import type { Metadata } from "next";
import { CreatePageShell } from "@/components/workspace/create-page-shell";
import { NewClientForm } from "@/components/clients/new-client-form";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";
import { WorkspaceLockedState } from "@/components/billing/workspace-locked-state";
import { canUseWorkspace } from "@/lib/billing-access";
import { requireCurrentWorkspace } from "@/lib/business";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.clients.meta.newClient };
}

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const { business } = await requireCurrentWorkspace("/clients/new", { missingBusinessRedirect: "/onboarding" });
  const title = (await getI18n()).m.clients.directory.newClient;

  if (!canUseWorkspace(business)) {
    return (
      <CreatePageShell title={title}>
        <WorkspaceLockedState />
      </CreatePageShell>
    );
  }

  return (
    <CreatePageShell title={title}>
      <WithMessages namespaces={["clients"]}>
        <NewClientForm nextAfterCreate={next === "calendar" ? "calendar" : undefined} />
      </WithMessages>
    </CreatePageShell>
  );
}

