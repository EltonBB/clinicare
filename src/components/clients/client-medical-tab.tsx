"use client";

import type { ReactNode } from "react";
import { Pencil, Plus, Stethoscope } from "lucide-react";

import type { RecordFormValues } from "@/components/clients/record-form-dialog";
import { AddLink, RecordRow } from "@/components/clients/record-list";
import { Button } from "@/components/ui/button";
import { WorkspaceCard, WorkspaceEmptyState } from "@/components/workspace/workspace-layout";
import { useI18n } from "@/i18n/client";
import { fmt, storedLabel } from "@/i18n/format";
import type { ClientRecord } from "@/lib/clients";
import { cn } from "@/lib/utils";

export type MedicalKind = "medication" | "health" | "treatment" | "note" | "background";

/** The kinds "Add medical record" offers, in order (titles in `clients.medical.types`). */
export const medicalRecordKinds: MedicalKind[] = ["medication", "health", "treatment", "note", "background"];

// The free-text background fields, in display order (labels in
// `clients.medical.background`). Shared by the card below and the "Medical
// background" dialog so both read the same fields.
export function medicalBackgroundFields(medical: ClientRecord["medical"]) {
  return (
    ["medicalHistory", "allergies", "importantHealthNotes", "previousTreatments", "treatmentPlan"] as const
  ).map((key) => ({ key, value: medical[key] }));
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
  const { m } = useI18n();
  const t = m.clients.medical;
  const background = medicalBackgroundFields(client.medical);
  const filledBackground = background.filter((field) => field.value);
  const sections: { key: string; node: ReactNode }[] = [];

  if (client.healthItems.length > 0) {
    sections.push({
      key: "health",
      node: (
        <WorkspaceCard fill title={t.healthRecord} action={<AddLink onClick={() => onCreate("health")} />}>
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
              meta={[storedLabel(m.clients.healthTypes, item.type), item.value].filter(Boolean).join(" · ")}
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
        <WorkspaceCard fill title={t.medications} action={<AddLink onClick={() => onCreate("medication")} />}>
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
                  {medication.isActive ? t.active : t.inactive}
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
        <WorkspaceCard fill title={t.treatmentPlan} action={<AddLink onClick={() => onCreate("treatment")} />}>
          {client.treatmentPlanItems.map((item) => (
            <RecordRow
              key={item.id}
              title={item.title}
              badge={
                <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-[11px] font-semibold leading-4 text-muted-foreground">
                  {storedLabel(m.clients.treatmentStatuses, item.status)}
                </span>
              }
              meta={item.dueAt ? fmt(t.due, { date: item.dueAt }) : ""}
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
        <WorkspaceCard fill title={t.providerNotes} action={<AddLink onClick={() => onCreate("note")} />}>
          {client.careNotes.map((note) => (
            <RecordRow
              key={note.id}
              title={note.title || m.clients.view.providerNote}
              meta={`${note.notedAt} · ${note.providerName}`}
              body={note.body}
              onEdit={() =>
                onEdit("note", note.id, {
                  title: note.title,
                  body: note.body,
                })
              }
              onDelete={() => onDelete("note", note.id, note.title || m.clients.view.providerNote)}
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
          title={t.backgroundCard}
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
              {t.edit}
            </button>
          }
          contentClassName="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {filledBackground.map((field) => (
            <div key={field.key}>
              <p className="text-sm font-semibold text-foreground">{t.background[field.key]}</p>
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
        title={t.noRecords}
        className="py-12"
        action={
          <Button size="sm" onClick={onChoose} className="rounded-(--radius-tile)">
            <Plus className="size-4" />
            {m.clients.record.addMedicalRecord}
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
          {t.addRecord}
        </Button>
      </div>
      <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-2">
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
