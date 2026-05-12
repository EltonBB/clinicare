import { redirect } from "next/navigation";
import { after } from "next/server";

import { AppShell } from "@/components/layout/app-shell";
import { completePastConfirmedAppointments } from "@/lib/appointments";
import { planDisplayName, planStatusLabel } from "@/lib/billing";
import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { isOnboardingCompleted } from "@/lib/onboarding";
import { resolveMediaDisplayUrl } from "@/lib/media-storage-server";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, business } = await requireCurrentWorkspace("/dashboard", {
    missingBusinessRedirect: "/onboarding",
  });

  if (!isOnboardingCompleted(user.user_metadata)) {
    redirect("/onboarding");
  }

  after(async () => {
    try {
      await completePastConfirmedAppointments(business.id);
    } catch {
      console.error("Failed to complete past appointments after response.");
    }
  });

  const { businessName, ownerName } = toBusinessIdentity(business, user);
  const ownerPhone =
    typeof user.user_metadata?.owner_phone === "string"
      ? user.user_metadata.owner_phone
      : "";
  const tourCompleted =
    user.user_metadata?.workspace_tour_completed_business_id === business.id &&
    typeof user.user_metadata?.workspace_tour_completed_at === "string" &&
    user.user_metadata.workspace_tour_completed_at.length > 0;
  const logoDisplayUrl = await resolveMediaDisplayUrl(business.logoUrl);

  return (
    <AppShell
      businessName={businessName}
      ownerName={ownerName}
      ownerEmail={user.email ?? ""}
      ownerPhone={ownerPhone}
      planName={planDisplayName(business.plan)}
      planStatus={planStatusLabel(business.planStatus)}
      brandAccentColor={business.brandAccentColor}
      logoUrl={logoDisplayUrl}
      tourScopeId={business.id}
      tourCompleted={tourCompleted}
      unreadCount={0}
      notifications={[]}
    >
      {children}
    </AppShell>
  );
}
