import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { planDisplayName } from "@/lib/billing";
import { requireCurrentWorkspace, toBusinessIdentity } from "@/lib/business";
import { isOnboardingCompleted } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";

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

  const { businessName, ownerName } = toBusinessIdentity(business, user);
  const ownerPhone =
    typeof user.user_metadata?.owner_phone === "string"
      ? user.user_metadata.owner_phone
      : "";
  const tourCompleted =
    user.user_metadata?.workspace_tour_completed_business_id === business.id &&
    typeof user.user_metadata?.workspace_tour_completed_at === "string" &&
    user.user_metadata.workspace_tour_completed_at.length > 0;
  const notificationRows = await prisma.conversation.findMany({
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
  });
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
      brandAccentColor={business.brandAccentColor}
      tourScopeId={business.id}
      tourCompleted={tourCompleted}
      unreadCount={unreadCount}
      notifications={notifications}
    >
      {children}
    </AppShell>
  );
}
