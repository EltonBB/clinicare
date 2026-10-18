import type { AppointmentStatus } from "@prisma/client";

import { buildReportsViewFromWorkspace, type ReportsViewModel } from "@/lib/reports";
import { getAppTimeZone, getZonedDateParts, getZonedDayWindowByOffset } from "@/lib/time-zone";

/**
 * A complete Reports view built from a made-up clinic, for the Basic plan's
 * upgrade screen: it runs the real Reports builder over sample appointments so
 * the preview is exactly what Pro shows, never a mock-up. The page labels it
 * "Sample data". Deterministic (a seeded generator, not Math.random), so the
 * same day always renders the same preview. Nothing here touches a database.
 */

const SAMPLE_STAFF = [
  { id: "sample-staff-1", name: "Dr. Arta Krasniqi", role: "Dentist" },
  { id: "sample-staff-2", name: "Dr. Blerim Hoxha", role: "Orthodontist" },
  { id: "sample-staff-3", name: "Era Gashi", role: "Hygienist" },
  { id: "sample-staff-4", name: "Liridon Berisha", role: "Assistant" },
] as const;

// weekday: 0 = Monday, as stored in BusinessHours. Weekdays 9 to 17,
// Saturday 9 to 13, Sunday closed.
const SAMPLE_HOURS = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  isOpen: weekday < 6,
  startTime: "09:00",
  endTime: weekday === 5 ? "13:00" : "17:00",
}));

// The monthly chart shows 8 weeks against the 8 before them, so the history
// covers 16 weeks plus a margin (shorter history drops the ghost line to 0).
const HISTORY_DAYS = 126;
const FUTURE_DAYS = 10;
const MINUTE = 60_000;

/** A small seeded generator (mulberry32), so the sample is stable. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSampleReportsView(now = new Date(), timeZone = getAppTimeZone()): ReportsViewModel {
  const random = seeded(20261014);
  const appointments: Array<{
    status: AppointmentStatus;
    startAt: Date;
    endAt: Date;
    createdAt: Date;
    clientId: string;
    staffMemberId: string;
  }> = [];
  const clients: Array<{ createdAt: Date; isArchived: boolean }> = [];
  let clientCount = 0;

  for (let offset = -HISTORY_DAYS; offset <= FUTURE_DAYS; offset++) {
    const day = getZonedDayWindowByOffset(now, offset, timeZone);
    const parts = getZonedDateParts(day.start, timeZone);
    const weekday = (new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay() + 6) % 7;
    const hours = SAMPLE_HOURS[weekday];
    if (!hours.isOpen) continue;

    const openMinutes = (Number(hours.endTime.slice(0, 2)) - Number(hours.startTime.slice(0, 2))) * 60;
    const opensAt = day.start.getTime() + Number(hours.startTime.slice(0, 2)) * 60 * MINUTE;
    // A busier week mid-history, so the trend has a shape rather than a flat line.
    const busy = offset > -70 && offset < -48 ? 2 : 0;
    // About 2.5 visits an open hour across four people: a steady, believable day.
    const visits = Math.round((openMinutes / 60) * (2.2 + random() * 0.6)) + busy;

    for (let index = 0; index < visits; index++) {
      const staff = SAMPLE_STAFF[Math.floor(random() * SAMPLE_STAFF.length)];
      const startAt = new Date(opensAt + Math.floor(random() * (openMinutes / 30 - 1)) * 30 * MINUTE);
      const length = random() < 0.6 ? 30 : 60;
      const endAt = new Date(startAt.getTime() + length * MINUTE);
      const roll = random();
      const past = endAt.getTime() < now.getTime();
      const status: AppointmentStatus = past
        ? roll < 0.06
          ? "CANCELLED"
          : roll < 0.1
            ? "NO_SHOW"
            : "COMPLETED"
        : roll < 0.75
          ? "CONFIRMED"
          : "PENDING";

      // Roughly a third of visits are a new client's first booking.
      const isNewClient = random() < 0.32 || clientCount === 0;
      if (isNewClient) {
        clientCount += 1;
        clients.push({ createdAt: new Date(startAt.getTime() - (1 + Math.floor(random() * 6)) * 24 * 60 * MINUTE), isArchived: false });
      }
      // Returning patients come from the recent ones, so some return within a period.
      const returning = clientCount - Math.floor(random() * Math.min(clientCount, 30));
      const clientId = `sample-client-${isNewClient ? clientCount : returning}`;
      const leadDays = random() < 0.15 ? 0 : 1 + Math.floor(random() * 12);
      appointments.push({
        status,
        startAt,
        endAt,
        createdAt: new Date(startAt.getTime() - leadDays * 24 * 60 * MINUTE),
        clientId,
        staffMemberId: staff.id,
      });
    }
  }

  return buildReportsViewFromWorkspace({
    business: { name: "Sample clinic" },
    appointments,
    clients,
    clientMix: {
      active: Math.round(clientCount * 0.78),
      atRisk: Math.round(clientCount * 0.12),
      inactive: Math.round(clientCount * 0.08),
      archived: Math.round(clientCount * 0.02),
    },
    messages: [],
    businessHours: SAMPLE_HOURS,
    scheduleBlocks: [],
    staffMembers: SAMPLE_STAFF.map((member) => ({ ...member, status: "ACTIVE" as const, isActive: true })),
    conversations: [],
    aiSnapshots: [],
    now,
    timeZone,
  });
}

// The sample only moves with the clock hour (visits before "now" are done,
// later ones are booked), so one build per hour serves every Basic request.
let cached: { key: string; view: ReportsViewModel } | null = null;

/** The sample view for the current hour, built once and reused. */
export function getSampleReportsView(now = new Date(), timeZone = getAppTimeZone()): ReportsViewModel {
  const parts = getZonedDateParts(now, timeZone);
  const key = `${timeZone}:${parts.year}-${parts.month}-${parts.day}T${parts.hour}`;
  if (cached?.key !== key) cached = { key, view: buildSampleReportsView(now, timeZone) };
  return cached.view;
}
