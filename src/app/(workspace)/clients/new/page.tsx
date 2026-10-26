import type { Metadata } from "next";
import { CreatePageShell } from "@/components/workspace/create-page-shell";
import { NewClientForm } from "@/components/clients/new-client-form";
import { WorkspaceLockedState } from "@/components/billing/workspace-locked-state";
import { canUseWorkspace } from "@/lib/billing-access";
import { requireCurrentWorkspace } from "@/lib/business";

export const metadata: Metadata = { title: "New client | Vela" };

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const { business } = await requireCurrentWorkspace("/clients/new", { missingBusinessRedirect: "/onboarding" });

  if (!canUseWorkspace(business)) {
    return (
      <CreatePageShell title="New client">
        <WorkspaceLockedState />
      </CreatePageShell>
    );
  }

  return (
    <CreatePageShell title="New client">
      <NewClientForm nextAfterCreate={next === "calendar" ? "calendar" : undefined} />
    </CreatePageShell>
  );
}

