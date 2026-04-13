import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import {
  getConfiguredTwilioWhatsAppSender,
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

async function resolveInboundConversation(fromPhone: string, toPhone: string) {
  const normalizedPhone = normalizePhone(fromPhone);
  const connectedConnections = await prisma.whatsAppConnection.findMany({
    where: {
      provider: "TWILIO",
      status: "CONNECTED",
    },
    select: {
      businessId: true,
      mode: true,
      requestedPhoneNumber: true,
      sandboxRecipientPhoneNumber: true,
      senderPhoneNumber: true,
    },
  });
  const candidateBusinessIds = connectedConnections
    .filter(
      (connection) =>
        phoneLookupKey(connection.senderPhoneNumber ?? "") === phoneLookupKey(toPhone)
    )
    .map((connection) => connection.businessId);

  if (candidateBusinessIds.length === 0) {
    return null;
  }

  const sandboxRecipientConnection = connectedConnections.find(
    (connection) =>
      connection.mode === "SANDBOX" &&
      phoneLookupKey(connection.sandboxRecipientPhoneNumber ?? "") ===
        phoneLookupKey(normalizedPhone)
  );

  const requestedClinicConnection = connectedConnections.find(
    (connection) =>
      phoneLookupKey(connection.requestedPhoneNumber ?? "") ===
      phoneLookupKey(normalizedPhone)
  );

  const scopedBusinessIds = sandboxRecipientConnection
    ? [sandboxRecipientConnection.businessId]
    : requestedClinicConnection
      ? [requestedClinicConnection.businessId]
    : candidateBusinessIds;

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
    if (sandboxRecipientConnection) {
      return {
        businessId: sandboxRecipientConnection.businessId,
        conversationId: null,
        normalizedPhone,
        clientId: null,
        contactName: normalizedPhone,
      };
    }

    if (requestedClinicConnection) {
      return {
        businessId: requestedClinicConnection.businessId,
        conversationId: null,
        normalizedPhone,
        clientId: null,
        contactName: normalizedPhone,
      };
    }

    if (candidateBusinessIds.length === 1) {
      return {
        businessId: candidateBusinessIds[0],
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

  const isValid = validateTwilioSignature({
    url: resolveWebhookUrl(request),
    params,
    signature,
  });

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

  const expectedSender = getConfiguredTwilioWhatsAppSender();

  if (phoneLookupKey(to) !== phoneLookupKey(expectedSender)) {
    console.error("Rejected Twilio webhook due to unexpected sender target.", {
      to,
      expectedSender,
    });
    return xmlResponse();
  }

  const resolved = await resolveInboundConversation(from, to);

  if (!resolved) {
    console.error("Twilio webhook did not match any clinic conversation or client.", {
      from,
    });
    return xmlResponse();
  }

  const normalizedPhone = resolved.normalizedPhone;

  await prisma.$transaction(async (tx) => {
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
