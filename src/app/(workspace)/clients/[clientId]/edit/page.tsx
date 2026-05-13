import { notFound } from "next/navigation";

import { EditClientForm } from "@/components/clients/edit-client-form";
import { CreatePageShell } from "@/components/workspace/create-page-shell";
import { requireCurrentWorkspace } from "@/lib/business";
import { buildClientRecord } from "@/lib/clients";
import { prisma } from "@/lib/prisma";

export default async function EditClientPage({
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
          fileUrl: true,
          category: true,
          mimeType: true,
          fileSize: true,
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
          receiptUrl: true,
          paidAt: true,
          invoiceNumber: true,
          receiptNumber: true,
          paymentMethod: true,
          billingNote: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 60,
      },
      healthItems: {
        orderBy: {
          createdAt: "desc",
        },
      },
      careNotes: {
        include: {
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
        orderBy: [
          {
            status: "asc",
          },
          {
            dueAt: "asc",
          },
        ],
        take: 50,
      },
      followUpReminders: {
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

  const record = await buildClientRecord(client);

  return (
    <CreatePageShell
      eyebrow="Patient record"
      title={`Edit ${record.name}`}
      description="Update patient demographics, clinic information, and medical profile fields from a full-page form."
      backHref={`/clients/${record.id}`}
      backLabel="patient details"
    >
      <EditClientForm client={record} />
    </CreatePageShell>
  );
}
