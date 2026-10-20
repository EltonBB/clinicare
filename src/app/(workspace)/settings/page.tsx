import { redirect } from "next/navigation";

const MOVED_TO_AUTOMATIONS = new Set(["reminders", "workflows"]);

type SettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// Settings is a dialog over the workspace, not a page. The route stays so
// existing links (checkout's billing link, onboarding's WhatsApp step, the
// email-change confirmation) keep working: it opens the dialog on the
// dashboard, on the section the link asked for.
export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const params = searchParams ? await searchParams : {};
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  // Reminders and Workflows moved to the Automations page (2026-10).
  if (MOVED_TO_AUTOMATIONS.has(first(params.section) ?? "")) {
    redirect("/automations");
  }
  const query = new URLSearchParams({ settings: first(params.section) ?? "business" });
  if (first(params.email_updated) === "1") {
    query.set("notice", "email_updated");
  }
  redirect(`/dashboard?${query}`);
}
