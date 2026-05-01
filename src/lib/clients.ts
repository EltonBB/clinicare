import type { Appointment, Client, ClientGalleryItem, Message } from "@prisma/client";
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

export type ClientRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  lastVisit: string;
  totalVisits: number;
  status: ClientStatus;
  notes: string;
  details: {
    preferredChannel: string;
    assignedStaff: string;
    tags: string[];
  };
  history: ClientHistoryEntry[];
  messages: ClientMessageEntry[];
  appointmentStats: {
    completed: number;
    cancelled: number;
    pending: number;
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
  status: ClientStatus;
  notes: string;
  preferredChannel: string;
  assignedStaff: string;
  tags: string;
};

type ClientWithRelations = Client & {
  appointments: Pick<Appointment, "id" | "title" | "startAt" | "status">[];
  messages: Pick<Message, "id" | "body" | "direction" | "sentAt">[];
  galleryItems: Pick<ClientGalleryItem, "id" | "type" | "imageUrl" | "caption" | "createdAt">[];
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

export async function buildClientRecord(client: ClientWithRelations): Promise<ClientRecord> {
  const completed = client.appointments.filter(
    (appointment) => appointment.status === "COMPLETED"
  ).length;
  const cancelled = client.appointments.filter(
    (appointment) => appointment.status === "CANCELLED"
  ).length;
  const pending = client.appointments.filter(
    (appointment) => appointment.status === "PENDING"
  ).length;

  return {
    id: client.id,
    name: client.name,
    email: client.email ?? "",
    phone: client.phone,
    lastVisit: formatLastVisit(client),
    totalVisits: client._count?.appointments ?? client.appointments.length,
    status: formatStatus(client.status, client.isArchived),
    notes: client.notes ?? "No notes yet.",
    details: {
      preferredChannel: client.preferredChannel ?? "WhatsApp",
      assignedStaff: client.assignedStaffName ?? "Workspace staff",
      tags: client.tags,
    },
    history: buildHistory(client),
    messages: buildMessages(client),
    appointmentStats: {
      completed,
      cancelled,
      pending,
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
