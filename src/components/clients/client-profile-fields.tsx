"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormSelect } from "@/components/workspace/form-parts";
import { fieldInputClass, fieldTextareaClass } from "@/components/workspace/workspace-layout";
import { useI18n } from "@/i18n/client";
import type { ClientRecord } from "@/lib/clients";

export const patientTypes = ["New Patient", "Returning Patient", "VIP / Important"];
export const clientStatuses = ["active", "inactive", "at-risk", "archived"];
const genders = ["", "Female", "Male", "Other"];
const contactMethods = ["", "WhatsApp", "Phone Call", "Email"];

// Profile fields shared by the New and Edit client forms, so both read the same
// and stay the same size. Uncontrolled: the form reads them back from FormData
// (name, phone, email, dateOfBirth, gender, preferredChannel, address, notes and —
// edit only — status, patientType). Render it inside a two-column grid.
export function ClientProfileFields({ client }: { client?: ClientRecord }) {
  const { m } = useI18n();
  const t = m.clients.form;

  return (
    <>
      <FormField label={t.fullName}>
        <Input name="name" required defaultValue={client?.name} className={fieldInputClass} />
      </FormField>
      <FormField label={t.phone}>
        <Input
          name="phone"
          required
          defaultValue={client?.phone}
          placeholder={t.phoneHint}
          className={fieldInputClass}
        />
      </FormField>
      <FormField label={t.email}>
        <Input name="email" type="email" defaultValue={client?.email} className={fieldInputClass} />
      </FormField>
      <FormField label={t.dateOfBirth}>
        <Input
          name="dateOfBirth"
          type="date"
          defaultValue={client?.dateOfBirthInput}
          className={fieldInputClass}
        />
      </FormField>
      <FormSelect
        label={t.gender}
        name="gender"
        defaultValue={client?.gender ?? ""}
        options={genders}
        optionLabels={m.clients.genders}
        emptyLabel={t.notSet}
      />
      <FormSelect
        label={t.preferredContact}
        name="preferredChannel"
        defaultValue={client?.details.preferredChannel ?? ""}
        options={contactMethods}
        optionLabels={m.clients.contactMethods}
        emptyLabel={t.notSet}
      />
      {client ? (
        <>
          <FormSelect
            label={t.status}
            name="status"
            defaultValue={client.status}
            options={clientStatuses}
            optionLabels={m.clients.status}
          />
          <FormSelect
            label={t.patientType}
            name="patientType"
            defaultValue={client.patientType}
            options={patientTypes}
            optionLabels={m.clients.patientTypes}
          />
        </>
      ) : null}
      <FormField label={t.address} className="sm:col-span-2">
        <Input
          name="address"
          defaultValue={client?.address}
          className={fieldInputClass}
        />
      </FormField>
      <FormField label={t.notes} className="sm:col-span-2">
        <Textarea
          name="notes"
          defaultValue={client?.notes}
          className={fieldTextareaClass}
        />
      </FormField>
    </>
  );
}
