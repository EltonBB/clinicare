import { prisma } from "@/lib/prisma";
import { refreshClientLastVisitAt } from "@/lib/appointments-shared";

// The sweep is throttled to once per 5 minutes per business (see
// (workspace)/layout.tsx) and only runs when someone navigates the
// workspace — so a quiet clinic (a multi-day closure, a lull in staff
// logins) can accumulate a real backlog of newly-due appointments before the
// next run, not just "however many ended in the last few minutes." Each
// batch's completion update and its clients' refresh stay one atomic unit —
// a crash between them is exactly the bug this fix closes — but capping the
// batch size keeps every individual transaction well clear of Prisma's
// default 5s interactive-transaction timeout regardless of backlog size.
const DUE_CLIENT_BATCH_SIZE = 25;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

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

  const dueClientIds = new Set(dueClients.map((client) => client.clientId));

  for (const batch of chunk([...dueClientIds], DUE_CLIENT_BATCH_SIZE)) {
    await prisma.$transaction(async (tx) => {
      await tx.appointment.updateMany({
        where: { ...dueWhere, clientId: { in: batch } },
        data: {
          status: "COMPLETED",
        },
      });

      for (const clientId of batch) {
        await refreshClientLastVisitAt(clientId, businessId, tx);
      }
    });
  }

  // The historical backlog can be arbitrarily large (everyone this bug ever
  // affected, all at once, the first time this runs) and each client here
  // has no pending status change to stay atomic with — only the refresh
  // itself. Run these outside any transaction so an oversized backlog can't
  // time out and roll back the (already-committed, unrelated) completions
  // above, and so a mid-loop failure only leaves the remaining clients
  // exactly as stale as they already were, self-resuming on the next sweep.
  for (const { id: clientId } of staleClients) {
    if (dueClientIds.has(clientId)) {
      continue;
    }
    await refreshClientLastVisitAt(clientId, businessId);
  }
}
