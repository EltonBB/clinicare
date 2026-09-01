"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getAuthedBusiness as getAuthedBusinessContext } from "@/lib/business";
import { ensureConversationForClient, normalizeConversationsForBusiness } from "@/lib/inbox-server";
import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import {
  hasUnsafePublicUrl,
  normalizeOptionalPublicUrl,
} from "@/lib/safe-url";
import {
  buildClientRecord,
  toPrismaClientStatus,
  type ClientRecord,
  type SaveClientPayload,
} from "@/lib/clients";
import { normalizeStorageReference } from "@/lib/media-storage";
import { deleteStorageReferences } from "@/lib/media-storage-server";

export type SaveClientResult = {
  ok: boolean;
  error?: string;
  client?: ClientRecord;
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
  storageUrl?: string;
  category?: string;
  mimeType?: string;
  fileSize?: number;
  uploadedBy?: string;
  notes: string;
};

export type AddClientPaymentPayload = {
  clientId: string;
  amount: string;
  status: string;
  description: string;
  receiptUrl: string;
  paidAt: string;
  invoiceNumber?: string;
  receiptNumber?: string;
  paymentMethod?: string;
  billingNote?: string;
};

export type AddClientHealthItemPayload = {
  clientId: string;
  type: string;
  label: string;
  value?: string;
  severity?: string;
  notes?: string;
};

export type AddClientCareNotePayload = {
  clientId: string;
  title?: string;
  body: string;
  staffMemberId?: string;
};

export type AddClientTreatmentPlanItemPayload = {
  clientId: string;
  title: string;
  description?: string;
  status?: string;
  dueAt?: string;
};

export type AddClientFollowUpReminderPayload = {
  clientId: string;
  title: string;
  channel?: string;
  status?: string;
  remindAt: string;
  notes?: string;
};

export type ClientRecordMutationResult = {
  ok: boolean;
  error?: string;
  client?: ClientRecord;
};

export type UpdateClientMedicationPayload = AddClientMedicationPayload & { id: string };
export type UpdateClientHealthItemPayload = AddClientHealthItemPayload & { id: string };
export type UpdateClientCareNotePayload = AddClientCareNotePayload & { id: string };
export type UpdateClientTreatmentPlanItemPayload = AddClientTreatmentPlanItemPayload & {
  id: string;
};
export type UpdateClientFollowUpReminderPayload = AddClientFollowUpReminderPayload & {
  id: string;
};
export type UpdateClientPaymentPayload = AddClientPaymentPayload & { id: string };
export type UpdateClientDocumentPayload = {
  id: string;
  clientId: string;
  fileName: string;
  fileType: string;
  notes: string;
};

export type DeleteClientSubRecordPayload = {
  id: string;
  clientId: string;
};

// Server-side validation for the client sub-record actions. Enum-style fields
// mirror the detail-page dialog options exactly and use `.catch(default)` so an
// unexpected value degrades to a safe default (bounding what reaches the DB)
// instead of rejecting the whole save. Required-text emptiness is still checked
// inside each action so its specific message is preserved.
const idField = z.string().min(1);
const text = (max: number) => z.string().max(max);
const optionalText = (max: number) => z.string().max(max).optional();

const HEALTH_TYPES = [
  "Allergy",
  "Medical alert",
  "Chronic condition",
  "Vital detail",
  "Care fact",
] as const;
const TREATMENT_STATUSES = ["Pending", "Upcoming", "Completed", "On hold"] as const;
const REMINDER_CHANNELS = ["WhatsApp", "SMS", "Email", "Phone call"] as const;
const REMINDER_STATUSES = ["Scheduled", "Sent", "Completed"] as const;
const PAYMENT_STATUSES = ["Paid", "Unpaid", "Partially Paid", "Refunded"] as const;
const DOCUMENT_CATEGORIES = [
  "Insurance",
  "Consent",
  "Medical History",
  "Report",
  "Image / Scan",
  "Invoice",
  "Other",
] as const;

const addClientGalleryItemSchema = z.object({
  clientId: idField,
  imageUrl: text(2048),
  caption: text(280),
});

const addClientMedicationSchema = z.object({
  clientId: idField,
  name: text(160),
  dosage: text(160),
  frequency: text(160),
  notes: text(2000),
  isActive: z.boolean(),
});

const addClientDocumentSchema = z.object({
  clientId: idField,
  fileName: text(200),
  fileType: z.enum(DOCUMENT_CATEGORIES).catch("Other"),
  fileUrl: text(2048),
  storageUrl: optionalText(2048),
  category: optionalText(120),
  mimeType: optionalText(160),
  fileSize: z.number().nonnegative().optional(),
  uploadedBy: optionalText(160),
  notes: text(2000),
});

const addClientPaymentSchema = z.object({
  clientId: idField,
  amount: text(24),
  status: z.enum(PAYMENT_STATUSES).catch("Unpaid"),
  description: text(2000),
  receiptUrl: text(2048),
  paidAt: text(40),
  invoiceNumber: optionalText(120),
  receiptNumber: optionalText(120),
  paymentMethod: optionalText(120),
  billingNote: optionalText(2000),
});

const addClientHealthItemSchema = z.object({
  clientId: idField,
  type: z.enum(HEALTH_TYPES).catch("Care fact"),
  label: text(200),
  value: optionalText(500),
  severity: optionalText(60),
  notes: optionalText(2000),
});

const addClientCareNoteSchema = z.object({
  clientId: idField,
  title: optionalText(200),
  body: text(5000),
  staffMemberId: optionalText(400),
});

const addClientTreatmentPlanItemSchema = z.object({
  clientId: idField,
  title: text(200),
  description: optionalText(2000),
  status: z.enum(TREATMENT_STATUSES).optional().catch("Pending"),
  dueAt: optionalText(40),
});

const addClientFollowUpReminderSchema = z.object({
  clientId: idField,
  title: text(200),
  channel: z.enum(REMINDER_CHANNELS).optional().catch("WhatsApp"),
  status: z.enum(REMINDER_STATUSES).optional().catch("Scheduled"),
  remindAt: text(40),
  notes: optionalText(2000),
});

const updateClientMedicationSchema = addClientMedicationSchema.extend({ id: idField });
const updateClientDocumentSchema = z.object({
  id: idField,
  clientId: idField,
  fileName: text(200),
  fileType: z.enum(DOCUMENT_CATEGORIES).catch("Other"),
  notes: text(2000),
});
const updateClientPaymentSchema = addClientPaymentSchema.extend({ id: idField });
const updateClientHealthItemSchema = addClientHealthItemSchema.extend({ id: idField });
const updateClientCareNoteSchema = addClientCareNoteSchema.extend({ id: idField });
const updateClientTreatmentPlanItemSchema = addClientTreatmentPlanItemSchema.extend({
  id: idField,
});
const updateClientFollowUpReminderSchema = addClientFollowUpReminderSchema.extend({
  id: idField,
});

const INVALID_RECORD_ERROR =
  "We couldn't save this record. Check the details and try again.";

function getAuthedBusiness() {
  return getAuthedBusinessContext(
    "Your session expired. Log in again to manage clients."
  );
}

// Invalidate the Router Cache for the surfaces a client mutation changes so a
// navigation shows the new data immediately instead of a stale cached payload.
// (Open detail views also consume the returned record for the live update.)
function revalidateClientDirectory() {
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  // Reports' "New clients" KPI counts directory membership.
  revalidatePath("/reports");
}

function revalidateClientDetail(clientId: string) {
  revalidatePath(`/clients/${clientId}`);
}

function revalidatePaymentSurfaces() {
  // Payments feed the dashboard "Revenue this month" KPI and Reports revenue;
  // the client's own ledger is refreshed by respondWithClientRecord.
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}

// Every sub-record mutation returns the refreshed client AND must revalidate the
// detail route so a later navigation back to it (served from the Router Cache)
// isn't stale. (The open detail view also consumes the returned record live.)
async function respondWithClientRecord(
  businessId: string,
  clientId: string
): Promise<ClientRecordMutationResult> {
  const client = await fetchClientRecord(businessId, clientId);
  revalidateClientDetail(clientId);
  return { ok: true, client };
}

async function fetchClientRecord(businessId: string, clientId: string) {
  // Tenant scoping by construction: even though every caller checks ownership
  // first, this query must never be able to cross a business boundary.
  const client = await prisma.client.findFirstOrThrow({
    where: {
      id: clientId,
      businessId,
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
          category: true,
          mimeType: true,
          fileSize: true,
          fileUrl: true,
          storageUrl: true,
          uploadedBy: true,
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
          appointmentId: true,
          amountCents: true,
          status: true,
          description: true,
          invoiceNumber: true,
          receiptNumber: true,
          paymentMethod: true,
          billingNote: true,
          receiptUrl: true,
          paidAt: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 60,
      },
      healthItems: {
        select: {
          id: true,
          type: true,
          label: true,
          value: true,
          severity: true,
          notes: true,
          recordedAt: true,
        },
        orderBy: {
          recordedAt: "desc",
        },
        take: 80,
      },
      careNotes: {
        select: {
          id: true,
          title: true,
          body: true,
          notedAt: true,
          staffMember: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          notedAt: "desc",
        },
        take: 50,
      },
      treatmentPlanItems: {
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          dueAt: true,
        },
        orderBy: [
          {
            dueAt: "asc",
          },
          {
            createdAt: "desc",
          },
        ],
        take: 50,
      },
      followUpReminders: {
        select: {
          id: true,
          title: true,
          channel: true,
          status: true,
          remindAt: true,
          notes: true,
        },
        orderBy: {
          remindAt: "asc",
        },
        take: 50,
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

  // Store date-only fields at UTC midnight. The render/edit paths format the
  // stored Date with date-fns (runtime-local, which is UTC on Vercel), so UTC
  // midnight round-trips to the entered calendar day. (A zoned anchor would
  // shift the day for the render path — see PR #13 review.)
  const parsed = new Date(`${value}T00:00:00.000Z`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseAmountToCents(value: string) {
  const normalized = Number(value.replace(/[^0-9.-]/g, ""));

  // Reject negatives and absurd fat-finger amounts (> $1,000,000) so a typo
  // can't write a huge value into the ledger and corrupt revenue reporting.
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1_000_000) {
    return null;
  }

  return Math.round(normalized * 100);
}

export async function addClientGalleryItemAction(
  payload: AddClientGalleryItemPayload
): Promise<AddClientGalleryItemResult> {
  const parsed = addClientGalleryItemSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

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

  // Mirror the guard on every other stored-URL sink (documents, payments, logo):
  // only a Supabase storage ref or a safe HTTPS URL may be persisted, since the
  // value is later rendered into an <img src>. Without it a crafted external URL
  // could beacon out from — or track views of — a PHI page.
  if (hasUnsafePublicUrl(payload.imageUrl)) {
    return {
      ok: false,
      error: "Upload the photo again before adding it to the gallery.",
    };
  }

  const normalizedImageUrl = normalizeOptionalPublicUrl(
    normalizeStorageReference(payload.imageUrl)
  );

  if (!normalizedImageUrl) {
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

  return respondWithClientRecord(context.business.id, payload.clientId);
}

async function syncClientInboxThread(businessId: string, clientId: string) {
  await normalizeConversationsForBusiness(businessId);

  const conversation = await ensureConversationForClient(businessId, clientId);

  if (!conversation) {
    return;
  }

  // Only claim messages that aren't already linked to a client. Conversations are
  // keyed on the phone digits, so two client records that share a phone (a family
  // landline, a duplicate/mis-entered record) resolve to one conversation — an
  // unconditional reassignment would silently move the *other* client's whole
  // message history onto whoever was saved last. Unlinked (clientId: null)
  // messages are the inbound ones that arrived before this record existed, which
  // is exactly what we want to attach here.
  await prisma.message.updateMany({
    where: {
      conversationId: conversation.id,
      clientId: null,
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
  // Canonical digit key kept in lockstep with phone so inbox/webhook/reminder
  // lookups resolve this client by the indexed (businessId, phoneKey).
  const cleanedPhoneKey = phoneLookupKey(payload.phone) || null;

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
    phoneKey: cleanedPhoneKey,
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

    revalidateClientDirectory();
    revalidateClientDetail(clientId!);

    return {
      ok: true,
      client: await fetchClientRecord(business.id, clientId!),
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
  const parsed = addClientMedicationSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

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

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function addClientDocumentAction(
  payload: AddClientDocumentPayload
): Promise<ClientRecordMutationResult> {
  const parsed = addClientDocumentSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

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

  if (
    hasUnsafePublicUrl(payload.fileUrl) ||
    hasUnsafePublicUrl(payload.storageUrl)
  ) {
    return {
      ok: false,
      error: "Use a safe HTTPS link or upload the document again.",
    };
  }

  const normalizedFileUrl =
    normalizeOptionalPublicUrl(normalizeStorageReference(payload.fileUrl.trim())) ||
    null;
  const normalizedStorageUrl = payload.storageUrl
    ? normalizeOptionalPublicUrl(normalizeStorageReference(payload.storageUrl.trim()))
    : normalizedFileUrl;

  await prisma.clientDocument.create({
    data: {
      businessId: context.business.id,
      clientId: payload.clientId,
      fileName,
      fileType: payload.fileType.trim() || "Other",
      category: payload.category?.trim() || payload.fileType.trim() || "Other",
      mimeType: payload.mimeType?.trim() || null,
      fileSize: Number.isFinite(payload.fileSize) ? payload.fileSize : null,
      fileUrl: normalizedFileUrl,
      storageUrl: normalizedStorageUrl,
      uploadedBy: payload.uploadedBy?.trim() || "Workspace staff",
      notes: payload.notes.trim() || null,
    },
  });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function addClientPaymentAction(
  payload: AddClientPaymentPayload
): Promise<ClientRecordMutationResult> {
  const parsed = addClientPaymentSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

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

  if (hasUnsafePublicUrl(payload.receiptUrl)) {
    return {
      ok: false,
      error: "Use a safe HTTPS receipt link.",
    };
  }

  await prisma.clientPayment.create({
    data: {
      businessId: context.business.id,
      clientId: payload.clientId,
      amountCents,
      status: payload.status.trim() || "Unpaid",
      description: payload.description.trim() || null,
      invoiceNumber: payload.invoiceNumber?.trim() || null,
      receiptNumber: payload.receiptNumber?.trim() || null,
      paymentMethod: payload.paymentMethod?.trim() || null,
      billingNote: payload.billingNote?.trim() || null,
      receiptUrl: normalizeOptionalPublicUrl(payload.receiptUrl) || null,
      paidAt: parseOptionalDate(payload.paidAt),
    },
  });

  revalidatePaymentSurfaces();

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function addClientHealthItemAction(
  payload: AddClientHealthItemPayload
): Promise<ClientRecordMutationResult> {
  const parsed = addClientHealthItemSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

  const context = await requireOwnedClient(payload.clientId);

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const label = payload.label.trim();

  if (!label) {
    return { ok: false, error: "Health item label is required." };
  }

  await prisma.clientHealthItem.create({
    data: {
      businessId: context.business.id,
      clientId: payload.clientId,
      type: payload.type.trim() || "Care fact",
      label,
      value: payload.value?.trim() || null,
      severity: payload.severity?.trim() || null,
      notes: payload.notes?.trim() || null,
    },
  });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function addClientCareNoteAction(
  payload: AddClientCareNotePayload
): Promise<ClientRecordMutationResult> {
  const parsed = addClientCareNoteSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

  const context = await requireOwnedClient(payload.clientId);

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const body = payload.body.trim();

  if (!body) {
    return { ok: false, error: "Care note text is required." };
  }

  const staffMemberId = payload.staffMemberId?.trim();
  const validStaffMember = staffMemberId
    ? await prisma.staffMember.findFirst({
        where: {
          id: staffMemberId,
          businessId: context.business.id,
        },
        select: {
          id: true,
        },
      })
    : null;

  await prisma.clientCareNote.create({
    data: {
      businessId: context.business.id,
      clientId: payload.clientId,
      staffMemberId: validStaffMember?.id ?? null,
      title: payload.title?.trim() || null,
      body,
    },
  });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function addClientTreatmentPlanItemAction(
  payload: AddClientTreatmentPlanItemPayload
): Promise<ClientRecordMutationResult> {
  const parsed = addClientTreatmentPlanItemSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

  const context = await requireOwnedClient(payload.clientId);

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const title = payload.title.trim();

  if (!title) {
    return { ok: false, error: "Treatment plan item title is required." };
  }

  await prisma.clientTreatmentPlanItem.create({
    data: {
      businessId: context.business.id,
      clientId: payload.clientId,
      title,
      description: payload.description?.trim() || null,
      status: payload.status?.trim() || "Pending",
      dueAt: parseOptionalDate(payload.dueAt ?? ""),
    },
  });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function addClientFollowUpReminderAction(
  payload: AddClientFollowUpReminderPayload
): Promise<ClientRecordMutationResult> {
  const parsed = addClientFollowUpReminderSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

  const context = await requireOwnedClient(payload.clientId);

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const title = payload.title.trim();
  const remindAt = parseOptionalDate(payload.remindAt);

  if (!title || !remindAt) {
    return { ok: false, error: "Reminder title and date are required." };
  }

  await prisma.clientFollowUpReminder.create({
    data: {
      businessId: context.business.id,
      clientId: payload.clientId,
      title,
      channel: payload.channel?.trim() || "WhatsApp",
      status: payload.status?.trim() || "Scheduled",
      remindAt,
      notes: payload.notes?.trim() || null,
    },
  });

  return respondWithClientRecord(context.business.id, payload.clientId);
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
      galleryItems: {
        select: {
          imageUrl: true,
        },
      },
      documents: {
        select: {
          storageUrl: true,
          fileUrl: true,
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

  // Compare-and-set: scope the delete by the same id+businessId used to find
  // the row above. If a concurrent request already deleted it, `count` is 0
  // and this call becomes a typed not-found instead of `.delete` throwing
  // Prisma's P2025 for a row that's already gone — mirrors
  // deleteAppointmentCore's fix (src/lib/appointments-shared.ts). Gating the
  // storage cleanup below on `count > 0` also means only the request that
  // actually won the race attempts it, not both.
  const { count } = await prisma.client.deleteMany({
    where: {
      id: clientId,
      businessId: business.id,
    },
  });

  if (count === 0) {
    return {
      ok: false,
      error: "Client not found in this clinic workspace.",
    };
  }

  // Deleting the client cascades the DB rows, but the actual files in storage
  // don't clean themselves up — without this, patient documents (the most
  // PHI-laden objects in the system) would sit in the private bucket forever
  // with no surviving reference to find and remove them later. The client
  // record (and its cascaded document/gallery rows) is already gone at this
  // point, so a cleanup failure here can't be retried through this action
  // again — a retry just sees "not found" before ever reaching cleanup, and
  // `existing` is the only place these paths still exist once this function
  // returns. Log them (opaque `userId/folder/uuid.ext` paths — not PHI, see
  // media-storage-client.ts) so they're still manually recoverable, but
  // still report the delete the admin asked for as successful, since it was.
  const storagePaths = [
    ...existing.galleryItems.map((item) => item.imageUrl),
    ...existing.documents.map((document) => document.storageUrl ?? document.fileUrl),
  ];

  try {
    await deleteStorageReferences(storagePaths);
  } catch (error) {
    logger.error("Failed to clean up a deleted client's storage files.", error, {
      clientId,
      paths: storagePaths.join(", "),
    });
  }

  revalidateClientDirectory();

  return {
    ok: true,
    clientId,
  };
}

type OwnedSubRecordContext =
  | { error: string }
  | { business: { id: string } };

async function requireOwnedSubRecord(
  payload: DeleteClientSubRecordPayload,
  exists: (businessId: string) => Promise<{ id: string } | null>
): Promise<OwnedSubRecordContext> {
  const context = await requireOwnedClient(payload.clientId);

  if ("error" in context) {
    return {
      error: context.error ?? "Your session expired. Log in again to manage clients.",
    };
  }

  const record = await exists(context.business.id);

  if (!record) {
    return { error: "This record was not found in the patient file." };
  }

  return { business: context.business };
}

export async function updateClientMedicationAction(
  payload: UpdateClientMedicationPayload
): Promise<ClientRecordMutationResult> {
  const parsed = updateClientMedicationSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

  const context = await requireOwnedSubRecord(payload, (businessId) =>
    prisma.clientMedication.findFirst({
      where: { id: payload.id, clientId: payload.clientId, businessId },
      select: { id: true },
    })
  );

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const name = payload.name.trim();

  if (!name) {
    return { ok: false, error: "Medication name is required." };
  }

  await prisma.clientMedication.update({
    where: { id: payload.id },
    data: {
      name,
      dosage: payload.dosage.trim() || null,
      frequency: payload.frequency.trim() || null,
      notes: payload.notes.trim() || null,
      isActive: payload.isActive,
    },
  });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function deleteClientMedicationAction(
  payload: DeleteClientSubRecordPayload
): Promise<ClientRecordMutationResult> {
  const context = await requireOwnedSubRecord(payload, (businessId) =>
    prisma.clientMedication.findFirst({
      where: { id: payload.id, clientId: payload.clientId, businessId },
      select: { id: true },
    })
  );

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  await prisma.clientMedication.delete({ where: { id: payload.id } });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function updateClientHealthItemAction(
  payload: UpdateClientHealthItemPayload
): Promise<ClientRecordMutationResult> {
  const parsed = updateClientHealthItemSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

  const context = await requireOwnedSubRecord(payload, (businessId) =>
    prisma.clientHealthItem.findFirst({
      where: { id: payload.id, clientId: payload.clientId, businessId },
      select: { id: true },
    })
  );

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const label = payload.label.trim();

  if (!label) {
    return { ok: false, error: "Health item label is required." };
  }

  await prisma.clientHealthItem.update({
    where: { id: payload.id },
    data: {
      type: payload.type.trim() || "Care fact",
      label,
      value: payload.value?.trim() || null,
      severity: payload.severity?.trim() || null,
      notes: payload.notes?.trim() || null,
    },
  });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function deleteClientHealthItemAction(
  payload: DeleteClientSubRecordPayload
): Promise<ClientRecordMutationResult> {
  const context = await requireOwnedSubRecord(payload, (businessId) =>
    prisma.clientHealthItem.findFirst({
      where: { id: payload.id, clientId: payload.clientId, businessId },
      select: { id: true },
    })
  );

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  await prisma.clientHealthItem.delete({ where: { id: payload.id } });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function updateClientCareNoteAction(
  payload: UpdateClientCareNotePayload
): Promise<ClientRecordMutationResult> {
  const parsed = updateClientCareNoteSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

  const context = await requireOwnedSubRecord(payload, (businessId) =>
    prisma.clientCareNote.findFirst({
      where: { id: payload.id, clientId: payload.clientId, businessId },
      select: { id: true },
    })
  );

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const body = payload.body.trim();

  if (!body) {
    return { ok: false, error: "Care note text is required." };
  }

  await prisma.clientCareNote.update({
    where: { id: payload.id },
    data: {
      title: payload.title?.trim() || null,
      body,
    },
  });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function deleteClientCareNoteAction(
  payload: DeleteClientSubRecordPayload
): Promise<ClientRecordMutationResult> {
  const context = await requireOwnedSubRecord(payload, (businessId) =>
    prisma.clientCareNote.findFirst({
      where: { id: payload.id, clientId: payload.clientId, businessId },
      select: { id: true },
    })
  );

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  await prisma.clientCareNote.delete({ where: { id: payload.id } });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function updateClientTreatmentPlanItemAction(
  payload: UpdateClientTreatmentPlanItemPayload
): Promise<ClientRecordMutationResult> {
  const parsed = updateClientTreatmentPlanItemSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

  const context = await requireOwnedSubRecord(payload, (businessId) =>
    prisma.clientTreatmentPlanItem.findFirst({
      where: { id: payload.id, clientId: payload.clientId, businessId },
      select: { id: true },
    })
  );

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const title = payload.title.trim();

  if (!title) {
    return { ok: false, error: "Treatment plan item title is required." };
  }

  await prisma.clientTreatmentPlanItem.update({
    where: { id: payload.id },
    data: {
      title,
      description: payload.description?.trim() || null,
      status: payload.status?.trim() || "Pending",
      dueAt: parseOptionalDate(payload.dueAt ?? ""),
    },
  });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function deleteClientTreatmentPlanItemAction(
  payload: DeleteClientSubRecordPayload
): Promise<ClientRecordMutationResult> {
  const context = await requireOwnedSubRecord(payload, (businessId) =>
    prisma.clientTreatmentPlanItem.findFirst({
      where: { id: payload.id, clientId: payload.clientId, businessId },
      select: { id: true },
    })
  );

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  await prisma.clientTreatmentPlanItem.delete({ where: { id: payload.id } });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function updateClientFollowUpReminderAction(
  payload: UpdateClientFollowUpReminderPayload
): Promise<ClientRecordMutationResult> {
  const parsed = updateClientFollowUpReminderSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

  const context = await requireOwnedSubRecord(payload, (businessId) =>
    prisma.clientFollowUpReminder.findFirst({
      where: { id: payload.id, clientId: payload.clientId, businessId },
      select: { id: true },
    })
  );

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const title = payload.title.trim();
  const remindAt = parseOptionalDate(payload.remindAt);

  if (!title || !remindAt) {
    return { ok: false, error: "Reminder title and date are required." };
  }

  await prisma.clientFollowUpReminder.update({
    where: { id: payload.id },
    data: {
      title,
      channel: payload.channel?.trim() || "WhatsApp",
      status: payload.status?.trim() || "Scheduled",
      remindAt,
      notes: payload.notes?.trim() || null,
    },
  });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function deleteClientFollowUpReminderAction(
  payload: DeleteClientSubRecordPayload
): Promise<ClientRecordMutationResult> {
  const context = await requireOwnedSubRecord(payload, (businessId) =>
    prisma.clientFollowUpReminder.findFirst({
      where: { id: payload.id, clientId: payload.clientId, businessId },
      select: { id: true },
    })
  );

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  await prisma.clientFollowUpReminder.delete({ where: { id: payload.id } });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function updateClientPaymentAction(
  payload: UpdateClientPaymentPayload
): Promise<ClientRecordMutationResult> {
  const parsed = updateClientPaymentSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

  const context = await requireOwnedSubRecord(payload, (businessId) =>
    prisma.clientPayment.findFirst({
      where: { id: payload.id, clientId: payload.clientId, businessId },
      select: { id: true },
    })
  );

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const amountCents = parseAmountToCents(payload.amount);

  if (amountCents === null) {
    return { ok: false, error: "Enter a valid payment amount." };
  }

  if (hasUnsafePublicUrl(payload.receiptUrl)) {
    return { ok: false, error: "Use a safe HTTPS receipt link." };
  }

  await prisma.clientPayment.update({
    where: { id: payload.id },
    data: {
      amountCents,
      status: payload.status.trim() || "Unpaid",
      description: payload.description.trim() || null,
      invoiceNumber: payload.invoiceNumber?.trim() || null,
      receiptNumber: payload.receiptNumber?.trim() || null,
      paymentMethod: payload.paymentMethod?.trim() || null,
      billingNote: payload.billingNote?.trim() || null,
      receiptUrl: normalizeOptionalPublicUrl(payload.receiptUrl) || null,
      paidAt: parseOptionalDate(payload.paidAt),
    },
  });

  revalidatePaymentSurfaces();

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function deleteClientPaymentAction(
  payload: DeleteClientSubRecordPayload
): Promise<ClientRecordMutationResult> {
  const context = await requireOwnedSubRecord(payload, (businessId) =>
    prisma.clientPayment.findFirst({
      where: { id: payload.id, clientId: payload.clientId, businessId },
      select: { id: true },
    })
  );

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  await prisma.clientPayment.delete({ where: { id: payload.id } });

  revalidatePaymentSurfaces();

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function updateClientDocumentAction(
  payload: UpdateClientDocumentPayload
): Promise<ClientRecordMutationResult> {
  const parsed = updateClientDocumentSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: INVALID_RECORD_ERROR };
  }

  payload = parsed.data;

  const context = await requireOwnedSubRecord(payload, (businessId) =>
    prisma.clientDocument.findFirst({
      where: { id: payload.id, clientId: payload.clientId, businessId },
      select: { id: true },
    })
  );

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const fileName = payload.fileName.trim();

  if (!fileName) {
    return { ok: false, error: "File name is required." };
  }

  await prisma.clientDocument.update({
    where: { id: payload.id },
    data: {
      fileName,
      fileType: payload.fileType.trim() || "Other",
      // `category` is set at upload and not edited here — leave it untouched
      // rather than overwriting it with fileType.
      notes: payload.notes.trim() || null,
    },
  });

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function deleteClientDocumentAction(
  payload: DeleteClientSubRecordPayload
): Promise<ClientRecordMutationResult> {
  const context = await requireOwnedClient(payload.clientId);

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const record = await prisma.clientDocument.findFirst({
    where: {
      id: payload.id,
      clientId: payload.clientId,
      businessId: context.business.id,
    },
    select: { id: true, storageUrl: true },
  });

  if (!record) {
    return { ok: false, error: "This record was not found in the patient file." };
  }

  await prisma.clientDocument.delete({ where: { id: payload.id } });

  if (record.storageUrl) {
    await deleteStorageReferences([record.storageUrl]);
  }

  return respondWithClientRecord(context.business.id, payload.clientId);
}

export async function deleteClientGalleryItemAction(
  payload: DeleteClientSubRecordPayload
): Promise<ClientRecordMutationResult> {
  const context = await requireOwnedClient(payload.clientId);

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const record = await prisma.clientGalleryItem.findFirst({
    where: {
      id: payload.id,
      clientId: payload.clientId,
      businessId: context.business.id,
    },
    select: { id: true, imageUrl: true },
  });

  if (!record) {
    return { ok: false, error: "This record was not found in the patient file." };
  }

  await prisma.clientGalleryItem.delete({ where: { id: payload.id } });

  if (record.imageUrl) {
    await deleteStorageReferences([record.imageUrl]);
  }

  return respondWithClientRecord(context.business.id, payload.clientId);
}
