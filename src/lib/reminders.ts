import { addHours, format, isAfter } from "date-fns";

import { normalizePhone } from "@/lib/inbox";
import { prisma } from "@/lib/prisma";
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

    const body = renderReminderTemplate(template, {
      client_name: appointment.client.name,
      date: format(appointment.startAt, "MMMM d"),
      time: format(appointment.startAt, "h:mm a"),
      service: appointment.title,
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
    } catch {
      failed += 1;
      console.error("Failed to send appointment reminder.", {
        businessId,
        appointmentId: appointment.id,
        reminderType,
      });
    }
  }

  return { sent, failed };
}

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

  let sent = 0;
  let failed = 0;

  for (const business of businesses) {
    const result = await syncAppointmentRemindersForBusiness(business.id);
    sent += result.sent;
    failed += result.failed;
  }

  return {
    processedBusinesses: businesses.length,
    sent,
    failed,
  };
}
