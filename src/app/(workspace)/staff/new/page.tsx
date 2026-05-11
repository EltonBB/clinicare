import { NewStaffForm } from "@/components/staff/new-staff-form";
import { CreatePageShell } from "@/components/workspace/create-page-shell";

export default function NewStaffPage() {
  return (
    <CreatePageShell
      eyebrow="Staff workspace"
      title="New staff member"
      description="Add the team member profile used for booking ownership, time tracking, and staff performance records."
      backHref="/staff"
      backLabel="staff"
    >
      <NewStaffForm />
    </CreatePageShell>
  );
}

