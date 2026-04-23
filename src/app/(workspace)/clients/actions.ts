"use server";

import { prisma } from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business";
import { ensureConversationForClient, normalizeConversationsForBusiness } from "@/lib/inbox-server";
import { normalizePhone } from "@/lib/inbox";
import {
  buildClientRecord,
  toPrismaClientStatus,
  type ClientRecord,
  type SaveClientPayload,
} from "@/lib/clients";
import { createClient } from "@/utils/supabase/server";

export type SaveClientResult = {
  ok: boolean;
  error?: string;
  client?: ClientRecord;
};

export type ArchiveClientResult = {
  ok: boolean;
  error?: string;
  clientId?: string;
};

export type DeleteClientResult = {
  ok: boolean;
  error?: string;
  clientId?: string;
};

export type AddClientGalleryItemPayload = {
  clientId: string;
  imageUrl: string;
  caption: string;
};

export type AddClientGalleryItemResult = {
  ok: boolean;
  error?: string;
  client?: ClientRecord;
};

async function getAuthedBusiness() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "Your session expired. Log in again to manage clients.",
    } as const;
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });

  return { business } as const;
}

async function fetchClientRecord(clientId: string) {
  const client = await prisma.client.findUniqueOrThrow({
    where: {
      id: clientId,
    },
    include: {
      appointments: {
        select: {
          id: true,
          title: true,
          startAt: true,
          status: true,
        },
        orderBy: {
          startAt: "desc",
        },
      },
      messages: {
        select: {
          id: true,
          body: true,
          direction: true,
          sentAt: true,
        },
        orderBy: {
          sentAt: "desc",
        },
      },
      galleryItems: {
        select: {
          id: true,
          type: true,
          imageUrl: true,
          caption: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  return buildClientRecord(client);
}

export async function addClientGalleryItemAction(
  payload: AddClientGalleryItemPayload
): Promise<AddClientGalleryItemResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;
  const client = await prisma.client.findFirst({
    where: {
      id: payload.clientId,
      businessId: business.id,
    },
    select: {
      id: true,
    },
  });

  if (!client) {
    return {
      ok: false,
      error: "Client not found in this clinic workspace.",
    };
  }

  if (!payload.imageUrl.trim()) {
    return {
      ok: false,
      error: "Choose a photo before adding it to the gallery.",
    };
  }

  await prisma.clientGalleryItem.create({
    data: {
      businessId: business.id,
      clientId: payload.clientId,
      imageUrl: payload.imageUrl,
      caption: payload.caption.trim() || null,
    },
  });

  return {
    ok: true,
    client: await fetchClientRecord(payload.clientId),
  };
}

async function syncClientInboxThread(businessId: string, clientId: string) {
  await normalizeConversationsForBusiness(businessId);

  const conversation = await ensureConversationForClient(businessId, clientId);

  if (!conversation) {
    return;
  }

  await prisma.message.updateMany({
    where: {
      conversationId: conversation.id,
    },
    data: {
      clientId,
    },
  });
}

export async function saveClientAction(
  payload: SaveClientPayload
): Promise<SaveClientResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;
  const cleanedName = payload.name.trim();
  const cleanedPhone = normalizePhone(payload.phone);

  if (!cleanedName || !cleanedPhone) {
    return {
      ok: false,
      error: "Client name and phone number are required.",
    };
  }

  const tagList = payload.tags
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const data = {
    name: cleanedName,
    email: payload.email.trim() || null,
    phone: cleanedPhone,
    notes: payload.notes.trim() || null,
    status: toPrismaClientStatus(payload.status),
    isArchived: payload.status === "archived",
    preferredChannel: payload.preferredChannel.trim() || null,
    assignedStaffName: payload.assignedStaff.trim() || null,
    tags: tagList,
  };

  try {
    let clientId = payload.id;

    if (payload.id) {
      const existing = await prisma.client.findFirst({
        where: {
          id: payload.id,
          businessId: business.id,
        },
        select: {
          id: true,
          phone: true,
        },
      });

      if (!existing) {
        return {
          ok: false,
          error: "Client not found in this clinic workspace.",
        };
      }

      await prisma.client.update({
        where: {
          id: payload.id,
        },
        data,
      });

      if (normalizePhone(existing.phone) !== cleanedPhone) {
        await normalizeConversationsForBusiness(business.id);
      }
    } else {
      const created = await prisma.client.create({
        data: {
          businessId: business.id,
          ...data,
        },
      });
      clientId = created.id;
    }

    await syncClientInboxThread(business.id, clientId!);

    return {
      ok: true,
      client: await fetchClientRecord(clientId!),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "We couldn't save the client record.",
    };
  }
}

export async function archiveClientAction(clientId: string): Promise<ArchiveClientResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;

  const existing = await prisma.client.findFirst({
    where: {
      id: clientId,
      businessId: business.id,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    return {
      ok: false,
      error: "Client not found in this clinic workspace.",
    };
  }

  await prisma.client.update({
    where: {
      id: clientId,
    },
    data: {
      isArchived: true,
      status: "ARCHIVED",
    },
  });

  return {
    ok: true,
    clientId,
  };
}

export async function deleteClientAction(clientId: string): Promise<DeleteClientResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;

  const existing = await prisma.client.findFirst({
    where: {
      id: clientId,
      businessId: business.id,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    return {
      ok: false,
      error: "Client not found in this clinic workspace.",
    };
  }

  await prisma.client.delete({
    where: {
      id: clientId,
    },
  });

  return {
    ok: true,
    clientId,
  };
}
