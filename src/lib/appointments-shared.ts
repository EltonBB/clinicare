import { revalidatePath } from "next/cache";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Appointment-mutation side effects shared by the web calendar actions and the
 * mobile staff API. Kept in one place so both paths recompute the same derived
 * state and invalidate the same Router-Cache surfaces (the "revalidate every
 * surface a mutation feeds" rule).
 */

/** Recompute a client's `lastVisitAt` from their remaining confirmed/completed visits. */
export async function refreshClientLastVisitAt(
  clientId: string,
  businessId: string,
  db: Prisma.TransactionClient = prisma
) {
  const latestAppointment = await db.appointment.findFirst({
    where: {
      businessId,
      clientId,
      status: {
        in: ["CONFIRMED", "COMPLETED"],
      },
    },
    select: {
      startAt: true,
    },
    orderBy: {
      startAt: "desc",
    },
  });

  await db.client.updateMany({
    where: {
      id: clientId,
      businessId,
    },
    data: {
      lastVisitAt: latestAppointment?.startAt ?? null,
    },
  });
}

// Invalidate the Router Cache for every surface an appointment mutation touches
// (calendar grid, dashboard schedule/KPIs, the client's directory row + detail
// timeline) so the change shows on navigation without a manual refresh.
export function revalidateCalendarSurfaces(
  clientIds: Array<string | null | undefined> = [],
  staffMemberIds: Array<string | null | undefined> = []
) {
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/clients");
  // Reports' appointment volume + completion-rate KPIs depend on this.
  revalidatePath("/reports");
  // Staff directory derives today's appointment counts; each staff detail page
  // lists that member's appointments.
  revalidatePath("/staff");
  // Dedup so a move that keeps the same client/staff doesn't revalidate twice.
  for (const clientId of new Set(clientIds)) {
    if (clientId) {
      revalidatePath(`/clients/${clientId}`);
    }
  }
  for (const staffMemberId of new Set(staffMemberIds)) {
    if (staffMemberId) {
      revalidatePath(`/staff/${staffMemberId}`);
    }
  }
}
