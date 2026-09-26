import { timeToMinutes } from "@/lib/calendar";

export type WaitlistCandidate = {
  id: string;
  clientId: string;
  service: string;
  staffMemberId: string | null;
  earliestDate: Date | null;
  /** Monday=0..Sunday=6, matching BusinessHours.weekday. Empty = no day preference. */
  preferredDays: number[];
  preferredFrom: string | null;
  preferredTo: string | null;
  createdAt: Date;
};

export type FreedSlot = {
  service: string;
  staffMemberId: string | null;
  startAt: Date;
  /** Monday=0..Sunday=6 — caller must derive this with the same (jsWeekday + 6) % 7 conversion used elsewhere in this codebase, in the clinic's time zone. */
  weekday: number;
  /** Minutes since midnight, clinic-local. */
  timeMinutes: number;
};

function normalizeService(value: string) {
  return value.trim().toLowerCase();
}

function matches(candidate: WaitlistCandidate, slot: FreedSlot): boolean {
  if (normalizeService(candidate.service) !== normalizeService(slot.service)) {
    return false;
  }
  if (candidate.staffMemberId && candidate.staffMemberId !== slot.staffMemberId) {
    return false;
  }
  if (candidate.earliestDate && slot.startAt.getTime() < candidate.earliestDate.getTime()) {
    return false;
  }
  if (candidate.preferredDays.length > 0 && !candidate.preferredDays.includes(slot.weekday)) {
    return false;
  }
  if (candidate.preferredFrom && slot.timeMinutes < timeToMinutes(candidate.preferredFrom)) {
    return false;
  }
  if (candidate.preferredTo && slot.timeMinutes > timeToMinutes(candidate.preferredTo)) {
    return false;
  }
  return true;
}

/**
 * The single best waiting-list match for a freed slot: same service, the
 * named provider if the entry has one, inside any day/time preference, then
 * whoever has waited longest. Returns null when nobody matches — never
 * guesses or relaxes a constraint to force a match.
 */
export function findBestWaitlistMatch(
  candidates: WaitlistCandidate[],
  freedSlot: FreedSlot
): WaitlistCandidate | null {
  const eligible = candidates.filter((candidate) => matches(candidate, freedSlot));

  if (eligible.length === 0) {
    return null;
  }

  return eligible.reduce((longestWaiting, candidate) =>
    candidate.createdAt.getTime() < longestWaiting.createdAt.getTime() ? candidate : longestWaiting
  );
}
