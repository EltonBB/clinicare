import { prisma } from "@/lib/prisma";

export async function createEmailVerificationReceipt(ticket: string, email: string) {
  await prisma.emailVerificationReceipt.upsert({
    where: {
      ticket,
    },
    update: {
      email,
      verifiedAt: null,
    },
    create: {
      ticket,
      email,
    },
  });
}

export async function markEmailVerificationReceiptVerifiedByEmail(
  email: string | null | undefined
) {
  if (!email) {
    return;
  }

  await prisma.emailVerificationReceipt.updateMany({
    where: {
      email,
    },
    data: {
      verifiedAt: new Date(),
    },
  });
}

export async function getEmailVerificationReceiptStatus(ticket: string | null | undefined) {
  if (!ticket) {
    return { verified: false };
  }

  const receipt = await prisma.emailVerificationReceipt.findUnique({
    where: {
      ticket,
    },
    select: {
      verifiedAt: true,
    },
  });

  return {
    verified: Boolean(receipt?.verifiedAt),
  };
}

export async function getEmailVerificationReceiptEmail(ticket: string | null | undefined) {
  if (!ticket) {
    return null;
  }

  const receipt = await prisma.emailVerificationReceipt.findUnique({
    where: {
      ticket,
    },
    select: {
      email: true,
    },
  });

  return receipt?.email ?? null;
}
