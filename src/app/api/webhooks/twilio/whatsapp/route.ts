import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
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

    console.error("Twilio webhook matched multiple connected clinic senders.");
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
    console.error("Twilio webhook matched multiple requested clinic numbers.");
  }

  return null;
}

async function resolveInboundConversation(
  connection: Awaited<ReturnType<typeof resolveInboundConnection>>,
  fromPhone: string
) {
  if (!connection) {
    return null;
  }

  const normalizedPhone = normalizePhone(fromPhone);
  const scopedBusinessIds = [connection.businessId];

  const [existingConversations, matchingClients] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        businessId: {
          in: scopedBusinessIds,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        businessId: true,
        contactName: true,
        phoneNumber: true,
      },
    }),
    prisma.client.findMany({
      where: {
        businessId: {
          in: scopedBusinessIds,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        businessId: true,
        name: true,
        phone: true,
      },
    }),
  ]);

  const existingConversation = existingConversations.find(
    (conversation) => phoneLookupKey(conversation.phoneNumber) === phoneLookupKey(normalizedPhone)
  );

  if (existingConversation) {
    return {
      businessId: existingConversation.businessId,
      conversationId: existingConversation.id,
      normalizedPhone,
      contactName: existingConversation.contactName,
    };
  }

  const matchingClient = matchingClients.find(
    (client) => phoneLookupKey(client.phone) === phoneLookupKey(normalizedPhone)
  );

  if (!matchingClient) {
    if (connection.mode === "SANDBOX") {
      return {
        businessId: connection.businessId,
        conversationId: null,
        normalizedPhone,
        clientId: null,
        contactName: normalizedPhone,
      };
    }

    if (connection.mode === "LIVE") {
      return {
        businessId: connection.businessId,
        conversationId: null,
        normalizedPhone,
        clientId: null,
        contactName: normalizedPhone,
      };
    }

    return null;
  }

  return {
    businessId: matchingClient.businessId,
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
    console.error("Rejected Twilio webhook due to invalid signature.");
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

  const inboundConnection = await resolveInboundConnection(to, from);
  const resolved = await resolveInboundConversation(inboundConnection, from);

  if (!resolved) {
    console.error("Twilio webhook did not match any clinic conversation or client.");
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

    const businessClients = await tx.client.findMany({
      where: {
        businessId: resolved.businessId,
      },
      select: {
        id: true,
        phone: true,
      },
    });
    const matchedClient = businessClients.find(
      (client) => phoneLookupKey(client.phone) === phoneLookupKey(normalizedPhone)
    );

    await tx.message.create({
      data: {
        conversationId: conversation.id,
        clientId: matchedClient?.id ?? null,
        direction: "INBOUND",
        body,
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
