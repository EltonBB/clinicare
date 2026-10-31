"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CalendarPlus2,
  CreditCard,
  Download,
  FileText,
  ImageOff,
  ImagePlus,
  MessageSquare,
  NotebookText,
  Phone,
  Plus,
  Trash2,
  UserRoundPen,
} from "lucide-react";

import {
  addClientCareNoteAction,
  addClientDocumentAction,
  addClientFollowUpReminderAction,
  addClientHealthItemAction,
  addClientMedicationAction,
  addClientPaymentAction,
  addClientTreatmentPlanItemAction,
  deleteClientCareNoteAction,
  deleteClientDocumentAction,
  deleteClientFollowUpReminderAction,
  deleteClientGalleryItemAction,
  deleteClientHealthItemAction,
  deleteClientMedicationAction,
  deleteClientPaymentAction,
  deleteClientTreatmentPlanItemAction,
  updateClientCareNoteAction,
  updateClientDocumentAction,
  updateClientFollowUpReminderAction,
  updateClientHealthItemAction,
  updateClientMedicalBackgroundAction,
  updateClientMedicationAction,
  updateClientPaymentAction,
  updateClientTreatmentPlanItemAction,
  type ClientRecordMutationResult,
} from "@/app/(workspace)/clients/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ClientMedicalTab,
  medicalBackgroundFields,
  medicalRecordKinds,
  type MedicalKind,
} from "@/components/clients/client-medical-tab";
import {
  ConfirmDeleteDialog,
  RecordFormDialog,
  RecordTypeDialog,
  type RecordField,
  type RecordFormValues,
} from "@/components/clients/record-form-dialog";
import { AddLink, RecordActions, RecordRow } from "@/components/clients/record-list";
import {
  WorkspaceCard,
  WorkspaceEmptyState,
  WorkspacePage,
} from "@/components/workspace/workspace-layout";
import { useI18n, useServerText } from "@/i18n/client";
import { fmt, plural, storedLabel } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { appointmentStatusKey } from "@/lib/appointment-status";
import { safeUploadErrorMessage, uploadWorkspaceDocument } from "@/lib/media-storage-client";
import { buildPaymentStatementCsv } from "@/lib/payment-statement";
import { cn, getInitials } from "@/lib/utils";
import type {
  ClientRecord,
  ClientStatus,
  ClientTimelineEntry,
} from "@/lib/clients";

type ClientDetailsPageProps = {
  initialClient: ClientRecord;
};

// The <TabsTrigger> count below (Overview, Appointments, Medical Info,
// Documents, Payments) is mirrored as CLIENT_DETAIL_TAB_COUNT in
// lib/skeleton-counts.ts, not exported from here — this is a "use client"
// module, and clients/[clientId]/loading.tsx (a Server Component) importing
// a value from one gets a client reference, not the number itself (Codex).
// Keep both in sync if the tab list changes.

const statusBadgeStyles: Record<ClientStatus, string> = {
  active: "bg-emerald-100 text-emerald-700",
  "at-risk": "bg-destructive/10 text-destructive",
  inactive: "bg-secondary text-muted-foreground",
  archived: "bg-secondary text-muted-foreground",
};

// Stored values (the actions' schemas accept exactly these); labels come from
// the dictionary.
const documentCategories = ["Insurance", "Consent", "Medical History", "Report", "Image / Scan", "Invoice", "Other"];
const healthTypes = ["Allergy", "Medical alert", "Chronic condition", "Vital detail", "Care fact"];
const treatmentStatuses = ["Pending", "Upcoming", "Completed", "On hold"];
const reminderChannels = ["WhatsApp", "SMS", "Email", "Phone call"];
const reminderStatuses = ["Scheduled", "Sent", "Completed"];
const paymentStatuses = ["Paid", "Unpaid", "Partially Paid", "Refunded"];

// "background" is the free-text medical background — one set of fields per
// patient, so unlike the other kinds it has no delete and no record id.
type EntityKind = MedicalKind | "reminder" | "payment" | "document";
type DeletableKind = Exclude<EntityKind, "background">;

type DialogState =
  | { mode: "choose" }
  | { mode: "create"; kind: EntityKind; initialValues?: RecordFormValues }
  | {
      mode: "edit";
      kind: EntityKind;
      recordId: string;
      initialValues: RecordFormValues;
    }
  | { mode: "delete"; kind: DeletableKind | "gallery"; recordId: string; label: string }
  | null;

function buildEntityDialogs(c: Messages["clients"]): Record<
  EntityKind,
  {
    createTitle: string;
    editTitle: string;
    description: string;
    submitCreate: string;
    // When set, "Add" shows this shorter list; "Edit" always shows all `fields`.
    createFields?: RecordField[];
    fields: RecordField[];
  }
> {
  const d = c.dialogs;
  const background = c.medical.background;
  const amount: RecordField = { key: "amount", label: d.payment.amount, required: true, placeholder: d.payment.amountPlaceholder };
  const paymentStatus: RecordField = {
    key: "status",
    label: d.payment.status,
    type: "select",
    options: paymentStatuses,
    optionLabels: c.paymentStatuses,
  };
  const paidAt: RecordField = { key: "paidAt", label: d.payment.paidAt, type: "date" };
  const paymentMethod: RecordField = {
    key: "paymentMethod",
    label: d.payment.paymentMethod,
    placeholder: d.payment.paymentMethodPlaceholder,
  };
  const paymentDescription: RecordField = {
    key: "description",
    label: d.payment.descriptionLabel,
    fullWidth: true,
    placeholder: d.payment.descriptionPlaceholder,
  };

  return {
    medication: {
      createTitle: d.medication.createTitle,
      editTitle: d.medication.editTitle,
      description: d.medication.description,
      submitCreate: d.medication.submitCreate,
      fields: [
        { key: "name", label: d.medication.name, required: true, placeholder: d.medication.namePlaceholder },
        { key: "dosage", label: d.medication.dosage, placeholder: d.medication.dosagePlaceholder },
        { key: "frequency", label: d.medication.frequency, placeholder: d.medication.frequencyPlaceholder },
        { key: "isActive", label: d.medication.isActive, type: "checkbox" },
        { key: "notes", label: d.medication.notes, type: "textarea" },
      ],
    },
    health: {
      createTitle: d.health.createTitle,
      editTitle: d.health.editTitle,
      description: d.health.description,
      submitCreate: d.health.submitCreate,
      fields: [
        { key: "type", label: d.health.type, type: "select", options: healthTypes, optionLabels: c.healthTypes },
        { key: "label", label: d.health.label, required: true, placeholder: d.health.labelPlaceholder },
        { key: "value", label: d.health.value, placeholder: d.health.valuePlaceholder },
        { key: "severity", label: d.health.severity, placeholder: d.health.severityPlaceholder },
        { key: "notes", label: d.health.notes, type: "textarea" },
      ],
    },
    background: {
      createTitle: d.background.title,
      editTitle: d.background.title,
      description: d.background.description,
      submitCreate: d.background.submit,
      fields: [
        { key: "medicalHistory", label: background.medicalHistory, type: "textarea" },
        { key: "allergies", label: background.allergies, type: "textarea" },
        { key: "importantHealthNotes", label: background.importantHealthNotes, type: "textarea" },
        { key: "previousTreatments", label: background.previousTreatments, type: "textarea" },
        { key: "treatmentPlan", label: background.treatmentPlan, type: "textarea" },
      ],
    },
    treatment: {
      createTitle: d.treatment.createTitle,
      editTitle: d.treatment.editTitle,
      description: d.treatment.description,
      submitCreate: d.treatment.submitCreate,
      fields: [
        { key: "title", label: d.treatment.title, required: true, placeholder: d.treatment.titlePlaceholder },
        {
          key: "status",
          label: d.treatment.status,
          type: "select",
          options: treatmentStatuses,
          optionLabels: c.treatmentStatuses,
        },
        { key: "dueAt", label: d.treatment.dueAt, type: "date" },
        { key: "description", label: d.treatment.details, type: "textarea" },
      ],
    },
    note: {
      createTitle: d.note.createTitle,
      editTitle: d.note.editTitle,
      description: d.note.description,
      submitCreate: d.note.submitCreate,
      fields: [
        { key: "title", label: d.note.title, placeholder: d.note.titlePlaceholder },
        { key: "body", label: d.note.body, type: "textarea", required: true },
      ],
    },
    reminder: {
      createTitle: d.reminder.createTitle,
      editTitle: d.reminder.editTitle,
      description: d.reminder.description,
      submitCreate: d.reminder.submitCreate,
      fields: [
        { key: "title", label: d.reminder.title, required: true, placeholder: d.reminder.titlePlaceholder },
        { key: "remindAt", label: d.reminder.date, type: "date", required: true },
        {
          key: "channel",
          label: d.reminder.channel,
          type: "select",
          options: reminderChannels,
          optionLabels: c.reminderChannels,
        },
        {
          key: "status",
          label: d.reminder.status,
          type: "select",
          options: reminderStatuses,
          optionLabels: c.reminderStatuses,
        },
        { key: "notes", label: d.reminder.notes, type: "textarea" },
      ],
    },
    payment: {
      createTitle: d.payment.createTitle,
      editTitle: d.payment.editTitle,
      description: d.payment.description,
      submitCreate: d.payment.submitCreate,
      // Adding an entry asks only for what a payment can't exist without; the
      // invoice/receipt references and billing note are added later by editing it.
      createFields: [amount, paymentStatus, paidAt, paymentMethod, paymentDescription],
      fields: [
        amount,
        paymentStatus,
        paidAt,
        paymentMethod,
        { key: "invoiceNumber", label: d.payment.invoiceNumber },
        { key: "receiptNumber", label: d.payment.receiptNumber },
        paymentDescription,
        { key: "receiptUrl", label: d.payment.receiptUrl, fullWidth: true, placeholder: "https://..." },
        { key: "billingNote", label: d.payment.billingNote, type: "textarea" },
      ],
    },
    document: {
      createTitle: d.document.createTitle,
      editTitle: d.document.editTitle,
      description: d.document.description,
      submitCreate: d.document.submitCreate,
      fields: [
        { key: "fileName", label: d.document.fileName, required: true },
        {
          key: "fileType",
          label: d.document.category,
          type: "select",
          options: documentCategories,
          optionLabels: c.documentCategories,
        },
        { key: "notes", label: d.document.notes, type: "textarea" },
      ],
    },
  };
}

const timelineIcons: Record<ClientTimelineEntry["kind"], ComponentType<{ className?: string }>> = {
  appointment: CalendarDays,
  payment: CreditCard,
  note: NotebookText,
  document: FileText,
  message: MessageSquare,
};

export function ClientDetailsPage({ initialClient }: ClientDetailsPageProps) {
  const { locale, m } = useI18n();
  const t = m.clients.record;
  const saved = t.saved;
  const serverText = useServerText();
  const entityDialogs = buildEntityDialogs(m.clients);
  const [client, setClient] = useState(initialClient);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{
    storageUrl: string;
    mimeType: string;
    fileSize: number;
  } | null>(null);
  const [selectedTab, setSelectedTab] = useState("overview");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [isPending, startSaving] = useTransition();

  const nextAppointment = client.nextAppointment;
  const latestPayment = client.payments[0];
  const currentMedications = client.medications.filter((medication) => medication.isActive);
  const allergies = client.healthItems.filter((item) =>
    item.type.toLowerCase().includes("allerg")
  );
  const alerts = client.healthItems.filter((item) =>
    item.type.toLowerCase().includes("alert")
  );
  const clinicalAlerts = [...alerts, ...allergies];
  // Background text, read the same way the Medical tab reads it.
  const backgroundValues = Object.fromEntries(
    medicalBackgroundFields(client.medical).map((field) => [field.key, field.value])
  );
  const selectedDocument =
    client.documents.find((document) => document.id === selectedDocumentId) ??
    client.documents[0];

  function runMutation(
    mutate: () => Promise<ClientRecordMutationResult>,
    successMessage: string
  ) {
    startSaving(async () => {
      const result = await mutate();

      if (!result.ok || !result.client) {
        setErrorMessage(serverText(result.error) ?? t.saveFailed);
        setStatusMessage("");
        return;
      }

      setClient(result.client);
      setDialog(null);
      setErrorMessage("");
      setStatusMessage(successMessage);
    });
  }

  function handleRecordSubmit(values: RecordFormValues) {
    if (!dialog || dialog.mode === "delete" || dialog.mode === "choose") {
      return;
    }

    const { kind } = dialog;
    // Narrows to a string only in edit mode; truthiness below removes the need
    // for non-null assertions when forwarding the id to the update actions.
    const editId = dialog.mode === "edit" ? dialog.recordId : undefined;
    const v = (key: string) => String(values[key] ?? "");

    switch (kind) {
      case "medication": {
        const payload = {
          clientId: client.id,
          name: v("name"),
          dosage: v("dosage"),
          frequency: v("frequency"),
          notes: v("notes"),
          isActive: Boolean(values.isActive),
        };
        runMutation(
          () =>
            editId
              ? updateClientMedicationAction({ ...payload, id: editId })
              : addClientMedicationAction(payload),
          editId ? saved.medicationUpdated : saved.medicationAdded
        );
        break;
      }
      case "background": {
        runMutation(
          () =>
            updateClientMedicalBackgroundAction({
              clientId: client.id,
              medicalHistory: v("medicalHistory"),
              allergies: v("allergies"),
              importantHealthNotes: v("importantHealthNotes"),
              previousTreatments: v("previousTreatments"),
              treatmentPlan: v("treatmentPlan"),
            }),
          saved.backgroundSaved
        );
        break;
      }
      case "health": {
        const payload = {
          clientId: client.id,
          type: v("type"),
          label: v("label"),
          value: v("value"),
          severity: v("severity"),
          notes: v("notes"),
        };
        runMutation(
          () =>
            editId
              ? updateClientHealthItemAction({ ...payload, id: editId })
              : addClientHealthItemAction(payload),
          editId ? saved.healthUpdated : saved.healthAdded
        );
        break;
      }
      case "treatment": {
        const payload = {
          clientId: client.id,
          title: v("title"),
          description: v("description"),
          status: v("status"),
          dueAt: v("dueAt"),
        };
        runMutation(
          () =>
            editId
              ? updateClientTreatmentPlanItemAction({ ...payload, id: editId })
              : addClientTreatmentPlanItemAction(payload),
          editId ? saved.treatmentUpdated : saved.treatmentAdded
        );
        break;
      }
      case "note": {
        const payload = {
          clientId: client.id,
          title: v("title"),
          body: v("body"),
        };
        runMutation(
          () =>
            editId
              ? updateClientCareNoteAction({ ...payload, id: editId })
              : addClientCareNoteAction(payload),
          editId ? saved.noteUpdated : saved.noteAdded
        );
        break;
      }
      case "reminder": {
        const payload = {
          clientId: client.id,
          title: v("title"),
          remindAt: v("remindAt"),
          channel: v("channel"),
          status: v("status"),
          notes: v("notes"),
        };
        runMutation(
          () =>
            editId
              ? updateClientFollowUpReminderAction({ ...payload, id: editId })
              : addClientFollowUpReminderAction(payload),
          editId ? saved.reminderUpdated : saved.reminderAdded
        );
        break;
      }
      case "payment": {
        const payload = {
          clientId: client.id,
          amount: v("amount"),
          status: v("status"),
          description: v("description"),
          receiptUrl: v("receiptUrl"),
          paidAt: v("paidAt"),
          invoiceNumber: v("invoiceNumber"),
          receiptNumber: v("receiptNumber"),
          paymentMethod: v("paymentMethod"),
          billingNote: v("billingNote"),
        };
        runMutation(
          () =>
            editId
              ? updateClientPaymentAction({ ...payload, id: editId })
              : addClientPaymentAction(payload),
          editId ? saved.paymentUpdated : saved.paymentAdded
        );
        break;
      }
      case "document": {
        if (editId) {
          runMutation(
            () =>
              updateClientDocumentAction({
                id: editId,
                clientId: client.id,
                fileName: v("fileName"),
                fileType: v("fileType"),
                notes: v("notes"),
              }),
            saved.documentUpdated
          );
        } else {
          runMutation(
            async () => {
              const result = await addClientDocumentAction({
                clientId: client.id,
                fileName: v("fileName"),
                fileType: v("fileType"),
                fileUrl: pendingUpload?.storageUrl ?? "",
                storageUrl: pendingUpload?.storageUrl,
                mimeType: pendingUpload?.mimeType,
                fileSize: pendingUpload?.fileSize,
                notes: v("notes"),
              });

              if (result.ok) {
                setPendingUpload(null);
              }

              return result;
            },
            saved.documentAdded
          );
        }
        break;
      }
    }
  }

  function handleDeleteConfirm() {
    if (!dialog || dialog.mode !== "delete") {
      return;
    }

    const payload = { id: dialog.recordId, clientId: client.id };
    const deleteActions: Record<
      DeletableKind | "gallery",
      (input: typeof payload) => Promise<ClientRecordMutationResult>
    > = {
      medication: deleteClientMedicationAction,
      health: deleteClientHealthItemAction,
      treatment: deleteClientTreatmentPlanItemAction,
      note: deleteClientCareNoteAction,
      reminder: deleteClientFollowUpReminderAction,
      payment: deleteClientPaymentAction,
      document: deleteClientDocumentAction,
      gallery: deleteClientGalleryItemAction,
    };

    runMutation(() => deleteActions[dialog.kind](payload), saved.removed);
  }

  async function handleDocumentFile(file?: File) {
    if (!file) {
      return;
    }

    setIsUploading(true);

    try {
      const uploadedDocument = await uploadWorkspaceDocument(file, {
        folder: "client-documents",
        maxBytes: 10_000_000,
      });
      setPendingUpload({
        storageUrl: uploadedDocument.storageUrl,
        mimeType: uploadedDocument.mimeType,
        fileSize: uploadedDocument.fileSize,
      });
      setErrorMessage("");
      setStatusMessage("");
      setDialog({
        mode: "create",
        kind: "document",
        initialValues: {
          fileName: file.name,
          fileType: file.type === "application/pdf" ? "Report" : "Image / Scan",
          notes: "",
        },
      });
    } catch (error) {
      setErrorMessage(serverText(safeUploadErrorMessage(error, t.uploadFailed)) ?? t.uploadFailed);
      setStatusMessage("");
    } finally {
      setIsUploading(false);
    }
  }

  function downloadPaymentStatement() {
    const csv = buildPaymentStatementCsv(client.payments, m.clients);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${client.name.replaceAll(" ", "-").toLowerCase()}-${m.clients.statement.fileName}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  // Opening "create" for the background kind pre-fills the current values,
  // since there's only ever one background per patient (it's edited, not added).
  function openCreate(kind: EntityKind) {
    setDialog({
      mode: "create",
      kind,
      initialValues:
        kind === "background"
          ? Object.fromEntries(
              medicalBackgroundFields(client.medical).map((field) => [field.key, field.value])
            )
          : undefined,
    });
  }

  const documentActions = (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setDialog({ mode: "create", kind: "document" })}
        className="rounded-(--radius-tile)"
      >
        <Plus className="size-4" />
        {t.addManually}
      </Button>
      <label className={cn(buttonVariants({ size: "sm" }), "cursor-pointer rounded-(--radius-tile)")}>
        <input
          type="file"
          accept="application/pdf,image/*"
          className="sr-only"
          onChange={(event) => {
            void handleDocumentFile(event.target.files?.[0]);
            event.target.value = "";
          }}
          disabled={isUploading}
        />
        <ImagePlus className="size-4" />
        {isUploading ? t.uploading : t.uploadDocument}
      </label>
    </>
  );

  const formDialog = dialog && (dialog.mode === "create" || dialog.mode === "edit") ? dialog : null;
  const activeFormDialog = formDialog ? entityDialogs[formDialog.kind] : null;

  return (
    <WorkspacePage>
      <section className="section-reveal space-y-3.5 pb-1">
        <Link
          href="/clients"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t.backToClients}
        </Link>

        <div className="flex flex-col gap-3.5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <Avatar shape="square" className="size-20">
              <AvatarFallback className="bg-white text-3xl font-semibold text-primary">
                {getInitials(client.name)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-[28px] font-semibold leading-tight tracking-tight text-foreground">
                  {client.name}
                </h1>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    statusBadgeStyles[client.status]
                  )}
                >
                  {m.clients.status[client.status]}
                </span>
              </div>

              {client.phone || client.details.preferredChannel ? (
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  {client.phone ? (
                    <span className="inline-flex items-center gap-2 font-medium text-foreground">
                      <Phone className="size-4 text-muted-foreground" />
                      {client.phone}
                    </span>
                  ) : null}
                  {client.details.preferredChannel ? (
                    <span className="inline-flex items-center gap-2">
                      <MessageSquare className="size-4 text-muted-foreground" />
                      {fmt(t.prefers, { channel: storedLabel(m.clients.contactMethods, client.details.preferredChannel) })}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 xl:justify-end">
            <Link
              href={`/calendar/new?client=${client.id}`}
              className={cn(buttonVariants({ variant: "solid" }), "h-10 rounded-(--radius-tile) px-4")}
            >
              <CalendarPlus2 className="size-4" />
              {t.bookAppointment}
            </Link>
            <Link
              href={`/inbox?client=${client.id}`}
              className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-(--radius-tile) px-4")}
            >
              <MessageSquare className="size-4" />
              {t.sendMessage}
            </Link>
            <Link
              href={`/clients/${client.id}/edit`}
              className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-(--radius-tile) px-4")}
            >
              <UserRoundPen className="size-4" />
              {t.editProfile}
            </Link>
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="state-pop rounded-(--radius-card) border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      {!errorMessage && statusMessage ? (
        <div className="state-pop rounded-(--radius-card) border border-primary/20 bg-primary/8 px-3 py-2.5 text-sm text-primary">
          {statusMessage}
        </div>
      ) : null}

      <Tabs
        value={selectedTab}
        onValueChange={setSelectedTab}
        className="section-reveal-delayed gap-3.5"
      >
        <TabsList
          variant="line"
          className="w-full justify-start gap-4 overflow-x-auto rounded-none border-b border-border/80 p-0"
        >
          {(["overview", "appointments", "medical", "documents", "payments"] as const).map((tab) => (
            <TabsTrigger key={tab} className="flex-none px-0 pb-3" value={tab}>
              {t.tabs[tab]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="grid items-start gap-3">
          <div className="grid items-stretch gap-3 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
            <WorkspaceCard title={t.nextAppointment}>
              {nextAppointment ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{nextAppointment.date}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{nextAppointment.title}</p>
                    {nextAppointment.notes ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {nextAppointment.notes}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge status={appointmentStatusKey(nextAppointment.status)} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t.noUpcoming}</p>
              )}
            </WorkspaceCard>

            <WorkspaceCard title={t.details}>
              <dl className="space-y-2.5">
                <OverviewLine label={t.email} value={client.email} />
                <OverviewLine label={t.patientType} value={storedLabel(m.clients.patientTypes, client.patientType)} />
                <OverviewLine label={t.dateOfBirth} value={client.dateOfBirth} />
                <OverviewLine label={t.gender} value={storedLabel(m.clients.genders, client.gender)} />
                <OverviewLine label={t.address} value={client.address} />
              </dl>
              {client.notes ? (
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground">{t.notes}</p>
                  <p className="mt-1 text-sm leading-5 text-foreground">{client.notes}</p>
                </div>
              ) : null}
            </WorkspaceCard>

            {clinicalAlerts.length > 0 ||
            backgroundValues.allergies ||
            backgroundValues.importantHealthNotes ||
            currentMedications[0] ? (
              <WorkspaceCard
                title={t.health}
                action={
                  <button
                    type="button"
                    onClick={() => setSelectedTab("medical")}
                    className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
                  >
                    {t.viewMedical}
                  </button>
                }
              >
                <div className="space-y-2.5">
                  {clinicalAlerts.slice(0, 3).map((item) => (
                    <p key={item.id} className="flex items-start gap-2 text-sm">
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                      <span className="font-medium text-foreground">{item.label}</span>
                    </p>
                  ))}
                  <HealthSummaryRow title={t.allergies} value={backgroundValues.allergies} />
                  <HealthSummaryRow
                    title={t.importantHealthNotes}
                    value={backgroundValues.importantHealthNotes}
                  />
                  <HealthSummaryRow
                    title={t.currentMedication}
                    value={
                      currentMedications[0]
                        ? `${currentMedications[0].name} ${currentMedications[0].dosage}`.trim()
                        : ""
                    }
                  />
                </div>
              </WorkspaceCard>
            ) : null}
          </div>
          <WorkspaceCard
            title={t.recentActivity}
            action={
              <Link
                href={`/inbox?client=${client.id}`}
                className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
              >
                {t.openInbox}
              </Link>
            }
          >
            {client.timeline.length > 0 ? (
              <div className="-mx-2">
                {client.timeline.map((entry) => {
                  const Icon = timelineIcons[entry.kind];

                  return (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 rounded-(--radius-card) px-2 py-2.5 transition-colors duration-(--duration-base) hover:bg-secondary/40"
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-(--radius-tile) border border-border/80 bg-white text-primary">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-foreground">{entry.title}</p>
                          <span className="shrink-0 text-xs text-muted-foreground">{entry.date}</span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{entry.detail}</p>
                      </div>
                      {entry.status ? <StatusBadge status={entry.status} /> : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <WorkspaceEmptyState icon={CalendarDays} title={t.noActivity} className="py-10" />
            )}
          </WorkspaceCard>
        </TabsContent>

        <TabsContent value="appointments" className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {client.appointments.length > 0 ? (
            <WorkspaceCard title={t.appointments}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#f8fafc] text-[10px] font-semibold caps-label text-muted-foreground">
                    <tr>
                      <th className="rounded-l-(--radius-field) px-3 py-2.5 text-left">{t.appointmentColumns.dateTime}</th>
                      <th className="px-3 py-2.5 text-left">{t.appointmentColumns.service}</th>
                      <th className="px-3 py-2.5 text-left">{t.appointmentColumns.status}</th>
                      <th className="rounded-r-(--radius-field) px-3 py-2.5 text-left">{t.appointmentColumns.notes}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.appointments.map((appointment) => (
                      <tr key={appointment.id} className="transition-colors duration-(--duration-base) hover:bg-secondary/40">
                        <td className="px-3 py-2.5 font-medium text-foreground">{appointment.date}</td>
                        <td className="px-3 py-2.5 text-foreground">{appointment.title}</td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={appointmentStatusKey(appointment.status)} />
                        </td>
                        <td className="max-w-[260px] truncate px-3 py-2.5 text-muted-foreground">{appointment.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </WorkspaceCard>
          ) : (
            <WorkspaceEmptyState icon={CalendarDays} title={t.noAppointments} className="py-12" />
          )}

          <WorkspaceCard
            title={t.followUps}
            action={<AddLink onClick={() => setDialog({ mode: "create", kind: "reminder" })} />}
          >
            {client.followUpReminders.length > 0 ? (
              client.followUpReminders.map((reminder) => (
                <RecordRow
                  key={reminder.id}
                  title={reminder.title}
                  meta={[
                    reminder.remindAt,
                    storedLabel(m.clients.reminderChannels, reminder.channel),
                    storedLabel(m.clients.reminderStatuses, reminder.status),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  body={reminder.notes}
                  onEdit={() =>
                    setDialog({
                      mode: "edit",
                      kind: "reminder",
                      recordId: reminder.id,
                      initialValues: {
                        title: reminder.title,
                        remindAt: reminder.remindAtInput,
                        channel: reminder.channel,
                        status: reminder.status,
                        notes: reminder.notes,
                      },
                    })
                  }
                  onDelete={() =>
                    setDialog({
                      mode: "delete",
                      kind: "reminder",
                      recordId: reminder.id,
                      label: reminder.title,
                    })
                  }
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t.noReminders}</p>
            )}
          </WorkspaceCard>
        </TabsContent>

        <TabsContent value="medical">
          <ClientMedicalTab
            client={client}
            onChoose={() => setDialog({ mode: "choose" })}
            onCreate={openCreate}
            onEdit={(kind, recordId, initialValues) =>
              setDialog({ mode: "edit", kind, recordId, initialValues })
            }
            onDelete={(kind, recordId, label) =>
              setDialog({ mode: "delete", kind, recordId, label })
            }
          />
        </TabsContent>

        <TabsContent value="documents">
          {client.documents.length === 0 && client.gallery.length === 0 ? (
            <WorkspaceEmptyState
              icon={FileText}
              title={t.noDocuments}
              className="py-12"
              action={<div className="flex flex-wrap justify-center gap-2">{documentActions}</div>}
            />
          ) : (
            <div
              className={cn(
                "grid items-start gap-3",
                selectedDocument && "xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
              )}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap justify-end gap-2">{documentActions}</div>

                {client.documents.length > 0 ? (
                  <section className="overflow-hidden rounded-(--radius-card) border border-border/80 bg-white shadow-(--shadow-card)">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[#f8fafc] text-[10px] font-semibold caps-label text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2.5 text-left">{t.documentColumns.name}</th>
                            <th className="px-3 py-2.5 text-left">{t.documentColumns.category}</th>
                            <th className="px-3 py-2.5 text-left">{t.documentColumns.uploadedOn}</th>
                            <th className="px-3 py-2.5 text-right">{t.documentColumns.actions}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {client.documents.map((document) => (
                            <tr
                              key={document.id}
                              onClick={() => setSelectedDocumentId(document.id)}
                              className={cn(
                                "cursor-pointer transition-colors duration-(--duration-base) hover:bg-secondary/40",
                                selectedDocument?.id === document.id && "bg-primary/[0.04]"
                              )}
                            >
                              <td className="px-3 py-2.5">
                                <p className="font-semibold text-foreground">{document.fileName}</p>
                                {document.fileSize ? (
                                  <p className="text-xs text-muted-foreground">{document.fileSize}</p>
                                ) : null}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                                  {storedLabel(m.clients.documentCategories, document.category || document.fileType)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground">{document.createdAt}</td>
                              <td className="px-3 py-2.5">
                                <div
                                  className="flex items-center justify-end gap-1.5"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {document.fileUrl ? (
                                    <a
                                      href={document.fileUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
                                    >
                                      <Download className="size-4" />
                                      {t.open}
                                    </a>
                                  ) : null}
                                  <RecordActions
                                    onEdit={() =>
                                      setDialog({
                                        mode: "edit",
                                        kind: "document",
                                        recordId: document.id,
                                        initialValues: {
                                          fileName: document.fileName,
                                          fileType: document.category || document.fileType,
                                          notes: document.notes,
                                        },
                                      })
                                    }
                                    onDelete={() =>
                                      setDialog({
                                        mode: "delete",
                                        kind: "document",
                                        recordId: document.id,
                                        label: document.fileName,
                                      })
                                    }
                                  />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : null}

                {client.gallery.length > 0 ? (
                  <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {client.gallery.map((item) => (
                      <figure key={item.id} className="overflow-hidden rounded-(--radius-card) border border-border/80 bg-white">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt={item.caption || t.imageAlt}
                            className="aspect-[4/3] w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted/40 text-muted-foreground">
                            <ImageOff className="size-6" aria-hidden="true" />
                            <span className="sr-only">{t.imageUnavailable}</span>
                          </div>
                        )}
                        <figcaption className="flex items-start justify-between gap-2 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{item.caption || t.noNote}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{fmt(t.uploadDate, { date: item.createdAt })}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setDialog({
                                mode: "delete",
                                kind: "gallery",
                                recordId: item.id,
                                label: item.caption || t.thisImage,
                              })
                            }
                            className="mt-0.5 text-muted-foreground transition-colors duration-(--duration-base) hover:text-destructive"
                            aria-label={t.removeImage}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </figcaption>
                      </figure>
                    ))}
                  </section>
                ) : null}
              </div>

              {selectedDocument ? (
                <WorkspaceCard title={t.selectedDocument}>
                  <div className="space-y-3">
                    <div className="rounded-(--radius-card) bg-secondary/45 p-3.5">
                      <p className="font-semibold text-foreground">{selectedDocument.fileName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[
                          storedLabel(m.clients.documentCategories, selectedDocument.category || selectedDocument.fileType),
                          selectedDocument.fileSize,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <dl className="space-y-2.5">
                      <OverviewLine label={t.uploadedOn} value={selectedDocument.createdAt} />
                      <OverviewLine label={t.uploadedBy} value={selectedDocument.uploadedBy || m.clients.view.workspaceStaff} />
                    </dl>
                    {selectedDocument.fileUrl ? (
                      <a
                        href={selectedDocument.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full rounded-(--radius-card) bg-white")}
                      >
                        <Download className="size-4" />
                        {t.downloadDocument}
                      </a>
                    ) : null}
                  </div>
                </WorkspaceCard>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payments">
          {client.payments.length === 0 ? (
            <WorkspaceEmptyState
              icon={CreditCard}
              title={t.noPayments}
              className="py-12"
              action={
                <Button
                  size="sm"
                  onClick={() => setDialog({ mode: "create", kind: "payment" })}
                  className="rounded-(--radius-tile)"
                >
                  <Plus className="size-4" />
                  {t.addEntry}
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              <section className="surface-card grid gap-3 p-3.5 md:grid-cols-4">
                <PaymentMetric label={t.totalBilled} value={client.paymentStats.totalBilledDisplay} helper={plural(t.ledgerEntries, client.paymentStats.totalCount, locale)} />
                <PaymentMetric label={t.totalPaid} value={client.paymentStats.totalPaidDisplay} helper={plural(t.paidEntries, client.paymentStats.totalPaidCount, locale)} tone="good" />
                <PaymentMetric label={t.outstanding} value={client.paymentStats.unpaidBalanceDisplay} helper={t.openBalance} tone={client.paymentStats.unpaidBalanceCents > 0 ? "danger" : "default"} />
                <PaymentMetric
                  label={t.lastPayment}
                  value={latestPayment ? latestPayment.paidAt || latestPayment.createdAt : "—"}
                  helper={latestPayment?.amountDisplay ?? t.noPayments}
                />
              </section>

              <WorkspaceCard
                title={t.paymentHistory}
                action={
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={downloadPaymentStatement}
                      className="text-sm font-medium text-primary transition-colors duration-(--duration-base) hover:text-foreground"
                    >
                      {t.downloadStatement}
                    </button>
                    <Button
                      size="sm"
                      onClick={() => setDialog({ mode: "create", kind: "payment" })}
                      className="rounded-(--radius-tile)"
                    >
                      <Plus className="size-4" />
                      {t.addEntry}
                    </Button>
                  </div>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#f8fafc] text-[10px] font-semibold caps-label text-muted-foreground">
                      <tr>
                        <th className="rounded-l-(--radius-field) px-3 py-2.5 text-left">{t.paymentColumns.date}</th>
                        <th className="px-3 py-2.5 text-left">{t.paymentColumns.invoice}</th>
                        <th className="px-3 py-2.5 text-left">{t.paymentColumns.description}</th>
                        <th className="px-3 py-2.5 text-left">{t.paymentColumns.amount}</th>
                        <th className="px-3 py-2.5 text-left">{t.paymentColumns.status}</th>
                        <th className="rounded-r-(--radius-field) px-3 py-2.5 text-right">{t.paymentColumns.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {client.payments.map((payment) => (
                        <tr key={payment.id} className="transition-colors duration-(--duration-base) hover:bg-secondary/40">
                          <td className="px-3 py-2.5 font-medium text-foreground">{payment.paidAt || payment.createdAt}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{payment.invoiceNumber}</td>
                          <td className="px-3 py-2.5 text-foreground">{payment.description}</td>
                          <td className="px-3 py-2.5 text-foreground">{payment.amountDisplay}</td>
                          <td className="px-3 py-2.5"><StatusBadge status={payment.status.toLowerCase()} /></td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {payment.receiptUrl ? (
                                <a
                                  href={payment.receiptUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
                                >
                                  {t.receipt}
                                </a>
                              ) : null}
                              <RecordActions
                                onEdit={() =>
                                  setDialog({
                                    mode: "edit",
                                    kind: "payment",
                                    recordId: payment.id,
                                    initialValues: {
                                      amount: payment.amountInput,
                                      status: payment.status,
                                      paidAt: payment.paidAtInput,
                                      paymentMethod: payment.paymentMethod,
                                      invoiceNumber: payment.invoiceNumber,
                                      receiptNumber: payment.receiptNumber,
                                      description: payment.description,
                                      receiptUrl: payment.receiptUrl,
                                      billingNote: payment.billingNote,
                                    },
                                  })
                                }
                                onDelete={() =>
                                  setDialog({
                                    mode: "delete",
                                    kind: "payment",
                                    recordId: payment.id,
                                    label: fmt(t.entryLabel, { amount: payment.amountDisplay }),
                                  })
                                }
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </WorkspaceCard>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {dialog?.mode === "choose" ? (
        <RecordTypeDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
            }
          }}
          title={t.addMedicalRecord}
          description={t.chooseRecord}
          options={medicalRecordKinds.map((key) => ({ key, ...m.clients.medical.types[key] }))}
          onSelect={(key) => openCreate(key as MedicalKind)}
        />
      ) : null}

      {activeFormDialog && formDialog ? (
        <RecordFormDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
              setPendingUpload(null);
            }
          }}
          title={formDialog.mode === "edit" ? activeFormDialog.editTitle : activeFormDialog.createTitle}
          description={activeFormDialog.description}
          fields={
            formDialog.mode === "create" && activeFormDialog.createFields
              ? activeFormDialog.createFields
              : activeFormDialog.fields
          }
          initialValues={formDialog.initialValues}
          submitLabel={formDialog.mode === "edit" ? t.saveChanges : activeFormDialog.submitCreate}
          isPending={isPending}
          onSubmit={handleRecordSubmit}
        />
      ) : null}

      {dialog?.mode === "delete" ? (
        <ConfirmDeleteDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
            }
          }}
          title={t.removeTitle}
          description={fmt(t.removeDescription, { label: dialog.label })}
          isPending={isPending}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}
    </WorkspacePage>
  );
}

// An appointment status key ("no-show") or a lowercased payment status
// ("partially paid"), shown in the reader's language.
function StatusBadge({ status }: { status: string }) {
  const { m } = useI18n();
  const normalized = status.toLowerCase().replace("_", "-");
  const paymentLabels = Object.fromEntries(
    Object.entries(m.clients.paymentStatuses).map(([value, label]) => [value.toLowerCase(), label])
  );
  const label = storedLabel({ ...m.common.appointmentStatus, ...paymentLabels }, normalized);

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-[11px] font-semibold",
        (normalized === "paid" || normalized === "completed") && "bg-emerald-100 text-emerald-700",
        normalized === "confirmed" && "bg-primary/10 text-primary",
        (normalized === "cancelled" || normalized === "refunded") &&
          "bg-destructive/10 text-destructive",
        (normalized === "pending" || normalized === "partial" || normalized === "partially paid" || normalized === "unpaid") &&
          "bg-amber-100 text-amber-700",
        normalized === "no-show" && "bg-violet-100 text-violet-700",
        normalized === "scheduled" && "bg-secondary text-muted-foreground"
      )}
    >
      {label}
    </span>
  );
}

function PaymentMetric({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "default" | "good" | "danger";
}) {
  return (
    <div className="border-border/70 px-2 py-1 md:border-r md:last:border-r-0">
      <p className="text-[11px] font-semibold caps-label text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold text-foreground",
          tone === "good" && "text-emerald-700",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function HealthSummaryRow({ title, value }: { title: string; value: string }) {
  if (!value) {
    return null;
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{value}</p>
    </div>
  );
}

function OverviewLine({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }

  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

