import type {
  Appointment,
  AppointmentStatus,
  Client,
  ClientCareNote,
  ClientDocument,
  ClientGalleryItem,
  ClientFollowUpReminder,
  ClientHealthItem,
  ClientMedication,
  ClientPayment,
  ClientTreatmentPlanItem,
  Message,
} from "@prisma/client";
import { format } from "date-fns";

import { resolveMediaDisplayUrls } from "@/lib/media-storage-server";
import { formatCurrency } from "@/lib/utils";

export type ClientStatus = "active" | "at-risk" | "inactive" | "archived";

export type ClientHistoryEntry = {
  id: string;
  date: string;
  title: string;
  detail: string;
};

export type ClientTimelineEntry = {
  id: string;
  kind: "appointment" | "payment" | "note" | "document" | "message";
  date: string;
  sortKey: number;
  title: string;
  detail: string;
  status?: string;
};

export type ClientMessageEntry = {
  id: string;
  sender: "client" | "business";
  body: string;
  timestamp: string;
};

export type ClientAppointmentEntry = {
  id: string;
  date: string;
  title: string;
  status: AppointmentStatus;
  notes: string;
};

export type ClientMedicationEntry = {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
};

export type ClientDocumentEntry = {
  id: string;
  fileName: string;
  fileType: string;
  category: string;
  mimeType: string;
  fileSize: string;
  fileUrl: string;
  storageUrl: string;
  uploadedBy: string;
  notes: string;
  createdAt: string;
};

export type ClientPaymentEntry = {
  id: string;
  appointmentId: string;
  amountCents: number;
  amountDisplay: string;
  amountInput: string;
  status: string;
  description: string;
  invoiceNumber: string;
  receiptNumber: string;
  paymentMethod: string;
  billingNote: string;
  receiptUrl: string;
  paidAt: string;
  paidAtInput: string;
  createdAt: string;
};

export type ClientHealthItemEntry = {
  id: string;
  type: string;
  label: string;
  value: string;
  severity: string;
  notes: string;
  recordedAt: string;
};

export type ClientCareNoteEntry = {
  id: string;
  title: string;
  body: string;
  providerName: string;
  notedAt: string;
};

export type ClientTreatmentPlanEntry = {
  id: string;
  title: string;
  description: string;
  status: string;
  dueAt: string;
  dueAtInput: string;
};

export type ClientFollowUpReminderEntry = {
  id: string;
  title: string;
  channel: string;
  status: string;
  remindAt: string;
  remindAtInput: string;
  notes: string;
};

export type ClientRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  dateOfBirthInput: string;
  address: string;
  patientType: string;
  clinicType: string;
  lastVisit: string;
  totalVisits: number;
  status: ClientStatus;
  notes: string;
  medical: {
    medicalHistory: string;
    allergies: string;
    importantHealthNotes: string;
    previousTreatments: string;
    treatmentPlan: string;
  };
  details: {
    preferredChannel: string;
    assignedStaff: string;
    tags: string[];
  };
  history: ClientHistoryEntry[];
  timeline: ClientTimelineEntry[];
  appointments: ClientAppointmentEntry[];
  medications: ClientMedicationEntry[];
  documents: ClientDocumentEntry[];
  payments: ClientPaymentEntry[];
  messages: ClientMessageEntry[];
  healthItems: ClientHealthItemEntry[];
  careNotes: ClientCareNoteEntry[];
  treatmentPlanItems: ClientTreatmentPlanEntry[];
  followUpReminders: ClientFollowUpReminderEntry[];
  appointmentStats: {
    completed: number;
    cancelled: number;
    pending: number;
    upcoming: number;
    noShows: number;
  };
  paymentStats: {
    totalPaidCents: number;
    unpaidBalanceCents: number;
    totalPaidDisplay: string;
    unpaidBalanceDisplay: string;
    paymentStatus: string;
  };
  gallery: Array<{
    id: string;
    type: "before" | "after";
    imageUrl: string;
    caption: string;
    createdAt: string;
  }>;
};

export type ClientDirectoryItem = Pick<
  ClientRecord,
  "id" | "name" | "email" | "phone" | "lastVisit" | "totalVisits" | "status"
> & {
  lastService: string;
  lastProvider: string;
  needsAttention: boolean;
  attentionReason: string;
};

export type ClientDirectoryFilter =
  | "all"
  | "active"
  | "inactive"
  | "archived"
  | "attention"
  | "no-visits";

export type ClientDirectoryCounts = {
  all: number;
  active: number;
  inactive: number;
  atRisk: number;
  archived: number;
  noVisits: number;
  attention: number;
};

export type ClientsViewModel = {
  clients: ClientDirectoryItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: ClientDirectoryCounts;
};

export type SaveClientPayload = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  gender?: string;
  dateOfBirth?: string;
  address?: string;
  patientType?: string;
  clinicType?: string;
  status: ClientStatus;
  notes: string;
  medicalHistory?: string;
  allergies?: string;
  importantHealthNotes?: string;
  previousTreatments?: string;
  treatmentPlan?: string;
  preferredChannel: string;
  assignedStaff: string;
  tags: string;
};

type ClientWithRelations = Client & {
  appointments: Pick<Appointment, "id" | "title" | "startAt" | "status" | "notes">[];
  messages: Pick<Message, "id" | "body" | "direction" | "sentAt">[];
  galleryItems: Pick<ClientGalleryItem, "id" | "type" | "imageUrl" | "caption" | "createdAt">[];
  medications: Pick<ClientMedication, "id" | "name" | "dosage" | "frequency" | "notes" | "isActive" | "createdAt">[];
  documents: Pick<ClientDocument, "id" | "fileName" | "fileType" | "category" | "mimeType" | "fileSize" | "fileUrl" | "storageUrl" | "uploadedBy" | "notes" | "createdAt">[];
  payments: Pick<ClientPayment, "id" | "appointmentId" | "amountCents" | "status" | "description" | "invoiceNumber" | "receiptNumber" | "paymentMethod" | "billingNote" | "receiptUrl" | "paidAt" | "createdAt">[];
  healthItems: Pick<ClientHealthItem, "id" | "type" | "label" | "value" | "severity" | "notes" | "recordedAt">[];
  careNotes: Array<
    Pick<ClientCareNote, "id" | "title" | "body" | "notedAt"> & {
      staffMember: { name: string } | null;
    }
  >;
  treatmentPlanItems: Pick<ClientTreatmentPlanItem, "id" | "title" | "description" | "status" | "dueAt">[];
  followUpReminders: Pick<ClientFollowUpReminder, "id" | "title" | "channel" | "status" | "remindAt" | "notes">[];
  _count?: {
    appointments: number;
  };
};

type ClientDirectoryRow = Pick<
  Client,
  | "id"
  | "name"
  | "email"
  | "phone"
  | "status"
  | "isArchived"
  | "lastVisitAt"
  | "createdAt"
> & {
  appointments: Array<
    Pick<Appointment, "title" | "startAt"> & {
      staffMember: { name: string } | null;
    }
  >;
  _count?: {
    appointments: number;
  };
};

function formatStatus(value: Client["status"], isArchived: boolean): ClientStatus {
  if (isArchived || value === "ARCHIVED") {
    return "archived";
  }

  if (value === "AT_RISK") {
    return "at-risk";
  }

  if (value === "INACTIVE") {
    return "inactive";
  }

  return "active";
}

export function toPrismaClientStatus(status: ClientStatus) {
  switch (status) {
    case "at-risk":
      return "AT_RISK" as const;
    case "inactive":
      return "INACTIVE" as const;
    case "archived":
      return "ARCHIVED" as const;
    default:
      return "ACTIVE" as const;
  }
}

function formatLastVisit(client: ClientWithRelations) {
  const latestAppointment = client.appointments[0]?.startAt ?? client.lastVisitAt;

  return latestAppointment ? format(latestAppointment, "MMM d, yyyy") : "No visits yet";
}

function formatDirectoryLastVisit(client: ClientDirectoryRow) {
  // `lastVisitAt` is the last confirmed/completed visit (maintained server-side).
  // Use it — not the most recent appointment of any status — so the column, the
  // attention badge, and the "Attention" filter all agree and a future booking
  // never reads as a past visit.
  return client.lastVisitAt
    ? format(client.lastVisitAt, "MMM d, yyyy")
    : "No visits yet";
}

function buildHistory(client: ClientWithRelations): ClientHistoryEntry[] {
  if (client.appointments.length > 0) {
    return client.appointments.map((appointment) => ({
      id: appointment.id,
      date: format(appointment.startAt, "MMM d, yyyy"),
      title: appointment.title,
      detail: `Appointment ${appointment.status.toLowerCase()} in the clinic workspace.`,
    }));
  }

  return [
    {
      id: `created-${client.id}`,
      date: format(client.createdAt, "MMM d, yyyy"),
      title: "Client created",
      detail: "Profile created in the Vela clients workspace.",
    },
  ];
}

function buildMessages(client: ClientWithRelations): ClientMessageEntry[] {
  return client.messages.map((message) => ({
    id: message.id,
    sender: message.direction === "INBOUND" ? "client" : "business",
    body: message.body,
    timestamp: format(message.sentAt, "h:mm a"),
  }));
}

const formatMoney = (cents: number) => formatCurrency(cents);

function formatFileSize(bytes: number | null) {
  if (!bytes || bytes <= 0) {
    return "";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(Math.round(bytes / 1024), 1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildAppointments(client: ClientWithRelations): ClientAppointmentEntry[] {
  return client.appointments.map((appointment) => ({
    id: appointment.id,
    date: format(appointment.startAt, "MMM d, yyyy"),
    title: appointment.title,
    status: appointment.status,
    notes: appointment.notes ?? "",
  }));
}

function buildMedications(client: ClientWithRelations): ClientMedicationEntry[] {
  return client.medications.map((medication) => ({
    id: medication.id,
    name: medication.name,
    dosage: medication.dosage ?? "",
    frequency: medication.frequency ?? "",
    notes: medication.notes ?? "",
    isActive: medication.isActive,
    createdAt: format(medication.createdAt, "MMM d, yyyy"),
  }));
}

async function buildDocuments(client: ClientWithRelations): Promise<ClientDocumentEntry[]> {
  // Sign every document URL in one batched pass (one request per bucket) rather
  // than a fresh client + round-trip per document.
  const urlMap = await resolveMediaDisplayUrls(
    client.documents.map((document) => document.storageUrl ?? document.fileUrl)
  );

  return client.documents.map((document) => {
    const source = document.storageUrl ?? document.fileUrl;

    return {
      id: document.id,
      fileName: document.fileName,
      fileType: document.fileType,
      category: document.category ?? document.fileType,
      mimeType: document.mimeType ?? "",
      fileSize: formatFileSize(document.fileSize ?? null),
      fileUrl: (source && urlMap.get(source)) || "",
      storageUrl: document.storageUrl ?? document.fileUrl ?? "",
      uploadedBy: document.uploadedBy ?? "Workspace staff",
      notes: document.notes ?? "",
      createdAt: format(document.createdAt, "MMM d, yyyy"),
    };
  });
}

function buildPayments(client: ClientWithRelations): ClientPaymentEntry[] {
  return client.payments.map((payment) => ({
    id: payment.id,
    appointmentId: payment.appointmentId ?? "",
    amountCents: payment.amountCents,
    amountDisplay: formatMoney(payment.amountCents),
    amountInput: (payment.amountCents / 100).toFixed(2),
    status: payment.status,
    description: payment.description ?? "",
    invoiceNumber: payment.invoiceNumber ?? "",
    receiptNumber: payment.receiptNumber ?? "",
    paymentMethod: payment.paymentMethod ?? "",
    billingNote: payment.billingNote ?? "",
    receiptUrl: payment.receiptUrl ?? "",
    paidAt: payment.paidAt ? format(payment.paidAt, "MMM d, yyyy") : "",
    paidAtInput: payment.paidAt ? format(payment.paidAt, "yyyy-MM-dd") : "",
    createdAt: format(payment.createdAt, "MMM d, yyyy"),
  }));
}

function buildHealthItems(client: ClientWithRelations): ClientHealthItemEntry[] {
  return client.healthItems.map((item) => ({
    id: item.id,
    type: item.type,
    label: item.label,
    value: item.value ?? "",
    severity: item.severity ?? "",
    notes: item.notes ?? "",
    recordedAt: format(item.recordedAt, "MMM d, yyyy"),
  }));
}

function buildCareNotes(client: ClientWithRelations): ClientCareNoteEntry[] {
  return client.careNotes.map((note) => ({
    id: note.id,
    title: note.title ?? "Provider note",
    body: note.body,
    providerName: note.staffMember?.name ?? "Workspace staff",
    notedAt: format(note.notedAt, "MMM d, yyyy"),
  }));
}

function buildTreatmentPlanItems(
  client: ClientWithRelations
): ClientTreatmentPlanEntry[] {
  return client.treatmentPlanItems.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description ?? "",
    status: item.status,
    dueAt: item.dueAt ? format(item.dueAt, "MMM d, yyyy") : "",
    dueAtInput: item.dueAt ? format(item.dueAt, "yyyy-MM-dd") : "",
  }));
}

function buildFollowUpReminders(
  client: ClientWithRelations
): ClientFollowUpReminderEntry[] {
  return client.followUpReminders.map((reminder) => ({
    id: reminder.id,
    title: reminder.title,
    channel: reminder.channel,
    status: reminder.status,
    remindAt: format(reminder.remindAt, "MMM d, yyyy"),
    remindAtInput: format(reminder.remindAt, "yyyy-MM-dd"),
    notes: reminder.notes ?? "",
  }));
}

function buildTimeline(client: ClientWithRelations): ClientTimelineEntry[] {
  const entries: ClientTimelineEntry[] = [
    ...client.appointments.map((appointment) => ({
      id: `appointment-${appointment.id}`,
      kind: "appointment" as const,
      date: format(appointment.startAt, "MMM d, yyyy"),
      sortKey: appointment.startAt.getTime(),
      title: appointment.title,
      detail: appointment.notes?.trim() || "Appointment",
      status: appointment.status.toLowerCase(),
    })),
    ...client.payments.map((payment) => ({
      id: `payment-${payment.id}`,
      kind: "payment" as const,
      date: format(payment.paidAt ?? payment.createdAt, "MMM d, yyyy"),
      sortKey: (payment.paidAt ?? payment.createdAt).getTime(),
      title: `${formatMoney(payment.amountCents)} ${payment.status.toLowerCase()}`,
      detail: payment.description?.trim() || "Payment record",
      status: payment.status.toLowerCase(),
    })),
    ...client.careNotes.map((note) => ({
      id: `note-${note.id}`,
      kind: "note" as const,
      date: format(note.notedAt, "MMM d, yyyy"),
      sortKey: note.notedAt.getTime(),
      title: note.title?.trim() || "Provider note",
      detail: note.body,
    })),
    ...client.documents.map((document) => ({
      id: `document-${document.id}`,
      kind: "document" as const,
      date: format(document.createdAt, "MMM d, yyyy"),
      sortKey: document.createdAt.getTime(),
      title: document.fileName,
      detail: `${document.category ?? document.fileType} document added`,
    })),
    ...client.messages.map((message) => ({
      id: `message-${message.id}`,
      kind: "message" as const,
      date: format(message.sentAt, "MMM d, yyyy"),
      sortKey: message.sentAt.getTime(),
      title: message.direction === "INBOUND" ? "Message received" : "Message sent",
      detail: message.body,
    })),
  ];

  return entries.sort((a, b) => b.sortKey - a.sortKey).slice(0, 14);
}

export async function buildClientRecord(client: ClientWithRelations): Promise<ClientRecord> {
  const now = new Date();
  const completed = client.appointments.filter(
    (appointment) => appointment.status === "COMPLETED"
  ).length;
  const cancelled = client.appointments.filter(
    (appointment) => appointment.status === "CANCELLED"
  ).length;
  const pending = client.appointments.filter(
    (appointment) => appointment.status === "PENDING"
  ).length;
  const upcoming = client.appointments.filter(
    (appointment) =>
      appointment.startAt >= now &&
      (appointment.status === "PENDING" || appointment.status === "CONFIRMED")
  ).length;
  const totalPaidCents = client.payments
    .filter((payment) => payment.status === "Paid")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const unpaidBalanceCents = client.payments
    .filter((payment) => payment.status === "Unpaid" || payment.status === "Partially Paid")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const paymentStatus =
    unpaidBalanceCents > 0
      ? totalPaidCents > 0
        ? "Partially Paid"
        : "Unpaid"
      : totalPaidCents > 0
        ? "Paid"
        : "No payments yet";

  // Batch-sign gallery images once (one request per bucket) instead of a
  // round-trip per item.
  const galleryUrlMap = await resolveMediaDisplayUrls(
    client.galleryItems.map((item) => item.imageUrl)
  );

  return {
    id: client.id,
    name: client.name,
    email: client.email ?? "",
    phone: client.phone,
    gender: client.gender ?? "",
    dateOfBirth: client.dateOfBirth ? format(client.dateOfBirth, "MMM d, yyyy") : "",
    dateOfBirthInput: client.dateOfBirth ? format(client.dateOfBirth, "yyyy-MM-dd") : "",
    address: client.address ?? "",
    patientType: client.patientType ?? "New Patient",
    clinicType: client.clinicType ?? "Clinic",
    lastVisit: formatLastVisit(client),
    totalVisits: client._count?.appointments ?? client.appointments.length,
    status: formatStatus(client.status, client.isArchived),
    notes: client.notes ?? "",
    medical: {
      medicalHistory: client.medicalHistory ?? "",
      allergies: client.allergies ?? "",
      importantHealthNotes: client.importantHealthNotes ?? "",
      previousTreatments: client.previousTreatments ?? "",
      treatmentPlan: client.treatmentPlan ?? "",
    },
    details: {
      preferredChannel: client.preferredChannel ?? "WhatsApp",
      assignedStaff: client.assignedStaffName ?? "",
      tags: client.tags,
    },
    history: buildHistory(client),
    timeline: buildTimeline(client),
    appointments: buildAppointments(client),
    medications: buildMedications(client),
    documents: await buildDocuments(client),
    payments: buildPayments(client),
    messages: buildMessages(client),
    healthItems: buildHealthItems(client),
    careNotes: buildCareNotes(client),
    treatmentPlanItems: buildTreatmentPlanItems(client),
    followUpReminders: buildFollowUpReminders(client),
    appointmentStats: {
      completed,
      cancelled,
      pending,
      upcoming,
      noShows: 0,
    },
    paymentStats: {
      totalPaidCents,
      unpaidBalanceCents,
      totalPaidDisplay: formatMoney(totalPaidCents),
      unpaidBalanceDisplay: formatMoney(unpaidBalanceCents),
      paymentStatus,
    },
    gallery: client.galleryItems.map((item) => ({
      id: item.id,
      type: item.type === "BEFORE" ? "before" : "after",
      imageUrl: (item.imageUrl && galleryUrlMap.get(item.imageUrl)) || "",
      caption: item.caption ?? "",
      createdAt: format(item.createdAt, "MMM d, yyyy"),
    })),
  };
}

export const ATTENTION_STALE_DAYS = 90;

export function attentionCutoffDate(now = new Date()) {
  return new Date(now.getTime() - ATTENTION_STALE_DAYS * 24 * 60 * 60 * 1000);
}

function deriveDirectoryAttention(client: ClientDirectoryRow, status: ClientStatus) {
  if (status === "archived") {
    return { needsAttention: false, attentionReason: "" };
  }

  if (status === "at-risk") {
    return { needsAttention: true, attentionReason: "Marked at risk" };
  }

  // Mirror the DB "attention" filter exactly (page.tsx buildFilterWhere), which
  // keys on lastVisitAt — so the chip count and the row badge can never disagree.
  if (client.lastVisitAt && client.lastVisitAt < attentionCutoffDate()) {
    return {
      needsAttention: true,
      attentionReason: `No visit in ${ATTENTION_STALE_DAYS}+ days`,
    };
  }

  return { needsAttention: false, attentionReason: "" };
}

export function buildClientDirectoryViewFromRecords(
  records: ClientDirectoryRow[],
  meta: {
    total: number;
    page: number;
    pageSize: number;
    counts: ClientDirectoryCounts;
  }
): ClientsViewModel {
  const clients = records.map((client) => {
    const latestAppointment = client.appointments[0];
    const status = formatStatus(client.status, client.isArchived);
    const attention = deriveDirectoryAttention(client, status);

    return {
      id: client.id,
      name: client.name,
      email: client.email ?? "",
      phone: client.phone,
      lastVisit: formatDirectoryLastVisit(client),
      totalVisits: client._count?.appointments ?? 0,
      status,
      lastService: latestAppointment?.title ?? "",
      lastProvider: latestAppointment?.staffMember?.name ?? "",
      needsAttention: attention.needsAttention,
      attentionReason: attention.attentionReason,
    };
  });

  return {
    clients,
    total: meta.total,
    page: meta.page,
    pageSize: meta.pageSize,
    counts: meta.counts,
  };
}
