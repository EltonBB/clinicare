"use client";

import type { ReactNode } from "react";
import { Pencil, Plus, Stethoscope } from "lucide-react";

import type { RecordFormValues, RecordTypeOption } from "@/components/clients/record-form-dialog";
import { AddLink, RecordRow } from "@/components/clients/record-list";
import { Button } from "@/components/ui/button";
import { WorkspaceCard, WorkspaceEmptyState } from "@/components/workspace/workspace-layout";
import type { ClientRecord } from "@/lib/clients";
import { cn } from "@/lib/utils";

export type MedicalKind = "medication" | "health" | "treatment" | "note" | "background";

export const medicalRecordTypes: (RecordTypeOption & { key: MedicalKind })[] = [
  { key: "medication", title: "Medication", description: "What the patient is taking" },
  { key: "health", title: "Allergy or health alert", description: "Allergies, conditions, vitals" },
  { key: "treatment", title: "Treatment plan item", description: "A planned step of care" },
  { key: "note", title: "Provider note", description: "Internal note from the care team" },
  { key: "background", title: "Medical background", description: "History and previous treatments" },
];

function stripPlaceholder(value: string) {
  return value === "Not added" || value === "Not added yet." ? "" : value;
}

// The free-text background fields, in display order. Shared by the card below
// and the "Medical background" dialog so both read the same fields.
export function medicalBackgroundFields(medical: ClientRecord["medical"]) {
  return [
    { key: "medicalHistory", label: "Medical history", value: medical.medicalHistory },
    { key: "allergies", label: "Allergies", value: medical.allergies },
    { key: "importantHealthNotes", label: "Health notes", value: medical.importantHealthNotes },
    { key: "previousTreatments", label: "Previous treatments", value: medical.previousTreatments },
    { key: "treatmentPlan", label: "Treatment plan", value: medical.treatmentPlan },
  ].map((field) => ({ ...field, value: stripPlaceholder(field.value) }));
}

type ClientMedicalTabProps = {
  client: ClientRecord;
  onChoose: () => void;
  onCreate: (kind: MedicalKind) => void;
  onEdit: (kind: MedicalKind, recordId: string, initialValues: RecordFormValues) => void;
  onDelete: (kind: Exclude<MedicalKind, "background">, recordId: string, label: string) => void;
};

export function ClientMedicalTab({
  client,
  onChoose,
  onCreate,
  onEdit,
  onDelete,
}: ClientMedicalTabProps) {
  const background = medicalBackgroundFields(client.medical);
  const filledBackground = background.filter((field) => field.value);
  const sections: { key: string; node: ReactNode }[] = [];

  if (client.healthItems.length > 0) {
    sections.push({
      key: "health",
      node: (
        <WorkspaceCard fill title="Health record" action={<AddLink onClick={() => onCreate("health")} />}>
          {client.healthItems.map((item) => (
            <RecordRow
              key={item.id}
              title={item.label}
              badge={
                item.severity ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold leading-4 text-amber-700">
                    {item.severity}
                  </span>
                ) : undefined
              }
              meta={[item.type, item.value].filter(Boolean).join(" · ")}
              body={item.notes}
              onEdit={() =>
                onEdit("health", item.id, {
                  type: item.type,
                  label: item.label,
                  value: item.value,
                  severity: item.severity,
                  notes: item.notes,
                })
              }
              onDelete={() => onDelete("health", item.id, item.label)}
            />
          ))}
        </WorkspaceCard>
      ),
    });
  }

  if (client.medications.length > 0) {
    sections.push({
      key: "medication",
      node: (
        <WorkspaceCard fill title="Medications" action={<AddLink onClick={() => onCreate("medication")} />}>
          {client.medications.map((medication) => (
            <RecordRow
              key={medication.id}
              title={medication.name}
              badge={
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4",
                    medication.isActive
                      ? "bg-primary/8 text-primary"
                      : "bg-secondary/80 text-muted-foreground"
                  )}
                >
                  {medication.isActive ? "Active" : "Inactive"}
                </span>
              }
              meta={[medication.dosage, medication.frequency].filter(Boolean).join(" · ")}
              body={medication.notes}
              onEdit={() =>
                onEdit("medication", medication.id, {
                  name: medication.name,
                  dosage: medication.dosage,
                  frequency: medication.frequency,
                  notes: medication.notes,
                  isActive: medication.isActive,
                })
              }
              onDelete={() => onDelete("medication", medication.id, medication.name)}
            />
          ))}
        </WorkspaceCard>
      ),
    });
  }

  if (client.treatmentPlanItems.length > 0) {
    sections.push({
      key: "treatment",
      node: (
        <WorkspaceCard fill title="Treatment plan" action={<AddLink onClick={() => onCreate("treatment")} />}>
          {client.treatmentPlanItems.map((item) => (
            <RecordRow
              key={item.id}
              title={item.title}
              badge={
                <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-[11px] font-semibold leading-4 text-muted-foreground">
                  {item.status}
                </span>
              }
              meta={item.dueAt ? `Due ${item.dueAt}` : ""}
              body={item.description}
              onEdit={() =>
                onEdit("treatment", item.id, {
                  title: item.title,
                  status: item.status,
                  dueAt: item.dueAtInput,
                  description: item.description,
                })
              }
              onDelete={() => onDelete("treatment", item.id, item.title)}
            />
          ))}
        </WorkspaceCard>
      ),
    });
  }

  if (client.careNotes.length > 0) {
    sections.push({
      key: "note",
      node: (
        <WorkspaceCard fill title="Provider notes" action={<AddLink onClick={() => onCreate("note")} />}>
          {client.careNotes.map((note) => (
            <RecordRow
              key={note.id}
              title={note.title}
              meta={`${note.notedAt} · ${note.providerName}`}
              body={note.body}
              onEdit={() =>
                onEdit("note", note.id, {
                  title: note.title === "Provider note" ? "" : note.title,
                  body: note.body,
                })
              }
              onDelete={() => onDelete("note", note.id, note.title)}
            />
          ))}
        </WorkspaceCard>
      ),
    });
  }

  if (filledBackground.length > 0) {
    sections.push({
      key: "background",
      node: (
        <WorkspaceCard
          fill
          title="Background"
          action={
            <button
              type="button"
              onClick={() =>
                onEdit(
                  "background",
                  client.id,
                  Object.fromEntries(background.map((field) => [field.key, field.value]))
                )
              }
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
            >
              <Pencil className="size-3" />
              Edit
            </button>
          }
          contentClassName="grid gap-3 sm:grid-cols-2"
        >
          {filledBackground.map((field) => (
            <div key={field.key}>
              <p className="text-sm font-semibold text-foreground">{field.label}</p>
              <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{field.value}</p>
            </div>
          ))}
        </WorkspaceCard>
      ),
    });
  }

  if (sections.length === 0) {
    return (
      <WorkspaceEmptyState
        icon={Stethoscope}
        title="No medical records yet"
        className="py-12"
        action={
          <Button size="sm" onClick={onChoose} className="rounded-(--radius-tile)">
            <Plus className="size-4" />
            Add medical record
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onChoose} className="rounded-(--radius-tile)">
          <Plus className="size-4" />
          Add record
        </Button>
      </div>
      <div className="grid items-stretch gap-3 xl:grid-cols-2">
        {sections.map((section, index) => (
          <div
            key={section.key}
            className={cn(
              "min-w-0",
              sections.length % 2 === 1 && index === sections.length - 1 && "xl:col-span-2"
            )}
          >
            {section.node}
          </div>
        ))}
      </div>
    </div>
  );
}
