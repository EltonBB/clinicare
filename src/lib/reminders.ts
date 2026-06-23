import { addHours } from "date-fns";

import { mapWithConcurrency } from "@/lib/concurrency";
import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { reminderTypeForAppointment } from "@/lib/reminder-schedule";
import { formatZonedFullDate, formatZonedTime } from "@/lib/time-zone";
import {
  mapTwilioStatusToDeliveryStatus,
  sendTwilioWhatsAppMessage,
} from "@/lib/whatsapp";

type ReminderSyncResult = {
  sent: number;
  failed: number;
};

export type ReminderCronResult = ReminderSyncResult & {
  processedBusinesses: number;
};

function renderReminderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

export async function syncAppointmentRemindersForBusiness(
  businessId: string
): Promise<ReminderSyncResult> {
  const now = new Date();
  const business = await prisma.business.findUnique({
    where: {
      id: businessId,
    },
    select: {
      id: true,
      name: true,
      whatsappEnabled: true,
      reminderSettings: {
        select: {
          send24HourReminder: true,
          send2HourReminder: true,
          firstReminderHours: true,
          secondReminderHours: true,
          template: true,
        },
      },
      whatsappConnection: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (
    !business ||
    !business.whatsappEnabled ||
    business.whatsappConnection?.status !== "CONNECTED"
  ) {
    return { sent: 0, failed: 0 };
  }

  const reminderSettings = business.reminderSettings;
  const template =
    reminderSettings?.template?.trim() ||
    "Hi {client_name}, this is a reminder for your appointment at {time} on {date}. Reply here if you need to reschedule.";

  const firstReminderHours = Math.min(
    Math.max(reminderSettings?.firstReminderHours ?? 24, 1),
    24
  );
  const secondReminderHours = Math.min(
    Math.max(reminderSettings?.secondReminderHours ?? 2, 1),
    24
  );
  const maxReminderHours = Math.max(firstReminderHours, secondReminderHours);

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId,
      status: {
        not: "CANCELLED",
      },
      startAt: {
        gt: now,
        lte: addHours(now, maxReminderHours),
      },
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      staffMember: {
        select: {
          name: true,
        },
      },
      reminders: {
        select: {
          type: true,
        },
      },
    },
    orderBy: {
      startAt: "asc",
    },
  });

  let sent = 0;
  let failed = 0;

  for (const appointment of appointments) {
    const reminderType = reminderTypeForAppointment({
      startsAt: appointment.startAt,
      now,
      send24HourReminder: reminderSettings?.send24HourReminder ?? true,
      send2HourReminder: reminderSettings?.send2HourReminder ?? true,
      firstReminderHours,
      secondReminderHours,
      sentTypes: new Set(appointment.reminders.map((reminder) => reminder.type)),
    });

    if (!reminderType) {
      continue;
    }

    const clientPhone = normalizePhone(appointment.client.phone);
    // Canonical dedup key (digits only) — the conversation is keyed on this so a
    // reminder and the patient's later inbound reply resolve to the SAME row.
    const clientPhoneKey = phoneLookupKey(appointment.client.phone);

    if (!clientPhone || !clientPhoneKey) {
      failed += 1;
      continue;
    }

    // HIPAA minimum-necessary: outbound reminders carry name + appointment time
    // (+ provider) only — never the service/treatment. `service` is deliberately
    // NOT supplied, so any {service} token in a custom template renders empty.
    const body = renderReminderTemplate(template, {
      client_name: appointment.client.name,
      date: formatZonedFullDate(appointment.startAt),
      time: formatZonedTime(appointment.startAt),
      staff_name: appointment.staffMember?.name ?? business.name,
    });

    try {
      const delivery = await sendTwilioWhatsAppMessage({
        to: clientPhone,
        body,
      });

      await prisma.$transaction(async (tx) => {
        const clientConversation = await tx.conversation.upsert({
          where: {
            businessId_phoneKey: {
              businessId,
              phoneKey: clientPhoneKey,
            },
          },
          update: {
            contactName: appointment.client.name,
            unreadCount: 0,
          },
          create: {
            businessId,
            phoneNumber: clientPhone,
            phoneKey: clientPhoneKey,
            contactName: appointment.client.name,
            unreadCount: 0,
          },
          select: {
            id: true,
          },
        });

        await tx.message.create({
          data: {
            conversationId: clientConversation.id,
            clientId: appointment.client.id,
            direction: "OUTBOUND",
            body,
            providerMessageSid: delivery.sid || null,
            deliveryStatus: mapTwilioStatusToDeliveryStatus(delivery.status),
            deliveryUpdatedAt: new Date(),
          },
        });

        await tx.appointmentReminder.create({
          data: {
            appointmentId: appointment.id,
            type: reminderType,
          },
        });

        await tx.whatsAppConnection.update({
          where: {
            businessId,
          },
          data: {
            status: "CONNECTED",
            lastSyncedAt: new Date(),
          },
        });
      });

      sent += 1;
    } catch (error) {
      failed += 1;
      logger.error("Failed to send appointment reminder.", error, {
        businessId,
        appointmentId: appointment.id,
        reminderType,
      });
    }
  }

  return { sent, failed };
}

// A few clinics at a time — bounds concurrent Twilio sends across tenants.
const REMINDER_BUSINESS_CONCURRENCY = 3;

export async function syncAppointmentRemindersJob(): Promise<ReminderCronResult> {
  const businesses = await prisma.business.findMany({
    where: {
      whatsappEnabled: true,
      whatsappConnection: {
        is: {
          status: "CONNECTED",
        },
      },
    },
    select: {
      id: true,
    },
  });

  const results = await mapWithConcurrency(
    businesses,
    REMINDER_BUSINESS_CONCURRENCY,
    async (business) => {
      try {
        return await syncAppointmentRemindersForBusiness(business.id);
      } catch (error) {
        // Isolate per-tenant failures so one clinic can't abort the whole run.
        logger.error("Reminder sync failed for business.", error, {
          businessId: business.id,
        });
        return { sent: 0, failed: 0 };
      }
    }
  );

  const sent = results.reduce((total, result) => total + result.sent, 0);
  const failed = results.reduce((total, result) => total + result.failed, 0);

  return {
    processedBusinesses: businesses.length,
    sent,
    failed,
  };
}
