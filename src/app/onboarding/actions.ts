"use server";

import { prisma } from "@/lib/prisma";
import { defaultReminderTemplate } from "@/lib/settings";
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

  return prisma.$transaction(async (tx) => {
    const business = await tx.business.upsert({
      where: {
        ownerId: user.id,
      },
      update: {
        name: businessName,
        businessType,
        dashboardFocus: nextState.dashboard.focus,
      },
      create: {
        ownerId: user.id,
        name: businessName,
        businessType,
        dashboardFocus: nextState.dashboard.focus,
        plan: "BASIC",
        planStatus: "ACTIVE",
        trialEndsAt: null,
      },
    });

    await tx.whatsAppConnection.upsert({
      where: {
        businessId: business.id,
      },
      update: {
        provider: "TWILIO",
        mode: "LIVE",
        status: "DISCONNECTED",
        requestedPhoneNumber: null,
        sandboxRecipientPhoneNumber: null,
        senderPhoneNumber: null,
        externalAccountId: process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
        externalSenderId: null,
        verificationStatus: "NOT_STARTED",
        displayNameStatus: "UNKNOWN",
        onboardingStartedAt: null,
        connectedAt: null,
        lastError: null,
        lastSyncedAt: new Date(),
      },
      create: {
        businessId: business.id,
        provider: "TWILIO",
        mode: "LIVE",
        status: "DISCONNECTED",
        requestedPhoneNumber: null,
        sandboxRecipientPhoneNumber: null,
        senderPhoneNumber: null,
        externalAccountId: process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
        externalSenderId: null,
        verificationStatus: "NOT_STARTED",
        displayNameStatus: "UNKNOWN",
        onboardingStartedAt: null,
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
        send24HourReminder: true,
        send2HourReminder: true,
        reminderWindow: "24 hours before",
        firstReminderHours: 24,
        secondReminderHours: 2,
        template: defaultReminderTemplate,
      },
      create: {
        businessId: business.id,
        send24HourReminder: true,
        send2HourReminder: true,
        reminderWindow: "24 hours before",
        firstReminderHours: 24,
        secondReminderHours: 2,
        template: defaultReminderTemplate,
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
      await bootstrapWorkspaceFromOnboarding(user, normalizedState);
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
