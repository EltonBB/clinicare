import { after } from "next/server";

import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { requireCurrentWorkspace } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { buildSettingsStateFromWorkspace } from "@/lib/settings";
import { resolveMediaDisplayUrl } from "@/lib/media-storage-server";
import { syncWhatsAppConnectionForBusiness } from "@/lib/whatsapp-connection";

type SettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function staffTimeEntryCutoff() {
  return new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
}

function completedAppointmentCutoff() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = searchParams ? await searchParams : {};
  const { user, business } = await requireCurrentWorkspace("/settings", {
    missingBusinessRedirect: "/onboarding",
  });

  after(async () => {
    try {
      await syncWhatsAppConnectionForBusiness(business.id);
    } catch {
      console.error("Failed to refresh WhatsApp connection after settings response.");
    }
  });

  const [businessHours, staffMembers, reminderSettings, whatsappConnection] = await Promise.all([
    prisma.businessHours.findMany({
      where: {
        businessId: business.id,
      },
      orderBy: {
        weekday: "asc",
      },
    }),
    prisma.staffMember.findMany({
      where: {
        businessId: business.id,
      },
      include: {
        timeEntries: {
          where: {
            checkedInAt: {
              gte: staffTimeEntryCutoff(),
            },
          },
          orderBy: {
            checkedInAt: "desc",
          },
        },
        appointments: {
          where: {
            status: "COMPLETED",
            startAt: {
              gte: completedAppointmentCutoff(),
            },
          },
          include: {
            client: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            startAt: "desc",
          },
          take: 50,
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
    prisma.reminderSettings.findUnique({
      where: {
        businessId: business.id,
      },
    }),
    prisma.whatsAppConnection.findUnique({
      where: {
        businessId: business.id,
      },
    }),
  ]);

  const logoDisplayUrl = await resolveMediaDisplayUrl(business.logoUrl);
  const initialState = buildSettingsStateFromWorkspace({
    business,
    logoDisplayUrl,
    supportEmail: user.email ?? "",
    ownerName:
      typeof user.user_metadata?.full_name === "string" &&
      user.user_metadata.full_name.trim().length > 0
        ? user.user_metadata.full_name
        : user.email ?? "Workspace Owner",
    businessHours,
    staffMembers,
    reminderSettings,
    whatsappConnection,
  });

  return (
    <SettingsWorkspace
      initialState={initialState}
      flashMessage={
        params.email_updated === "1"
          ? "Your email address was confirmed and updated."
          : params.setup === "whatsapp"
            ? "Finish WhatsApp setup now, or continue and return later from settings."
          : ""
      }
    />
  );
}
