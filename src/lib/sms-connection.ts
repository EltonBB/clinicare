import { prisma } from "@/lib/prisma";
import {
  findTwilioSmsPhoneNumberByPhoneNumber,
  getPublicTwilioSmsWebhookUrl,
  updateTwilioSmsPhoneWebhook,
} from "@/lib/sms";
import { normalizePhone } from "@/lib/inbox";

function normalizeRequestedPhoneNumber(value: string | null | undefined) {
  return normalizePhone(value ?? "");
}

async function findWorkspaceSmsNumberConflict(args: {
  requestedPhoneNumber: string;
  businessId: string;
}) {
  const requestedPhoneNumber = normalizeRequestedPhoneNumber(args.requestedPhoneNumber);

  if (!requestedPhoneNumber) {
    return null;
  }

  const rows = await prisma.$queryRaw<
    Array<{
      businessId: string;
      businessName: string;
      requestedPhoneNumber: string | null;
      senderPhoneNumber: string | null;
      status: string;
    }>
  >`
    select
      sc."businessId" as "businessId",
      b."name" as "businessName",
      sc."requestedPhoneNumber" as "requestedPhoneNumber",
      sc."senderPhoneNumber" as "senderPhoneNumber",
      sc."status"::text as "status"
    from "SmsConnection" sc
    inner join "Business" b on b."id" = sc."businessId"
    inner join auth.users u on u."id"::text = b."ownerId"
    where sc."businessId" <> ${args.businessId}
      and sc."status" in ('CONNECTED', 'PENDING_SETUP')
      and (
        regexp_replace(coalesce(sc."requestedPhoneNumber", ''), '[^0-9]', '', 'g') = regexp_replace(${requestedPhoneNumber}, '[^0-9]', '', 'g')
        or regexp_replace(coalesce(sc."senderPhoneNumber", ''), '[^0-9]', '', 'g') = regexp_replace(${requestedPhoneNumber}, '[^0-9]', '', 'g')
      )
    limit 1
  `;

  return rows[0] ?? null;
}

export async function syncSmsConnectionForBusiness(businessId: string) {
  const business = await prisma.business.findUnique({
    where: {
      id: businessId,
    },
    select: {
      id: true,
      smsNumber: true,
      smsConnection: true,
    },
  });

  if (!business) {
    throw new Error("Clinic workspace not found.");
  }

  const requestedPhoneNumber = normalizeRequestedPhoneNumber(business.smsNumber);

  if (!requestedPhoneNumber) {
    return prisma.smsConnection.upsert({
      where: {
        businessId,
      },
      update: {
        provider: "TWILIO",
        status: "DISCONNECTED",
        requestedPhoneNumber: null,
        senderPhoneNumber: null,
        externalPhoneSid: null,
        connectedAt: null,
        lastError: null,
        lastSyncedAt: new Date(),
      },
      create: {
        businessId,
        provider: "TWILIO",
        status: "DISCONNECTED",
        requestedPhoneNumber: null,
        senderPhoneNumber: null,
        externalPhoneSid: null,
        connectedAt: null,
        lastError: null,
        lastSyncedAt: new Date(),
      },
    });
  }

  const workspaceConflict = await findWorkspaceSmsNumberConflict({
    requestedPhoneNumber,
    businessId,
  });

  if (workspaceConflict) {
    return prisma.smsConnection.upsert({
      where: {
        businessId,
      },
      update: {
        provider: "TWILIO",
        status: "ERRORED",
        requestedPhoneNumber,
        senderPhoneNumber: null,
        externalPhoneSid: null,
        connectedAt: null,
        lastError:
          "This clinic number is already connected to another Clinicare workspace. Disconnect it there first before reusing it here.",
        lastSyncedAt: new Date(),
      },
      create: {
        businessId,
        provider: "TWILIO",
        status: "ERRORED",
        requestedPhoneNumber,
        senderPhoneNumber: null,
        externalPhoneSid: null,
        connectedAt: null,
        lastError:
          "This clinic number is already connected to another Clinicare workspace. Disconnect it there first before reusing it here.",
        lastSyncedAt: new Date(),
      },
    });
  }

  const twilioPhone = await findTwilioSmsPhoneNumberByPhoneNumber(requestedPhoneNumber).catch(
    (error) => {
      console.error("Failed to inspect the Twilio SMS number.", {
        businessId,
        requestedPhoneNumber,
        error,
      });
      return null;
    }
  );

  if (!twilioPhone) {
    return prisma.smsConnection.upsert({
      where: {
        businessId,
      },
      update: {
        provider: "TWILIO",
        status: "PENDING_SETUP",
        requestedPhoneNumber,
        senderPhoneNumber: null,
        externalPhoneSid: null,
        connectedAt: null,
        lastError:
          "This SMS number is not connected in the provider account yet. Add or port the number into the messaging account first, then refresh status here.",
        lastSyncedAt: new Date(),
      },
      create: {
        businessId,
        provider: "TWILIO",
        status: "PENDING_SETUP",
        requestedPhoneNumber,
        senderPhoneNumber: null,
        externalPhoneSid: null,
        connectedAt: null,
        lastError:
          "This SMS number is not connected in the provider account yet. Add or port the number into the messaging account first, then refresh status here.",
        lastSyncedAt: new Date(),
      },
    });
  }

  const callbackUrl = getPublicTwilioSmsWebhookUrl();
  let repairedPhone = twilioPhone;

  if (
    callbackUrl &&
    (twilioPhone.smsUrl !== callbackUrl || twilioPhone.statusCallback !== callbackUrl)
  ) {
    try {
      repairedPhone = await updateTwilioSmsPhoneWebhook({
        phoneSid: twilioPhone.sid,
        callbackUrl,
      });
    } catch (error) {
      console.error("Failed to repair the Twilio SMS webhook.", {
        businessId,
        requestedPhoneNumber,
        phoneSid: twilioPhone.sid,
        error,
      });
    }
  }

  return prisma.smsConnection.upsert({
    where: {
      businessId,
    },
    update: {
      provider: "TWILIO",
      status: "CONNECTED",
      requestedPhoneNumber,
      senderPhoneNumber: repairedPhone.phoneNumber || requestedPhoneNumber,
      externalPhoneSid: repairedPhone.sid || null,
      connectedAt: business.smsConnection?.connectedAt ?? new Date(),
      lastError: null,
      lastSyncedAt: new Date(),
    },
    create: {
      businessId,
      provider: "TWILIO",
      status: "CONNECTED",
      requestedPhoneNumber,
      senderPhoneNumber: repairedPhone.phoneNumber || requestedPhoneNumber,
      externalPhoneSid: repairedPhone.sid || null,
      connectedAt: new Date(),
      lastError: null,
      lastSyncedAt: new Date(),
    },
  });
}
