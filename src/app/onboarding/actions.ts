"use server";

import { addHours } from "date-fns";

import { prisma } from "@/lib/prisma";
import { ensureInboxSeedData } from "@/lib/inbox-server";
import { resolveWhatsAppConnectionStatus } from "@/lib/settings";
import {
  weekdayOrder,
  normalizeOnboardingState,
  type OnboardingState,
} from "@/lib/onboarding";
import { createClient } from "@/utils/supabase/server";

export type SaveOnboardingStateResult = {
  ok: boolean;
  error?: string;
  state?: OnboardingState;
};

function parseBookingStart(date: string, time: string) {
  const fallback = new Date();
  fallback.setHours(9, 0, 0, 0);

  if (!date) {
    return fallback;
  }

  const parsed = new Date(`${date}T${time || "09:00"}:00`);

  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed;
}

async function bootstrapWorkspaceFromOnboarding(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}, nextState: OnboardingState) {
  const metadata = user.user_metadata ?? {};
  const businessName =
    typeof metadata.business_name === "string" && metadata.business_name.trim().length > 0
      ? metadata.business_name.trim()
      : "Vela Workspace";
  const businessType =
    typeof metadata.business_type === "string" && metadata.business_type.trim().length > 0
      ? metadata.business_type.trim()
      : "Clinic";
  const defaultTemplate =
    nextState.whatsapp.template ||
    "Hi {client_name}, this is a reminder for your appointment at {time}. Reply here if you need to reschedule.";
  const bookingStartAt = parseBookingStart(nextState.booking.date, nextState.booking.time);
  const bookingEndAt = addHours(bookingStartAt, 1);
  const clientName = nextState.client.name.trim() || nextState.booking.clientName.trim();
  const clientPhone = nextState.client.phone.trim();
  const shouldCreateClient = clientName.length > 0 && clientPhone.length > 0;
  const shouldCreateAppointment =
    shouldCreateClient &&
    nextState.booking.service.trim().length > 0 &&
    nextState.booking.date.trim().length > 0 &&
    nextState.booking.time.trim().length > 0;

  return prisma.$transaction(async (tx) => {
    const business = await tx.business.upsert({
      where: {
        ownerId: user.id,
      },
      update: {
        name: businessName,
        businessType,
        whatsappNumber: nextState.whatsapp.phoneNumber || null,
        whatsappEnabled: nextState.whatsapp.sendReminders,
      },
      create: {
        ownerId: user.id,
        name: businessName,
        businessType,
        plan: "BASIC",
        planStatus: "ACTIVE",
        whatsappNumber: nextState.whatsapp.phoneNumber || null,
        whatsappEnabled: nextState.whatsapp.sendReminders,
        trialEndsAt: null,
      },
    });

    const requestedPhoneNumber = nextState.whatsapp.phoneNumber.trim() || null;
    const sandboxSender = process.env.TWILIO_WHATSAPP_FROM?.trim() ?? null;
    const nextConnectionStatus = resolveWhatsAppConnectionStatus({
      hasSender: Boolean(sandboxSender),
    });

    await tx.whatsAppConnection.upsert({
      where: {
        businessId: business.id,
      },
      update: {
        provider: "TWILIO",
        mode: "SANDBOX",
        status: nextConnectionStatus,
        requestedPhoneNumber,
        senderPhoneNumber: sandboxSender,
        externalAccountId: process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
        connectedAt: nextConnectionStatus === "CONNECTED" ? new Date() : null,
        lastSyncedAt: new Date(),
      },
      create: {
        businessId: business.id,
        provider: "TWILIO",
        mode: "SANDBOX",
        status: nextConnectionStatus,
        requestedPhoneNumber,
        senderPhoneNumber: sandboxSender,
        externalAccountId: process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
        connectedAt: nextConnectionStatus === "CONNECTED" ? new Date() : null,
        lastSyncedAt: new Date(),
      },
    });

    for (const [index, day] of weekdayOrder.entries()) {
      const schedule = nextState.workingHours[day];

      await tx.businessHours.upsert({
        where: {
          businessId_weekday: {
            businessId: business.id,
            weekday: index,
          },
        },
        update: {
          isOpen: schedule.enabled,
          startTime: schedule.start,
          endTime: schedule.end,
        },
        create: {
          businessId: business.id,
          weekday: index,
          isOpen: schedule.enabled,
          startTime: schedule.start,
          endTime: schedule.end,
        },
      });
    }

    const staffName =
      nextState.staffMember.name.trim() ||
      (typeof metadata.full_name === "string" && metadata.full_name.trim().length > 0
        ? metadata.full_name.trim()
        : user.email?.trim() || "Workspace Owner");

    const existingStaffMember = await tx.staffMember.findFirst({
      where: {
        businessId: business.id,
        name: staffName,
      },
    });

    const staffMember =
      existingStaffMember ??
      (await tx.staffMember.create({
        data: {
          businessId: business.id,
          name: staffName,
          role: nextState.staffMember.role || "Owner",
        },
      }));

    if (shouldCreateClient) {
      const client = await tx.client.upsert({
        where: {
          businessId_phone: {
            businessId: business.id,
            phone: clientPhone,
          },
        },
        update: {
          name: clientName,
          email: nextState.client.email.trim() || null,
          notes: nextState.client.notes.trim() || null,
          status: "ACTIVE",
          preferredChannel: "WhatsApp",
          assignedStaffName: staffName,
          tags: ["priority", "whatsapp"],
          lastVisitAt: shouldCreateAppointment ? bookingStartAt : null,
        },
        create: {
          businessId: business.id,
          name: clientName,
          email: nextState.client.email.trim() || null,
          phone: clientPhone,
          notes: nextState.client.notes.trim() || null,
          status: "ACTIVE",
          preferredChannel: "WhatsApp",
          assignedStaffName: staffName,
          tags: ["priority", "whatsapp"],
          lastVisitAt: shouldCreateAppointment ? bookingStartAt : null,
        },
      });

      if (shouldCreateAppointment) {
        const existingAppointment = await tx.appointment.findFirst({
          where: {
            businessId: business.id,
            clientId: client.id,
            title: nextState.booking.service.trim() || "Initial consultation",
            startAt: bookingStartAt,
          },
        });

        if (!existingAppointment) {
          await tx.appointment.create({
            data: {
              businessId: business.id,
              clientId: client.id,
              staffMemberId: staffMember.id,
              title: nextState.booking.service.trim() || "Initial consultation",
              startAt: bookingStartAt,
              endAt: bookingEndAt,
              status: "CONFIRMED",
              notes: nextState.client.notes.trim() || null,
            },
          });
        }
      }
    }

    await tx.reminderSettings.upsert({
      where: {
        businessId: business.id,
      },
      update: {
        send24HourReminder: nextState.whatsapp.sendReminders,
        send2HourReminder: nextState.whatsapp.sendReminders,
        reminderWindow: nextState.whatsapp.reminderWindow,
        template: defaultTemplate,
      },
      create: {
        businessId: business.id,
        send24HourReminder: nextState.whatsapp.sendReminders,
        send2HourReminder: nextState.whatsapp.sendReminders,
        reminderWindow: nextState.whatsapp.reminderWindow,
        template: defaultTemplate,
      },
    });

    return business;
  });
}

export async function saveOnboardingStateAction(
  nextState: OnboardingState
): Promise<SaveOnboardingStateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Log in again to continue onboarding.",
    };
  }

  const normalizedState = normalizeOnboardingState(nextState);

  if (normalizedState.completed) {
    try {
      const business = await bootstrapWorkspaceFromOnboarding(user, normalizedState);
      await ensureInboxSeedData(business.id);
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "We couldn't create your clinic workspace. Try again.",
      };
    }
  }

  const nextMetadata = {
    ...(user.user_metadata ?? {}),
    onboarding_state: normalizedState,
    onboarding_current_step: normalizedState.currentStep,
    onboarding_completed: normalizedState.completed,
  };

  const { error } = await supabase.auth.updateUser({
    data: nextMetadata,
  });

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  return {
    ok: true,
    state: normalizedState,
  };
}
