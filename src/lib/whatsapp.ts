import { createHmac, timingSafeEqual } from "node:crypto";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

function readRequiredEnv(name: "TWILIO_ACCOUNT_SID" | "TWILIO_AUTH_TOKEN" | "TWILIO_WHATSAPP_FROM") {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required WhatsApp configuration: ${name}`);
  }

  return value.trim();
}

function normalizeWhatsAppAddress(value: string) {
  const trimmed = value
    .trim()
    .replace(/^whatsapp:/i, "")
    .replace(/[\s()-]/g, "");

  if (!trimmed) {
    throw new Error("A WhatsApp phone number is required.");
  }

  return `whatsapp:${trimmed}`;
}

type SendWhatsAppMessageInput = {
  to: string;
  body: string;
};

type TwilioSendStatus =
  | "queued"
  | "accepted"
  | "scheduled"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "undelivered"
  | "failed";

export function getConfiguredTwilioWhatsAppSender() {
  return normalizeWhatsAppAddress(readRequiredEnv("TWILIO_WHATSAPP_FROM"));
}

export function validateTwilioSignature(args: {
  url: string;
  params: Record<string, string>;
  signature: string;
}) {
  const authToken = readRequiredEnv("TWILIO_AUTH_TOKEN");
  const payload = Object.keys(args.params)
    .sort()
    .reduce((result, key) => result + key + args.params[key], args.url);
  const expected = createHmac("sha1", authToken).update(payload).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(args.signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function sendTwilioWhatsAppMessage({
  to,
  body,
}: SendWhatsAppMessageInput) {
  const accountSid = readRequiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = readRequiredEnv("TWILIO_AUTH_TOKEN");
  const from = getConfiguredTwilioWhatsAppSender();
  const toAddress = normalizeWhatsAppAddress(to);
  const statusCallback = process.env.APP_URL?.trim()
    ? `${process.env.APP_URL.trim().replace(/\/$/, "")}/api/webhooks/twilio/whatsapp`
    : undefined;

  const response = await fetch(
    `${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: from,
        To: toAddress,
        Body: body,
        ...(statusCallback ? { StatusCallback: statusCallback } : {}),
      }),
      cache: "no-store",
    }
  );

  const payload = (await response.json()) as {
    sid?: string;
    message?: string;
    status?: TwilioSendStatus;
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "Twilio rejected the WhatsApp request.");
  }

  return {
    sid: payload.sid ?? "",
    status: payload.status ?? "queued",
  };
}
