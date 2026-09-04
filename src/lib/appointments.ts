import { prisma } from "@/lib/prisma";
import { refreshClientLastVisitAt } from "@/lib/appointments-shared";

export async function completePastConfirmedAppointments(businessId: string) {
  const dueWhere = {
    businessId,
    status: "CONFIRMED" as const,
    endAt: {
      lte: new Date(),
    },
  };

  const [dueClients, staleClients] = await Promise.all([
    // updateMany doesn't report which rows it touched, and each affected
    // client's lastVisitAt needs refreshing now that a booking which was
    // future-dated when created (so refreshClientLastVisitAt found nothing
    // to set at the time) has actually happened — otherwise a client whose
    // only appointment is auto-completed here shows "no visits"
    // indefinitely, since nothing else ever revisits this appointment.
    prisma.appointment.findMany({
      where: dueWhere,
      select: { clientId: true },
      distinct: ["clientId"],
    }),
    // Self-heals clients who already hit the bug above before this refresh
    // existed: their appointment is already COMPLETED, but lastVisitAt was
    // never backfilled, so they'd otherwise stay stuck showing "No visits"
    // forever with no future mutation left to trigger a refresh.
    prisma.client.findMany({
      where: {
        businessId,
        lastVisitAt: null,
        appointments: {
          some: {
            status: "COMPLETED",
            startAt: { lte: new Date() },
          },
        },
      },
      select: { id: true },
    }),
  ]);

  const clientIdsToRefresh = Array.from(
    new Set([
      ...dueClients.map((client) => client.clientId),
      ...staleClients.map((client) => client.id),
    ])
  );

  if (clientIdsToRefresh.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (dueClients.length > 0) {
      await tx.appointment.updateMany({
        where: dueWhere,
        data: {
          status: "COMPLETED",
        },
      });
    }

    for (const clientId of clientIdsToRefresh) {
      await refreshClientLastVisitAt(clientId, businessId, tx);
    }
  });
}
