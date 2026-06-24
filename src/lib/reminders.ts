import { addHours } from "date-fns";

import { mapWithConcurrency } from "@/lib/concurrency";
import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { logger } from "@/lib/logger";
import { sendMessage } from "@/lib/messaging";
import { prisma } from "@/lib/prisma";
import { reminderTypeForAppointment } from "@/lib/reminder-schedule";
import { formatZonedFullDate, formatZonedTime } from "@/lib/time-zone";

type ReminderSyncResult = {
  sent: number;
  failed: number;
};

export type ReminderCronResult = ReminderSyncResult & {
  processedBusinesses: number;
};

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

  // ERRORED is a soft, recoverable state: re-attempt so a transient outage
  // self-heals back to CONNECTED on the next successful send (the success path
  // below sets CONNECTED), rather than excluding the clinic from reminders until
  // someone re-pairs.
  const connectionStatus = business?.whatsappConnection?.status;
  if (
    !business ||
    !business.whatsappEnabled ||
    (connectionStatus !== "CONNECTED" && connectionStatus !== "ERRORED")
  ) {
    return { sent: 0, failed: 0 };
  }

  const reminderSettings = business.reminderSettings;
  // The seam renders the body (and falls back to a default min-necessary
  // template); pass the clinic's custom template through when set.
  const template = reminderSettings?.template?.trim() || undefined;

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
          status: true,
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
      // Only delivered reminders suppress a re-send; a FAILED row retries.
      sentTypes: new Set(
        appointment.reminders
          .filter((reminder) => reminder.status === "SENT")
          .map((reminder) => reminder.type)
      ),
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

    // Outbound reminders flow through the messaging seam, which renders a HIPAA
    // minimum-necessary body (name + appointment time only — never the
    // service/treatment) and routes to the active WhatsApp provider.
    const result = await sendMessage({
      channel: "WHATSAPP",
      businessId,
      to: clientPhone,
      message: {
        kind: "appointment_reminder",
        recipientName: appointment.client.name,
        appointmentDate: formatZonedFullDate(appointment.startAt),
        appointmentTime: formatZonedTime(appointment.startAt),
        staffName: appointment.staffMember?.name ?? business.name,
        template,
      },
    });

    if (!result.ok) {
      failed += 1;
      // Persist the failure so it's visible and retried on the next run.
      await prisma.appointmentReminder
        .upsert({
          where: {
            appointmentId_type: {
              appointmentId: appointment.id,
              type: reminderType,
            },
          },
          create: {
            appointmentId: appointment.id,
            type: reminderType,
            status: "FAILED",
          },
          update: {
            status: "FAILED",
          },
        })
        .catch((error) => {
          logger.error("Failed to record reminder failure.", error, {
            businessId,
            appointmentId: appointment.id,
            reminderType,
          });
        });
      continue;
    }

    try {
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
            body: result.body,
            providerMessageSid: result.providerMessageId,
            deliveryStatus: result.status,
            deliveryUpdatedAt: new Date(),
          },
        });

        await tx.appointmentReminder.upsert({
          where: {
            appointmentId_type: {
              appointmentId: appointment.id,
              type: reminderType,
            },
          },
          create: {
            appointmentId: appointment.id,
            type: reminderType,
            status: "SENT",
          },
          update: {
            status: "SENT",
            sentAt: new Date(),
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
      logger.error("Failed to record sent reminder.", error, {
        businessId,
        appointmentId: appointment.id,
        reminderType,
      });
    }
  }

  return { sent, failed };
}

// A few clinics at a time — bounds concurrent outbound sends across tenants.
const REMINDER_BUSINESS_CONCURRENCY = 3;

export async function syncAppointmentRemindersJob(): Promise<ReminderCronResult> {
  const businesses = await prisma.business.findMany({
    where: {
      whatsappEnabled: true,
      whatsappConnection: {
        is: {
          // ERRORED included so a transiently-failed connection still gets
          // reminder attempts and self-heals to CONNECTED on the next success.
          status: { in: ["CONNECTED", "ERRORED"] },
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
