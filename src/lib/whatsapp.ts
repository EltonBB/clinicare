import { createHmac, timingSafeEqual } from "node:crypto";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";
const TWILIO_MESSAGING_API_BASE = "https://messaging.twilio.com/v2";

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

type SendWhatsAppTemplateMessageInput = {
  to: string;
  contentSid: string;
  contentVariables?: Record<string, string>;
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
      hostname.endsWith(".local") ||
      isPrivateIpv4Hostname(hostname)
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

function resolveTwilioStatusCallback(configuredBase = resolvePublicAppBaseUrl()) {
  if (!configuredBase) {
    return undefined;
  }

  try {
    return new URL("/api/webhooks/twilio/whatsapp", configuredBase).toString();
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
    throw new Error(message || "Twilio rejected the request.");
  }

  return payload;
}

export function getConfiguredTwilioWhatsAppSender() {
  return normalizeWhatsAppAddress(readRequiredEnv("TWILIO_WHATSAPP_FROM"));
}

export function getConfiguredTwilioWabaId() {
  const value = process.env.TWILIO_WHATSAPP_WABA_ID?.trim();
  return value && value.length > 0 ? value : null;
}

export function getConfiguredTwilioFirstMessageTemplateSid() {
  const value = process.env.TWILIO_WHATSAPP_FIRST_MESSAGE_TEMPLATE_SID?.trim();
  return value && value.length > 0 ? value : null;
}

export function getPublicTwilioWebhookUrl() {
  return resolveTwilioStatusCallback(resolvePublicAppBaseUrl() ?? undefined);
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

export async function sendTwilioWhatsAppTemplateMessage({
  to,
  contentSid,
  contentVariables,
  from: rawFrom,
  accountSid: rawAccountSid,
  authToken: rawAuthToken,
}: SendWhatsAppTemplateMessageInput) {
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
        ContentSid: contentSid.trim(),
        ...(contentVariables
          ? {
              ContentVariables: JSON.stringify(contentVariables),
            }
          : {}),
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
    throw new Error(payload.message ?? "Twilio rejected the WhatsApp template request.");
  }

  return {
    sid: payload.sid ?? "",
    status: payload.status ?? "queued",
  };
}

type TwilioAccountSummaryPayload = {
  sid: string;
  status: string;
  type: string;
};

export async function fetchTwilioAccountSummary(options: TwilioRequestOptions = {}) {
  const accountSid = options.accountSid?.trim() || readRequiredEnv("TWILIO_ACCOUNT_SID");
  const payload = await twilioJsonRequest<TwilioAccountSummaryPayload>(
    `${TWILIO_API_BASE}/Accounts/${accountSid}.json`,
    {
      method: "GET",
    },
    options
  );

  return {
    sid: payload.sid,
    status: payload.status,
    type: payload.type,
  };
}

type TwilioSenderPayload = {
  sid?: string;
  status?: string;
  sender_id?: string;
  senderId?: string;
  offline_reasons?: Array<{
    message?: string;
  }>;
  offlineReasons?: Array<{
    message?: string;
  }>;
  profile?: {
    name?: string;
  };
  properties?: {
    offline_reasons?: Array<{
      message?: string;
    }>;
    offlineReasons?: Array<{
      message?: string;
    }>;
  };
  webhook?: {
    callback_url?: string | null;
    status_callback_url?: string | null;
  } | null;
};

type TwilioSendersListPayload = {
  senders?: TwilioSenderPayload[];
};

export type TwilioWhatsAppSender = {
  sid: string;
  status: string;
  senderId: string;
  profileName: string;
  offlineReason: string;
  callbackUrl: string;
  statusCallbackUrl: string;
};

function normalizeTwilioSenderPayload(payload: TwilioSenderPayload): TwilioWhatsAppSender {
  const offlineReasons =
    payload.offline_reasons ??
    payload.offlineReasons ??
    payload.properties?.offline_reasons ??
    payload.properties?.offlineReasons ??
    [];

  return {
    sid: payload.sid ?? "",
    status: payload.status ?? "DRAFT",
    senderId: payload.sender_id ?? payload.senderId ?? "",
    profileName: payload.profile?.name ?? "",
    offlineReason:
      offlineReasons.find((item) => item.message?.trim())?.message?.trim() ?? "",
    callbackUrl: payload.webhook?.callback_url?.trim() ?? "",
    statusCallbackUrl: payload.webhook?.status_callback_url?.trim() ?? "",
  };
}

type CreateTwilioWhatsAppSenderInput = {
  phoneNumber: string;
  businessName: string;
  callbackUrl?: string | null;
  wabaId?: string | null;
  accountSid?: string | null;
  authToken?: string | null;
};

export async function createTwilioWhatsAppSender({
  phoneNumber,
  businessName,
  callbackUrl,
  wabaId,
  accountSid,
  authToken,
}: CreateTwilioWhatsAppSenderInput) {
  const webhookUrl = callbackUrl?.trim() || getPublicTwilioWebhookUrl();
  const senderId = normalizeWhatsAppAddress(phoneNumber);
  const payload = await twilioJsonRequest<TwilioSenderPayload>(
    `${TWILIO_MESSAGING_API_BASE}/Channels/Senders`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender_id: senderId,
        ...(wabaId?.trim()
          ? {
              configuration: {
                waba_id: wabaId.trim(),
              },
            }
          : {}),
        profile: {
          name: businessName.trim() || "Clinicare",
        },
        ...(webhookUrl
          ? {
              webhook: {
                callback_url: webhookUrl,
                callback_method: "POST",
                status_callback_url: webhookUrl,
                status_callback_method: "POST",
              },
            }
          : {}),
      }),
    },
    { accountSid, authToken }
  );

  return normalizeTwilioSenderPayload(payload);
}

export async function fetchTwilioWhatsAppSender(
  senderSid: string,
  options: TwilioRequestOptions = {}
) {
  const payload = await twilioJsonRequest<TwilioSenderPayload>(
    `${TWILIO_MESSAGING_API_BASE}/Channels/Senders/${senderSid}`,
    {
      method: "GET",
    },
    options
  );

  return normalizeTwilioSenderPayload(payload);
}

export async function findTwilioWhatsAppSenderByPhoneNumber(
  phoneNumber: string,
  options: TwilioRequestOptions = {}
) {
  const senderId = normalizeWhatsAppAddress(phoneNumber);
  const senders = await listTwilioWhatsAppSenders(options);

  const sender = senders.find((candidate) => {
    return candidate.senderId.toLowerCase() === senderId.toLowerCase();
  });

  return sender ?? null;
}

export async function listTwilioWhatsAppSenders(
  options: TwilioRequestOptions = {}
) {
  const payload = await twilioJsonRequest<TwilioSendersListPayload>(
    `${TWILIO_MESSAGING_API_BASE}/Channels/Senders?Channel=whatsapp&PageSize=1000`,
    {
      method: "GET",
    },
    options
  );

  return (payload.senders ?? []).map(normalizeTwilioSenderPayload);
}

export async function updateTwilioWhatsAppSenderWebhook(args: {
  senderSid: string;
  callbackUrl: string;
  accountSid?: string | null;
  authToken?: string | null;
}) {
  const callbackUrl = args.callbackUrl.trim();
  const payload = await twilioJsonRequest<TwilioSenderPayload>(
    `${TWILIO_MESSAGING_API_BASE}/Channels/Senders/${args.senderSid}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        webhook: {
          callback_url: callbackUrl,
          callback_method: "POST",
          status_callback_url: callbackUrl,
          status_callback_method: "POST",
        },
      }),
    },
    {
      accountSid: args.accountSid,
      authToken: args.authToken,
    }
  );

  return normalizeTwilioSenderPayload(payload);
}

export async function verifyTwilioWhatsAppSender(args: {
  senderSid: string;
  verificationCode: string;
  accountSid?: string | null;
  authToken?: string | null;
}) {
  const payload = await twilioJsonRequest<TwilioSenderPayload>(
    `${TWILIO_MESSAGING_API_BASE}/Channels/Senders/${args.senderSid}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        configuration: {
          verification_code: args.verificationCode.trim(),
        },
      }),
    },
    {
      accountSid: args.accountSid,
      authToken: args.authToken,
    }
  );

  return normalizeTwilioSenderPayload(payload);
}
