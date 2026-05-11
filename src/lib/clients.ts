import type {
  Appointment,
  AppointmentStatus,
  Client,
  ClientDocument,
  ClientGalleryItem,
  ClientMedication,
  ClientPayment,
  Message,
} from "@prisma/client";
import { format } from "date-fns";

import { resolveMediaDisplayUrl } from "@/lib/media-storage-server";

export type ClientStatus = "active" | "at-risk" | "inactive" | "archived";

export type ClientHistoryEntry = {
  id: string;
  date: string;
  title: string;
  detail: string;
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
  fileUrl: string;
  notes: string;
  createdAt: string;
};

export type ClientPaymentEntry = {
  id: string;
  appointmentId: string;
  amountCents: number;
  amountDisplay: string;
  status: string;
  description: string;
  receiptUrl: string;
  paidAt: string;
  createdAt: string;
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
  appointments: ClientAppointmentEntry[];
  medications: ClientMedicationEntry[];
  documents: ClientDocumentEntry[];
  payments: ClientPaymentEntry[];
  messages: ClientMessageEntry[];
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

export type ClientsViewModel = {
  clients: ClientRecord[];
  initialSelectedClientId: string;
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
  documents: Pick<ClientDocument, "id" | "fileName" | "fileType" | "fileUrl" | "notes" | "createdAt">[];
  payments: Pick<ClientPayment, "id" | "appointmentId" | "amountCents" | "status" | "description" | "receiptUrl" | "paidAt" | "createdAt">[];
  _count?: {
    appointments: number;
  };
};

function formatStatus(value: ClientWithRelations["status"], isArchived: boolean): ClientStatus {
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

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function buildAppointments(client: ClientWithRelations): ClientAppointmentEntry[] {
  return client.appointments.map((appointment) => ({
    id: appointment.id,
    date: format(appointment.startAt, "MMM d, yyyy"),
    title: appointment.title,
    status: appointment.status,
    notes: appointment.notes ?? "No appointment notes.",
  }));
}

function buildMedications(client: ClientWithRelations): ClientMedicationEntry[] {
  return client.medications.map((medication) => ({
    id: medication.id,
    name: medication.name,
    dosage: medication.dosage ?? "Not added",
    frequency: medication.frequency ?? "Not added",
    notes: medication.notes ?? "No notes.",
    isActive: medication.isActive,
    createdAt: format(medication.createdAt, "MMM d, yyyy"),
  }));
}

async function buildDocuments(client: ClientWithRelations): Promise<ClientDocumentEntry[]> {
  return Promise.all(
    client.documents.map(async (document) => ({
      id: document.id,
      fileName: document.fileName,
      fileType: document.fileType,
      fileUrl: await resolveMediaDisplayUrl(document.fileUrl),
      notes: document.notes ?? "No notes.",
      createdAt: format(document.createdAt, "MMM d, yyyy"),
    }))
  );
}

function buildPayments(client: ClientWithRelations): ClientPaymentEntry[] {
  return client.payments.map((payment) => ({
    id: payment.id,
    appointmentId: payment.appointmentId ?? "",
    amountCents: payment.amountCents,
    amountDisplay: formatMoney(payment.amountCents),
    status: payment.status,
    description: payment.description ?? "Payment record",
    receiptUrl: payment.receiptUrl ?? "",
    paidAt: payment.paidAt ? format(payment.paidAt, "MMM d, yyyy") : "Not paid yet",
    createdAt: format(payment.createdAt, "MMM d, yyyy"),
  }));
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

  return {
    id: client.id,
    name: client.name,
    email: client.email ?? "",
    phone: client.phone,
    gender: client.gender ?? "Not added",
    dateOfBirth: client.dateOfBirth ? format(client.dateOfBirth, "MMM d, yyyy") : "Not added",
    dateOfBirthInput: client.dateOfBirth ? format(client.dateOfBirth, "yyyy-MM-dd") : "",
    address: client.address ?? "Not added",
    patientType: client.patientType ?? "New Patient",
    clinicType: client.clinicType ?? "Clinic",
    lastVisit: formatLastVisit(client),
    totalVisits: client._count?.appointments ?? client.appointments.length,
    status: formatStatus(client.status, client.isArchived),
    notes: client.notes ?? "No notes yet.",
    medical: {
      medicalHistory: client.medicalHistory ?? "Not added yet.",
      allergies: client.allergies ?? "Not added yet.",
      importantHealthNotes: client.importantHealthNotes ?? "Not added yet.",
      previousTreatments: client.previousTreatments ?? "Not added yet.",
      treatmentPlan: client.treatmentPlan ?? "Not added yet.",
    },
    details: {
      preferredChannel: client.preferredChannel ?? "WhatsApp",
      assignedStaff: client.assignedStaffName ?? "Workspace staff",
      tags: client.tags,
    },
    history: buildHistory(client),
    appointments: buildAppointments(client),
    medications: buildMedications(client),
    documents: await buildDocuments(client),
    payments: buildPayments(client),
    messages: buildMessages(client),
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
    gallery: await Promise.all(
      client.galleryItems.map(async (item) => ({
        id: item.id,
        type: item.type === "BEFORE" ? "before" : "after",
        imageUrl: await resolveMediaDisplayUrl(item.imageUrl),
        caption: item.caption ?? "",
        createdAt: format(item.createdAt, "MMM d, yyyy"),
      }))
    ),
  };
}

export async function buildClientsViewFromRecords(
  records: ClientWithRelations[]
): Promise<ClientsViewModel> {
  const clients = await Promise.all(records.map(buildClientRecord));

  return {
    clients,
    initialSelectedClientId: clients[0]?.id ?? "",
  };
}
