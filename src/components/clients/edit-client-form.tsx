"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Save, Trash2 } from "lucide-react";

import { deleteClientAction, saveClientAction } from "@/app/(workspace)/clients/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
        className="h-11 w-full rounded-[0.9rem] border border-border/80 bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/35"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
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
        clinicType: String(formData.get("clinicType") ?? ""),
        status,
        notes: String(formData.get("notes") ?? ""),
        medicalHistory: String(formData.get("medicalHistory") ?? ""),
        allergies: String(formData.get("allergies") ?? ""),
        importantHealthNotes: String(formData.get("importantHealthNotes") ?? ""),
        previousTreatments: String(formData.get("previousTreatments") ?? ""),
        treatmentPlan: String(formData.get("treatmentPlan") ?? ""),
        preferredChannel,
        assignedStaff: String(formData.get("assignedStaff") ?? ""),
        tags: String(formData.get("tags") ?? ""),
      });

      if (!result.ok || !result.client) {
        setError(result.error ?? "We couldn't update this patient.");
        return;
      }

      router.push(`/clients/${result.client.id}`);
    });
  }

  function deleteClient() {
    if (!window.confirm("Delete this patient permanently?")) {
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await deleteClientAction(client.id);

      if (!result.ok) {
        setError(result.error ?? "We couldn't delete this patient.");
        return;
      }

      router.push("/clients");
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3.5">
      <section className="surface-card p-3.5">
        <h2 className="text-base font-semibold text-foreground">Basic information</h2>
        <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2">
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
        </div>
      </section>

      <section className="surface-card p-3.5">
        <h2 className="text-base font-semibold text-foreground">Clinic information</h2>
        <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2">
          <Field name="clinicType" label="Clinic type" defaultValue={clean(client.clinicType)} />
          <SelectField
            label="Preferred contact method"
            value={preferredChannel}
            options={["WhatsApp", "Phone Call", "Email"]}
            onChange={setPreferredChannel}
          />
          <Field name="assignedStaff" label="Assigned doctor / staff member" defaultValue={client.details.assignedStaff} />
          <Field name="tags" label="Patient type / tags" defaultValue={client.details.tags.join(", ")} className="sm:col-span-2" />
          <TextField name="notes" label="Patient notes" defaultValue={client.notes === "No notes yet." ? "" : client.notes} className="sm:col-span-2" />
        </div>
      </section>

      <section className="surface-card p-3.5">
        <h2 className="text-base font-semibold text-foreground">Medical information</h2>
        <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2">
          <TextField name="medicalHistory" label="Medical history" defaultValue={clean(client.medical.medicalHistory)} className="sm:col-span-2" />
          <TextField name="allergies" label="Allergies" defaultValue={clean(client.medical.allergies)} />
          <TextField name="importantHealthNotes" label="Important health notes" defaultValue={clean(client.medical.importantHealthNotes)} />
          <TextField name="previousTreatments" label="Previous treatments" defaultValue={clean(client.medical.previousTreatments)} />
          <TextField name="treatmentPlan" label="Treatment plan" defaultValue={clean(client.medical.treatmentPlan)} />
        </div>
      </section>

      {error ? (
        <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          className="rounded-[0.9rem] border-destructive/25 bg-white text-destructive hover:bg-destructive/5 hover:text-destructive"
          onClick={deleteClient}
          disabled={isPending}
        >
          <Trash2 className="size-4" />
          Delete patient
        </Button>
        <div className="flex justify-end gap-3">
          <Link
            href={`/clients/${client.id}`}
            className={cn(buttonVariants({ variant: "outline" }), "rounded-[0.9rem] bg-white")}
          >
            <ArrowLeft className="size-4" />
            Cancel
          </Link>
          <Button type="submit" className="rounded-[0.9rem]" disabled={isPending}>
            <Save className="size-4" />
            {isPending ? "Saving..." : "Save patient"}
          </Button>
        </div>
      </div>
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
        className="h-11 rounded-[0.9rem] bg-white"
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
        className="min-h-24 rounded-[0.9rem] bg-white px-3 py-3"
      />
    </label>
  );
}
