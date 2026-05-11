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
import { normalizeStorageReference } from "@/lib/media-storage";
import { deleteStorageReferences } from "@/lib/media-storage-server";
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

export type AddClientMedicationPayload = {
  clientId: string;
  name: string;
  dosage: string;
  frequency: string;
  notes: string;
  isActive: boolean;
};

export type AddClientDocumentPayload = {
  clientId: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  notes: string;
};

export type AddClientPaymentPayload = {
  clientId: string;
  amount: string;
  status: string;
  description: string;
  receiptUrl: string;
  paidAt: string;
};

export type ClientRecordMutationResult = {
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
          notes: true,
        },
        orderBy: {
          startAt: "desc",
        },
        take: 25,
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
        take: 25,
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
        take: 24,
      },
      medications: {
        select: {
          id: true,
          name: true,
          dosage: true,
          frequency: true,
          notes: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50,
      },
      documents: {
        select: {
          id: true,
          fileName: true,
          fileType: true,
          fileUrl: true,
          notes: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 60,
      },
      payments: {
        select: {
          id: true,
          amountCents: true,
          status: true,
          description: true,
          receiptUrl: true,
          paidAt: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 60,
      },
      _count: {
        select: {
          appointments: true,
        },
      },
    },
  });

  return buildClientRecord(client);
}

async function requireOwnedClient(clientId: string) {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return context;
  }

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      businessId: context.business.id,
    },
    select: {
      id: true,
    },
  });

  if (!client) {
    return {
      error: "Patient not found in this clinic workspace.",
    } as const;
  }

  return {
    business: context.business,
    client,
  } as const;
}

function parseOptionalDate(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseAmountToCents(value: string) {
  const normalized = Number(value.replace(/[^0-9.-]/g, ""));

  if (!Number.isFinite(normalized) || normalized < 0) {
    return null;
  }

  return Math.round(normalized * 100);
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

  const normalizedImageUrl = normalizeStorageReference(payload.imageUrl);

  if (normalizedImageUrl.startsWith("data:")) {
    return {
      ok: false,
      error: "Upload the photo again before adding it to the gallery.",
    };
  }

  await prisma.clientGalleryItem.create({
    data: {
      businessId: business.id,
      clientId: payload.clientId,
      imageUrl: normalizedImageUrl,
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
    gender: payload.gender?.trim() || null,
    dateOfBirth: parseOptionalDate(payload.dateOfBirth),
    address: payload.address?.trim() || null,
    patientType: payload.patientType?.trim() || "New Patient",
    clinicType: payload.clinicType?.trim() || null,
    notes: payload.notes.trim() || null,
    medicalHistory: payload.medicalHistory?.trim() || null,
    allergies: payload.allergies?.trim() || null,
    importantHealthNotes: payload.importantHealthNotes?.trim() || null,
    previousTreatments: payload.previousTreatments?.trim() || null,
    treatmentPlan: payload.treatmentPlan?.trim() || null,
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
  } catch {
    return {
      ok: false,
      error: "We couldn't save the client record.",
    };
  }
}

export async function addClientMedicationAction(
  payload: AddClientMedicationPayload
): Promise<ClientRecordMutationResult> {
  const context = await requireOwnedClient(payload.clientId);

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const name = payload.name.trim();

  if (!name) {
    return {
      ok: false,
      error: "Medication name is required.",
    };
  }

  await prisma.clientMedication.create({
    data: {
      businessId: context.business.id,
      clientId: payload.clientId,
      name,
      dosage: payload.dosage.trim() || null,
      frequency: payload.frequency.trim() || null,
      notes: payload.notes.trim() || null,
      isActive: payload.isActive,
    },
  });

  return {
    ok: true,
    client: await fetchClientRecord(payload.clientId),
  };
}

export async function addClientDocumentAction(
  payload: AddClientDocumentPayload
): Promise<ClientRecordMutationResult> {
  const context = await requireOwnedClient(payload.clientId);

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const fileName = payload.fileName.trim();

  if (!fileName) {
    return {
      ok: false,
      error: "File name is required.",
    };
  }

  await prisma.clientDocument.create({
    data: {
      businessId: context.business.id,
      clientId: payload.clientId,
      fileName,
      fileType: payload.fileType.trim() || "Other",
      fileUrl: normalizeStorageReference(payload.fileUrl.trim()) || null,
      notes: payload.notes.trim() || null,
    },
  });

  return {
    ok: true,
    client: await fetchClientRecord(payload.clientId),
  };
}

export async function addClientPaymentAction(
  payload: AddClientPaymentPayload
): Promise<ClientRecordMutationResult> {
  const context = await requireOwnedClient(payload.clientId);

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const amountCents = parseAmountToCents(payload.amount);

  if (amountCents === null) {
    return {
      ok: false,
      error: "Enter a valid payment amount.",
    };
  }

  await prisma.clientPayment.create({
    data: {
      businessId: context.business.id,
      clientId: payload.clientId,
      amountCents,
      status: payload.status.trim() || "Unpaid",
      description: payload.description.trim() || null,
      receiptUrl: payload.receiptUrl.trim() || null,
      paidAt: parseOptionalDate(payload.paidAt),
    },
  });

  return {
    ok: true,
    client: await fetchClientRecord(payload.clientId),
  };
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
      galleryItems: {
        select: {
          imageUrl: true,
        },
      },
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

  await deleteStorageReferences(existing.galleryItems.map((item) => item.imageUrl));

  return {
    ok: true,
    clientId,
  };
}
