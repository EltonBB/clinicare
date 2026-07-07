import { redirect } from "next/navigation";
import { after } from "next/server";

import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceToaster } from "@/components/layout/workspace-toaster";
import { completePastConfirmedAppointments } from "@/lib/appointments";
import { planDisplayName, planStatusLabel } from "@/lib/billing";
import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { getCached } from "@/lib/cache";
import { isOnboardingCompleted } from "@/lib/onboarding";
import { resolveMediaDisplayUrl } from "@/lib/media-storage-server";
import { autoCloseStaleTimeEntries } from "@/lib/staff-clock";

// Both sweeps are idempotent no-ops once nothing is stale, but they still cost
// a handful of queries/writes — and every concurrent operator of the SAME
// business re-triggers them on every navigation. This flag (non-PHI: just a
// per-business "did we sweep recently" timestamp) throttles the actual sweep
// to once per window; every other navigation in between reads the cached hit
// and skips the work entirely.
const SWEEP_THROTTLE_SECONDS = 300;

// The signed logo URL is valid for a full hour (media-storage-server.ts) but
// was re-signed with a fresh Supabase Storage round-trip on every single
// workspace navigation. Cache it just under that TTL — non-PHI (a logo isn't
// patient data) — keyed by the raw logoUrl value, so a new upload changes the
// key and misses automatically; no manual invalidation needed.
const LOGO_URL_CACHE_SECONDS = 50 * 60;

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
    await getCached(`workspace-sweep:${business.id}`, SWEEP_THROTTLE_SECONDS, async () => {
      try {
        await completePastConfirmedAppointments(business.id);
      } catch {
        console.error("Failed to complete past appointments after response.");
      }
      try {
        // Close forgotten open check-ins for this workspace so weekly hours stay
        // accurate without waiting for the daily cron.
        await autoCloseStaleTimeEntries(business.id);
      } catch {
        console.error("Failed to auto-close stale time entries after response.");
      }
      return true;
    });
  });

  const { businessName, ownerName } = toBusinessIdentity(business, user);
  const ownerPhone =
    typeof user.user_metadata?.owner_phone === "string"
      ? user.user_metadata.owner_phone
      : "";
  const logoDisplayUrl = await getCached(
    `logo-url:${business.id}:${business.logoUrl ?? "none"}`,
    LOGO_URL_CACHE_SECONDS,
    () => resolveMediaDisplayUrl(business.logoUrl)
  );

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
      unreadCount={0}
      inboxUnreadCount={0}
      notifications={[]}
      hasInboxUnread={false}
      hasStaffUnread={false}
    >
      {children}
      <WorkspaceToaster />
    </AppShell>
  );
}
