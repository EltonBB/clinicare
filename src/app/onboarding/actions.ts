"use server";

import { prisma } from "@/lib/prisma";
import { beginWhatsAppLiveConnection } from "@/lib/whatsapp-connection";
import { normalizePhone } from "@/lib/inbox";
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
  const normalizedWhatsAppNumber = normalizePhone(nextState.whatsapp.phoneNumber);

  return prisma.$transaction(async (tx) => {
    const business = await tx.business.upsert({
      where: {
        ownerId: user.id,
      },
      update: {
        name: businessName,
        businessType,
        whatsappNumber: normalizedWhatsAppNumber || null,
        whatsappEnabled: nextState.whatsapp.sendReminders,
      },
      create: {
        ownerId: user.id,
        name: businessName,
        businessType,
        plan: "BASIC",
        planStatus: "ACTIVE",
        whatsappNumber: normalizedWhatsAppNumber || null,
        whatsappEnabled: nextState.whatsapp.sendReminders,
        trialEndsAt: null,
      },
    });

    const requestedPhoneNumber = normalizedWhatsAppNumber || null;

    await tx.whatsAppConnection.upsert({
      where: {
        businessId: business.id,
      },
      update: {
        provider: "TWILIO",
        mode: "LIVE",
        status: requestedPhoneNumber ? "PENDING_SETUP" : "DISCONNECTED",
        requestedPhoneNumber,
        sandboxRecipientPhoneNumber: null,
        senderPhoneNumber: null,
        externalAccountId: process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
        externalSenderId: null,
        verificationStatus: requestedPhoneNumber ? "NOT_STARTED" : "NOT_STARTED",
        displayNameStatus: "UNKNOWN",
        onboardingStartedAt: requestedPhoneNumber ? new Date() : null,
        connectedAt: null,
        lastError: null,
        lastSyncedAt: new Date(),
      },
      create: {
        businessId: business.id,
        provider: "TWILIO",
        mode: "LIVE",
        status: requestedPhoneNumber ? "PENDING_SETUP" : "DISCONNECTED",
        requestedPhoneNumber,
        sandboxRecipientPhoneNumber: null,
        senderPhoneNumber: null,
        externalAccountId: process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
        externalSenderId: null,
        verificationStatus: "NOT_STARTED",
        displayNameStatus: "UNKNOWN",
        onboardingStartedAt: requestedPhoneNumber ? new Date() : null,
        connectedAt: null,
        lastError: null,
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

    if (!existingStaffMember) {
      await tx.staffMember.create({
        data: {
          businessId: business.id,
          name: staffName,
          role: nextState.staffMember.role || "Owner",
        },
      });
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
      if (business.whatsappNumber?.trim()) {
        try {
          await beginWhatsAppLiveConnection({
            businessId: business.id,
            businessName: business.name,
            requestedPhoneNumber: business.whatsappNumber,
          });
        } catch (error) {
          console.error("Failed to auto-start live WhatsApp connection during onboarding.", {
            businessId: business.id,
            error,
          });
        }
      }
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
