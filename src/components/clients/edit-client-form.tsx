"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteClientAction, saveClientAction } from "@/app/(workspace)/clients/actions";
import { ClientProfileFields } from "@/components/clients/client-profile-fields";
import { ConfirmDeleteDialog } from "@/components/clients/record-form-dialog";
import { DestructiveTextButton, FormActions, FormError } from "@/components/workspace/form-parts";
import { WorkspaceFormSection } from "@/components/workspace/workspace-layout";
import type { ClientRecord, ClientStatus } from "@/lib/clients";

type EditClientFormProps = {
  client: ClientRecord;
};

export function EditClientForm({ client }: EditClientFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const field = (key: string) => String(formData.get(key) ?? "");
      const patientType = field("patientType");
      const result = await saveClientAction({
        id: client.id,
        name: field("name"),
        email: field("email"),
        phone: field("phone"),
        gender: field("gender"),
        dateOfBirth: field("dateOfBirth"),
        address: field("address"),
        patientType,
        status: field("status") as ClientStatus,
        notes: field("notes"),
        preferredChannel: field("preferredChannel"),
        // Not shown on the record and vestigial (clinic-type-per-patient is a
        // wrong concept, assigned-staff was free text). Clear them rather than
        // persist the view model's fabricated display default ("Clinic"). Tags
        // mirror the patient type.
        clinicType: "",
        assignedStaff: "",
        tags: patientType,
      });

      if (!result.ok || !result.client) {
        setError(result.error ?? "We couldn't update this patient.");
        return;
      }

      router.push(`/clients/${result.client.id}`);
    });
  }

  function deleteClient() {
    setError("");
    startTransition(async () => {
      const result = await deleteClientAction(client.id);

      if (!result.ok) {
        setConfirmingDelete(false);
        setError(result.error ?? "We couldn't delete this patient.");
        return;
      }

      router.push("/clients");
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <WorkspaceFormSection>
        <div className="grid gap-3 sm:grid-cols-2">
          <ClientProfileFields client={client} />
        </div>
      </WorkspaceFormSection>

      <FormError message={error} />

      <FormActions cancelHref={`/clients/${client.id}`} submitLabel="Save" isPending={isPending}>
        <DestructiveTextButton onClick={() => setConfirmingDelete(true)} disabled={isPending}>
          Delete patient
        </DestructiveTextButton>
      </FormActions>

      <ConfirmDeleteDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this patient?"
        description="This permanently removes the patient record, including appointments, documents, and payment history. This can't be undone."
        isPending={isPending}
        onConfirm={deleteClient}
      />
    </form>
  );
}
