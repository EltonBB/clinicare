import { addHours, isAfter } from "date-fns";
import { Prisma } from "@prisma/client";

import { mapWithConcurrency } from "@/lib/concurrency";
import { normalizePhone } from "@/lib/inbox";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { formatZonedFullDate, formatZonedTime } from "@/lib/time-zone";
import { sendTwilioWhatsAppMessage } from "@/lib/whatsapp";

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

function reminderTypeForAppointment(args: {
  startsAt: Date;
  now: Date;
  send24HourReminder: boolean;
  send2HourReminder: boolean;
  firstReminderHours: number;
  secondReminderHours: number;
  sentTypes: Set<string>;
}) {
  const {
    startsAt,
    now,
    send24HourReminder,
    send2HourReminder,
    firstReminderHours,
    secondReminderHours,
    sentTypes,
  } = args;

  if (!isAfter(startsAt, now)) {
    return null;
  }

  if (
    send2HourReminder &&
    !sentTypes.has("TWO_HOUR") &&
    !isAfter(startsAt, addHours(now, secondReminderHours))
  ) {
    return "TWO_HOUR" as const;
  }

  if (
    send24HourReminder &&
    !sentTypes.has("TWENTY_FOUR_HOUR") &&
    !isAfter(startsAt, addHours(now, firstReminderHours))
  ) {
    return "TWENTY_FOUR_HOUR" as const;
  }

  return null;
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

    if (!clientPhone) {
      failed += 1;
      continue;
    }

    // Claim this reminder before sending (unique on appointmentId + type) so a
    // post-send bookkeeping failure can't make the next cron run re-send to the
    // patient. A concurrent or overlapping run that already claimed it gets P2002.
    try {
      await prisma.appointmentReminder.create({
        data: {
          appointmentId: appointment.id,
          type: reminderType,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // Already claimed (and sent) by a concurrent/overlapping run — skip.
        continue;
      }
      // A transient claim failure should skip just this appointment, like the
      // rest of the loop — not abort the whole tenant's batch.
      failed += 1;
      logger.error("Failed to claim appointment reminder.", error, {
        businessId,
        appointmentId: appointment.id,
        reminderType,
      });
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

    let delivery: Awaited<ReturnType<typeof sendTwilioWhatsAppMessage>>;
    try {
      delivery = await sendTwilioWhatsAppMessage({
        to: clientPhone,
        body,
      });
    } catch (error) {
      // The send itself failed — release the claim so a later run can retry.
      await prisma.appointmentReminder
        .deleteMany({
          where: { appointmentId: appointment.id, type: reminderType },
        })
        .catch(() => {});
      failed += 1;
      logger.error("Failed to send appointment reminder.", error, {
        businessId,
        appointmentId: appointment.id,
        reminderType,
      });
      continue;
    }

    // Delivered — the claim stays committed no matter what happens next, so the
    // reminder is never sent twice. The conversation/message bookkeeping below is
    // best-effort: a failure here is logged, never retried, and never re-sends.
    try {
      await prisma.$transaction(async (tx) => {
        const clientConversation = await tx.conversation.upsert({
          where: {
            businessId_phoneNumber: {
              businessId,
              phoneNumber: clientPhone,
            },
          },
          update: {
            contactName: appointment.client.name,
            unreadCount: 0,
          },
          create: {
            businessId,
            phoneNumber: clientPhone,
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
            deliveryStatus:
              delivery.status === "sent"
                ? "SENT"
                : delivery.status === "delivered"
                  ? "DELIVERED"
                  : delivery.status === "read"
                    ? "READ"
                    : delivery.status === "failed" || delivery.status === "undelivered"
                      ? "FAILED"
                      : "QUEUED",
            deliveryUpdatedAt: new Date(),
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
    } catch (error) {
      logger.error("Reminder delivered but bookkeeping failed.", error, {
        businessId,
        appointmentId: appointment.id,
        reminderType,
      });
    }

    sent += 1;
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
