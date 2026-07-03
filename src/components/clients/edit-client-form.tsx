"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Save, Trash2 } from "lucide-react";

import { deleteClientAction, saveClientAction } from "@/app/(workspace)/clients/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDeleteDialog } from "@/components/clients/record-form-dialog";
import {
  fieldInputClass,
  fieldSelectClass,
  WorkspaceFormSection,
} from "@/components/workspace/workspace-layout";
import type { ClientRecord, ClientStatus } from "@/lib/clients";
import { cn } from "@/lib/utils";

type EditClientFormProps = {
  client: ClientRecord;
};

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={fieldSelectClass}
      >
        {options.map((option) => (
          <option key={option || "unset"} value={option}>
            {option || "Not set"}
          </option>
        ))}
      </select>
    </label>
  );
}

function clean(value: string, emptyValue = "") {
  return value === "Not added" || value === "Not added yet." ? emptyValue : value;
}

export function EditClientForm({ client }: EditClientFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [status, setStatus] = useState<ClientStatus>(client.status);
  const [preferredChannel, setPreferredChannel] = useState(client.details.preferredChannel);
  const [patientType, setPatientType] = useState(client.patientType);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await saveClientAction({
        id: client.id,
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        gender: String(formData.get("gender") ?? ""),
        dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
        address: String(formData.get("address") ?? ""),
        patientType,
        status,
        notes: String(formData.get("notes") ?? ""),
        medicalHistory: String(formData.get("medicalHistory") ?? ""),
        allergies: String(formData.get("allergies") ?? ""),
        importantHealthNotes: String(formData.get("importantHealthNotes") ?? ""),
        previousTreatments: String(formData.get("previousTreatments") ?? ""),
        treatmentPlan: String(formData.get("treatmentPlan") ?? ""),
        preferredChannel,
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
    <form action={handleSubmit} className="space-y-3.5">
      <WorkspaceFormSection title="Basic information">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field name="name" label="Full name" defaultValue={client.name} required />
          <Field name="phone" label="Phone number" defaultValue={client.phone} required />
          <Field name="email" label="Email" defaultValue={client.email} type="email" />
          <Field name="gender" label="Gender" defaultValue={clean(client.gender)} />
          <Field name="dateOfBirth" label="Date of birth" defaultValue={client.dateOfBirthInput} type="date" />
          <Field name="address" label="Address" defaultValue={clean(client.address)} className="sm:col-span-2" />
          <SelectField
            label="Patient type"
            value={patientType}
            options={["New Patient", "Returning Patient", "VIP / Important"]}
            onChange={setPatientType}
          />
          <SelectField
            label="Status"
            value={status}
            options={["active", "inactive", "at-risk", "archived"]}
            onChange={(value) => setStatus(value as ClientStatus)}
          />
          <SelectField
            label="Preferred contact method"
            value={preferredChannel}
            options={["", "WhatsApp", "Phone Call", "Email"]}
            onChange={setPreferredChannel}
          />
          <TextField name="notes" label="Patient notes" defaultValue={client.notes === "No notes yet." ? "" : client.notes} className="sm:col-span-2" />
        </div>
      </WorkspaceFormSection>

      <WorkspaceFormSection title="Medical information">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextField name="medicalHistory" label="Medical history" defaultValue={clean(client.medical.medicalHistory)} className="sm:col-span-2" />
          <TextField name="allergies" label="Allergies" defaultValue={clean(client.medical.allergies)} />
          <TextField name="importantHealthNotes" label="Important health notes" defaultValue={clean(client.medical.importantHealthNotes)} />
          <TextField name="previousTreatments" label="Previous treatments" defaultValue={clean(client.medical.previousTreatments)} />
          <TextField name="treatmentPlan" label="Treatment plan" defaultValue={clean(client.medical.treatmentPlan)} />
        </div>
      </WorkspaceFormSection>

      {error ? (
        <div className="rounded-(--radius-card) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          className="rounded-(--radius-card) border-destructive/25 bg-white text-destructive hover:bg-destructive/5 hover:text-destructive"
          onClick={() => setConfirmingDelete(true)}
          disabled={isPending}
        >
          <Trash2 className="size-4" />
          Delete patient
        </Button>
        <div className="flex justify-end gap-3">
          <Link
            href={`/clients/${client.id}`}
            className={cn(buttonVariants({ variant: "outline" }), "rounded-(--radius-card) bg-white")}
          >
            <ArrowLeft className="size-4" />
            Cancel
          </Link>
          <Button type="submit" className="rounded-(--radius-card)" disabled={isPending}>
            <Save className="size-4" />
            {isPending ? "Saving..." : "Save patient"}
          </Button>
        </div>
      </div>

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

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  required,
  className,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("space-y-2", className)}>
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <Input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className={fieldInputClass}
      />
    </label>
  );
}

function TextField({
  name,
  label,
  defaultValue,
  className,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <label className={cn("space-y-2", className)}>
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <Textarea
        name={name}
        defaultValue={defaultValue}
        className="min-h-24 rounded-(--radius-card) bg-white px-3 py-3"
      />
    </label>
  );
}
