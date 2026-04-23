import { prisma } from "@/lib/prisma";

export async function completePastConfirmedAppointments(businessId: string) {
  await prisma.appointment.updateMany({
    where: {
      businessId,
      status: "CONFIRMED",
      endAt: {
        lte: new Date(),
      },
    },
    data: {
      status: "COMPLETED",
    },
  });
}
