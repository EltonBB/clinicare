import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { logger } from "@/lib/logger";
import {
  validateTwilioSignature,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

function xmlResponse() {
  return new NextResponse("<Response></Response>", {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}

function resolveWebhookUrl(request: Request) {
  const incoming = new URL(request.url);
  const configuredBase = process.env.APP_URL?.trim();

  if (configuredBase) {
    return `${configuredBase.replace(/\/$/, "")}${incoming.pathname}`;
  }

  return incoming.toString();
}

function resolveWebhookValidationUrls(request: Request) {
  const incoming = new URL(request.url);
  const candidates = new Set<string>();
  const forwardedProto =
    request.headers.get("x-forwarded-proto")?.trim() ||
    incoming.protocol.replace(/:$/, "") ||
    "https";
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.trim() ||
    request.headers.get("host")?.trim() ||
    "";

  candidates.add(incoming.toString());
  candidates.add(resolveWebhookUrl(request));

  if (forwardedHost) {
    candidates.add(
      `${forwardedProto}://${forwardedHost}${incoming.pathname}${incoming.search}`
    );
  }

  return Array.from(candidates);
}

function toDeliveryStatus(status: string) {
  const normalized = status.trim().toLowerCase();

  if (normalized === "read") {
    return "READ" as const;
  }

  if (normalized === "delivered") {
    return "DELIVERED" as const;
  }

  if (normalized === "sent") {
    return "SENT" as const;
  }

  if (normalized === "failed" || normalized === "undelivered") {
    return "FAILED" as const;
  }

  return "QUEUED" as const;
}

async function resolveInboundConnection(toPhone: string, fromPhone: string) {
  const normalizedTo = normalizePhone(toPhone);
  const normalizedFrom = normalizePhone(fromPhone);
  const connections = await prisma.whatsAppConnection.findMany({
    where: {
      provider: "TWILIO",
      status: {
        in: ["CONNECTED", "PENDING_VERIFICATION"],
      },
    },
    select: {
      id: true,
      businessId: true,
      status: true,
      mode: true,
      requestedPhoneNumber: true,
      sandboxRecipientPhoneNumber: true,
      senderPhoneNumber: true,
    },
  });

  const connectedMatch = connections.filter(
    (connection) =>
      phoneLookupKey(connection.senderPhoneNumber ?? "") === phoneLookupKey(normalizedTo)
  );

  if (connectedMatch.length === 1) {
    return connectedMatch[0];
  }

  if (connectedMatch.length > 1) {
    const sandboxMatch = connectedMatch.find(
      (connection) =>
        connection.mode === "SANDBOX" &&
        phoneLookupKey(connection.sandboxRecipientPhoneNumber ?? "") ===
          phoneLookupKey(normalizedFrom)
    );

    if (sandboxMatch) {
      return sandboxMatch;
    }

    logger.error("Twilio webhook matched multiple connected clinic senders.");
    return null;
  }

  const requestedMatch = connections.filter(
    (connection) =>
      connection.mode === "LIVE" &&
      phoneLookupKey(connection.requestedPhoneNumber ?? "") === phoneLookupKey(normalizedTo)
  );

  if (requestedMatch.length === 1) {
    return requestedMatch[0];
  }

  if (requestedMatch.length > 1) {
    logger.error("Twilio webhook matched multiple requested clinic numbers.");
  }

  return null;
}

// Client phone numbers are free-text (spaces, formatting), so match leniently on
// the digit key. This is a single bounded query over small columns, replacing
// the previous repeated full-client scans. (A normalized-phone column would let
// this become a direct indexed lookup — tracked as a follow-up.)
async function findClientByPhone(businessId: string, normalizedPhone: string) {
  const candidates = await prisma.client.findMany({
    where: {
      businessId,
    },
    select: {
      id: true,
      name: true,
      phone: true,
    },
  });
  const key = phoneLookupKey(normalizedPhone);

  return candidates.find((client) => phoneLookupKey(client.phone) === key) ?? null;
}

async function resolveInboundConversation(
  connection: Awaited<ReturnType<typeof resolveInboundConnection>>,
  fromPhone: string
) {
  if (!connection) {
    return null;
  }

  const normalizedPhone = normalizePhone(fromPhone);
  const businessId = connection.businessId;

  // Conversations are always stored with the normalized phone, so the unique
  // (businessId, phoneNumber) index resolves them directly — no table scan.
  const [existingConversation, matchingClient] = await Promise.all([
    prisma.conversation.findUnique({
      where: {
        businessId_phoneNumber: {
          businessId,
          phoneNumber: normalizedPhone,
        },
      },
      select: {
        id: true,
        contactName: true,
      },
    }),
    findClientByPhone(businessId, normalizedPhone),
  ]);

  if (existingConversation) {
    return {
      businessId,
      conversationId: existingConversation.id,
      normalizedPhone,
      clientId: matchingClient?.id ?? null,
      contactName: existingConversation.contactName,
    };
  }

  if (!matchingClient) {
    if (connection.mode === "SANDBOX" || connection.mode === "LIVE") {
      return {
        businessId,
        conversationId: null,
        normalizedPhone,
        clientId: null,
        contactName: normalizedPhone,
      };
    }

    return null;
  }

  return {
    businessId,
    conversationId: null,
    normalizedPhone,
    clientId: matchingClient.id,
    contactName: matchingClient.name,
  };
}

export async function POST(request: Request) {
  const signature = request.headers.get("x-twilio-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Twilio signature." },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const params = Object.fromEntries(
    Array.from(formData.entries()).map(([key, value]) => [key, String(value)])
  );

  const isValid = resolveWebhookValidationUrls(request).some((url) =>
    validateTwilioSignature({
      url,
      params,
      signature,
    })
  );

  if (!isValid) {
    logger.error("Rejected Twilio webhook due to invalid signature.");
    return NextResponse.json(
      { error: "Invalid Twilio signature." },
      { status: 403 }
    );
  }

  const from = params.From ?? "";
  const to = params.To ?? "";
  const body = (params.Body ?? "").trim();
  const profileName = (params.ProfileName ?? "").trim();
  const messageSid = (params.MessageSid ?? "").trim();
  const messageStatus = (params.MessageStatus ?? "").trim();
  const errorCode = (params.ErrorCode ?? "").trim();

  if (messageSid && messageStatus && !body) {
    await prisma.message.updateMany({
      where: {
        providerMessageSid: messageSid,
      },
      data: {
        deliveryStatus: toDeliveryStatus(messageStatus),
        deliveryErrorCode: errorCode || null,
        deliveryUpdatedAt: new Date(),
      },
    });

    return xmlResponse();
  }

  if (!from || !body) {
    return xmlResponse();
  }

  // Idempotency: Twilio retries any webhook it doesn't get a prompt 2xx for, so
  // a slow/cold invocation can redeliver the same inbound message. Ack-and-skip
  // if we've already stored this MessageSid, otherwise retries would duplicate
  // the message and re-increment the unread badge. (A unique index on
  // Message.providerMessageSid is the hard backstop once applied.)
  if (messageSid) {
    const alreadyProcessed = await prisma.message.findFirst({
      where: {
        providerMessageSid: messageSid,
      },
      select: {
        id: true,
      },
    });

    if (alreadyProcessed) {
      return xmlResponse();
    }
  }

  const inboundConnection = await resolveInboundConnection(to, from);
  const resolved = await resolveInboundConversation(inboundConnection, from);

  if (!resolved) {
    logger.error("Twilio webhook did not match any clinic conversation or client.");
    return xmlResponse();
  }

  const normalizedPhone = resolved.normalizedPhone;
  const normalizedTo = normalizePhone(to);

  await prisma.$transaction(async (tx) => {
    if (
      inboundConnection &&
      inboundConnection.mode === "LIVE" &&
      (inboundConnection.status !== "CONNECTED" ||
        phoneLookupKey(inboundConnection.senderPhoneNumber ?? "") !==
          phoneLookupKey(normalizedTo))
    ) {
      await tx.whatsAppConnection.update({
        where: {
          id: inboundConnection.id,
        },
        data: {
          status: "CONNECTED",
          verificationStatus: "VERIFIED",
          senderPhoneNumber: normalizedTo,
          connectedAt: new Date(),
          lastError: null,
          lastSyncedAt: new Date(),
        },
      });
    }

    const conversation = await tx.conversation.upsert({
      where: {
        businessId_phoneNumber: {
          businessId: resolved.businessId,
          phoneNumber: normalizedPhone,
        },
      },
      update: {
        contactName: profileName || resolved.contactName || normalizedPhone,
        unreadCount: {
          increment: 1,
        },
      },
      create: {
        businessId: resolved.businessId,
        phoneNumber: normalizedPhone,
        contactName: profileName || resolved.contactName || normalizedPhone,
        unreadCount: 1,
      },
      select: {
        id: true,
      },
    });

    await tx.message.create({
      data: {
        conversationId: conversation.id,
        // Client already resolved (leniently) above — no second table scan.
        clientId: resolved.clientId ?? null,
        direction: "INBOUND",
        body,
        providerMessageSid: messageSid || null,
      },
    });

    await tx.whatsAppConnection.updateMany({
      where: {
        businessId: resolved.businessId,
      },
      data: {
        status: "CONNECTED",
        lastSyncedAt: new Date(),
      },
    });
  });

  return xmlResponse();
}
