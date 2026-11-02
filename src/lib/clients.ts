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

import type { Locale } from "@/i18n/config";
import { dateText, fmt, numberFormatter, storedLabel } from "@/i18n/format";
import { messages } from "@/i18n/messages";
import { appointmentStatusKey } from "@/lib/appointment-status";
import { resolveMediaDisplayUrls } from "@/lib/media-storage-server";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

export type ClientStatus = "active" | "at-risk" | "inactive" | "archived";

export type ClientTimelineEntry = {
  id: string;
  kind: "appointment" | "payment" | "note" | "document" | "message";
  date: string;
  sortKey: number;
  title: string;
  detail: string;
  status?: string;
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
  timeline: ClientTimelineEntry[];
  appointments: ClientAppointmentEntry[];
  /** The soonest pending or confirmed visit that hasn't started yet, if any. */
  nextAppointment: ClientAppointmentEntry | null;
  medications: ClientMedicationEntry[];
  documents: ClientDocumentEntry[];
  payments: ClientPaymentEntry[];
  healthItems: ClientHealthItemEntry[];
  careNotes: ClientCareNoteEntry[];
  treatmentPlanItems: ClientTreatmentPlanEntry[];
  followUpReminders: ClientFollowUpReminderEntry[];
  paymentStats: {
    unpaidBalanceCents: number;
    totalPaidDisplay: string;
    unpaidBalanceDisplay: string;
    /** Sum over the full payment ledger (billed = every status), not just the capped display list. */
    totalBilledDisplay: string;
    /** Row count over that same full ledger — payments.length is capped and undercounts past the display list's take limit. */
    totalCount: number;
    /** Same, scoped to Paid entries only. */
    totalPaidCount: number;
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
  needsAttention: boolean;
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
  appointments: Array<Pick<Appointment, "title" | "startAt">>;
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

type Copy = { locale: Locale; t: (typeof messages)["en"]["clients"] };

function copyFor(locale: Locale): Copy {
  return { locale, t: messages[locale].clients };
}

/** "Oct 31, 2026" / "31 tet 2026". */
function day(date: Date, { locale }: Copy) {
  return dateText(locale, date, { month: "short", day: "numeric", year: "numeric" });
}

// `lastVisitAt` is the last confirmed/completed visit (maintained server-side).
// The record and the directory both use it — not the most recent appointment of
// any status — so the column, the attention badge, and the "Attention" filter
// all agree and a future booking never reads as a past visit.
function formatLastVisit(lastVisitAt: Date | null, copy: Copy) {
  return lastVisitAt ? day(lastVisitAt, copy) : copy.t.view.noVisitsYet;
}

function formatFileSize(bytes: number | null, { locale }: Copy) {
  if (!bytes || bytes <= 0) {
    return "";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(Math.round(bytes / 1024), 1)} KB`;
  }

  return `${numberFormatter(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}

function toAppointmentEntry(
  appointment: ClientWithRelations["appointments"][number],
  copy: Copy
): ClientAppointmentEntry {
  return {
    id: appointment.id,
    date: day(appointment.startAt, copy),
    title: appointment.title,
    status: appointment.status,
    notes: appointment.notes ?? "",
  };
}

function buildAppointments(client: ClientWithRelations, copy: Copy): ClientAppointmentEntry[] {
  return client.appointments.map((appointment) => toAppointmentEntry(appointment, copy));
}

function buildMedications(client: ClientWithRelations, copy: Copy): ClientMedicationEntry[] {
  return client.medications.map((medication) => ({
    id: medication.id,
    name: medication.name,
    dosage: medication.dosage ?? "",
    frequency: medication.frequency ?? "",
    notes: medication.notes ?? "",
    isActive: medication.isActive,
    createdAt: day(medication.createdAt, copy),
  }));
}

async function buildDocuments(client: ClientWithRelations, copy: Copy): Promise<ClientDocumentEntry[]> {
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
      fileSize: formatFileSize(document.fileSize ?? null, copy),
      fileUrl: (source && urlMap.get(source)) || "",
      storageUrl: document.storageUrl ?? document.fileUrl ?? "",
      // The action stores "Workspace staff" when nobody is named; the page shows
      // that default in the reader's language.
      uploadedBy: storedText(document.uploadedBy, "Workspace staff"),
      notes: storedText(document.notes),
      createdAt: day(document.createdAt, copy),
    };
  });
}

// Filler text an older version of this view model returned for empty values.
// Edit dialogs could save it back, so some stored rows may still hold it; it is
// read here as empty, once, instead of being stripped again in every component.
const LEGACY_FILLER = new Set(["Not added", "Not added yet.", "No notes.", "No notes yet."]);

/** A stored free-text value, with legacy filler (or null) read as empty. */
export function storedText(value: string | null | undefined, ...extraFiller: string[]) {
  const text = value ?? "";
  return LEGACY_FILLER.has(text) || extraFiller.includes(text) ? "" : text;
}

function buildPayments(client: ClientWithRelations, currency: string, copy: Copy): ClientPaymentEntry[] {
  return client.payments.map((payment) => ({
    id: payment.id,
    appointmentId: payment.appointmentId ?? "",
    amountCents: payment.amountCents,
    amountDisplay: formatCurrency(payment.amountCents, currency, { locale: copy.locale }),
    amountInput: (payment.amountCents / 100).toFixed(2),
    status: payment.status,
    description: storedText(payment.description, "Payment record"),
    invoiceNumber: payment.invoiceNumber ?? "",
    receiptNumber: payment.receiptNumber ?? "",
    paymentMethod: storedText(payment.paymentMethod, "Manual entry"),
    billingNote: payment.billingNote ?? "",
    receiptUrl: payment.receiptUrl ?? "",
    paidAt: payment.paidAt ? day(payment.paidAt, copy) : "",
    paidAtInput: payment.paidAt ? format(payment.paidAt, "yyyy-MM-dd") : "",
    createdAt: day(payment.createdAt, copy),
  }));
}

function buildHealthItems(client: ClientWithRelations, copy: Copy): ClientHealthItemEntry[] {
  return client.healthItems.map((item) => ({
    id: item.id,
    type: item.type,
    label: item.label,
    value: item.value ?? "",
    severity: item.severity ?? "",
    notes: item.notes ?? "",
    recordedAt: day(item.recordedAt, copy),
  }));
}

function buildCareNotes(client: ClientWithRelations, copy: Copy): ClientCareNoteEntry[] {
  return client.careNotes.map((note) => ({
    id: note.id,
    // Empty when untitled; the page shows "Provider note" in its place.
    title: note.title ?? "",
    body: note.body,
    providerName: note.staffMember?.name ?? copy.t.view.workspaceStaff,
    notedAt: day(note.notedAt, copy),
  }));
}

function buildTreatmentPlanItems(
  client: ClientWithRelations,
  copy: Copy
): ClientTreatmentPlanEntry[] {
  return client.treatmentPlanItems.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description ?? "",
    status: item.status,
    dueAt: item.dueAt ? day(item.dueAt, copy) : "",
    dueAtInput: item.dueAt ? format(item.dueAt, "yyyy-MM-dd") : "",
  }));
}

function buildFollowUpReminders(
  client: ClientWithRelations,
  copy: Copy
): ClientFollowUpReminderEntry[] {
  return client.followUpReminders.map((reminder) => ({
    id: reminder.id,
    title: reminder.title,
    channel: reminder.channel,
    status: reminder.status,
    remindAt: day(reminder.remindAt, copy),
    remindAtInput: format(reminder.remindAt, "yyyy-MM-dd"),
    notes: reminder.notes ?? "",
  }));
}

function buildTimeline(client: ClientWithRelations, currency: string, copy: Copy): ClientTimelineEntry[] {
  const { t } = copy;
  const entries: ClientTimelineEntry[] = [
    ...client.appointments.map((appointment) => ({
      id: `appointment-${appointment.id}`,
      kind: "appointment" as const,
      date: day(appointment.startAt, copy),
      sortKey: appointment.startAt.getTime(),
      title: appointment.title,
      detail: appointment.notes?.trim() || t.view.appointment,
      status: appointmentStatusKey(appointment.status),
    })),
    ...client.payments.map((payment) => ({
      id: `payment-${payment.id}`,
      kind: "payment" as const,
      date: day(payment.paidAt ?? payment.createdAt, copy),
      sortKey: (payment.paidAt ?? payment.createdAt).getTime(),
      title: fmt(t.view.paymentTitle, {
        amount: formatCurrency(payment.amountCents, currency, { locale: copy.locale }),
        status: storedLabel(t.paymentStatuses, payment.status).toLowerCase(),
      }),
      detail: payment.description?.trim() || t.view.paymentRecord,
      status: payment.status.toLowerCase(),
    })),
    ...client.careNotes.map((note) => ({
      id: `note-${note.id}`,
      kind: "note" as const,
      date: day(note.notedAt, copy),
      sortKey: note.notedAt.getTime(),
      title: note.title?.trim() || t.view.providerNote,
      detail: note.body,
    })),
    ...client.documents.map((document) => ({
      id: `document-${document.id}`,
      kind: "document" as const,
      date: day(document.createdAt, copy),
      sortKey: document.createdAt.getTime(),
      title: document.fileName,
      detail: fmt(t.view.documentAdded, {
        category: storedLabel(t.documentCategories, document.category ?? document.fileType),
      }),
    })),
    ...client.messages.map((message) => ({
      id: `message-${message.id}`,
      kind: "message" as const,
      date: day(message.sentAt, copy),
      sortKey: message.sentAt.getTime(),
      title: message.direction === "INBOUND" ? t.view.messageReceived : t.view.messageSent,
      detail: message.body,
    })),
  ];

  return entries.sort((a, b) => b.sortKey - a.sortKey).slice(0, 14);
}

/**
 * `currency` is the workspace's (`Business.currency`): every amount on the record
 * is formatted in it. It is a required argument so no caller can forget it.
 * `locale` is the reader's language, for dates, amounts and the record's own text.
 */
export async function buildClientRecord(
  client: ClientWithRelations,
  currency: string,
  now: Date = new Date(),
  locale: Locale = "en"
): Promise<ClientRecord> {
  const copy = copyFor(locale);
  const money = (cents: number) => formatCurrency(cents, currency, { locale });
  // The payments array on `client` is a display list capped at take:60
  // (most-recent-first) — fine for rendering history, but a patient with more
  // invoices than that would understate the paid/unpaid totals. Sum those over
  // the FULL history in the DB instead, unbounded by the display take limit.
  const [paymentSumsByStatus, galleryUrlMap, nextAppointment] = await Promise.all([
    prisma.clientPayment.groupBy({
      by: ["status"],
      where: { businessId: client.businessId, clientId: client.id },
      _sum: { amountCents: true },
      _count: true,
    }),
    // Batch-sign gallery images once (one request per bucket) instead of a
    // round-trip per item; independent of the sums above, so it runs alongside
    // them rather than after.
    resolveMediaDisplayUrls(client.galleryItems.map((item) => item.imageUrl)),
    // "Next" means still to come: an old booking nobody marked completed or
    // cancelled stays PENDING and must not read as the next visit (QA
    // 2026-10-07). Its own query, not the capped display list, which holds the
    // latest bookings first and can leave the soonest one out (Codex #142).
    prisma.appointment.findFirst({
      where: {
        businessId: client.businessId,
        clientId: client.id,
        status: { in: ["PENDING", "CONFIRMED"] },
        startAt: { gt: now },
      },
      orderBy: { startAt: "asc" },
      select: { id: true, title: true, startAt: true, status: true, notes: true },
    }),
  ]);

  const paymentSum = (status: string) =>
    paymentSumsByStatus.find((row) => row.status === status)?._sum.amountCents ?? 0;
  const paymentCount = (status: string) =>
    paymentSumsByStatus.find((row) => row.status === status)?._count ?? 0;
  const totalPaidCents = paymentSum("Paid");
  const totalPaidCount = paymentCount("Paid");
  const unpaidBalanceCents = paymentSum("Unpaid") + paymentSum("Partially Paid");
  // Billed must come from the same unbounded source as paid/unpaid above — a
  // client with more than 60 payments would otherwise show billed < paid +
  // unpaid, since `client.payments` is the capped take:60 display list
  // (CodeRabbit).
  const totalBilledCents = paymentSumsByStatus.reduce((sum, row) => sum + (row._sum.amountCents ?? 0), 0);
  // Same reasoning applies to the ledger-entry count shown beside it — a
  // client with more than 60 payments would otherwise show a "60 ledger
  // entries" caption next to a full-history total (Codex #131).
  const totalPaymentCount = paymentSumsByStatus.reduce((sum, row) => sum + row._count, 0);

  return {
    id: client.id,
    name: client.name,
    email: client.email ?? "",
    phone: client.phone,
    gender: storedText(client.gender),
    dateOfBirth: client.dateOfBirth ? day(client.dateOfBirth, copy) : "",
    dateOfBirthInput: client.dateOfBirth ? format(client.dateOfBirth, "yyyy-MM-dd") : "",
    address: storedText(client.address),
    patientType: client.patientType ?? "New Patient",
    // Vestigial (clinic-type-per-patient isn't a real concept) and never
    // rendered anywhere — an empty string here, not a fabricated "Clinic".
    clinicType: client.clinicType ?? "",
    lastVisit: formatLastVisit(client.lastVisitAt, copy),
    totalVisits: client._count?.appointments ?? client.appointments.length,
    status: formatStatus(client.status, client.isArchived),
    notes: storedText(client.notes),
    medical: {
      medicalHistory: storedText(client.medicalHistory),
      allergies: storedText(client.allergies),
      importantHealthNotes: storedText(client.importantHealthNotes),
      previousTreatments: storedText(client.previousTreatments),
      treatmentPlan: storedText(client.treatmentPlan),
    },
    details: {
      // A never-captured preference is unknown, not "WhatsApp" — the record
      // shouldn't assert a fact about the patient the clinic never confirmed.
      // Both render sites (client-details-page.tsx) already treat an empty
      // string as "hide this row", matching the empty-value display rule.
      preferredChannel: client.preferredChannel ?? "",
      assignedStaff: client.assignedStaffName ?? "",
      tags: client.tags,
    },
    timeline: buildTimeline(client, currency, copy),
    appointments: buildAppointments(client, copy),
    nextAppointment: nextAppointment ? toAppointmentEntry(nextAppointment, copy) : null,
    medications: buildMedications(client, copy),
    documents: await buildDocuments(client, copy),
    payments: buildPayments(client, currency, copy),
    healthItems: buildHealthItems(client, copy),
    careNotes: buildCareNotes(client, copy),
    treatmentPlanItems: buildTreatmentPlanItems(client, copy),
    followUpReminders: buildFollowUpReminders(client, copy),
    paymentStats: {
      unpaidBalanceCents,
      totalPaidDisplay: money(totalPaidCents),
      unpaidBalanceDisplay: money(unpaidBalanceCents),
      totalBilledDisplay: money(totalBilledCents),
      totalCount: totalPaymentCount,
      totalPaidCount,
    },
    gallery: client.galleryItems.map((item) => ({
      id: item.id,
      type: item.type === "BEFORE" ? "before" : "after",
      imageUrl: (item.imageUrl && galleryUrlMap.get(item.imageUrl)) || "",
      caption: item.caption ?? "",
      createdAt: day(item.createdAt, copy),
    })),
  };
}

export const ATTENTION_STALE_DAYS = 90;

export function attentionCutoffDate(now = new Date()) {
  return new Date(now.getTime() - ATTENTION_STALE_DAYS * 24 * 60 * 60 * 1000);
}

function deriveDirectoryAttention(client: ClientDirectoryRow, status: ClientStatus): boolean {
  if (status === "archived") {
    return false;
  }

  if (status === "at-risk") {
    return true;
  }

  // Mirror the DB "attention" filter exactly (page.tsx buildFilterWhere), which
  // keys on lastVisitAt — so the chip count and the row badge can never disagree.
  return Boolean(client.lastVisitAt && client.lastVisitAt < attentionCutoffDate());
}

export function buildClientDirectoryViewFromRecords(
  records: ClientDirectoryRow[],
  meta: {
    total: number;
    page: number;
    pageSize: number;
    counts: ClientDirectoryCounts;
  },
  locale: Locale = "en"
): ClientsViewModel {
  const copy = copyFor(locale);
  const clients = records.map((client) => {
    const latestAppointment = client.appointments[0];
    const status = formatStatus(client.status, client.isArchived);

    return {
      id: client.id,
      name: client.name,
      email: client.email ?? "",
      phone: client.phone,
      lastVisit: formatLastVisit(client.lastVisitAt, copy),
      totalVisits: client._count?.appointments ?? 0,
      status,
      lastService: latestAppointment?.title ?? "",
      needsAttention: deriveDirectoryAttention(client, status),
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
