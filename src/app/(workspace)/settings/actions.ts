"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business";
import { createClient } from "@/utils/supabase/server";
import { sendTwilioWhatsAppMessage } from "@/lib/whatsapp";
import {
  beginWhatsAppLiveConnection,
  submitWhatsAppVerificationCode,
  syncWhatsAppConnectionForBusiness,
} from "@/lib/whatsapp-connection";
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

export type RefreshWhatsAppLiveConnectionResult = PrepareWhatsAppLiveConnectionResult;

export type SubmitWhatsAppVerificationCodeResult = PrepareWhatsAppLiveConnectionResult;

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
      requestedPhoneNumber: true,
      sandboxRecipientPhoneNumber: true,
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
    const requestedPhoneChanged =
      (existingConnection?.requestedPhoneNumber ?? null) !== requestedPhoneNumber;
    const sandboxSender = process.env.TWILIO_WHATSAPP_FROM?.trim() ?? null;
    const nextMode =
      requestedPhoneNumber || existingConnection?.mode === "LIVE"
        ? "LIVE"
        : "SANDBOX";
    const nextConnectionStatus =
      nextMode === "LIVE"
        ? requestedPhoneNumber
          ? requestedPhoneChanged
            ? "PENDING_SETUP"
            : existingConnection?.status === "CONNECTED"
              ? "CONNECTED"
              : existingConnection?.status === "CONNECTING"
                ? "CONNECTING"
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
        sandboxRecipientPhoneNumber:
          nextMode === "LIVE"
            ? null
            : existingConnection?.sandboxRecipientPhoneNumber ?? null,
        senderPhoneNumber:
          nextMode === "LIVE"
            ? requestedPhoneChanged
              ? null
              : existingConnection?.senderPhoneNumber ?? null
            : sandboxSender,
        externalAccountId:
          nextMode === "LIVE"
            ? existingConnection?.externalAccountId ?? null
            : process.env.TWILIO_ACCOUNT_SID?.trim() ?? null,
        externalSenderId:
          nextMode === "LIVE"
            ? requestedPhoneChanged
              ? null
              : existingConnection?.externalSenderId ?? null
            : null,
        verificationStatus:
          nextMode === "LIVE"
            ? requestedPhoneNumber
              ? requestedPhoneChanged
                ? "NOT_STARTED"
                : existingConnection?.verificationStatus ?? "PENDING"
              : "NOT_STARTED"
            : nextConnectionStatus === "CONNECTED"
              ? "VERIFIED"
              : "NOT_STARTED",
        displayNameStatus:
          nextMode === "LIVE"
            ? requestedPhoneNumber
              ? requestedPhoneChanged
                ? "UNKNOWN"
                : existingConnection?.displayNameStatus ?? "PENDING"
              : "UNKNOWN"
            : "UNKNOWN",
        onboardingStartedAt:
          nextMode === "LIVE"
            ? requestedPhoneNumber
              ? requestedPhoneChanged
                ? null
                : existingConnection?.onboardingStartedAt ?? new Date()
              : null
            : null,
        lastError:
          nextConnectionStatus === "ERRORED" && !requestedPhoneChanged
            ? existingConnection?.lastError ?? null
            : null,
        connectedAt:
          nextConnectionStatus === "CONNECTED"
            ? requestedPhoneChanged
              ? null
              : existingConnection?.connectedAt ?? new Date()
            : null,
        lastSyncedAt: new Date(),
      },
      create: {
        businessId: business.id,
        provider: "TWILIO",
        mode: nextMode,
        status: nextConnectionStatus,
        requestedPhoneNumber,
        sandboxRecipientPhoneNumber: null,
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

  let resolvedConnection = whatsappConnection;

  if (updatedBusiness.whatsappNumber?.trim()) {
    try {
      resolvedConnection = await beginWhatsAppLiveConnection({
        businessId: updatedBusiness.id,
        businessName: updatedBusiness.name,
        requestedPhoneNumber: updatedBusiness.whatsappNumber,
      });
    } catch (error) {
      console.error("Failed to auto-start live WhatsApp connection after settings save.", {
        businessId: updatedBusiness.id,
        error,
      });
    }
  }

  const nextState: SettingsState = buildSettingsStateFromWorkspace({
    business: updatedBusiness,
    supportEmail: user.email ?? "",
    ownerName: payload.business.ownerName,
    businessHours,
    staffMembers,
    reminderSettings,
    whatsappConnection: resolvedConnection,
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
        sandboxRecipientPhoneNumber: recipient,
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
        sandboxRecipientPhoneNumber: recipient,
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
        sandboxRecipientPhoneNumber: recipient,
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
        sandboxRecipientPhoneNumber: recipient,
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

  const connection = await beginWhatsAppLiveConnection({
    businessId: business.id,
    businessName: business.name,
    requestedPhoneNumber,
  });

  revalidatePath("/settings");
  revalidatePath("/inbox");
  revalidatePath("/onboarding/complete");

  return {
    ok:
      connection.status !== "ERRORED" &&
      connection.status !== "PENDING_SETUP",
    error:
      connection.status === "ERRORED" || connection.status === "PENDING_SETUP"
        ? connection.lastError ?? undefined
        : undefined,
    message:
      connection.status === "CONNECTED"
        ? "Clinic number connected."
        : connection.status === "CONNECTING"
          ? "Clinic number registration started."
          : "Clinic number saved and waiting for provider verification.",
    connection: buildWhatsAppConnectionSummary(
      connection,
      business.whatsappNumber ?? ""
    ),
  };
}

export async function refreshWhatsAppLiveConnectionAction(): Promise<RefreshWhatsAppLiveConnectionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Log in again to refresh the WhatsApp connection.",
    };
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });

  const connection = await syncWhatsAppConnectionForBusiness(business.id);

  if (!connection) {
    return {
      ok: false,
      error: "No WhatsApp connection exists for this clinic yet.",
    };
  }

  const resolvedConnection = connection;

  revalidatePath("/settings");
  revalidatePath("/inbox");
  revalidatePath("/onboarding/complete");

  return {
    ok:
      resolvedConnection.status !== "ERRORED" &&
      resolvedConnection.status !== "PENDING_SETUP",
    error:
      resolvedConnection.status === "ERRORED" ||
      resolvedConnection.status === "PENDING_SETUP"
        ? resolvedConnection.lastError ?? undefined
        : undefined,
    message:
      resolvedConnection.status === "CONNECTED"
        ? "Clinic number is live."
        : "Latest provider status loaded.",
    connection: buildWhatsAppConnectionSummary(
      resolvedConnection,
      business.whatsappNumber ?? ""
    ),
  };
}

export async function submitWhatsAppVerificationCodeAction(
  rawVerificationCode: string
): Promise<SubmitWhatsAppVerificationCodeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Log in again to verify the clinic number.",
    };
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });
  const verificationCode = rawVerificationCode.trim();

  if (!verificationCode) {
    return {
      ok: false,
      error: "Enter the verification code first.",
    };
  }

  try {
    const connection = await submitWhatsAppVerificationCode({
      businessId: business.id,
      verificationCode,
    });

    revalidatePath("/settings");
    revalidatePath("/inbox");
    revalidatePath("/onboarding/complete");

    return {
      ok: connection.status !== "ERRORED",
      error:
        connection.status === "ERRORED" ? connection.lastError ?? undefined : undefined,
      message:
        connection.status === "CONNECTED"
          ? "Clinic number verified and connected."
          : "Verification code submitted. Refresh the status in a moment.",
      connection: buildWhatsAppConnectionSummary(
        connection,
        business.whatsappNumber ?? ""
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "We couldn't submit the verification code.",
    };
  }
}
