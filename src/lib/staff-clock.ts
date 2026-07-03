import { prisma } from "@/lib/prisma";
import { CHECK_IN_EARLY_GRACE_MS } from "@/lib/staff";

/**
 * Auto-close forgotten open check-ins.
 *
 * A staff member who checks in and never checks out would otherwise inflate
 * their weekly hours forever — `calculateWeeklyHours` counts an open time entry
 * up to "now". Each stale entry is closed at its natural boundary: the end of
 * the shift it was opened for, or a 12-hour cap when there's no covering shift.
 *
 * Runs in the daily reminders cron (global sweep) and opportunistically per
 * business on workspace render (mirrors `completePastConfirmedAppointments`).
 * Best-effort and idempotent — only entries already past their boundary close,
 * and a legitimately-open current session is left untouched.
 */
const MAX_OPEN_NO_SHIFT_MS = 12 * 60 * 60 * 1000;

export async function autoCloseStaleTimeEntries(
  businessId?: string,
  now: Date = new Date()
): Promise<{ closed: number }> {
  const open = await prisma.staffTimeEntry.findMany({
    where: {
      checkedOutAt: null,
      ...(businessId ? { businessId } : {}),
    },
    select: { id: true, businessId: true, staffMemberId: true, checkedInAt: true },
    // Bounded: at any moment only currently-checked-in or forgotten entries are
    // open, a small set; the cap is a runaway guard, not an expected volume.
    take: 1000,
  });

  let closed = 0;
  for (const entry of open) {
    // The shift the check-in belongs to (its 30-min early grace through its end).
    const shift = await prisma.staffShift.findFirst({
      where: {
        businessId: entry.businessId,
        staffMemberId: entry.staffMemberId,
        startsAt: { lte: new Date(entry.checkedInAt.getTime() + CHECK_IN_EARLY_GRACE_MS) },
        endsAt: { gte: entry.checkedInAt },
      },
      orderBy: { endsAt: "asc" },
      select: { endsAt: true },
    });

    const boundary = shift
      ? shift.endsAt
      : new Date(entry.checkedInAt.getTime() + MAX_OPEN_NO_SHIFT_MS);

    if (now.getTime() <= boundary.getTime()) {
      continue; // still within the shift / cap — a legitimately open session
    }

    // Never record a checkout before the check-in (clamp defensively).
    const closeAt = boundary > entry.checkedInAt ? boundary : entry.checkedInAt;
    await prisma.staffTimeEntry.update({
      where: { id: entry.id },
      data: { checkedOutAt: closeAt },
    });
    closed += 1;
  }

  return { closed };
}
