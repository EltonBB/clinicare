"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CalendarPlus2,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  HeartPulse,
  ImageOff,
  ImagePlus,
  Mail,
  MessageSquare,
  NotebookText,
  Pencil,
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
  updateClientMedicationAction,
  updateClientPaymentAction,
  updateClientTreatmentPlanItemAction,
  type ClientRecordMutationResult,
} from "@/app/(workspace)/clients/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ConfirmDeleteDialog,
  RecordFormDialog,
  type RecordField,
  type RecordFormValues,
} from "@/components/clients/record-form-dialog";
import {
  WorkspaceEmptyState,
  WorkspacePage,
} from "@/components/workspace/workspace-layout";
import { HeaderStat } from "@/components/workspace/header-stat";
import { safeUploadErrorMessage, uploadWorkspaceDocument } from "@/lib/media-storage-client";
import { cn, formatCurrency, getInitials } from "@/lib/utils";
import type {
  ClientRecord,
  ClientStatus,
  ClientTimelineEntry,
} from "@/lib/clients";

type ClientDetailsPageProps = {
  initialClient: ClientRecord;
};

const statusLabels: Record<ClientStatus, string> = {
  active: "Active",
  "at-risk": "At risk",
  inactive: "Inactive",
  archived: "Archived",
};

const statusBadgeStyles: Record<ClientStatus, string> = {
  active: "bg-emerald-100 text-emerald-700",
  "at-risk": "bg-destructive/10 text-destructive",
  inactive: "bg-secondary text-muted-foreground",
  archived: "bg-secondary text-muted-foreground",
};

const documentCategories = [
  "Insurance",
  "Consent",
  "Medical History",
  "Report",
  "Image / Scan",
  "Invoice",
  "Other",
];

type EntityKind =
  | "medication"
  | "health"
  | "treatment"
  | "note"
  | "reminder"
  | "payment"
  | "document";

type DialogState =
  | { mode: "create"; kind: EntityKind; initialValues?: RecordFormValues }
  | {
      mode: "edit";
      kind: EntityKind;
      recordId: string;
      initialValues: RecordFormValues;
    }
  | { mode: "delete"; kind: EntityKind | "gallery"; recordId: string; label: string }
  | null;

const entityDialogs: Record<
  EntityKind,
  {
    createTitle: string;
    editTitle: string;
    description: string;
    submitCreate: string;
    fields: RecordField[];
  }
> = {
  medication: {
    createTitle: "Add medication",
    editTitle: "Edit medication",
    description: "Record what this patient is currently taking.",
    submitCreate: "Add medication",
    fields: [
      { key: "name", label: "Medication name", required: true, placeholder: "Amoxicillin" },
      { key: "dosage", label: "Dosage", placeholder: "500mg" },
      { key: "frequency", label: "Frequency", placeholder: "2x daily" },
      { key: "isActive", label: "Currently active", type: "checkbox" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  health: {
    createTitle: "Add health item",
    editTitle: "Edit health item",
    description: "Allergies, alerts, conditions, vitals, or care facts.",
    submitCreate: "Add health item",
    fields: [
      {
        key: "type",
        label: "Type",
        type: "select",
        options: ["Allergy", "Medical alert", "Chronic condition", "Vital detail", "Care fact"],
      },
      { key: "label", label: "Label", required: true, placeholder: "Penicillin allergy" },
      { key: "value", label: "Value", placeholder: "Optional value" },
      { key: "severity", label: "Severity", placeholder: "High / Moderate / Low" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  treatment: {
    createTitle: "Add treatment plan item",
    editTitle: "Edit treatment plan item",
    description: "Keep the care plan structured and trackable.",
    submitCreate: "Add item",
    fields: [
      { key: "title", label: "Plan item", required: true, placeholder: "Whitening session 2" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["Pending", "Upcoming", "Completed", "On hold"],
      },
      { key: "dueAt", label: "Due date", type: "date" },
      { key: "description", label: "Details", type: "textarea" },
    ],
  },
  note: {
    createTitle: "Add provider note",
    editTitle: "Edit provider note",
    description: "Internal clinical note from the care team.",
    submitCreate: "Add note",
    fields: [
      { key: "title", label: "Title", placeholder: "Optional title" },
      { key: "body", label: "Note", type: "textarea", required: true },
    ],
  },
  reminder: {
    createTitle: "Add follow-up reminder",
    editTitle: "Edit follow-up reminder",
    description: "Schedule a follow-up touchpoint for this patient.",
    submitCreate: "Add reminder",
    fields: [
      { key: "title", label: "Reminder", required: true, placeholder: "Post-visit check-in" },
      { key: "remindAt", label: "Date", type: "date", required: true },
      {
        key: "channel",
        label: "Channel",
        type: "select",
        options: ["WhatsApp", "SMS", "Email", "Phone call"],
      },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["Scheduled", "Sent", "Completed"],
      },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  payment: {
    createTitle: "Add ledger entry",
    editTitle: "Edit ledger entry",
    description: "Record a manual payment or billing entry.",
    submitCreate: "Add entry",
    fields: [
      { key: "amount", label: "Amount", required: true, placeholder: "85.00" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: ["Paid", "Unpaid", "Partially Paid", "Refunded"],
      },
      { key: "paidAt", label: "Payment date", type: "date" },
      { key: "paymentMethod", label: "Payment method", placeholder: "Cash, card, transfer..." },
      { key: "invoiceNumber", label: "Invoice number" },
      { key: "receiptNumber", label: "Receipt number" },
      { key: "description", label: "Description", fullWidth: true, placeholder: "Whitening session" },
      { key: "receiptUrl", label: "Receipt link", fullWidth: true, placeholder: "https://..." },
      { key: "billingNote", label: "Billing note", type: "textarea" },
    ],
  },
  document: {
    createTitle: "Add document",
    editTitle: "Edit document",
    description: "Private document metadata for this patient file.",
    submitCreate: "Add document",
    fields: [
      { key: "fileName", label: "File name", required: true },
      { key: "fileType", label: "Category", type: "select", options: documentCategories },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
};

const timelineIcons: Record<ClientTimelineEntry["kind"], ComponentType<{ className?: string }>> = {
  appointment: CalendarDays,
  payment: CreditCard,
  note: NotebookText,
  document: FileText,
  message: MessageSquare,
};

function stripPlaceholder(value: string, ...placeholders: string[]) {
  return placeholders.includes(value) ? "" : value;
}

export function ClientDetailsPage({ initialClient }: ClientDetailsPageProps) {
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

  const upcomingAppointments = client.appointments.filter(
    (appointment) => appointment.status === "PENDING" || appointment.status === "CONFIRMED"
  );
  const pastAppointments = client.appointments.filter(
    (appointment) => appointment.status === "COMPLETED"
  );
  const latestPayment = client.payments[0];
  const currentMedications = client.medications.filter((medication) => medication.isActive);
  const totalBilledDisplay = formatCurrency(
    client.payments.reduce((sum, payment) => sum + payment.amountCents, 0)
  );
  const allergies = client.healthItems.filter((item) =>
    item.type.toLowerCase().includes("allerg")
  );
  const alerts = client.healthItems.filter((item) =>
    item.type.toLowerCase().includes("alert")
  );
  const clinicalAlerts = [...alerts, ...allergies];
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
        setErrorMessage(result.error ?? "We couldn't save this change.");
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
    if (!dialog || dialog.mode === "delete") {
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
          editId ? "Medication updated." : "Medication added."
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
          editId ? "Health item updated." : "Health item added."
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
          editId ? "Treatment plan item updated." : "Treatment plan item added."
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
          editId ? "Provider note updated." : "Provider note added."
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
          editId ? "Reminder updated." : "Follow-up reminder added."
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
          editId ? "Ledger entry updated." : "Payment ledger entry added."
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
            "Document updated."
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
            "Document added."
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
      EntityKind | "gallery",
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

    runMutation(() => deleteActions[dialog.kind](payload), "Record removed.");
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
      setErrorMessage(safeUploadErrorMessage(error, "We couldn't upload this file."));
      setStatusMessage("");
    } finally {
      setIsUploading(false);
    }
  }

  function downloadPaymentStatement() {
    const rows = [
      ["Date", "Invoice", "Description", "Amount", "Status", "Payment method", "Receipt"],
      ...client.payments.map((payment) => [
        payment.paidAt || payment.createdAt,
        payment.invoiceNumber || "",
        payment.description || "Manual ledger entry",
        payment.amountDisplay,
        payment.status,
        payment.paymentMethod || "Manual",
        payment.receiptNumber || "",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${client.name.replaceAll(" ", "-").toLowerCase()}-payment-statement.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const activeFormDialog =
    dialog && dialog.mode !== "delete" ? entityDialogs[dialog.kind] : null;

  return (
    <WorkspacePage>
      <section className="section-reveal space-y-3.5 pb-1">
        <Link
          href="/clients"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to clients
        </Link>

        <div className="flex flex-col gap-3.5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <Avatar shape="square" className="size-20">
              <AvatarFallback className="bg-white text-3xl font-semibold text-primary">
                {getInitials(client.name)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 pt-1">
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
                  {statusLabels[client.status]}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {client.phone ? (
                  <span className="inline-flex items-center gap-2 font-medium text-foreground">
                    <Phone className="size-4 text-muted-foreground" />
                    {client.phone}
                  </span>
                ) : null}
                {client.email ? (
                  <span className="inline-flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" />
                    {client.email}
                  </span>
                ) : null}
                {!client.phone && !client.email ? (
                  <span>No contact details yet</span>
                ) : null}
                {client.details.preferredChannel ? (
                  <span className="inline-flex items-center gap-2">
                    <MessageSquare className="size-4 text-muted-foreground" />
                    Prefers {client.details.preferredChannel}
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-sm text-muted-foreground">
                Last visit: {client.lastVisit}
              </p>
            </div>
          </div>

          <div className="w-full space-y-3 xl:w-[560px]">
            <div className="surface-card stagger-children grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-border/70">
              <HeaderStat label="Visits" value={client.totalVisits.toString()} />
              <HeaderStat
                label="Completed"
                value={client.appointmentStats.completed.toString()}
                tone="good"
              />
              <HeaderStat label="Pending" value={client.appointmentStats.pending.toString()} />
              <HeaderStat
                label="Balance"
                value={client.paymentStats.unpaidBalanceDisplay}
                tone={client.paymentStats.unpaidBalanceCents > 0 ? "danger" : "default"}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2.5">
              <Link
                href={`/calendar/new?client=${client.id}`}
                className={cn(buttonVariants({ variant: "solid" }), "h-10 rounded-(--radius-tile) px-4")}
              >
                <CalendarPlus2 className="size-4" />
                Book appointment
              </Link>
              <Link
                href={`/inbox?client=${client.id}`}
                className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-(--radius-tile) px-4")}
              >
                <MessageSquare className="size-4" />
                Send message
              </Link>
              <Link
                href={`/clients/${client.id}/edit`}
                className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-(--radius-tile) px-4")}
              >
                <UserRoundPen className="size-4" />
                Edit profile
              </Link>
            </div>
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
          <TabsTrigger className="flex-none px-0 pb-3" value="overview">Overview</TabsTrigger>
          <TabsTrigger className="flex-none px-0 pb-3" value="appointments">Appointments</TabsTrigger>
          <TabsTrigger className="flex-none px-0 pb-3" value="medical">Medical Info</TabsTrigger>
          <TabsTrigger className="flex-none px-0 pb-3" value="documents">Documents</TabsTrigger>
          <TabsTrigger className="flex-none px-0 pb-3" value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid items-start gap-3.5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside>
            <section className="surface-card flex flex-col p-3.5 xl:sticky xl:top-[76px]">
              <div className="flex items-center gap-3">
                <Avatar size="lg" shape="square">
                  <AvatarFallback className="bg-white text-xs font-semibold text-primary">
                    {getInitials(client.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-foreground">{client.name}</h2>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                    {statusLabels[client.status]}
                  </p>
                </div>
              </div>
              <dl className="mt-4 space-y-2.5">
                <OverviewLine label="Phone" value={client.phone} />
                <OverviewLine label="Email" value={client.email} />
                <OverviewLine label="Patient type" value={client.patientType} />
                <OverviewLine label="Date of birth" value={client.dateOfBirth} />
                <OverviewLine label="Preferred contact" value={client.details.preferredChannel} />
              </dl>
              {client.notes ? (
                <div className="mt-3 border-t border-border/70 pt-3">
                  <p className="text-sm text-muted-foreground">Patient notes</p>
                  <p className="mt-1 text-sm leading-5 text-foreground">{client.notes}</p>
                </div>
              ) : null}
              <Link
                href={`/clients/${client.id}/edit`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 w-full rounded-(--radius-tile) bg-white")}
              >
                <UserRoundPen className="size-4" />
                Edit profile
              </Link>

              <div className="mt-5 border-t border-border/70 pt-4">
                <SidebarSectionHeader icon={CalendarDays} title="Upcoming appointment" />
                {upcomingAppointments[0] ? (
                  <div className="mt-3 rounded-(--radius-card) bg-primary/7 px-3.5 py-3">
                    <div className="flex items-start justify-between gap-3.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{upcomingAppointments[0].date}</p>
                        <p className="mt-1.5 font-semibold text-foreground">{upcomingAppointments[0].title}</p>
                        {upcomingAppointments[0].notes ? (
                          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                            {upcomingAppointments[0].notes}
                          </p>
                        ) : null}
                      </div>
                      <StatusBadge status={upcomingAppointments[0].status} />
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No upcoming appointment booked.</p>
                )}
                <Link
                  href="/calendar"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors duration-(--duration-base) hover:text-foreground"
                >
                  View in calendar
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            </section>
          </aside>

          <div className="grid gap-3">
            <div className="stagger-children grid auto-rows-fr gap-3 lg:grid-cols-2">
              <section className="surface-card flex h-full flex-col p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[15px] font-semibold leading-5 text-foreground">Payment snapshot</h2>
                  <button
                    type="button"
                    onClick={() => setSelectedTab("payments")}
                    className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
                  >
                    View payments
                  </button>
                </div>
                <dl className="mt-3.5 space-y-2.5">
                  <OverviewLine label="Total paid" value={client.paymentStats.totalPaidDisplay} />
                  <OverviewLine label="Unpaid balance" value={client.paymentStats.unpaidBalanceDisplay} />
                  <OverviewLine
                    label="Latest payment"
                    value={
                      latestPayment
                        ? `${latestPayment.paidAt || latestPayment.createdAt} · ${latestPayment.amountDisplay}`
                        : ""
                    }
                  />
                </dl>
              </section>

              <section className="surface-card flex h-full flex-col p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[15px] font-semibold leading-5 text-foreground">Health notes</h2>
                  <button
                    type="button"
                    onClick={() => setSelectedTab("medical")}
                    className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
                  >
                    View medical info
                  </button>
                </div>
                {client.medical.importantHealthNotes || currentMedications[0] ? (
                  <div className="mt-2 divide-y divide-border/70">
                    <HealthSummaryRow
                      title="Important health notes"
                      value={client.medical.importantHealthNotes}
                    />
                    <HealthSummaryRow
                      title="Current medication"
                      value={
                        currentMedications[0]
                          ? `${currentMedications[0].name} ${currentMedications[0].dosage}`.trim()
                          : ""
                      }
                    />
                  </div>
                ) : (
                  <p className="mt-3.5 text-sm leading-6 text-muted-foreground">
                    No health notes recorded yet.
                  </p>
                )}
              </section>
            </div>

            <section className="section-reveal-delayed surface-card p-3.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold leading-5 text-foreground">Recent activity</h2>
                <Link
                  href={`/inbox?client=${client.id}`}
                  className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
                >
                  Open inbox
                </Link>
              </div>
              {client.timeline.length > 0 ? (
                <div className="mt-2 divide-y divide-border/65">
                  {client.timeline.map((entry) => {
                    const Icon = timelineIcons[entry.kind];

                    return (
                      <div key={entry.id} className="flex items-start gap-3 py-2.5">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-(--radius-tile) border border-border/80 bg-white text-primary">
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {entry.title}
                            </p>
                            <span className="shrink-0 text-xs text-muted-foreground">{entry.date}</span>
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {entry.detail}
                          </p>
                        </div>
                        {entry.status ? <StatusBadge status={entry.status} /> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3">
                  <WorkspaceEmptyState
                    icon={CalendarDays}
                    title="No activity yet"
                    description="Appointments, payments, notes, documents, and messages will appear here."
                    compact
                  />
                </div>
              )}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="appointments" className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="space-y-3.5">
            <section className="surface-card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold leading-5 text-foreground">Upcoming appointment</h2>
                <Link
                  href="/calendar"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-(--radius-tile)")}
                >
                  <CalendarDays className="size-4" />
                  View in calendar
                </Link>
              </div>
              {upcomingAppointments[0] ? (
                <div className="mt-3 grid gap-3 rounded-(--radius-card) bg-primary/5 p-3.5 lg:grid-cols-[88px_minmax(0,1fr)]">
                  <div className="flex h-20 flex-col items-center justify-center rounded-(--radius-card) bg-white text-center text-primary">
                    <span className="text-xs font-semibold uppercase">{upcomingAppointments[0].date.split(" ")[0]}</span>
                    <span className="text-2xl font-semibold text-foreground">{upcomingAppointments[0].date.match(/\d+/)?.[0] ?? ""}</span>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-lg font-semibold text-foreground">{upcomingAppointments[0].title}</p>
                      <StatusBadge status={upcomingAppointments[0].status} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{upcomingAppointments[0].date}</p>
                    {upcomingAppointments[0].notes ? (
                      <p className="mt-2 text-sm text-muted-foreground">{upcomingAppointments[0].notes}</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="mt-4 rounded-(--radius-card) border border-dashed border-border/90 p-3.5 text-sm text-muted-foreground">
                  No upcoming appointment booked.
                </p>
              )}
            </section>

            <section className="surface-card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold leading-5 text-foreground">Appointment history</h2>
                <Link
                  href={`/calendar/new?client=${client.id}`}
                  className={cn(buttonVariants({ size: "sm" }), "rounded-(--radius-tile)")}
                >
                  <CalendarPlus2 className="size-4" />
                  Book appointment
                </Link>
              </div>
              <div className="mt-4 overflow-hidden rounded-(--radius-field) border border-border/75">
                <table className="w-full text-sm">
                  <thead className="bg-[#f8fafc] text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 text-left">Date & time</th>
                      <th className="px-3 py-2.5 text-left">Appointment</th>
                      <th className="px-3 py-2.5 text-left">Status</th>
                      <th className="px-3 py-2.5 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70 bg-white">
                    {client.appointments.map((appointment) => (
                      <tr key={appointment.id} className="transition-colors duration-(--duration-base) hover:bg-[#f7f9fc]">
                        <td className="px-3 py-2.5 font-medium text-foreground">{appointment.date}</td>
                        <td className="px-3 py-2.5 text-foreground">{appointment.title}</td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={appointment.status.toLowerCase()} />
                        </td>
                        <td className="max-w-[320px] px-3 py-2.5 text-muted-foreground">{appointment.notes || "-"}</td>
                      </tr>
                    ))}
                    {client.appointments.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-sm text-muted-foreground">No appointment history yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="grid content-start gap-3">
            <section className="surface-card p-3.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold leading-5 text-foreground">Follow-up reminders</h2>
                <Button
                  size="sm"
                  onClick={() => setDialog({ mode: "create", kind: "reminder" })}
                  className="rounded-(--radius-tile)"
                >
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
              {client.followUpReminders.length > 0 ? (
                <div className="mt-1.5 divide-y divide-border/65">
                  {client.followUpReminders.map((reminder) => (
                    <RecordRow
                      key={reminder.id}
                      title={reminder.title}
                      meta={[reminder.remindAt, reminder.channel, reminder.status]
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
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No follow-up reminders scheduled.</p>
              )}
            </section>

            <section className="surface-card p-3.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold leading-5 text-foreground">Recent visits</h2>
                <span className="text-sm font-medium text-primary">{pastAppointments.length}</span>
              </div>
              <div className="mt-4 space-y-3">
                {pastAppointments.slice(0, 4).map((appointment) => (
                  <div key={appointment.id} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-semibold text-foreground">{appointment.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{appointment.date}</p>
                    </div>
                    <StatusBadge status={appointment.status.toLowerCase()} />
                  </div>
                ))}
                {pastAppointments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No completed visits yet.</p>
                ) : null}
              </div>
            </section>
          </aside>
        </TabsContent>

        <TabsContent value="medical" className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="space-y-3.5">
            <section className="surface-card p-3.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold leading-5 text-foreground">Medications</h2>
                <Button
                  size="sm"
                  onClick={() => setDialog({ mode: "create", kind: "medication" })}
                  className="rounded-(--radius-tile)"
                >
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
              {client.medications.length > 0 ? (
                <div className="mt-1.5 divide-y divide-border/65">
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
                        setDialog({
                          mode: "edit",
                          kind: "medication",
                          recordId: medication.id,
                          initialValues: {
                            name: medication.name,
                            dosage: medication.dosage,
                            frequency: medication.frequency,
                            notes: medication.notes,
                            isActive: medication.isActive,
                          },
                        })
                      }
                      onDelete={() =>
                        setDialog({
                          mode: "delete",
                          kind: "medication",
                          recordId: medication.id,
                          label: medication.name,
                        })
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No medications recorded.</p>
              )}
            </section>

            <section className="surface-card p-3.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold leading-5 text-foreground">Health record</h2>
                <Button
                  size="sm"
                  onClick={() => setDialog({ mode: "create", kind: "health" })}
                  className="rounded-(--radius-tile)"
                >
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
              {client.healthItems.length > 0 ? (
                <div className="mt-1.5 divide-y divide-border/65">
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
                        setDialog({
                          mode: "edit",
                          kind: "health",
                          recordId: item.id,
                          initialValues: {
                            type: item.type,
                            label: item.label,
                            value: item.value,
                            severity: item.severity,
                            notes: item.notes,
                          },
                        })
                      }
                      onDelete={() =>
                        setDialog({
                          mode: "delete",
                          kind: "health",
                          recordId: item.id,
                          label: item.label,
                        })
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No allergies, alerts, conditions, or vitals recorded.
                </p>
              )}
            </section>

            <section className="surface-card p-3.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold leading-5 text-foreground">Treatment plan</h2>
                <Button
                  size="sm"
                  onClick={() => setDialog({ mode: "create", kind: "treatment" })}
                  className="rounded-(--radius-tile)"
                >
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
              {client.treatmentPlanItems.length > 0 ? (
                <div className="mt-1.5 divide-y divide-border/65">
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
                        setDialog({
                          mode: "edit",
                          kind: "treatment",
                          recordId: item.id,
                          initialValues: {
                            title: item.title,
                            status: item.status,
                            dueAt: item.dueAtInput,
                            description: item.description,
                          },
                        })
                      }
                      onDelete={() =>
                        setDialog({
                          mode: "delete",
                          kind: "treatment",
                          recordId: item.id,
                          label: item.title,
                        })
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No treatment plan items yet.</p>
              )}
            </section>

            <section className="surface-card p-3.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold leading-5 text-foreground">Provider notes</h2>
                <Button
                  size="sm"
                  onClick={() => setDialog({ mode: "create", kind: "note" })}
                  className="rounded-(--radius-tile)"
                >
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
              {client.careNotes.length > 0 ? (
                <div className="mt-1.5 divide-y divide-border/65">
                  {client.careNotes.map((note) => (
                    <RecordRow
                      key={note.id}
                      title={note.title}
                      meta={`${note.notedAt} · ${note.providerName}`}
                      body={note.body}
                      onEdit={() =>
                        setDialog({
                          mode: "edit",
                          kind: "note",
                          recordId: note.id,
                          initialValues: {
                            title: stripPlaceholder(note.title, "Provider note"),
                            body: note.body,
                          },
                        })
                      }
                      onDelete={() =>
                        setDialog({
                          mode: "delete",
                          kind: "note",
                          recordId: note.id,
                          label: note.title,
                        })
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No provider notes yet.</p>
              )}
            </section>
          </div>

          <aside className="grid content-start gap-3">
            <section className="surface-card p-3.5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold leading-5 text-foreground">Health summary</h2>
                <Link
                  href={`/clients/${client.id}/edit`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-(--radius-tile)")}
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Link>
              </div>

              {clinicalAlerts.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {clinicalAlerts.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-2.5 rounded-(--radius-card) border border-destructive/15 bg-destructive/[0.04] px-3 py-2.5"
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{item.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[item.type, item.severity, item.value].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {(
                [
                  { label: "Medical history", value: client.medical.medicalHistory },
                  { label: "Allergies", value: client.medical.allergies },
                  { label: "Important health notes", value: client.medical.importantHealthNotes },
                  { label: "Treatment plan", value: client.medical.treatmentPlan },
                ].filter((field) => field.value)
              ).length > 0 ? (
                <div className="mt-3 divide-y divide-border/65">
                  {[
                    { label: "Medical history", value: client.medical.medicalHistory },
                    { label: "Allergies", value: client.medical.allergies },
                    { label: "Important health notes", value: client.medical.importantHealthNotes },
                    { label: "Treatment plan", value: client.medical.treatmentPlan },
                  ]
                    .filter((field) => field.value)
                    .map((field) => (
                      <div key={field.label} className="py-2.5 first:pt-1.5 last:pb-0">
                        <p className="text-sm font-semibold text-foreground">{field.label}</p>
                        <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{field.value}</p>
                      </div>
                    ))}
                </div>
              ) : clinicalAlerts.length === 0 ? (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  No health background recorded yet. Use Edit to add medical history, allergies, or
                  notes.
                </p>
              ) : null}
            </section>
          </aside>
        </TabsContent>

        <TabsContent value="documents" className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="space-y-3.5">
            <section className="surface-card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold leading-5 text-foreground">Documents</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Manage private PDF and image records for this client.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDialog({ mode: "create", kind: "document" })}
                    className="rounded-(--radius-tile)"
                  >
                    <Plus className="size-4" />
                    Add manually
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
                    {isUploading ? "Uploading..." : "Upload document"}
                  </label>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-(--radius-card) border border-border/80 bg-white shadow-(--shadow-card)">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#f8fafc] text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 text-left">Document name</th>
                      <th className="px-3 py-2.5 text-left">Category</th>
                      <th className="px-3 py-2.5 text-left">Uploaded on</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {client.documents.map((document) => (
                      <tr
                        key={document.id}
                        onClick={() => setSelectedDocumentId(document.id)}
                        className={cn(
                          "cursor-pointer transition-colors duration-(--duration-base) hover:bg-[#f7f9fc]",
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
                            {document.category || document.fileType}
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
                                Open
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
                                    notes: stripPlaceholder(document.notes, "No notes."),
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
                    {client.documents.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-sm text-muted-foreground">No documents uploaded yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            {client.gallery.length > 0 ? (
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {client.gallery.map((item) => (
                  <figure key={item.id} className="overflow-hidden rounded-(--radius-card) border border-border/80 bg-white">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.caption || "Client clinical image"}
                        className="aspect-[4/3] w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted/40 text-muted-foreground">
                        <ImageOff className="size-6" aria-hidden="true" />
                        <span className="sr-only">Image unavailable</span>
                      </div>
                    )}
                    <figcaption className="flex items-start justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{item.caption || "No note"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Upload date: {item.createdAt}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDialog({
                            mode: "delete",
                            kind: "gallery",
                            recordId: item.id,
                            label: item.caption || "this image",
                          })
                        }
                        className="mt-0.5 text-muted-foreground transition-colors duration-(--duration-base) hover:text-destructive"
                        aria-label="Remove image"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </section>
            ) : null}
          </div>

          <aside className="grid content-start gap-3">
            <section className="surface-card p-3.5">
              <h2 className="text-[15px] font-semibold leading-5 text-foreground">Selected document</h2>
              {selectedDocument ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-(--radius-field) border border-border/80 p-3.5">
                    <p className="font-semibold text-foreground">{selectedDocument.fileName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[selectedDocument.category || selectedDocument.fileType, selectedDocument.fileSize]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <OverviewLine label="Uploaded on" value={selectedDocument.createdAt} />
                  <OverviewLine label="Uploaded by" value={selectedDocument.uploadedBy || "Workspace staff"} />
                  {selectedDocument.fileUrl ? (
                    <a href={selectedDocument.fileUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 w-full rounded-(--radius-card) bg-white")}>
                      <Download className="size-4" />
                      Download document
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">Upload a document to preview its metadata.</p>
              )}
            </section>

            <section className="surface-card p-3.5">
              <h2 className="text-[15px] font-semibold leading-5 text-foreground">Documents summary</h2>
              <div className="mt-4 space-y-3 text-sm">
                {documentCategories
                  .map((type) => ({
                    type,
                    count: client.documents.filter(
                      (document) => (document.category || document.fileType) === type
                    ).length,
                  }))
                  .filter((entry) => entry.count > 0)
                  .map((entry) => (
                    <SummaryRow key={entry.type} label={entry.type} value={entry.count} />
                  ))}
                <div className="border-t border-border/70 pt-3 first:border-t-0 first:pt-0">
                  <SummaryRow label="Total documents" value={client.documents.length} strong />
                </div>
              </div>
            </section>
          </aside>
        </TabsContent>

        <TabsContent value="payments" className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="space-y-3.5">
            <section className="grid gap-3 surface-card p-3.5 md:grid-cols-4">
              <PaymentMetric label="Total billed" value={totalBilledDisplay} helper={`${client.payments.length} ledger entries`} />
              <PaymentMetric label="Total paid" value={client.paymentStats.totalPaidDisplay} helper={`${client.payments.filter((payment) => payment.status.toLowerCase() === "paid").length} paid entries`} tone="good" />
              <PaymentMetric label="Outstanding" value={client.paymentStats.unpaidBalanceDisplay} helper="Open balance" tone={client.paymentStats.unpaidBalanceCents > 0 ? "danger" : "default"} />
              <PaymentMetric
                label="Last payment"
                value={latestPayment ? latestPayment.paidAt || latestPayment.createdAt : "—"}
                helper={latestPayment?.amountDisplay ?? "No payments yet"}
              />
            </section>

            <section className="overflow-hidden rounded-(--radius-card) border border-border/80 bg-white shadow-(--shadow-card)">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/75 px-3.5 py-3">
                <h2 className="text-[15px] font-semibold leading-5 text-foreground">Invoice & payment history</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={downloadPaymentStatement}
                    className="text-sm font-medium text-primary transition-colors duration-(--duration-base) hover:text-foreground"
                  >
                    Download statement
                  </button>
                  <Button
                    size="sm"
                    onClick={() => setDialog({ mode: "create", kind: "payment" })}
                    className="rounded-(--radius-tile)"
                  >
                    <Plus className="size-4" />
                    Add entry
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#f8fafc] text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 text-left">Date</th>
                      <th className="px-3 py-2.5 text-left">Invoice #</th>
                      <th className="px-3 py-2.5 text-left">Description</th>
                      <th className="px-3 py-2.5 text-left">Amount</th>
                      <th className="px-3 py-2.5 text-left">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70 bg-white">
                    {client.payments.map((payment) => (
                      <tr key={payment.id} className="transition-colors duration-(--duration-base) hover:bg-[#f7f9fc]">
                        <td className="px-3 py-2.5 font-medium text-foreground">{payment.paidAt || payment.createdAt}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{payment.invoiceNumber || "-"}</td>
                        <td className="px-3 py-2.5 text-foreground">{payment.description || "—"}</td>
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
                                Receipt
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
                                    paymentMethod: stripPlaceholder(payment.paymentMethod, "Manual entry"),
                                    invoiceNumber: payment.invoiceNumber,
                                    receiptNumber: payment.receiptNumber,
                                    description: stripPlaceholder(payment.description, "Payment record"),
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
                                  label: `${payment.amountDisplay} entry`,
                                })
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {client.payments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-sm text-muted-foreground">No payments yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="grid content-start gap-3">
            <section className="surface-card p-3.5">
              <h2 className="text-[15px] font-semibold leading-5 text-foreground">Payment status</h2>
              <div className="mt-4 flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-(--radius-tile)",
                    client.paymentStats.unpaidBalanceCents > 0
                      ? "bg-amber-50 text-amber-600"
                      : "bg-emerald-100 text-emerald-600"
                  )}
                >
                  {client.paymentStats.unpaidBalanceCents > 0 ? (
                    <AlertCircle className="size-5" />
                  ) : (
                    <CheckCircle2 className="size-5" />
                  )}
                </span>
                <div>
                  <p className="font-semibold text-foreground">{client.paymentStats.paymentStatus}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Current balance {client.paymentStats.unpaidBalanceDisplay}.
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-3 border-t border-border/70 pt-4 text-sm">
                <SummaryRow label="Paid entries" value={client.payments.filter((payment) => payment.status.toLowerCase() === "paid").length} />
                <SummaryRow label="Open entries" value={client.payments.filter((payment) => payment.status.toLowerCase() !== "paid").length} />
                <SummaryRow label="Receipts linked" value={client.payments.filter((payment) => Boolean(payment.receiptUrl)).length} />
                <SummaryRow label="Last update" value={latestPayment?.createdAt ?? "No payments yet"} strong />
              </div>
            </section>

            {latestPayment?.billingNote ? (
              <section className="surface-card p-3.5">
                <h2 className="text-[15px] font-semibold leading-5 text-foreground">Billing notes</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{latestPayment.billingNote}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Last updated: {latestPayment.createdAt}
                </p>
              </section>
            ) : null}
          </aside>
        </TabsContent>
      </Tabs>

      {activeFormDialog && dialog && dialog.mode !== "delete" ? (
        <RecordFormDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDialog(null);
              setPendingUpload(null);
            }
          }}
          title={dialog.mode === "edit" ? activeFormDialog.editTitle : activeFormDialog.createTitle}
          description={activeFormDialog.description}
          fields={activeFormDialog.fields}
          initialValues={dialog.initialValues}
          submitLabel={dialog.mode === "edit" ? "Save changes" : activeFormDialog.submitCreate}
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
          title="Remove this record?"
          description={`"${dialog.label}" will be permanently removed from this patient file.`}
          isPending={isPending}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}
    </WorkspacePage>
  );
}

function RecordRow({
  title,
  badge,
  meta,
  body,
  onEdit,
  onDelete,
}: {
  title: string;
  badge?: ReactNode;
  meta?: string;
  body?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {badge}
        </div>
        {meta ? <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p> : null}
        {body ? (
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{body}</p>
        ) : null}
      </div>
      <RecordActions onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

function RecordActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit record"
        className="flex size-7 items-center justify-center rounded-(--radius-tile) text-muted-foreground transition-colors duration-(--duration-base) hover:bg-secondary/60 hover:text-foreground"
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete record"
        className="flex size-7 items-center justify-center rounded-(--radius-tile) text-muted-foreground transition-colors duration-(--duration-base) hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-[11px] font-semibold capitalize",
        (normalized === "paid" || normalized === "completed" || normalized === "confirmed") &&
          "bg-emerald-100 text-emerald-700",
        (normalized === "cancelled" || normalized === "refunded") &&
          "bg-destructive/10 text-destructive",
        (normalized === "pending" || normalized === "partial" || normalized === "partially paid" || normalized === "unpaid") &&
          "bg-primary/10 text-primary",
        normalized === "scheduled" && "bg-secondary text-muted-foreground"
      )}
    >
      {normalized}
    </span>
  );
}

function SummaryRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: number | string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("text-muted-foreground", strong && "font-semibold text-foreground")}>
        {label}
      </span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
    <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex size-9 items-center justify-center rounded-(--radius-tile) border border-border/80 bg-white text-primary">
        <HeartPulse className="size-4" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

function SidebarSectionHeader({
  icon: Icon,
  title,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <h2 className="inline-flex items-center gap-3 text-[15px] font-semibold leading-5 text-foreground">
      <span className="flex size-8 items-center justify-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
        <Icon className="size-4" />
      </span>
      {title}
    </h2>
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

