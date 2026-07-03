import { logger } from "@/lib/logger";

/**
 * Staff push notifications (Expo). This is the single choke point for sending
 * push to the mobile app — features call `sendStaffPush`, never the Expo API
 * directly, so the provider can be swapped in one place.
 *
 * Why not the patient `sendMessage` seam: that seam is phone/text/patient
 * shaped (recipient = phone, body = text). Staff push is internal app
 * notification infra (title + deep-link data, non-PHI), a different abstraction
 * — keeping it separate avoids polluting patient-messaging types with
 * push-only fields.
 *
 * HIPAA: payloads are generic and whitelisted by `buildStaffPushPayload`. A push
 * NEVER carries a patient name or any clinical detail — only "New message" /
 * "Schedule updated" style copy plus an in-app deep link.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type StaffPushKind = "message" | "appointment" | "reminder" | "system";

export type StaffPushPayload = {
  title: string;
  body: string;
  data?: { linkType: string; linkId: string };
};

const TITLES: Record<StaffPushKind, string> = {
  message: "New message",
  appointment: "Schedule updated",
  reminder: "Reminder",
  system: "Vela Staff",
};

const BODIES: Record<StaffPushKind, string> = {
  message: "You have a new message from your clinic.",
  appointment: "Your schedule has changed.",
  reminder: "You have a new reminder.",
  system: "Open the app for details.",
};

/**
 * Build a PHI-safe push payload. Takes only a kind + an optional deep link — by
 * construction there is no way for a patient name or clinical text to enter the
 * notification. Context is fetched in-app after the deep link.
 */
export function buildStaffPushPayload(input: {
  kind: StaffPushKind;
  linkType?: "conversation" | "appointment";
  linkId?: string;
}): StaffPushPayload {
  return {
    title: TITLES[input.kind],
    body: BODIES[input.kind],
    data: input.linkType && input.linkId ? { linkType: input.linkType, linkId: input.linkId } : undefined,
  };
}

/**
 * Send a push to one or more Expo device tokens. Best-effort: never throws, so a
 * push failure can't break the action that triggered it. Invalid/empty tokens
 * are dropped.
 */
export async function sendStaffPush(
  expoPushTokens: Array<string | null | undefined>,
  payload: StaffPushPayload
): Promise<void> {
  const tokens = Array.from(
    new Set(
      expoPushTokens.filter(
        (token): token is string => !!token && token.startsWith("ExponentPushToken")
      )
    )
  );
  if (tokens.length === 0) {
    return;
  }

  const messages = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    sound: "default" as const,
    ...(payload.data ? { data: payload.data } : {}),
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(messages),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.error("Expo push send failed.", undefined, { status: response.status });
    }
  } catch (error) {
    logger.error("Expo push send threw.", error);
  } finally {
    clearTimeout(timer);
  }
}
