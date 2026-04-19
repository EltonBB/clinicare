import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { requireCurrentWorkspace } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import { buildSettingsStateFromWorkspace } from "@/lib/settings";
import { syncWhatsAppConnectionForBusiness } from "@/lib/whatsapp-connection";

type SettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = searchParams ? await searchParams : {};
  const { user, business } = await requireCurrentWorkspace("/settings", {
    missingBusinessRedirect: "/onboarding",
  });

  await syncWhatsAppConnectionForBusiness(business.id);

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

  const initialState = buildSettingsStateFromWorkspace({
    business,
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
