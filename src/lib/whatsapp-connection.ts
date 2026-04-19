import type {
  WhatsAppConnection,
  WhatsAppConnectionStatus,
  WhatsAppDisplayNameStatus,
  WhatsAppVerificationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  createTwilioWhatsAppSender,
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
    return "We couldn't start WhatsApp setup for this clinic number.";
  }

  if (
    /already connected to another Clinicare workspace|already being set up in another Clinicare workspace/i.test(
      rawMessage
    )
  ) {
    return rawMessage;
  }

  if (
    /another WABA ID|already linked|linked elsewhere|already registered|more than 1 sender/i.test(
      rawMessage
    )
  ) {
    return `This clinic number is still linked to another WhatsApp setup. Finish moving or disconnecting ${normalizeLiveNumber(args.requestedPhoneNumber)} there first, then retry setup here.`;
  }

  return rawMessage;
}

function normalizeTwilioSenderForComparison(sender: TwilioWhatsAppSender) {
  return {
    ...sender,
    phoneNumber: sender.senderId ? normalizeLiveNumber(sender.senderId) : "",
  };
}

type NormalizedTwilioSender = ReturnType<typeof normalizeTwilioSenderForComparison>;

function buildClinicNumberMismatchMessage(args: {
  requestedPhoneNumber: string;
  activePhoneNumber: string;
}) {
  return `A different clinic number is already active (${args.activePhoneNumber}). Use that number for testing now, or finish moving ${args.requestedPhoneNumber} into the current WhatsApp setup first.`;
}

async function inspectTwilioProviderState(args: {
  requestedPhoneNumber: string;
  externalSenderId?: string | null;
}) {
  const requestedPhoneNumber = normalizeLiveNumber(args.requestedPhoneNumber);
  let existingSender: NormalizedTwilioSender | null = null;

  if (args.externalSenderId?.trim()) {
    try {
      existingSender = normalizeTwilioSenderForComparison(
        await fetchTwilioWhatsAppSender(args.externalSenderId.trim())
      );
    } catch {
      existingSender = null;
    }
  }

  try {
    const senders = (await listTwilioWhatsAppSenders()).map(
      normalizeTwilioSenderForComparison
    );
    const requestedSender =
      senders.find((sender) => sender.phoneNumber === requestedPhoneNumber) ??
      (existingSender?.phoneNumber === requestedPhoneNumber ? existingSender : null);

    return {
      requestedSender,
      existingSender,
    };
  } catch {
    return {
      requestedSender:
        existingSender?.phoneNumber === requestedPhoneNumber ? existingSender : null,
      existingSender,
    };
  }
}

async function findWorkspaceNumberConflict(args: {
  businessId: string;
  requestedPhoneNumber: string;
  externalSenderId?: string | null;
}) {
  const requestedPhoneNumber = normalizeLiveNumber(args.requestedPhoneNumber);
  const externalSenderId = args.externalSenderId?.trim() || null;

  return prisma.whatsAppConnection.findFirst({
    where: {
      businessId: {
        not: args.businessId,
      },
      mode: "LIVE",
      status: {
        not: "DISCONNECTED",
      },
      OR: [
        {
          requestedPhoneNumber,
        },
        {
          senderPhoneNumber: requestedPhoneNumber,
        },
        ...(externalSenderId
          ? [
              {
                externalSenderId,
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      status: true,
      requestedPhoneNumber: true,
      senderPhoneNumber: true,
      business: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

function buildWorkspaceConflictMessage(args: {
  requestedPhoneNumber: string;
  conflict: Awaited<ReturnType<typeof findWorkspaceNumberConflict>>;
}) {
  if (!args.conflict) {
    return null;
  }

  const activePhoneNumber =
    args.conflict.senderPhoneNumber?.trim() || args.conflict.requestedPhoneNumber?.trim();

  if (
    activePhoneNumber &&
    normalizeLiveNumber(activePhoneNumber) === normalizeLiveNumber(args.requestedPhoneNumber)
  ) {
    return `This clinic number is already connected to another Clinicare workspace. Disconnect it there first before using ${normalizeLiveNumber(args.requestedPhoneNumber)} here.`;
  }

  return `This clinic number is already being set up in another Clinicare workspace. Finish or remove ${normalizeLiveNumber(args.requestedPhoneNumber)} there before trying again here.`;
}

async function refreshSenderWebhookIfNeeded(sender: TwilioWhatsAppSender) {
  const webhookUrl = getPublicTwilioWebhookUrl();

  if (!webhookUrl) {
    return sender;
  }

  const hasMatchingCallback =
    sender.callbackUrl.trim() === webhookUrl &&
    sender.statusCallbackUrl.trim() === webhookUrl;

  if (hasMatchingCallback) {
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

  const normalizedSenderPhone =
    mapped.connectionStatus === "CONNECTED"
      ? normalizeLiveNumber(sender.senderId || connection.requestedPhoneNumber || "")
      : null;

  return prisma.$transaction(async (tx) => {
    if (normalizedSenderPhone) {
      await tx.whatsAppConnection.updateMany({
        where: {
          id: {
            not: connection.id,
          },
          mode: "LIVE",
          OR: [
            { externalSenderId: sender.sid || connection.externalSenderId },
            { senderPhoneNumber: normalizedSenderPhone },
          ],
        },
        data: {
          status: "DISCONNECTED",
          senderPhoneNumber: null,
          connectedAt: null,
          lastError:
            `This number is now attached to another clinic workspace (${normalizedSenderPhone}). Refresh and reconnect the correct number if needed.`,
          lastSyncedAt: new Date(),
        },
      });
    }

    return tx.whatsAppConnection.update({
      where: {
        id: connection.id,
      },
      data: {
        mode: "LIVE",
        status: mapped.connectionStatus,
        requestedPhoneNumber: connection.requestedPhoneNumber,
        senderPhoneNumber: normalizedSenderPhone,
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
    const providerState = connection.requestedPhoneNumber?.trim()
      ? await inspectTwilioProviderState({
          requestedPhoneNumber: connection.requestedPhoneNumber,
          externalSenderId: connection.externalSenderId,
        })
      : {
          requestedSender: null,
          existingSender: connection.externalSenderId
            ? normalizeTwilioSenderForComparison(
                await fetchTwilioWhatsAppSender(connection.externalSenderId)
              )
            : null,
        };

    const sender = providerState.requestedSender ?? providerState.existingSender;

    if (!sender) {
      return connection;
    }

    if (
      connection.requestedPhoneNumber?.trim() &&
      sender.phoneNumber &&
      sender.phoneNumber !== normalizeLiveNumber(connection.requestedPhoneNumber)
    ) {
      return await updateConnectionError(
        connection,
        buildClinicNumberMismatchMessage({
          requestedPhoneNumber: normalizeLiveNumber(connection.requestedPhoneNumber),
          activePhoneNumber: sender.phoneNumber,
        })
      );
    }

    const repairedSender = await refreshSenderWebhookIfNeeded(sender);
    return await updateConnectionFromSender(connection, repairedSender);
  } catch (error) {
    return await updateConnectionError(
      connection,
      error instanceof Error
        ? error.message
        : "We couldn't refresh WhatsApp setup for this clinic number."
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
    const workspaceConflict = await findWorkspaceNumberConflict({
      businessId: args.businessId,
      requestedPhoneNumber,
      externalSenderId: existingConnection.externalSenderId,
    });
    const workspaceConflictMessage = buildWorkspaceConflictMessage({
      requestedPhoneNumber,
      conflict: workspaceConflict,
    });

    if (workspaceConflictMessage) {
      return await updateConnectionError(existingConnection, workspaceConflictMessage);
    }

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
            "Live WhatsApp is not available on this account yet. Upgrade the connected account before using a real clinic number.",
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
            "We couldn't finish setup for this clinic number. Contact support if this keeps happening.",
        },
      });
    }

    const providerState = await inspectTwilioProviderState({
      requestedPhoneNumber,
      externalSenderId: existingConnection.externalSenderId,
    });
    const existingSender = providerState.requestedSender;

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
            "This workspace is not ready to connect a new clinic number yet. Contact support to finish the WhatsApp setup.",
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
          : "We couldn't start WhatsApp setup for this clinic number.",
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
