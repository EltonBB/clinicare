import { notFound } from "next/navigation";

import { ClientDetailsPage } from "@/components/clients/client-details-page";
import { requireCurrentWorkspace } from "@/lib/business";
import { buildClientRecord } from "@/lib/clients";
import { prisma } from "@/lib/prisma";

export default async function ClientDetailsRoute({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { business } = await requireCurrentWorkspace("/clients", {
    missingBusinessRedirect: "/onboarding",
  });
  const { clientId } = await params;

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      businessId: business.id,
    },
    include: {
      appointments: {
        select: {
          id: true,
          title: true,
          startAt: true,
          status: true,
          notes: true,
        },
        orderBy: {
          startAt: "desc",
        },
        take: 50,
      },
      messages: {
        select: {
          id: true,
          body: true,
          direction: true,
          sentAt: true,
        },
        orderBy: {
          sentAt: "desc",
        },
        take: 50,
      },
      galleryItems: {
        select: {
          id: true,
          type: true,
          imageUrl: true,
          caption: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 60,
      },
      medications: {
        select: {
          id: true,
          name: true,
          dosage: true,
          frequency: true,
          notes: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 50,
      },
      documents: {
        select: {
          id: true,
          fileName: true,
          fileType: true,
          category: true,
          mimeType: true,
          fileSize: true,
          fileUrl: true,
          storageUrl: true,
          uploadedBy: true,
          notes: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 60,
      },
      payments: {
        select: {
          id: true,
          appointmentId: true,
          amountCents: true,
          status: true,
          description: true,
          invoiceNumber: true,
          receiptNumber: true,
          paymentMethod: true,
          billingNote: true,
          receiptUrl: true,
          paidAt: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 60,
      },
      healthItems: {
        select: {
          id: true,
          type: true,
          label: true,
          value: true,
          severity: true,
          notes: true,
          recordedAt: true,
        },
        orderBy: {
          recordedAt: "desc",
        },
        take: 80,
      },
      careNotes: {
        select: {
          id: true,
          title: true,
          body: true,
          notedAt: true,
          staffMember: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          notedAt: "desc",
        },
        take: 50,
      },
      treatmentPlanItems: {
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          dueAt: true,
        },
        orderBy: [
          {
            dueAt: "asc",
          },
          {
            createdAt: "desc",
          },
        ],
        take: 50,
      },
      followUpReminders: {
        select: {
          id: true,
          title: true,
          channel: true,
          status: true,
          remindAt: true,
          notes: true,
        },
        orderBy: {
          remindAt: "asc",
        },
        take: 50,
      },
      _count: {
        select: {
          appointments: true,
        },
      },
    },
  });

  if (!client) {
    notFound();
  }

  return <ClientDetailsPage initialClient={await buildClientRecord(client)} />;
}
