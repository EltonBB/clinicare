import { createHmac, timingSafeEqual } from "node:crypto";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

function readRequiredEnv(
  name: "TWILIO_ACCOUNT_SID" | "TWILIO_AUTH_TOKEN" | "TWILIO_WHATSAPP_FROM"
) {
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
  from?: string | null;
  accountSid?: string | null;
  authToken?: string | null;
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

function isPrivateIpv4Hostname(hostname: string) {
  const octets = hostname.split(".").map((part) => Number(part));

  if (octets.length !== 4 || octets.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function resolveTwilioStatusCallback(configuredBase = process.env.APP_URL?.trim()) {

  if (!configuredBase) {
    return undefined;
  }

  try {
    const url = new URL(configuredBase);
    const hostname = url.hostname.toLowerCase();

    if (
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname.endsWith(".local") ||
      isPrivateIpv4Hostname(hostname)
    ) {
      return undefined;
    }

    return new URL("/api/webhooks/twilio/whatsapp", url).toString();
  } catch {
    return undefined;
  }
}

export function getConfiguredTwilioWhatsAppSender() {
  return normalizeWhatsAppAddress(readRequiredEnv("TWILIO_WHATSAPP_FROM"));
}

export function validateTwilioSignature(args: {
  url: string;
  params: Record<string, string>;
  signature: string;
  authToken?: string | null;
}) {
  const authToken = args.authToken?.trim() || readRequiredEnv("TWILIO_AUTH_TOKEN");
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
  from: rawFrom,
  accountSid: rawAccountSid,
  authToken: rawAuthToken,
}: SendWhatsAppMessageInput) {
  const accountSid = rawAccountSid?.trim() || readRequiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = rawAuthToken?.trim() || readRequiredEnv("TWILIO_AUTH_TOKEN");
  const from = rawFrom?.trim()
    ? normalizeWhatsAppAddress(rawFrom)
    : getConfiguredTwilioWhatsAppSender();
  const toAddress = normalizeWhatsAppAddress(to);
  const statusCallback = resolveTwilioStatusCallback();

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
