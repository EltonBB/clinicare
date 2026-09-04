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

  // updateMany doesn't report which rows it touched, and each affected
  // client's lastVisitAt needs refreshing now that a booking which was
  // future-dated when created (so refreshClientLastVisitAt found nothing to
  // set at the time) has actually happened — otherwise a client whose only
  // appointment is auto-completed here shows "no visits" indefinitely, since
  // nothing else ever revisits this appointment to refresh it.
  const dueClients = await prisma.appointment.findMany({
    where: dueWhere,
    select: { clientId: true },
    distinct: ["clientId"],
  });

  if (dueClients.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.updateMany({
      where: dueWhere,
      data: {
        status: "COMPLETED",
      },
    });

    for (const { clientId } of dueClients) {
      await refreshClientLastVisitAt(clientId, businessId, tx);
    }
  });
}
