"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveClientAction } from "@/app/(workspace)/clients/actions";
import { ClientProfileFields } from "@/components/clients/client-profile-fields";
import { FormActions, FormError } from "@/components/workspace/form-parts";
import { WorkspaceFormSection } from "@/components/workspace/workspace-layout";

type NewClientFormProps = {
  nextAfterCreate?: "calendar";
};

export function NewClientForm({ nextAfterCreate }: NewClientFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const field = (key: string) => String(formData.get(key) ?? "");
      const result = await saveClientAction({
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

      if (!result.ok || !result.client) {
        setError(result.error ?? "We couldn't create this patient.");
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

      <FormActions cancelHref="/clients" submitLabel="Create" isPending={isPending} />
    </form>
  );
}
