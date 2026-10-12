import type { Metadata } from "next";
import { CreatePageShell } from "@/components/workspace/create-page-shell";
import { NewClientForm } from "@/components/clients/new-client-form";

export const metadata: Metadata = { title: "New client | Vela" };

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <CreatePageShell title="New client">
      <NewClientForm nextAfterCreate={next === "calendar" ? "calendar" : undefined} />
    </CreatePageShell>
  );
}

