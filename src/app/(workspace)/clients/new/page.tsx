import { CreatePageShell } from "@/components/workspace/create-page-shell";
import { NewClientForm } from "@/components/clients/new-client-form";

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <CreatePageShell
      eyebrow="Client directory"
      title="New client"
      description="Create the client record once, then use it for bookings, reminders, notes, messages, and visit history."
      backHref="/clients"
      backLabel="clients"
    >
      <NewClientForm nextAfterCreate={next === "calendar" ? "calendar" : undefined} />
    </CreatePageShell>
  );
}

