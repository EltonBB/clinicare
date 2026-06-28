"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCurrentBusiness, requireCurrentWorkspace } from "@/lib/business";
import { getCurrentUser, updateCurrentUserMetadata } from "@/lib/auth";
import { sanitizeAuthMetadataForSession } from "@/lib/auth-metadata";
import { syncWhatsAppConnectionForBusiness } from "@/lib/whatsapp-connection";
import QRCode from "qrcode";

import {
  fetchBaileysStatus,
  isBaileysWorkerConfigured,
  requestBaileysPairing,
} from "@/lib/messaging/baileys-control";
import type { WorkerConnectionStatus } from "@/lib/messaging/baileys-contract";
import { normalizePhone } from "@/lib/inbox";
import { normalizeStorageReference } from "@/lib/media-storage";
import { hasUnsafePublicUrl, normalizeOptionalPublicUrl } from "@/lib/safe-url";
import { deleteStorageReferences } from "@/lib/media-storage-server";
import { normalizeBrandHexColor, resolveBrandAccentPreset } from "@/lib/branding";
import {
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
      },
    });

    // `whatsappEnabled` is connection-derived state owned by the pairing flow —
    // it is NOT written here. There's no UI control for `whatsapp.sendReminders`,
    // so writing it on save would silently disable a paired clinic's reminders
    // on any unrelated settings change. The connection (provider, pairing
    // status) is likewise owned by pairing + the inbound webhook.
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

  // Business name, logo, brand accent, and owner name all render in the app
  // shell on every workspace route, and working hours feed calendar utilization.
  // Invalidate the whole layout tree so none of those surfaces lag a save
  // instead of enumerating a partial path list (which missed /clients, /staff,
  // /reports, /inbox).
  revalidatePath("/", "layout");

  return {
    ok: true,
    state: nextState,
  };
}

export type BaileysPairingResult =
  | { ok: true; status: WorkerConnectionStatus; qr?: string }
  | { ok: false; error: string };

/** Renders a raw QR payload to a small PNG data URL for the pairing UI. */
async function renderQrDataUrl(qr?: string): Promise<string | undefined> {
  if (!qr) {
    return undefined;
  }
  try {
    return await QRCode.toDataURL(qr, { margin: 1, width: 240 });
  } catch {
    return undefined;
  }
}

/**
 * Starts linking this workspace's WhatsApp via the worker, marking the
 * connection as Baileys-backed. The QR arrives asynchronously — the client
 * polls {@link getBaileysPairingStatusAction} for it.
 */
export async function connectBaileysWhatsAppAction(options?: {
  force?: boolean;
}): Promise<BaileysPairingResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Log in again to connect WhatsApp.",
    };
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });

  if (!isBaileysWorkerConfigured()) {
    return {
      ok: false,
      error: "WhatsApp connection isn't available yet. Please contact support.",
    };
  }

  await prisma.whatsAppConnection.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      provider: "BAILEYS",
      mode: "LIVE",
      status: "CONNECTING",
      onboardingStartedAt: new Date(),
    },
    update: {
      provider: "BAILEYS",
      mode: "LIVE",
      status: "CONNECTING",
      lastError: null,
    },
  });

  const state = await requestBaileysPairing(business.id, {
    force: options?.force === true,
  });
  if (!state) {
    return {
      ok: false,
      error: "We couldn't start the WhatsApp connection. Please try again.",
    };
  }

  if (state.status === "connected") {
    await markWhatsAppConnected(business.id);
    revalidatePath("/inbox");
  }

  revalidatePath("/settings");
  return { ok: true, status: state.status, qr: await renderQrDataUrl(state.qr) };
}

/**
 * Marks a workspace's WhatsApp connection CONNECTED and turns reminders on. A
 * clinic that just paired (and sees "Connected") should actually get
 * reminders — `Business.whatsappEnabled` gates the cron and defaults to false.
 */
async function markWhatsAppConnected(businessId: string): Promise<void> {
  // Match on businessId only (and (re)assert provider=BAILEYS in the data) so a
  // legacy/other-provider row can't make this silently update zero rows and
  // leave a connected session unrecorded.
  await prisma.whatsAppConnection.updateMany({
    where: { businessId },
    data: {
      provider: "BAILEYS",
      status: "CONNECTED",
      connectedAt: new Date(),
      lastSyncedAt: new Date(),
    },
  });
  await prisma.business.update({
    where: { id: businessId },
    data: { whatsappEnabled: true },
  });
}

/** Polls the worker for the current pairing/connection state (and QR). */
export async function getBaileysPairingStatusAction(): Promise<BaileysPairingResult> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Log in again to check WhatsApp.",
    };
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });

  const state = await fetchBaileysStatus(business.id);
  if (!state) {
    return {
      ok: false,
      error: "We couldn't reach the WhatsApp connection. Please try again.",
    };
  }

  if (state.status === "connected") {
    await markWhatsAppConnected(business.id);
    revalidatePath("/inbox");
  }

  return { ok: true, status: state.status, qr: await renderQrDataUrl(state.qr) };
}
