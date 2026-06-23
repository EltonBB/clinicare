"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCurrentBusiness, requireCurrentWorkspace } from "@/lib/business";
import { getCurrentUser, updateCurrentUserMetadata } from "@/lib/auth";
import { sanitizeAuthMetadataForSession } from "@/lib/auth-metadata";
import { sendTwilioWhatsAppMessage } from "@/lib/whatsapp";
import {
  beginWhatsAppLiveConnection,
  submitWhatsAppVerificationCode,
  syncWhatsAppConnectionForBusiness,
} from "@/lib/whatsapp-connection";
import { normalizePhone } from "@/lib/inbox";
import { normalizeStorageReference } from "@/lib/media-storage";
import { hasUnsafePublicUrl, normalizeOptionalPublicUrl } from "@/lib/safe-url";
import { deleteStorageReferences } from "@/lib/media-storage-server";
import { normalizeBrandHexColor, resolveBrandAccentPreset } from "@/lib/branding";
import {
  buildWhatsAppConnectionSummary,
  resolveWhatsAppConnectionStatus,
  type SaveSettingsPayload,
  type SettingsState,
} from "@/lib/settings";
import { loadSettingsState } from "@/lib/settings-server";
import { weekdayOrder } from "@/lib/onboarding";

function clampReminderHours(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(value), 1), 24);
}

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

export async function getSettingsDataAction(): Promise<SettingsState> {
  const { user, business } = await requireCurrentWorkspace("/settings", {
    missingBusinessRedirect: "/onboarding",
  });

  // Keep the WhatsApp status fresh for the next load, exactly like the
  // /settings route does — without delaying this response.
  after(async () => {
    try {
      await syncWhatsAppConnectionForBusiness(business.id);
    } catch {
      console.error("Failed to refresh WhatsApp connection after settings load.");
    }
  });

  return loadSettingsState(user, business);
}

export async function saveSettingsAction(
  payload: SaveSettingsPayload
): Promise<SaveSettingsResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Log in again to update settings.",
    };
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });
  const normalizedWhatsAppNumber = normalizePhone(payload.whatsapp.phoneNumber);
  const customAccentHex = normalizeBrandHexColor(payload.appearance.accentHex);
  const accentPreset = resolveBrandAccentPreset(payload.appearance.accentColor);
  const candidateLogoUrl = normalizeStorageReference(payload.business.logoUrl);

  if (payload.appearance.accentColor === "custom" && !customAccentHex) {
    return {
      ok: false,
      error: "Enter a valid HEX color, for example #0A22FF.",
    };
  }

  // Only a Supabase storage reference or a safe HTTPS URL may be stored — the
  // logo is later interpolated into a CSS url() in the app shell.
  if (hasUnsafePublicUrl(candidateLogoUrl)) {
    return {
      ok: false,
      error: "Upload the clinic logo again, or use a safe HTTPS link.",
    };
  }

  const nextLogoUrl = normalizeOptionalPublicUrl(candidateLogoUrl);

  const brandAccentColor =
    payload.appearance.accentColor === "custom" && customAccentHex
      ? customAccentHex
      : accentPreset.id;
  const firstReminderHours = clampReminderHours(
    payload.reminders.firstReminderHours,
    24
  );
  const secondReminderHours = clampReminderHours(
    payload.reminders.secondReminderHours,
    2
  );

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
  const previousLogoUrl = business.logoUrl ?? "";

  await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: {
        id: business.id,
      },
      data: {
        name: payload.business.businessName.trim() || business.name,
        businessType: payload.business.businessType,
        logoUrl: nextLogoUrl || null,
        brandAccentColor,
        whatsappNumber: normalizedWhatsAppNumber || null,
        whatsappEnabled: payload.whatsapp.sendReminders,
      },
    });

    const requestedPhoneNumber = normalizedWhatsAppNumber || null;
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

    await tx.reminderSettings.upsert({
      where: {
        businessId: business.id,
      },
      update: {
        send24HourReminder: payload.reminders.twentyFourHour,
        send2HourReminder: payload.reminders.twoHour,
        reminderWindow: payload.whatsapp.reminderWindow,
        firstReminderHours,
        secondReminderHours,
        template: payload.reminders.template.trim(),
      },
      create: {
        businessId: business.id,
        send24HourReminder: payload.reminders.twentyFourHour,
        send2HourReminder: payload.reminders.twoHour,
        reminderWindow: payload.whatsapp.reminderWindow,
        firstReminderHours,
        secondReminderHours,
        template: payload.reminders.template.trim(),
      },
    });
  });

  const nextMetadata = {
    ...sanitizeAuthMetadataForSession(user.user_metadata),
    full_name: payload.business.ownerName,
  };

  const { error } = await updateCurrentUserMetadata(nextMetadata);

  if (error) {
    return {
      ok: false,
      error: "We couldn't update settings right now.",
    };
  }

  if (previousLogoUrl && previousLogoUrl !== nextLogoUrl) {
    await deleteStorageReferences([previousLogoUrl]);
  }

  const updatedBusiness = await prisma.business.findUniqueOrThrow({
    where: {
      id: business.id,
    },
  });
  const nextState = await loadSettingsState(user, updatedBusiness, {
    ownerName: payload.business.ownerName,
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");

  return {
    ok: true,
    state: nextState,
  };
}

export async function sendWhatsAppTestAction(
  rawRecipient: string
): Promise<SendWhatsAppTestResult> {
  const user = await getCurrentUser();

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
      error: "Enter the recipient number that joined the test sandbox.",
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
  } catch {
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
        lastError: "We couldn't send the WhatsApp sandbox test.",
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
        lastError: "We couldn't send the WhatsApp sandbox test.",
        lastSyncedAt: new Date(),
      },
    });

    return {
      ok: false,
      error: "We couldn't send the WhatsApp sandbox test.",
      connection: buildWhatsAppConnectionSummary(
        connection,
        business.whatsappNumber ?? ""
      ),
    };
  }
}

export async function prepareWhatsAppLiveConnectionAction(
  rawPhoneNumber?: string
): Promise<PrepareWhatsAppLiveConnectionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Log in again to update the WhatsApp connection.",
    };
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });

  const typedPhoneNumber = normalizePhone(rawPhoneNumber ?? "");

  if ((rawPhoneNumber ?? "").trim() && !/^\+?\d{7,15}$/.test(typedPhoneNumber)) {
    return {
      ok: false,
      error:
        "Enter the clinic WhatsApp number in international format, for example +1 555 000 0000.",
    };
  }

  const requestedPhoneNumber =
    typedPhoneNumber || business.whatsappNumber?.trim() || "";

  if (!requestedPhoneNumber) {
    return {
      ok: false,
      error: "Enter the clinic WhatsApp number first, then start setup.",
    };
  }

  // Connect must act on the number in the input, not a previously saved one —
  // persist it before starting setup so the two can never diverge.
  if (typedPhoneNumber && typedPhoneNumber !== (business.whatsappNumber ?? "")) {
    await prisma.business.update({
      where: { id: business.id },
      data: { whatsappNumber: typedPhoneNumber },
    });
  }

  try {
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
          ? "WhatsApp is connected."
          : connection.status === "CONNECTING"
            ? "WhatsApp setup started."
            : "Clinic number saved. Finish the next step when it appears.",
      connection: buildWhatsAppConnectionSummary(connection, requestedPhoneNumber),
    };
  } catch {
    return {
      ok: false,
      error: "We couldn't start the clinic WhatsApp connection.",
    };
  }
}

export async function refreshWhatsAppLiveConnectionAction(): Promise<RefreshWhatsAppLiveConnectionResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Log in again to refresh the WhatsApp connection.",
    };
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });

  let connection;

  try {
    connection = await syncWhatsAppConnectionForBusiness(business.id);
  } catch {
    return {
      ok: false,
      error: "We couldn't refresh the clinic WhatsApp connection.",
    };
  }

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
        ? "WhatsApp is connected."
        : "Latest WhatsApp status loaded.",
    connection: buildWhatsAppConnectionSummary(
      resolvedConnection,
      business.whatsappNumber ?? ""
    ),
  };
}

export async function submitWhatsAppVerificationCodeAction(
  rawVerificationCode: string
): Promise<SubmitWhatsAppVerificationCodeResult> {
  const user = await getCurrentUser();

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
  } catch {
    return {
      ok: false,
      error: "We couldn't submit the verification code.",
    };
  }
}
