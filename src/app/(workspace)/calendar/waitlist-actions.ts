"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getAuthedBusiness as getAuthedBusinessContext } from "@/lib/business";
import { isProBusinessPlan } from "@/lib/billing";
import { createWaitlistEntry, removeWaitlistEntry } from "@/lib/waitlist-data";
import { parseZonedWallClock } from "@/lib/time-zone";

// Same phrasing convention as NO_SHOW_PLAN_ERROR (lib/appointments-shared.ts):
// "<feature> is part of the Pro plan."
export const WAITLIST_PLAN_ERROR = "Waiting list is part of the Pro plan.";

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

const addWaitlistEntrySchema = z.object({
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
    return { ok: false, error: "Choose a client and enter a valid service before saving." };
  }

  const data = parsed.data;

  // Tenant isolation: createWaitlistEntry (Task 3) doesn't itself verify that
  // clientId/staffMemberId belong to this business — it just writes whatever
  // id it's given. Without this check a caller could reference another
  // business's client/staff row; listWaitingEntries would then join and
  // display that other business's client name inside this workspace. Same
  // ownership checks and message text as saveAppointmentAction.
  const client = await prisma.client.findFirst({
    where: { id: data.clientId, businessId: business.id },
    select: { id: true },
  });

  if (!client) {
    return {
      ok: false,
      error: "The selected client does not belong to this clinic workspace.",
    };
  }

  let staffMemberId: string | null = null;
  if (data.staffMemberId) {
    const staff = await prisma.staffMember.findFirst({
      where: { id: data.staffMemberId, businessId: business.id },
      select: { id: true },
    });

    if (!staff) {
      return {
        ok: false,
        error: "The selected staff member does not belong to this clinic workspace.",
      };
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

export async function removeWaitlistEntryAction(id: string): Promise<WaitlistActionResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return { ok: false, error: context.error };
  }

  const business = context.business;

  if (!isProBusinessPlan(business.plan)) {
    return { ok: false, error: WAITLIST_PLAN_ERROR };
  }

  const result = await removeWaitlistEntry({ id, businessId: business.id });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/calendar");

  return { ok: true };
}
