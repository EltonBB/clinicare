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

/**
 * The one definition of "the same service": ignoring case and any stray
 * whitespace on either side. The candidate query can't express that in SQL, so
 * it fetches the waiting entries and filters with this.
 */
export function isSameService(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function matches(candidate: WaitlistCandidate, slot: FreedSlot): boolean {
  if (!isSameService(candidate.service, slot.service)) {
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
 * Every waiting-list entry that fits a freed slot, best first: same service,
 * the named provider if the entry has one, inside any day/time preference,
 * ordered by who has waited longest. Empty when nobody matches — never
 * guesses or relaxes a constraint to force a match. Returns the full ranked
 * list (not just the winner) so the caller can fall through to the next
 * entry when a concurrent offer claims the first one.
 */
export function rankWaitlistMatches<T extends WaitlistCandidate>(candidates: T[], freedSlot: FreedSlot): T[] {
  return candidates
    .filter((candidate) => matches(candidate, freedSlot))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
