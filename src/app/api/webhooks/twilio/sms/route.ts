import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { validateTwilioSignature } from "@/lib/sms";

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

async function resolveInboundConnection(toPhone: string) {
  const normalizedTo = normalizePhone(toPhone);
  const connections = await prisma.smsConnection.findMany({
    where: {
      provider: "TWILIO",
      status: "CONNECTED",
    },
    select: {
      id: true,
      businessId: true,
      requestedPhoneNumber: true,
      senderPhoneNumber: true,
    },
  });

  return (
    connections.find(
      (connection) =>
        phoneLookupKey(connection.senderPhoneNumber ?? "") === phoneLookupKey(normalizedTo) ||
        phoneLookupKey(connection.requestedPhoneNumber ?? "") === phoneLookupKey(normalizedTo)
    ) ?? null
  );
}

export async function POST(request: Request) {
  const signature = request.headers.get("x-twilio-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Twilio signature." }, { status: 400 });
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
    console.error("Rejected Twilio SMS webhook due to invalid signature.");
    return NextResponse.json({ error: "Invalid Twilio signature." }, { status: 403 });
  }

  const from = params.From ?? "";
  const to = params.To ?? "";
  const body = (params.Body ?? "").trim();
  const messageSid = (params.MessageSid ?? "").trim();
  const messageStatus = (params.MessageStatus ?? "").trim();
  const errorCode = (params.ErrorCode ?? "").trim();

  if (messageSid && messageStatus && !body) {
    await prisma.message.updateMany({
      where: {
        providerMessageSid: messageSid,
        channel: "SMS",
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

  const inboundConnection = await resolveInboundConnection(to);

  if (!inboundConnection) {
    console.error("Twilio SMS webhook did not match any clinic number.", {
      from,
      to,
    });
    return xmlResponse();
  }

  const normalizedPhone = normalizePhone(from);
  const normalizedTo = normalizePhone(to);

  await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.upsert({
      where: {
        businessId_channel_phoneNumber: {
          businessId: inboundConnection.businessId,
          channel: "SMS",
          phoneNumber: normalizedPhone,
        },
      },
      update: {
        channel: "SMS",
        contactName: normalizedPhone,
        unreadCount: {
          increment: 1,
        },
      },
      create: {
        businessId: inboundConnection.businessId,
        channel: "SMS",
        phoneNumber: normalizedPhone,
        contactName: normalizedPhone,
        unreadCount: 1,
      },
      select: {
        id: true,
      },
    });

    const businessClients = await tx.client.findMany({
      where: {
        businessId: inboundConnection.businessId,
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
        channel: "SMS",
        direction: "INBOUND",
        body,
      },
    });

    await tx.smsConnection.update({
      where: {
        businessId: inboundConnection.businessId,
      },
      data: {
        status: "CONNECTED",
        senderPhoneNumber: normalizedTo,
        lastError: null,
        connectedAt: new Date(),
        lastSyncedAt: new Date(),
      },
    });
  });

  return xmlResponse();
}
