import { redirect } from "next/navigation";
import { after } from "next/server";

import { AppShell } from "@/components/layout/app-shell";
import { completePastConfirmedAppointments } from "@/lib/appointments";
import { planDisplayName, planStatusLabel } from "@/lib/billing";
import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { isOnboardingCompleted } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
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
  const [logoDisplayUrl, notificationRows] = await Promise.all([
    resolveMediaDisplayUrl(business.logoUrl),
    prisma.conversation.findMany({
      where: {
        businessId: business.id,
        unreadCount: {
          gt: 0,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 3,
      select: {
        id: true,
        contactName: true,
        unreadCount: true,
      },
    }),
  ]);
  const unreadCount = notificationRows.reduce(
    (total, row) => total + row.unreadCount,
    0
  );
  const notifications = notificationRows.map((row) => ({
    id: row.id,
    title: row.contactName,
    detail: `${row.unreadCount} unread message${
      row.unreadCount === 1 ? "" : "s"
    } waiting in the inbox.`,
  }));

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
      unreadCount={unreadCount}
      notifications={notifications}
    >
      {children}
    </AppShell>
  );
}
