import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormSelect } from "@/components/workspace/form-parts";
import { fieldInputClass, fieldTextareaClass } from "@/components/workspace/workspace-layout";
import type { ClientRecord } from "@/lib/clients";

export const patientTypes = ["New Patient", "Returning Patient", "VIP / Important"];
export const clientStatuses = ["active", "inactive", "at-risk", "archived"];
const genders = ["", "Female", "Male", "Other"];
const contactMethods = ["", "WhatsApp", "Phone Call", "Email"];

// The view model still returns a few legacy "Not added" strings for empty values.
export function clean(value: string) {
  return value === "Not added" || value === "Not added yet." || value === "No notes yet."
    ? ""
    : value;
}

// Profile fields shared by the New and Edit client forms, so both read the same
// and stay the same size. Uncontrolled: the form reads them back from FormData
// (name, phone, email, dateOfBirth, gender, preferredChannel, address, notes and —
// edit only — status, patientType). Render it inside a two-column grid.
export function ClientProfileFields({ client }: { client?: ClientRecord }) {
  return (
    <>
      <FormField label="Full name">
        <Input name="name" required defaultValue={client?.name} className={fieldInputClass} />
      </FormField>
      <FormField label="Phone">
        <Input
          name="phone"
          required
          defaultValue={client?.phone}
          placeholder="+1 555 000 0000"
          className={fieldInputClass}
        />
      </FormField>
      <FormField label="Email">
        <Input name="email" type="email" defaultValue={client?.email} className={fieldInputClass} />
      </FormField>
      <FormField label="Date of birth">
        <Input
          name="dateOfBirth"
          type="date"
          defaultValue={client?.dateOfBirthInput}
          className={fieldInputClass}
        />
      </FormField>
      <FormSelect
        label="Gender"
        name="gender"
        defaultValue={client ? clean(client.gender) : ""}
        options={genders}
        emptyLabel="Not set"
      />
      <FormSelect
        label="Preferred contact"
        name="preferredChannel"
        defaultValue={client?.details.preferredChannel ?? ""}
        options={contactMethods}
        emptyLabel="Not set"
      />
      {client ? (
        <>
          <FormSelect
            label="Status"
            name="status"
            defaultValue={client.status}
            options={clientStatuses}
            selectClassName="capitalize"
          />
          <FormSelect
            label="Patient type"
            name="patientType"
            defaultValue={client.patientType}
            options={patientTypes}
          />
        </>
      ) : null}
      <FormField label="Address" className="sm:col-span-2">
        <Input
          name="address"
          defaultValue={client ? clean(client.address) : undefined}
          className={fieldInputClass}
        />
      </FormField>
      <FormField label="Notes" className="sm:col-span-2">
        <Textarea
          name="notes"
          defaultValue={client ? clean(client.notes) : undefined}
          className={fieldTextareaClass}
        />
      </FormField>
    </>
  );
}
