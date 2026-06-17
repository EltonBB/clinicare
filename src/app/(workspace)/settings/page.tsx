import { after } from "next/server";

import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { loadSettingsState } from "@/lib/settings-server";
import { syncWhatsAppConnectionForBusiness } from "@/lib/whatsapp-connection";

type SettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

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

  const initialState = await loadSettingsState(user, business);
  const { ownerName } = toBusinessIdentity(business, user);
  const ownerPhone =
    typeof user.user_metadata?.owner_phone === "string"
      ? user.user_metadata.owner_phone
      : "";

  return (
    <SettingsWorkspace
      initialState={initialState}
      ownerName={ownerName}
      ownerEmail={user.email ?? ""}
      ownerPhone={ownerPhone}
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
