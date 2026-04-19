import { addHours, format, isAfter } from "date-fns";

import { phoneLookupKey, normalizePhone } from "@/lib/inbox";
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
  sentTypes: Set<string>;
}) {
  const { startsAt, now, send24HourReminder, send2HourReminder, sentTypes } = args;

  if (!isAfter(startsAt, now)) {
    return null;
  }

  if (
    send2HourReminder &&
    !sentTypes.has("TWO_HOUR") &&
    !isAfter(startsAt, addHours(now, 2))
  ) {
    return "TWO_HOUR" as const;
  }

  if (
    send24HourReminder &&
    !sentTypes.has("TWENTY_FOUR_HOUR") &&
    !isAfter(startsAt, addHours(now, 24))
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

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId,
      status: {
        not: "CANCELLED",
      },
      startAt: {
        gt: now,
        lte: addHours(now, 24),
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
        const businessConversations = await tx.conversation.findMany({
          where: {
            businessId,
          },
          select: {
            id: true,
            phoneNumber: true,
            contactName: true,
          },
        });
        const existingConversation = businessConversations.find(
          (conversation) => phoneLookupKey(conversation.phoneNumber) === phoneLookupKey(clientPhone)
        );
        const clientConversation = existingConversation
          ? existingConversation
          : await tx.conversation.upsert({
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
                phoneNumber: true,
                contactName: true,
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
    } catch (error) {
      failed += 1;
      console.error("Failed to send appointment reminder.", {
        businessId,
        appointmentId: appointment.id,
        reminderType,
        error: error instanceof Error ? error.message : error,
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
