"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getAuthedBusiness as getAuthedBusinessContext } from "@/lib/business";
import { isProBusinessPlan } from "@/lib/billing";
import { logger } from "@/lib/logger";
import { ELIGIBLE_CLIENT_WHERE } from "@/lib/client-eligibility";
import { parseRecordId } from "@/lib/record-id";
import { removeWaitlistEntry } from "@/lib/slot-offers";
import { AVAILABLE_STAFF_WHERE } from "@/lib/staff-eligibility";
import { createWaitlistEntry } from "@/lib/waitlist-data";
import {
  isInvalidPreferredWindow,
  WAITLIST_CLIENT_ERROR,
  WAITLIST_ENTRY_REMOVED_ERROR,
  WAITLIST_PLAN_ERROR,
  WAITLIST_STAFF_ERROR,
  WAITLIST_TIME_RANGE_ERROR,
} from "@/lib/waitlist";
import { parseZonedWallClock } from "@/lib/time-zone";

export type AddWaitlistEntryPayload = {
  clientId: string;
  service: string;
  staffMemberId?: string;
  earliestDate?: string;
  preferredDays?: number[];
  preferredFrom?: string;
  preferredTo?: string;
  notes?: string;
};

export type WaitlistActionResult = {
  ok: boolean;
  error?: string;
};

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const REMOVE_FAILED_ERROR = "Couldn't remove this entry. Try again.";

const addWaitlistEntrySchema = z
  .object({
    clientId: z.string().min(1),
    service: z.string().trim().min(1).max(200),
    staffMemberId: z.string().min(1).optional(),
    earliestDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    preferredDays: z.array(z.number().int().min(0).max(6)).optional(),
    preferredFrom: z.string().regex(timePattern).optional(),
    preferredTo: z.string().regex(timePattern).optional(),
    notes: z.string().max(2000).optional(),
  })
  // A window that ends before it starts can never match a slot.
  .refine((data) => !isInvalidPreferredWindow(data.preferredFrom, data.preferredTo), {
    message: WAITLIST_TIME_RANGE_ERROR,
    path: ["preferredTo"],
  });

function getAuthedBusiness() {
  return getAuthedBusinessContext(
    "Your session expired. Log in again to manage the waiting list."
  );
}

export async function addWaitlistEntryAction(
  payload: AddWaitlistEntryPayload
): Promise<WaitlistActionResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const business = context.business;

  if (!isProBusinessPlan(business.plan)) {
    return { ok: false, error: WAITLIST_PLAN_ERROR };
  }

  const parsed = addWaitlistEntrySchema.safeParse(payload);

  if (!parsed.success) {
    const invalidWindow = parsed.error.issues.some((issue) => issue.message === WAITLIST_TIME_RANGE_ERROR);
    return {
      ok: false,
      error: invalidWindow
        ? WAITLIST_TIME_RANGE_ERROR
        : "Choose a client and enter a valid service before saving.",
    };
  }

  const data = parsed.data;

  // Tenant isolation: createWaitlistEntry (Task 3) doesn't itself verify that
  // clientId/staffMemberId belong to this business — it just writes whatever
  // id it's given. Without this check a caller could reference another
  // business's client/staff row; listWaitingEntries would then join and
  // display that other business's client name inside this workspace. The same
  // check also refuses an archived or inactive client (the client typeahead
  // still returns inactive ones): the matcher never offers them a slot, so the
  // entry would sit on the list and count against its cap without ever being
  // matched (Codex #130).
  const client = await prisma.client.findFirst({
    where: { id: data.clientId, businessId: business.id, ...ELIGIBLE_CLIENT_WHERE },
    select: { id: true },
  });

  if (!client) {
    return { ok: false, error: WAITLIST_CLIENT_ERROR };
  }

  let staffMemberId: string | null = null;
  if (data.staffMemberId) {
    // Same staff-liveness rule liveSlotOfferWhere applies to an offer: an
    // entry pinned to an inactive/deactivated staff member would sit on the
    // list and count against the cap, but any slot offered for them is
    // rejected as stale the moment it's drafted (Codex #130) — so it can
    // never actually be matched.
    const staff = await prisma.staffMember.findFirst({
      where: { id: data.staffMemberId, businessId: business.id, ...AVAILABLE_STAFF_WHERE },
      select: { id: true },
    });

    if (!staff) {
      return { ok: false, error: WAITLIST_STAFF_ERROR };
    }

    staffMemberId = staff.id;
  }

  let earliestDate: Date | null = null;
  if (data.earliestDate) {
    earliestDate = parseZonedWallClock(data.earliestDate, "00:00");

    if (!earliestDate) {
      return { ok: false, error: "Choose a valid earliest date." };
    }
  }

  const result = await createWaitlistEntry({
    businessId: business.id,
    clientId: data.clientId,
    service: data.service,
    staffMemberId,
    earliestDate,
    preferredDays: data.preferredDays ?? [],
    preferredFrom: data.preferredFrom ?? null,
    preferredTo: data.preferredTo ?? null,
    notes: data.notes?.trim() || null,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/calendar");

  return { ok: true };
}

export async function removeWaitlistEntryAction(rawId: string): Promise<WaitlistActionResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const business = context.business;

  if (!isProBusinessPlan(business.plan)) {
    return { ok: false, error: WAITLIST_PLAN_ERROR };
  }

  // A non-string id would remove the whole waiting list.
  const id = parseRecordId(rawId);

  if (!id) {
    return { ok: false, error: WAITLIST_ENTRY_REMOVED_ERROR };
  }

  let result;
  try {
    result = await removeWaitlistEntry({ id, businessId: business.id });
  } catch (error) {
    // Already retried once on a write conflict (see retryOnWriteConflict) —
    // a plain retry message, never the raw error, and never the error page.
    logger.error("Couldn't remove a waiting-list entry.", error, { businessId: business.id, waitlistEntryId: id });
    return { ok: false, error: REMOVE_FAILED_ERROR };
  }

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/calendar");
  // Removing an entry that holds an offer retires that offer (and may draft
  // one for the next match) — the Follow-ups list and the Inbox's count.
  revalidatePath("/inbox");
  revalidatePath("/inbox/follow-ups");

  return { ok: true };
}
