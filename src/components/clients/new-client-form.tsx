"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveClientAction } from "@/app/(workspace)/clients/actions";
import { ClientProfileFields } from "@/components/clients/client-profile-fields";
import { Button } from "@/components/ui/button";
import { FormActions, FormError } from "@/components/workspace/form-parts";
import { WorkspaceFormSection } from "@/components/workspace/workspace-layout";

type NewClientFormProps = {
  nextAfterCreate?: "calendar";
};

export function NewClientForm({ nextAfterCreate }: NewClientFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [savedClientId, setSavedClientId] = useState<string | null>(null);
  const [submissionBlocked, setSubmissionBlocked] = useState(false);

  function handleSubmit(formData: FormData) {
    if (submissionBlocked) return;
    setError("");
    startTransition(async () => {
      const field = (key: string) => String(formData.get(key) ?? "");
      let result;
      try {
        result = await saveClientAction({
          name: field("name"),
          email: field("email"),
          phone: field("phone"),
          gender: field("gender"),
          dateOfBirth: field("dateOfBirth"),
          address: field("address"),
          notes: field("notes"),
          preferredChannel: field("preferredChannel"),
          // A new patient starts active as a "New Patient"; medical detail is added
          // later from the record's Medical Info tab.
          patientType: "New Patient",
          clinicType: "",
          status: "active",
          assignedStaff: "",
          tags: "New Patient",
        });
      } catch {
        setSubmissionBlocked(true);
        setSaveNotice("We couldn't confirm whether this patient was created. Check the patient list before trying again.");
        return;
      }

      if (!result.ok) {
        setError(result.error ?? "We couldn't create this patient.");
        return;
      }

      if (result.inboxSyncRequired || result.recordRefreshRequired || !result.client) {
        setSubmissionBlocked(true);
        setSavedClientId(result.clientId ?? result.client?.id ?? null);
        setSaveNotice(result.inboxSyncRequired
          ? "Patient created, but existing messages may not be linked. Open the profile and save it again to retry linking."
          : "Patient created. We couldn't reload the record yet.");
        return;
      }

      if (nextAfterCreate === "calendar") {
        router.push(`/calendar/new?client=${result.client.id}`);
        return;
      }

      router.push(`/clients/${result.client.id}`);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <WorkspaceFormSection>
        <div className="grid gap-3 sm:grid-cols-2">
          <ClientProfileFields />
        </div>
      </WorkspaceFormSection>

      <FormError message={error} />

      {saveNotice ? <p role="alert" className="rounded-(--radius-card) bg-primary/8 px-3.5 py-2.5 text-sm text-primary">
        {saveNotice} <Button type="button" variant="outline" size="sm" onClick={() => window.location.assign(savedClientId ? `/clients/${savedClientId}` : "/clients")}>
          {savedClientId ? "Reload patient" : "Check patient list"}
        </Button>
      </p> : null}

      <FormActions cancelHref="/clients" submitLabel="Create" isPending={isPending} disabled={submissionBlocked} />
    </form>
  );
}
