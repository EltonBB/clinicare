"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business";
import { createClient } from "@/utils/supabase/server";
import { sendTwilioWhatsAppMessage } from "@/lib/whatsapp";
import {
  buildWhatsAppConnectionSummary,
  buildSettingsStateFromWorkspace,
  resolveWhatsAppConnectionStatus,
  type SaveSettingsPayload,
  type SettingsState,
} from "@/lib/settings";
import { weekdayOrder } from "@/lib/onboarding";

export type SaveSettingsResult = {
  ok: boolean;
  error?: string;
  state?: SettingsState;
};

export type SendWhatsAppTestResult = {
  ok: boolean;
  error?: string;
  message?: string;
  connection?: SettingsState["whatsapp"]["connection"];
};

export type PrepareWhatsAppLiveConnectionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  connection?: SettingsState["whatsapp"]["connection"];
};

export async function saveSettingsAction(
  payload: SaveSettingsPayload
): Promise<SaveSettingsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Log in again to update settings.",
    };
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });

  const cleanedStaff = payload.staff.filter((member) => member.name.trim().length > 0);
  const persistedStaff =
    cleanedStaff.length > 0
      ? cleanedStaff
      : [
          {
            id: "owner-seed",
            name: payload.business.ownerName.trim() || user.email || "Workspace Owner",
            role: "Owner" as const,
          },
        ];
  const existingConnection = await prisma.whatsAppConnection.findUnique({
    where: {
      businessId: business.id,
    },
    select: {
      status: true,
      connectedAt: true,
      mode: true,
      senderPhoneNumber: true,
      externalAccountId: true,
      externalSenderId: true,
      verificationStatus: true,
      displayNameStatus: true,
      onboardingStartedAt: true,
      lastError: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: {
        id: business.id,
      },
      data: {
        name: payload.business.businessName.trim() || business.name,
        businessType: payload.business.businessType,
        whatsappNumber: payload.whatsapp.phoneNumber.trim() || null,
        whatsappEnabled: payload.whatsapp.sendReminders,
      },
    });

    const requestedPhoneNumber = payload.whatsapp.phoneNumber.trim() || null;
    const sandboxSender = process.env.TWILIO_WHATSAPP_FROM?.trim() ?? null;
    const nextMode = existingConnection?.mode ?? "SANDBOX";
    const nextConnectionStatus =
      nextMode === "LIVE"
        ? requestedPhoneNumber
          ? existingConnection?.status === "CONNECTED"
            ? "CONNECTED"
            : "PENDING_VERIFICATION"
          : "DISCONNECTED"
        : resolveWhatsAppConnectionStatus({
            hasSender: Boolean(sandboxSender),
            previousStatus: existingConnection?.status,
          });

    await tx.whatsAppConnection.upsert({
      where: {
        businessId: business.id,
      },
      update: {
        provider: "TWILIO",
        mode: nextMode,
        status: nextConnectionStatus,
        requestedPhoneNumber,
        senderPhoneNumber:
          nextMode === "LIVE"
            ? existingConnection?.senderPhoneNumber ?? null
            : sandboxSender,
        externalAccountId:
          nextMode === "LIVE"
            ? existingConnection?.externalAccountId ?? null
            : process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
        externalSenderId:
          nextMode === "LIVE" ? existingConnection?.externalSenderId ?? null : null,
        verificationStatus:
          nextMode === "LIVE"
            ? requestedPhoneNumber
              ? existingConnection?.verificationStatus ?? "PENDING"
              : "NOT_STARTED"
            : nextConnectionStatus === "CONNECTED"
              ? "VERIFIED"
              : "NOT_STARTED",
        displayNameStatus:
          nextMode === "LIVE"
            ? requestedPhoneNumber
              ? existingConnection?.displayNameStatus ?? "PENDING"
              : "UNKNOWN"
            : "UNKNOWN",
        onboardingStartedAt:
          nextMode === "LIVE"
            ? requestedPhoneNumber
              ? existingConnection?.onboardingStartedAt ?? new Date()
              : null
            : null,
        lastError: nextConnectionStatus === "ERRORED" ? existingConnection?.lastError ?? null : null,
        connectedAt:
          nextConnectionStatus === "CONNECTED"
            ? existingConnection?.connectedAt ?? new Date()
            : null,
        lastSyncedAt: new Date(),
      },
      create: {
        businessId: business.id,
        provider: "TWILIO",
        mode: nextMode,
        status: nextConnectionStatus,
        requestedPhoneNumber,
        senderPhoneNumber: nextMode === "LIVE" ? null : sandboxSender,
        externalAccountId:
          nextMode === "LIVE" ? null : process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
        externalSenderId: null,
        verificationStatus:
          nextMode === "LIVE"
            ? requestedPhoneNumber
              ? "PENDING"
              : "NOT_STARTED"
            : nextConnectionStatus === "CONNECTED"
              ? "VERIFIED"
              : "NOT_STARTED",
        displayNameStatus:
          nextMode === "LIVE" && requestedPhoneNumber ? "PENDING" : "UNKNOWN",
        onboardingStartedAt:
          nextMode === "LIVE" && requestedPhoneNumber ? new Date() : null,
        lastError: null,
        connectedAt: nextConnectionStatus === "CONNECTED" ? new Date() : null,
        lastSyncedAt: new Date(),
      },
    });

    for (const [index, day] of weekdayOrder.entries()) {
      const schedule = payload.workingHours[day];

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

    const existingStaff = await tx.staffMember.findMany({
      where: {
        businessId: business.id,
      },
      select: {
        id: true,
      },
    });

    const existingIds = new Set(existingStaff.map((member) => member.id));
    const submittedIds = new Set(
      persistedStaff
        .map((member) => member.id)
        .filter((id) => existingIds.has(id))
    );

    const idsToDelete = existingStaff
      .map((member) => member.id)
      .filter((id) => !submittedIds.has(id));

    if (idsToDelete.length > 0) {
      await tx.staffMember.deleteMany({
        where: {
          businessId: business.id,
          id: {
            in: idsToDelete,
          },
        },
      });
    }

    for (const member of persistedStaff) {
      if (existingIds.has(member.id)) {
        await tx.staffMember.update({
          where: {
            id: member.id,
          },
          data: {
            name: member.name.trim(),
            role: member.role,
          },
        });
      } else {
        await tx.staffMember.create({
          data: {
            businessId: business.id,
            name: member.name.trim(),
            role: member.role,
          },
        });
      }
    }

    await tx.reminderSettings.upsert({
      where: {
        businessId: business.id,
      },
      update: {
        send24HourReminder: payload.reminders.twentyFourHour,
        send2HourReminder: payload.reminders.twoHour,
        reminderWindow: payload.whatsapp.reminderWindow,
        template: payload.reminders.template,
      },
      create: {
        businessId: business.id,
        send24HourReminder: payload.reminders.twentyFourHour,
        send2HourReminder: payload.reminders.twoHour,
        reminderWindow: payload.whatsapp.reminderWindow,
        template: payload.reminders.template,
      },
    });
  });

  const nextMetadata = {
    ...(user.user_metadata ?? {}),
    full_name: payload.business.ownerName,
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

  const [updatedBusiness, businessHours, staffMembers, reminderSettings, whatsappConnection] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: {
        id: business.id,
      },
    }),
    prisma.businessHours.findMany({
      where: {
        businessId: business.id,
      },
      orderBy: {
        weekday: "asc",
      },
    }),
    prisma.staffMember.findMany({
      where: {
        businessId: business.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
    prisma.reminderSettings.findUnique({
      where: {
        businessId: business.id,
      },
    }),
    prisma.whatsAppConnection.findUnique({
      where: {
        businessId: business.id,
      },
    }),
  ]);

  const nextState: SettingsState = buildSettingsStateFromWorkspace({
    business: updatedBusiness,
    supportEmail: user.email ?? "",
    ownerName: payload.business.ownerName,
    businessHours,
    staffMembers,
    reminderSettings,
    whatsappConnection,
  });

  return {
    ok: true,
    state: nextState,
  };
}

export async function sendWhatsAppTestAction(
  rawRecipient: string
): Promise<SendWhatsAppTestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Log in again to send a test message.",
    };
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });
  const recipient = rawRecipient.trim();

  if (!recipient) {
    return {
      ok: false,
      error: "Enter the recipient number that joined the Twilio sandbox.",
    };
  }

  try {
    await sendTwilioWhatsAppMessage({
      to: recipient,
      body: `Vela sandbox test: ${business.name} is connected. If you received this, outbound WhatsApp sending is working.`,
    });

    const connection = await prisma.whatsAppConnection.upsert({
      where: {
        businessId: business.id,
      },
      update: {
        provider: "TWILIO",
        mode: "SANDBOX",
        status: "CONNECTED",
        senderPhoneNumber: process.env.TWILIO_WHATSAPP_FROM?.trim() ?? null,
        externalAccountId: process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
        externalSenderId: null,
        verificationStatus: "VERIFIED",
        displayNameStatus: "UNKNOWN",
        onboardingStartedAt: null,
        lastError: null,
        connectedAt: new Date(),
        lastSyncedAt: new Date(),
      },
      create: {
        businessId: business.id,
        provider: "TWILIO",
        mode: "SANDBOX",
        status: "CONNECTED",
        requestedPhoneNumber: business.whatsappNumber,
        senderPhoneNumber: process.env.TWILIO_WHATSAPP_FROM?.trim() ?? null,
        externalAccountId: process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
        externalSenderId: null,
        verificationStatus: "VERIFIED",
        displayNameStatus: "UNKNOWN",
        onboardingStartedAt: null,
        lastError: null,
        connectedAt: new Date(),
        lastSyncedAt: new Date(),
      },
    });

    revalidatePath("/settings");

    return {
      ok: true,
      message: "Sandbox test sent. Check the joined WhatsApp number.",
      connection: buildWhatsAppConnectionSummary(
        connection,
        business.whatsappNumber ?? ""
      ),
    };
  } catch (error) {
    const connection = await prisma.whatsAppConnection.upsert({
      where: {
        businessId: business.id,
      },
      update: {
        provider: "TWILIO",
        mode: "SANDBOX",
        status: "ERRORED",
        senderPhoneNumber: process.env.TWILIO_WHATSAPP_FROM?.trim() ?? null,
        externalAccountId: process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
        externalSenderId: null,
        verificationStatus: "FAILED",
        displayNameStatus: "UNKNOWN",
        onboardingStartedAt: null,
        lastError:
          error instanceof Error
            ? error.message
            : "We couldn't send the WhatsApp sandbox test.",
        lastSyncedAt: new Date(),
      },
      create: {
        businessId: business.id,
        provider: "TWILIO",
        mode: "SANDBOX",
        status: "ERRORED",
        requestedPhoneNumber: business.whatsappNumber,
        senderPhoneNumber: process.env.TWILIO_WHATSAPP_FROM?.trim() ?? null,
        externalAccountId: process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
        externalSenderId: null,
        verificationStatus: "FAILED",
        displayNameStatus: "UNKNOWN",
        onboardingStartedAt: null,
        lastError:
          error instanceof Error
            ? error.message
            : "We couldn't send the WhatsApp sandbox test.",
        lastSyncedAt: new Date(),
      },
    });

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "We couldn't send the WhatsApp sandbox test.",
      connection: buildWhatsAppConnectionSummary(
        connection,
        business.whatsappNumber ?? ""
      ),
    };
  }
}

export async function prepareWhatsAppLiveConnectionAction(): Promise<PrepareWhatsAppLiveConnectionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Log in again to update the WhatsApp connection.",
    };
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });

  const requestedPhoneNumber = business.whatsappNumber?.trim() ?? "";

  if (!requestedPhoneNumber) {
    return {
      ok: false,
      error: "Save the clinic WhatsApp number first before preparing a live connection.",
    };
  }

  const connection = await prisma.whatsAppConnection.upsert({
    where: {
      businessId: business.id,
    },
    update: {
      provider: "TWILIO",
      mode: "LIVE",
      status: "PENDING_VERIFICATION",
      requestedPhoneNumber,
      senderPhoneNumber: null,
      externalAccountId: process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
      externalSenderId: null,
      verificationStatus: "PENDING",
      displayNameStatus: "PENDING",
      onboardingStartedAt: new Date(),
      lastError: null,
      connectedAt: null,
      lastSyncedAt: new Date(),
    },
    create: {
      businessId: business.id,
      provider: "TWILIO",
      mode: "LIVE",
      status: "PENDING_VERIFICATION",
      requestedPhoneNumber,
      senderPhoneNumber: null,
      externalAccountId: process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
      externalSenderId: null,
      verificationStatus: "PENDING",
      displayNameStatus: "PENDING",
      onboardingStartedAt: new Date(),
      lastError: null,
      connectedAt: null,
      lastSyncedAt: new Date(),
    },
  });

  revalidatePath("/settings");

  return {
    ok: true,
    message:
      "Live clinic WhatsApp connection prepared. The next step is provider verification and sender approval.",
    connection: buildWhatsAppConnectionSummary(
      connection,
      business.whatsappNumber ?? ""
    ),
  };
}
