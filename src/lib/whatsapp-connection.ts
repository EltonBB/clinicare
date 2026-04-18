import type {
  WhatsAppConnection,
  WhatsAppConnectionStatus,
  WhatsAppDisplayNameStatus,
  WhatsAppVerificationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  createTwilioWhatsAppSender,
  findTwilioWhatsAppSenderByPhoneNumber,
  fetchTwilioAccountSummary,
  fetchTwilioWhatsAppSender,
  getConfiguredTwilioWabaId,
  getPublicTwilioWebhookUrl,
  listTwilioWhatsAppSenders,
  updateTwilioWhatsAppSenderWebhook,
  verifyTwilioWhatsAppSender,
  type TwilioWhatsAppSender,
} from "@/lib/whatsapp";
import { normalizePhone } from "@/lib/inbox";

export function isLiveWhatsAppConnectionReady(connection: {
  mode: string;
  status: string;
  senderPhoneNumber: string | null;
} | null) {
  return (
    connection?.mode === "LIVE" &&
    connection.status === "CONNECTED" &&
    Boolean(connection.senderPhoneNumber?.trim())
  );
}

function normalizeLiveNumber(value: string) {
  return normalizePhone(value).replace(/^whatsapp:/i, "");
}

async function buildLiveConnectionErrorMessage(args: {
  requestedPhoneNumber: string;
  rawMessage: string;
}) {
  const rawMessage = args.rawMessage.trim();

  if (!rawMessage) {
    return "We couldn't start the clinic WhatsApp connection.";
  }

  if (!/another WABA ID|more than 1 sender/i.test(rawMessage)) {
    return rawMessage;
  }

  try {
    const senders = (await listTwilioWhatsAppSenders())
      .map(normalizeTwilioSenderForComparison)
      .filter((sender) => sender.phoneNumber);
    const requestedPhoneNumber = normalizeLiveNumber(args.requestedPhoneNumber);
    const matchingSender = senders.find(
      (sender) => sender.phoneNumber === requestedPhoneNumber
    );

    if (matchingSender) {
      return `This clinic number already exists in the WhatsApp provider. Refresh the connection status to attach the existing sender for ${matchingSender.phoneNumber}.`;
    }

    const activeSender =
      senders.find((sender) => sender.status === "ONLINE") ?? senders[0];

    if (activeSender) {
      return `A different WhatsApp sender is already active for this provider account (${activeSender.phoneNumber}). If you want to test now, save that number as the clinic WhatsApp number. If you want to use ${requestedPhoneNumber} instead, move that number into the current WhatsApp Business account first.`;
    }
  } catch {
    // Fall back to a customer-facing message below if provider discovery fails.
  }

  return `This clinic number is not the active WhatsApp sender on the current provider account. Use the provider's active sender for testing, or finish moving ${normalizeLiveNumber(args.requestedPhoneNumber)} into the current WhatsApp Business account first.`;
}

function normalizeTwilioSenderForComparison(sender: TwilioWhatsAppSender) {
  return {
    ...sender,
    phoneNumber: sender.senderId ? normalizeLiveNumber(sender.senderId) : "",
  };
}

async function refreshSenderWebhookIfNeeded(sender: TwilioWhatsAppSender) {
  const webhookUrl = getPublicTwilioWebhookUrl();

  if (!webhookUrl || sender.status.toUpperCase() !== "OFFLINE") {
    return sender;
  }

  try {
    await updateTwilioWhatsAppSenderWebhook({
      senderSid: sender.sid,
      callbackUrl: webhookUrl,
    });

    return await fetchTwilioWhatsAppSender(sender.sid);
  } catch {
    return sender;
  }
}

function mapTwilioSenderStatus(
  providerStatus: string,
  currentDisplayStatus?: WhatsAppDisplayNameStatus | null
): {
  connectionStatus: WhatsAppConnectionStatus;
  verificationStatus: WhatsAppVerificationStatus;
  displayNameStatus: WhatsAppDisplayNameStatus;
} {
  switch (providerStatus.toUpperCase()) {
    case "ONLINE":
      return {
        connectionStatus: "CONNECTED",
        verificationStatus: "VERIFIED",
        displayNameStatus:
          currentDisplayStatus && currentDisplayStatus !== "UNKNOWN"
            ? currentDisplayStatus
            : "APPROVED",
      };
    case "CREATING":
    case "DRAFT":
    case "STUBBED":
      return {
        connectionStatus: "CONNECTING",
        verificationStatus: "PENDING",
        displayNameStatus: currentDisplayStatus ?? "PENDING",
      };
    case "VERIFYING":
    case "PENDING_VERIFICATION":
    case "TWILIO_REVIEW":
    case "ONLINE:UPDATING":
      return {
        connectionStatus: "PENDING_VERIFICATION",
        verificationStatus: "PENDING",
        displayNameStatus: currentDisplayStatus ?? "PENDING",
      };
    default:
      return {
        connectionStatus: "ERRORED",
        verificationStatus: "FAILED",
        displayNameStatus:
          currentDisplayStatus && currentDisplayStatus !== "UNKNOWN"
            ? currentDisplayStatus
            : "PENDING",
      };
  }
}

async function updateConnectionFromSender(
  connection: WhatsAppConnection,
  sender: TwilioWhatsAppSender,
  lastError?: string | null
) {
  const mapped = mapTwilioSenderStatus(
    sender.status,
    connection.displayNameStatus
  );

  return prisma.whatsAppConnection.update({
    where: {
      id: connection.id,
    },
    data: {
      mode: "LIVE",
      status: mapped.connectionStatus,
      requestedPhoneNumber: connection.requestedPhoneNumber,
      senderPhoneNumber:
        mapped.connectionStatus === "CONNECTED"
          ? normalizeLiveNumber(sender.senderId || connection.requestedPhoneNumber || "")
          : null,
      externalAccountId: connection.externalAccountId,
      externalSenderId: sender.sid || connection.externalSenderId,
      verificationStatus: mapped.verificationStatus,
      displayNameStatus: mapped.displayNameStatus,
      lastError: lastError?.trim() || sender.offlineReason || null,
      connectedAt:
        mapped.connectionStatus === "CONNECTED"
          ? connection.connectedAt ?? new Date()
          : null,
      lastSyncedAt: new Date(),
    },
  });
}

async function updateConnectionError(
  connection: WhatsAppConnection,
  message: string,
  nextStatus: WhatsAppConnectionStatus = "ERRORED"
) {
  return prisma.whatsAppConnection.update({
    where: {
      id: connection.id,
    },
    data: {
      mode: "LIVE",
      status: nextStatus,
      verificationStatus:
        nextStatus === "PENDING_SETUP" ? "NOT_STARTED" : "FAILED",
      displayNameStatus:
        nextStatus === "PENDING_SETUP" ? "UNKNOWN" : connection.displayNameStatus,
      senderPhoneNumber: null,
      connectedAt: null,
      lastError: message,
      lastSyncedAt: new Date(),
    },
  });
}

export async function syncWhatsAppConnectionForBusiness(businessId: string) {
  const connection = await prisma.whatsAppConnection.findUnique({
    where: {
      businessId,
    },
  });

  if (!connection || connection.mode !== "LIVE") {
    return connection;
  }

  try {
    const sender = connection.externalSenderId
      ? await fetchTwilioWhatsAppSender(connection.externalSenderId)
      : connection.requestedPhoneNumber
        ? await findTwilioWhatsAppSenderByPhoneNumber(connection.requestedPhoneNumber)
        : null;

    if (!sender) {
      return connection;
    }

    const repairedSender = await refreshSenderWebhookIfNeeded(sender);
    return await updateConnectionFromSender(connection, repairedSender);
  } catch (error) {
    return await updateConnectionError(
      connection,
      error instanceof Error
        ? error.message
        : "We couldn't refresh the clinic WhatsApp status."
    );
  }
}

export async function beginWhatsAppLiveConnection(args: {
  businessId: string;
  businessName: string;
  requestedPhoneNumber: string;
}) {
  const requestedPhoneNumber = normalizeLiveNumber(args.requestedPhoneNumber);
  const existingConnection =
    (await prisma.whatsAppConnection.findUnique({
      where: {
        businessId: args.businessId,
      },
    })) ??
    (await prisma.whatsAppConnection.create({
      data: {
        businessId: args.businessId,
        provider: "TWILIO",
        mode: "LIVE",
        status: "PENDING_SETUP",
      },
    }));

  const baseData = {
    provider: "TWILIO" as const,
    mode: "LIVE" as const,
    requestedPhoneNumber,
    externalAccountId: existingConnection.externalAccountId,
    onboardingStartedAt: existingConnection.onboardingStartedAt ?? new Date(),
    lastSyncedAt: new Date(),
  };

  try {
    const account = await fetchTwilioAccountSummary();
    const webhookUrl = getPublicTwilioWebhookUrl();
    const wabaId = getConfiguredTwilioWabaId();

    if (account.type.toLowerCase() === "trial") {
      return await prisma.whatsAppConnection.update({
        where: {
          id: existingConnection.id,
        },
        data: {
          ...baseData,
          status: "ERRORED",
          senderPhoneNumber: null,
          externalAccountId: account.sid,
          verificationStatus: "FAILED",
          displayNameStatus: "UNKNOWN",
          connectedAt: null,
          lastError:
            "Twilio trial accounts cannot onboard live WhatsApp numbers. Upgrade the Twilio account first.",
        },
      });
    }

    if (!webhookUrl) {
      return await prisma.whatsAppConnection.update({
        where: {
          id: existingConnection.id,
        },
        data: {
          ...baseData,
          status: "PENDING_SETUP",
          senderPhoneNumber: null,
          externalAccountId: account.sid,
          externalSenderId: null,
          verificationStatus: "NOT_STARTED",
          displayNameStatus: "UNKNOWN",
          connectedAt: null,
          lastError:
            "A public APP_URL is required before live WhatsApp onboarding can start.",
        },
      });
    }

    if (
      existingConnection.externalSenderId &&
      existingConnection.requestedPhoneNumber === requestedPhoneNumber
    ) {
      return (
        (await syncWhatsAppConnectionForBusiness(args.businessId)) ??
        existingConnection
      );
    }

    const existingSender = await findTwilioWhatsAppSenderByPhoneNumber(
      requestedPhoneNumber
    );

    if (existingSender) {
      const repairedSender = await refreshSenderWebhookIfNeeded(existingSender);
      const mapped = mapTwilioSenderStatus(repairedSender.status, "PENDING");

      return prisma.whatsAppConnection.update({
        where: {
          id: existingConnection.id,
        },
        data: {
          ...baseData,
          status: mapped.connectionStatus,
          senderPhoneNumber:
            mapped.connectionStatus === "CONNECTED" ? requestedPhoneNumber : null,
          externalAccountId: account.sid,
          externalSenderId: repairedSender.sid,
          verificationStatus: mapped.verificationStatus,
          displayNameStatus: mapped.displayNameStatus,
          connectedAt:
            mapped.connectionStatus === "CONNECTED" ? new Date() : null,
          lastError: repairedSender.offlineReason || null,
        },
      });
    }

    if (!wabaId) {
      return await prisma.whatsAppConnection.update({
        where: {
          id: existingConnection.id,
        },
        data: {
          ...baseData,
          status: "PENDING_SETUP",
          senderPhoneNumber: null,
          externalAccountId: account.sid,
          externalSenderId: null,
          verificationStatus: "NOT_STARTED",
          displayNameStatus: "UNKNOWN",
          connectedAt: null,
          lastError:
            "Twilio WhatsApp onboarding is not fully configured yet. Add the platform WABA ID before starting live clinic numbers.",
        },
      });
    }

    const created = await createTwilioWhatsAppSender({
      phoneNumber: requestedPhoneNumber,
      businessName: args.businessName,
      callbackUrl: webhookUrl,
      wabaId,
    });
    const mapped = mapTwilioSenderStatus(created.status, "PENDING");

    return prisma.whatsAppConnection.update({
      where: {
        id: existingConnection.id,
      },
      data: {
        ...baseData,
        status: mapped.connectionStatus,
        senderPhoneNumber:
          mapped.connectionStatus === "CONNECTED" ? requestedPhoneNumber : null,
        externalAccountId: account.sid,
        externalSenderId: created.sid,
        verificationStatus: mapped.verificationStatus,
        displayNameStatus: mapped.displayNameStatus,
        connectedAt:
          mapped.connectionStatus === "CONNECTED" ? new Date() : null,
        lastError: created.offlineReason || null,
      },
    });
  } catch (error) {
    const message = await buildLiveConnectionErrorMessage({
      requestedPhoneNumber,
      rawMessage:
        error instanceof Error
          ? error.message
          : "We couldn't start the clinic WhatsApp connection.",
    });

    return await updateConnectionError(
      existingConnection,
      message
    );
  }
}

export async function submitWhatsAppVerificationCode(args: {
  businessId: string;
  verificationCode: string;
}) {
  const connection = await prisma.whatsAppConnection.findUniqueOrThrow({
    where: {
      businessId: args.businessId,
    },
  });

  if (!connection.externalSenderId) {
    throw new Error("Start the clinic connection first before submitting a verification code.");
  }

  const sender = await verifyTwilioWhatsAppSender({
    senderSid: connection.externalSenderId,
    verificationCode: args.verificationCode,
  });

  return updateConnectionFromSender(connection, sender);
}
