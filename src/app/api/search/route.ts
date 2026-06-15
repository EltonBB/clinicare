import { NextResponse } from "next/server";

import { getCurrentBusiness } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const RESULT_LIMIT = 5;

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ results: [] }, { status: 401 });
  }

  const business = await getCurrentBusiness(user.id);

  if (!business) {
    return NextResponse.json({ results: [] });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim().slice(0, 80) ?? "";

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // Each search fans out into several `contains` scans; cap per-user frequency
  // so a tight client loop can't amplify into a DB-load denial of service.
  const rate = checkRateLimit(`search:${user.id}`, { limit: 30, windowMs: 10_000 });

  if (!rate.allowed) {
    return NextResponse.json(
      { results: [], error: "Too many searches. Please slow down for a moment." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const [clients, appointments, staff, conversations] = await Promise.all([
    prisma.client.findMany({
      where: {
        businessId: business.id,
        isArchived: false,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
      orderBy: { updatedAt: "desc" },
      take: RESULT_LIMIT,
    }),
    prisma.appointment.findMany({
      where: {
        businessId: business.id,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { notes: { contains: query, mode: "insensitive" } },
          { client: { name: { contains: query, mode: "insensitive" } } },
          { client: { phone: { contains: query, mode: "insensitive" } } },
          { staffMember: { name: { contains: query, mode: "insensitive" } } },
        ],
      },
      select: {
        id: true,
        title: true,
        startAt: true,
        status: true,
        client: { select: { name: true } },
      },
      orderBy: { startAt: "desc" },
      take: RESULT_LIMIT,
    }),
    prisma.staffMember.findMany({
      where: {
        businessId: business.id,
        isActive: true,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { role: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        role: true,
      },
      orderBy: { updatedAt: "desc" },
      take: RESULT_LIMIT,
    }),
    prisma.conversation.findMany({
      where: {
        businessId: business.id,
        OR: [
          { contactName: { contains: query, mode: "insensitive" } },
          { phoneNumber: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        contactName: true,
        phoneNumber: true,
        unreadCount: true,
      },
      orderBy: { updatedAt: "desc" },
      take: RESULT_LIMIT,
    }),
  ]);

  const results = [
    ...clients.map((client) => ({
      id: `client-${client.id}`,
      type: "Client",
      title: client.name,
      detail: client.phone || client.email || "Client record",
      href: `/clients/${client.id}`,
    })),
    ...appointments.map((appointment) => ({
      id: `appointment-${appointment.id}`,
      type: "Appointment",
      title: appointment.title,
      detail: `${appointment.client.name} - ${formatDate(appointment.startAt)} - ${appointment.status.toLowerCase()}`,
      href: `/calendar/${appointment.id}/edit`,
    })),
    ...staff.map((member) => ({
      id: `staff-${member.id}`,
      type: "Staff",
      title: member.name,
      detail: member.role,
      href: `/staff/${member.id}`,
    })),
    ...conversations.map((conversation) => ({
      id: `conversation-${conversation.id}`,
      type: "Message",
      title: conversation.contactName,
      detail: `${conversation.phoneNumber}${conversation.unreadCount > 0 ? ` - ${conversation.unreadCount} unread` : ""}`,
      href: `/inbox?conversation=${conversation.id}`,
    })),
  ].slice(0, 12);

  return NextResponse.json({ results });
}
