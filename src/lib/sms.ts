import { createHmac, timingSafeEqual } from "node:crypto";

import { normalizePhone } from "@/lib/inbox";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

function readRequiredEnv(
  name: "TWILIO_ACCOUNT_SID" | "TWILIO_AUTH_TOKEN" | "TWILIO_SMS_FROM"
) {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required SMS configuration: ${name}`);
  }

  return value.trim();
}

function normalizePublicBaseUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const withProtocol =
    /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    const hostname = url.hostname.toLowerCase();

    if (
      url.protocol !== "https:" ||
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname.endsWith(".local")
    ) {
      return null;
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function resolvePublicAppBaseUrl(configuredBase = process.env.APP_URL?.trim()) {
  const candidates = [
    configuredBase,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const resolved = normalizePublicBaseUrl(candidate);

    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function resolveTwilioSmsWebhookUrl(configuredBase = resolvePublicAppBaseUrl()) {
  if (!configuredBase) {
    return undefined;
  }

  try {
    return new URL("/api/webhooks/twilio/sms", configuredBase).toString();
  } catch {
    return undefined;
  }
}

type TwilioRequestOptions = {
  accountSid?: string | null;
  authToken?: string | null;
};

type TwilioRequestErrorPayload = {
  code?: number;
  message?: string;
  details?: string;
};

async function twilioJsonRequest<T>(
  url: string,
  init: RequestInit,
  options: TwilioRequestOptions = {}
) {
  const accountSid = options.accountSid?.trim() || readRequiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = options.authToken?.trim() || readRequiredEnv("TWILIO_AUTH_TOKEN");
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const payload = (await response.json()) as T & TwilioRequestErrorPayload;

  if (!response.ok) {
    const message = payload.message?.trim() || payload.details?.trim();
    throw new Error(message || "Twilio rejected the SMS request.");
  }

  return payload;
}

function normalizeSmsAddress(value: string) {
  const normalized = normalizePhone(value);

  if (!normalized) {
    throw new Error("A valid SMS phone number is required.");
  }

  return normalized;
}

export function getConfiguredTwilioSmsSender() {
  return normalizeSmsAddress(readRequiredEnv("TWILIO_SMS_FROM"));
}

export function getPublicTwilioSmsWebhookUrl() {
  return resolveTwilioSmsWebhookUrl(resolvePublicAppBaseUrl() ?? undefined);
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

type TwilioSendStatus =
  | "queued"
  | "accepted"
  | "scheduled"
  | "sending"
  | "sent"
  | "delivered"
  | "undelivered"
  | "failed";

export async function sendTwilioSmsMessage(args: {
  to: string;
  body: string;
  from?: string | null;
  accountSid?: string | null;
  authToken?: string | null;
}) {
  const accountSid = args.accountSid?.trim() || readRequiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = args.authToken?.trim() || readRequiredEnv("TWILIO_AUTH_TOKEN");
  const from = args.from?.trim()
    ? normalizeSmsAddress(args.from)
    : getConfiguredTwilioSmsSender();
  const to = normalizeSmsAddress(args.to);
  const statusCallback = resolveTwilioSmsWebhookUrl();

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
        To: to,
        Body: args.body,
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
    throw new Error(payload.message ?? "Twilio rejected the SMS request.");
  }

  return {
    sid: payload.sid ?? "",
    status: payload.status ?? "queued",
  };
}

type TwilioIncomingPhoneNumberPayload = {
  sid?: string;
  phone_number?: string;
  sms_url?: string | null;
  status_callback?: string | null;
};

type TwilioIncomingPhoneNumbersListPayload = {
  incoming_phone_numbers?: TwilioIncomingPhoneNumberPayload[];
};

export type TwilioSmsPhoneNumber = {
  sid: string;
  phoneNumber: string;
  smsUrl: string;
  statusCallback: string;
};

function normalizeIncomingPhoneNumberPayload(
  payload: TwilioIncomingPhoneNumberPayload
): TwilioSmsPhoneNumber {
  return {
    sid: payload.sid ?? "",
    phoneNumber: normalizePhone(payload.phone_number ?? ""),
    smsUrl: payload.sms_url?.trim() ?? "",
    statusCallback: payload.status_callback?.trim() ?? "",
  };
}

export async function findTwilioSmsPhoneNumberByPhoneNumber(
  phoneNumber: string,
  options: TwilioRequestOptions = {}
) {
  const accountSid = options.accountSid?.trim() || readRequiredEnv("TWILIO_ACCOUNT_SID");
  const normalizedPhone = normalizeSmsAddress(phoneNumber);
  const payload = await twilioJsonRequest<TwilioIncomingPhoneNumbersListPayload>(
    `${TWILIO_API_BASE}/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(normalizedPhone)}`,
    {
      method: "GET",
    },
    options
  );

  const phone = (payload.incoming_phone_numbers ?? [])
    .map(normalizeIncomingPhoneNumberPayload)
    .find((candidate) => candidate.phoneNumber === normalizedPhone);

  return phone ?? null;
}

export async function updateTwilioSmsPhoneWebhook(args: {
  phoneSid: string;
  callbackUrl: string;
  accountSid?: string | null;
  authToken?: string | null;
}) {
  const accountSid = args.accountSid?.trim() || readRequiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = args.authToken?.trim() || readRequiredEnv("TWILIO_AUTH_TOKEN");
  const callbackUrl = args.callbackUrl.trim();
  const response = await fetch(
    `${TWILIO_API_BASE}/Accounts/${accountSid}/IncomingPhoneNumbers/${args.phoneSid}.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        SmsUrl: callbackUrl,
        SmsMethod: "POST",
        StatusCallback: callbackUrl,
      }),
      cache: "no-store",
    }
  );

  const payload = (await response.json()) as TwilioIncomingPhoneNumberPayload & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "Twilio rejected the SMS webhook update.");
  }

  return normalizeIncomingPhoneNumberPayload(payload);
}
