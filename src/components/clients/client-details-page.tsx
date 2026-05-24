"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useState, useTransition } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Download,
  FileText,
  HeartPulse,
  ImagePlus,
  Inbox,
  Mail,
  MessageSquare,
  MoreHorizontal,
  NotebookText,
  Phone,
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
} from "@/app/(workspace)/clients/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  WorkspaceKpiCard,
  WorkspaceKpiGrid,
  WorkspaceEmptyState,
  WorkspacePage,
} from "@/components/workspace/workspace-layout";
import { uploadWorkspaceDocument } from "@/lib/media-storage-client";
import { cn } from "@/lib/utils";
import type { ClientRecord, ClientStatus } from "@/lib/clients";

type ClientDetailsPageProps = {
  initialClient: ClientRecord;
};

const statusLabels: Record<ClientStatus, string> = {
  active: "Active",
  "at-risk": "At risk",
  inactive: "Inactive",
  archived: "Archived",
};

function clientInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

function NativeSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-[0.9rem] border border-border/80 bg-white/84 px-3 text-sm outline-none transition-[border-color,background-color,box-shadow] duration-200 focus:border-ring focus:bg-white focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

export function ClientDetailsPage({ initialClient }: ClientDetailsPageProps) {
  const [client, setClient] = useState(initialClient);
  const [medicationDraft, setMedicationDraft] = useState({
    name: "",
    dosage: "",
    frequency: "",
    notes: "",
    isActive: true,
  });
  const [documentDraft, setDocumentDraft] = useState({
    fileName: "",
    fileType: "Medical",
    fileUrl: "",
    storageUrl: "",
    mimeType: "",
    fileSize: 0,
    notes: "",
  });
  const [healthDraft, setHealthDraft] = useState({
    type: "Allergy",
    label: "",
    value: "",
    severity: "",
    notes: "",
  });
  const [careNoteDraft, setCareNoteDraft] = useState({
    title: "",
    body: "",
  });
  const [treatmentDraft, setTreatmentDraft] = useState({
    title: "",
    description: "",
    status: "Pending",
    dueAt: "",
  });
  const [reminderDraft, setReminderDraft] = useState({
    title: "",
    remindAt: "",
    channel: "WhatsApp",
    status: "Scheduled",
    notes: "",
  });
  const [paymentDraft, setPaymentDraft] = useState({
    amount: "",
    status: "Paid",
    description: "",
    receiptUrl: "",
    paidAt: "",
    invoiceNumber: "",
    receiptNumber: "",
    paymentMethod: "Manual",
    billingNote: "",
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isGalleryUploading, setIsGalleryUploading] = useState(false);
  const [selectedTab, setSelectedTab] = useState("overview");
  const [isPending, startSaving] = useTransition();
  const upcomingAppointments = client.appointments.filter(
    (appointment) => appointment.status === "PENDING" || appointment.status === "CONFIRMED"
  );
  const pastAppointments = client.appointments.filter(
    (appointment) => appointment.status === "COMPLETED"
  );
  const firstVisit = client.appointments.at(-1)?.date ?? "No visits yet";
  const nextAppointment = upcomingAppointments[0]?.date ?? "No appointment booked";
  const lastMessage = client.messages[0]?.timestamp ?? "No messages yet";
  const latestAppointment = client.appointments[0];
  const currentMedications = client.medications.filter((medication) => medication.isActive);
  const latestPayment = client.payments[0];
  const totalBilledDisplay = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(client.payments.reduce((sum, payment) => sum + payment.amountCents, 0) / 100);
  const allergies = client.healthItems.filter((item) =>
    item.type.toLowerCase().includes("allerg")
  );
  const alerts = client.healthItems.filter((item) =>
    item.type.toLowerCase().includes("alert")
  );
  const careFacts = client.healthItems.filter(
    (item) => !allergies.some((allergy) => allergy.id === item.id) &&
      !alerts.some((alert) => alert.id === item.id)
  );

  function addMedication() {
    startSaving(async () => {
      const result = await addClientMedicationAction({
        clientId: client.id,
        ...medicationDraft,
      });

      if (!result.ok || !result.client) {
        setErrorMessage(result.error ?? "We couldn't add this medication.");
        setStatusMessage("");
        return;
      }

      setClient(result.client);
      setMedicationDraft({
        name: "",
        dosage: "",
        frequency: "",
        notes: "",
        isActive: true,
      });
      setErrorMessage("");
      setStatusMessage("Medication added.");
    });
  }

  function addDocument() {
    startSaving(async () => {
      const result = await addClientDocumentAction({
        clientId: client.id,
        ...documentDraft,
      });

      if (!result.ok || !result.client) {
        setErrorMessage(result.error ?? "We couldn't add this document.");
        setStatusMessage("");
        return;
      }

      setClient(result.client);
      setDocumentDraft({
        fileName: "",
        fileType: "Medical",
        fileUrl: "",
        storageUrl: "",
        mimeType: "",
        fileSize: 0,
        notes: "",
      });
      setErrorMessage("");
      setStatusMessage("Document added.");
    });
  }

  async function handleDocumentFile(file?: File) {
    if (!file) {
      return;
    }

    setIsGalleryUploading(true);

    try {
      const uploadedDocument = await uploadWorkspaceDocument(file, {
        folder: "client-documents",
        maxBytes: 10_000_000,
      });
      setDocumentDraft((current) => ({
        ...current,
        fileName: current.fileName || file.name,
        fileType: file.type === "application/pdf" ? "Document" : "Image / Scan",
        fileUrl: uploadedDocument.storageUrl,
        storageUrl: uploadedDocument.storageUrl,
        mimeType: uploadedDocument.mimeType,
        fileSize: uploadedDocument.fileSize,
      }));
      setErrorMessage("");
      setStatusMessage("File uploaded. Add it to save it to this patient.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "We couldn't upload this file.");
      setStatusMessage("");
    } finally {
      setIsGalleryUploading(false);
    }
  }

  function addHealthItem() {
    startSaving(async () => {
      const result = await addClientHealthItemAction({
        clientId: client.id,
        ...healthDraft,
      });

      if (!result.ok || !result.client) {
        setErrorMessage(result.error ?? "We couldn't add this health item.");
        setStatusMessage("");
        return;
      }

      setClient(result.client);
      setHealthDraft({
        type: "Allergy",
        label: "",
        value: "",
        severity: "",
        notes: "",
      });
      setErrorMessage("");
      setStatusMessage("Health item added.");
    });
  }

  function addCareNote() {
    startSaving(async () => {
      const result = await addClientCareNoteAction({
        clientId: client.id,
        ...careNoteDraft,
      });

      if (!result.ok || !result.client) {
        setErrorMessage(result.error ?? "We couldn't add this care note.");
        setStatusMessage("");
        return;
      }

      setClient(result.client);
      setCareNoteDraft({ title: "", body: "" });
      setErrorMessage("");
      setStatusMessage("Care note added.");
    });
  }

  function addTreatmentItem() {
    startSaving(async () => {
      const result = await addClientTreatmentPlanItemAction({
        clientId: client.id,
        ...treatmentDraft,
      });

      if (!result.ok || !result.client) {
        setErrorMessage(result.error ?? "We couldn't add this treatment item.");
        setStatusMessage("");
        return;
      }

      setClient(result.client);
      setTreatmentDraft({
        title: "",
        description: "",
        status: "Pending",
        dueAt: "",
      });
      setErrorMessage("");
      setStatusMessage("Treatment plan item added.");
    });
  }

  function addFollowUpReminder() {
    startSaving(async () => {
      const result = await addClientFollowUpReminderAction({
        clientId: client.id,
        ...reminderDraft,
      });

      if (!result.ok || !result.client) {
        setErrorMessage(result.error ?? "We couldn't add this reminder.");
        setStatusMessage("");
        return;
      }

      setClient(result.client);
      setReminderDraft({
        title: "",
        remindAt: "",
        channel: "WhatsApp",
        status: "Scheduled",
        notes: "",
      });
      setErrorMessage("");
      setStatusMessage("Follow-up reminder added.");
    });
  }

  function addPayment() {
    startSaving(async () => {
      const result = await addClientPaymentAction({
        clientId: client.id,
        ...paymentDraft,
      });

      if (!result.ok || !result.client) {
        setErrorMessage(result.error ?? "We couldn't add this payment.");
        setStatusMessage("");
        return;
      }

      setClient(result.client);
      setPaymentDraft({
        amount: "",
        status: "Paid",
        description: "",
        receiptUrl: "",
        paidAt: "",
        invoiceNumber: "",
        receiptNumber: "",
        paymentMethod: "Manual",
        billingNote: "",
      });
      setErrorMessage("");
      setStatusMessage("Payment ledger entry added.");
    });
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

  return (
    <WorkspacePage>
      <section className="space-y-4 pb-1">
        <Link
          href="/clients"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to clients
        </Link>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar className="size-20 rounded-full bg-primary/10 text-primary">
              <AvatarFallback className="bg-primary/10 text-3xl font-semibold text-primary">
                {clientInitials(client.name)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-[28px] font-semibold leading-tight tracking-tight text-foreground">
                  {client.name}
                </h1>
                <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {statusLabels[client.status]}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2 font-medium text-foreground">
                  <Phone className="size-4 text-muted-foreground" />
                  {client.phone || "Not added"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <MessageSquare className="size-4 text-emerald-500" />
                  {client.details.preferredChannel || "No preference"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Mail className="size-4 text-muted-foreground" />
                  {client.email || "Not added"}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>Last visit: {client.lastVisit}</span>
                <span className="hidden text-border sm:inline">/</span>
                <span>Preferred contact: {client.details.preferredChannel}</span>
              </div>
            </div>
          </div>

          <div className="w-full space-y-3.5 xl:w-[560px]">
            <WorkspaceKpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
              <WorkspaceKpiCard compact label="Visits" value={client.totalVisits} />
              <WorkspaceKpiCard compact label="Completed" value={client.appointmentStats.completed} tone="good" />
              <WorkspaceKpiCard compact label="Pending" value={client.appointmentStats.pending} />
              <WorkspaceKpiCard
                compact
                label="Balance"
                value={client.paymentStats.unpaidBalanceDisplay}
                tone={client.paymentStats.unpaidBalanceCents > 0 ? "danger" : "default"}
              />
            </WorkspaceKpiGrid>
            <div className="flex flex-wrap justify-end gap-3">
              <Link
                href={`/calendar/new?client=${client.id}`}
                className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-[0.65rem] px-4")}
              >
                <CalendarPlus2 className="size-4" />
                Book appointment
              </Link>
              <Link
                href={`/inbox?client=${client.id}`}
                className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-[0.65rem] px-4")}
              >
                <MessageSquare className="size-4" />
                Send message
              </Link>
              <Link
                href={`/clients/${client.id}/edit`}
                className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-[0.65rem] px-4")}
              >
                <MoreHorizontal className="size-4" />
                More actions
              </Link>
            </div>
          </div>
        </div>
      </section>

      {errorMessage ? (
        <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      {!errorMessage && statusMessage ? (
        <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
          {statusMessage}
        </div>
      ) : null}

      <Tabs
        value={selectedTab}
        onValueChange={setSelectedTab}
        className="section-reveal-delayed gap-4"
      >
        <TabsList
          variant="line"
          className="w-full justify-start gap-6 overflow-x-auto rounded-none border-b border-border/80 p-0"
        >
          <TabsTrigger className="flex-none px-0 pb-3" value="overview">Overview</TabsTrigger>
          <TabsTrigger className="flex-none px-0 pb-3" value="appointments">Appointments</TabsTrigger>
          <TabsTrigger className="flex-none px-0 pb-3" value="medical">Medical Info</TabsTrigger>
          <TabsTrigger className="flex-none px-0 pb-3" value="documents">Documents</TabsTrigger>
          <TabsTrigger className="flex-none px-0 pb-3" value="messages">Messages</TabsTrigger>
          <TabsTrigger className="flex-none px-0 pb-3" value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="surface-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="inline-flex items-center gap-3 text-base font-semibold text-foreground">
                    <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <CheckCircle2 className="size-4" />
                    </span>
                    Profile summary
                  </h2>
                  <Link
                    href={`/clients/${client.id}/edit`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-[0.65rem]")}
                  >
                    <UserRoundPen className="size-4" />
                    Edit
                  </Link>
                </div>
                <dl className="mt-5 space-y-4">
                  <OverviewLine label="Full name" value={client.name} />
                  <OverviewLine icon={Phone} label="Phone number" value={client.phone || "Not added"} />
                  <OverviewLine icon={Mail} label="Email" value={client.email || "Not added"} />
                  <OverviewLine label="Gender" value={client.gender} />
                  <OverviewLine label="Date of birth" value={client.dateOfBirth} />
                  <OverviewLine label="Address" value={client.address} />
                  <OverviewLine label="Patient type" value={client.patientType} />
                  <OverviewLine label="Status" value={statusLabels[client.status]} />
                </dl>
              </section>

              <section className="surface-card p-4">
                <h2 className="text-base font-semibold text-foreground">Care summary</h2>
                <dl className="mt-5 space-y-4">
                  <OverviewLine label="Assigned doctor / staff" value={client.details.assignedStaff} />
                  <OverviewLine label="First visit" value={firstVisit} />
                  <OverviewLine label="Last visit" value={client.lastVisit} />
                  <OverviewLine label="Next appointment" value={nextAppointment} />
                  <OverviewLine label="Preferred contact" value={client.details.preferredChannel} />
                  <OverviewLine label="Patient notes" value={client.notes} />
                </dl>
              </section>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="surface-card p-4">
                <h2 className="inline-flex items-center gap-3 text-base font-semibold text-foreground">
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CheckCircle2 className="size-4" />
                  </span>
                  Latest appointment
                </h2>
              {latestAppointment ? (
                <div className="mt-4 rounded-[0.85rem] bg-primary/5 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-foreground">{latestAppointment.title}</p>
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                      {latestAppointment.status.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{latestAppointment.date}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{latestAppointment.notes}</p>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  No appointment history yet.
                </p>
              )}
            </section>

              <section className="surface-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="inline-flex items-center gap-3 text-base font-semibold text-foreground">
                    <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <HeartPulse className="size-4" />
                    </span>
                    Health notes
                  </h2>
                  <Link
                    href={`/clients/${client.id}/edit`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-[0.65rem]")}
                  >
                    Edit
                  </Link>
                </div>
                <div className="mt-4 divide-y divide-border/70">
                  <HealthSummaryRow title="Important health notes" value={client.medical.importantHealthNotes} />
                  <HealthSummaryRow
                    title="Allergies"
                    value={allergies[0]?.label ?? client.medical.allergies}
                  />
                  <HealthSummaryRow
                    title="Current medication"
                    value={
                      currentMedications[0]
                        ? `${currentMedications[0].name} ${currentMedications[0].dosage}`.trim()
                        : "No active medications recorded."
                    }
                  />
                </div>
              </section>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <section className="surface-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="inline-flex items-center gap-3 text-base font-semibold text-foreground">
                    <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <FileText className="size-4" />
                    </span>
                    Documents
                  </h2>
                </div>
                <div className="mt-4 overflow-hidden rounded-[0.85rem] border border-border/75">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/45 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-left">Name</th>
                        <th className="px-4 py-3 text-left">Type</th>
                        <th className="px-4 py-3 text-left">Uploaded on</th>
                        <th className="px-4 py-3 text-left">Uploaded by</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70 bg-white">
                      {client.documents.slice(0, 3).map((document) => (
                        <tr key={document.id}>
                          <td className="px-4 py-3 font-medium text-foreground">{document.fileName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{document.category || document.fileType}</td>
                          <td className="px-4 py-3 text-muted-foreground">{document.createdAt}</td>
                          <td className="px-4 py-3 text-muted-foreground">{document.uploadedBy || "Workspace staff"}</td>
                        </tr>
                      ))}
                      {client.documents.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-sm text-muted-foreground">
                            No documents uploaded yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTab("documents")}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary"
                >
                  View all documents
                  <ArrowLeft className="size-4 rotate-180" />
                </button>
              </section>

              <section className="surface-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="inline-flex items-center gap-3 text-base font-semibold text-foreground">
                    <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Inbox className="size-4" />
                    </span>
                    Messages
                  </h2>
                  <Link href={`/inbox?client=${client.id}`} className="text-sm font-medium text-primary">
                    View messages
                  </Link>
                </div>
                <div className="mt-4 space-y-3">
                  {client.messages.slice(0, 3).map((message) => (
                    <div key={message.id} className="rounded-[0.85rem] border border-border/75 px-3 py-3">
                      <p className="line-clamp-2 text-sm text-foreground">{message.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{message.timestamp}</p>
                    </div>
                  ))}
                  {client.messages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No recent messages.</p>
                  ) : null}
                </div>
                <Link
                  href={`/inbox?client=${client.id}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-5 rounded-[0.65rem]")}
                >
                  <MessageSquare className="size-4" />
                  Send message
                </Link>
              </section>
            </div>
          </div>

          <aside className="grid content-start gap-3.5">
            <section className="rounded-[1rem] border border-primary/10 bg-primary/8 p-4 shadow-[0_16px_36px_rgba(20,32,51,0.04)]">
              <h2 className="inline-flex items-center gap-3 text-base font-semibold text-foreground">
                <span className="flex size-9 items-center justify-center rounded-full bg-white text-primary">
                  <CalendarDays className="size-4" />
                </span>
                Upcoming appointment
              </h2>
              {upcomingAppointments[0] ? (
                <div className="mt-5 rounded-[0.9rem] bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{upcomingAppointments[0].date}</p>
                      <p className="mt-2 font-semibold text-foreground">{upcomingAppointments[0].title}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{upcomingAppointments[0].notes}</p>
                    </div>
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                      {upcomingAppointments[0].status.toLowerCase()}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">No upcoming appointment booked.</p>
              )}
              <Link href="/calendar" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
                View in calendar
                <ArrowLeft className="size-4 rotate-180" />
              </Link>
            </section>

            <section className="surface-card p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="inline-flex items-center gap-3 text-base font-semibold text-foreground">
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ClipboardList className="size-4" />
                  </span>
                  Treatment plan
                </h2>
              </div>
              <div className="mt-4 space-y-3">
                {client.treatmentPlanItems.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 border-b border-border/70 pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.description || item.dueAt}</p>
                    </div>
                    <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                      {item.status}
                    </span>
                  </div>
                ))}
                {client.treatmentPlanItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{client.medical.treatmentPlan}</p>
                ) : null}
              </div>
            </section>

            <section className="surface-card p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="inline-flex items-center gap-3 text-base font-semibold text-foreground">
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CreditCard className="size-4" />
                  </span>
                  Payment snapshot
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedTab("payments")}
                  className="text-sm font-medium text-primary"
                >
                  View payments
                </button>
              </div>
              <dl className="mt-5 space-y-4">
                <OverviewLine label="Payment status" value={client.paymentStats.paymentStatus} />
                <OverviewLine label="Total paid" value={client.paymentStats.totalPaidDisplay} />
                <OverviewLine label="Unpaid balance" value={client.paymentStats.unpaidBalanceDisplay} />
                <OverviewLine
                  label="Latest payment"
                  value={latestPayment ? `${latestPayment.paidAt} / ${latestPayment.amountDisplay}` : "No payments yet"}
                />
              </dl>
            </section>

            <section className="surface-card p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="inline-flex items-center gap-3 text-base font-semibold text-foreground">
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <NotebookText className="size-4" />
                  </span>
                  Follow-up reminders
                </h2>
                <button type="button" onClick={() => setSelectedTab("medical")} className="text-sm font-medium text-primary">
                  Manage
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {client.followUpReminders.slice(0, 3).map((reminder) => (
                  <div key={reminder.id} className="rounded-[0.85rem] border border-border/75 px-3 py-3 text-sm">
                    <p className="font-semibold text-foreground">{reminder.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {reminder.remindAt} - {reminder.channel} - {reminder.status}
                    </p>
                  </div>
                ))}
                {client.followUpReminders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No follow-up reminders scheduled.</p>
                ) : null}
              </div>
            </section>

            <section className="surface-card p-4">
              <h2 className="inline-flex items-center gap-3 text-base font-semibold text-foreground">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FileText className="size-4" />
                </span>
                Record activity
              </h2>
              <div className="mt-4 space-y-3 text-sm">
                <SummaryRow label="Documents" value={client.documents.length} />
                <SummaryRow label="Care notes" value={client.careNotes.length} />
                <SummaryRow label="Messages" value={client.messages.length} />
                <SummaryRow label="Treatment items" value={client.treatmentPlanItems.length} />
              </div>
            </section>
          </aside>
        </TabsContent>

        <TabsContent value="appointments" className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <section className="surface-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">Upcoming appointment</h2>
                <Link
                  href="/calendar"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-[0.65rem]")}
                >
                  <CalendarDays className="size-4" />
                  View in calendar
                </Link>
              </div>
              {upcomingAppointments[0] ? (
                <div className="mt-4 grid gap-4 rounded-[0.9rem] bg-primary/5 p-4 lg:grid-cols-[96px_minmax(0,1fr)_minmax(220px,0.8fr)]">
                  <div className="flex h-20 flex-col items-center justify-center rounded-[0.75rem] bg-white text-center text-primary">
                    <span className="text-xs font-semibold uppercase">{upcomingAppointments[0].date.split(" ")[0]}</span>
                    <span className="text-2xl font-semibold text-foreground">{upcomingAppointments[0].date.match(/\d+/)?.[0] ?? ""}</span>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-lg font-semibold text-foreground">{upcomingAppointments[0].title}</p>
                      <span className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                        {upcomingAppointments[0].status.toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{upcomingAppointments[0].date}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{upcomingAppointments[0].notes || "No appointment notes."}</p>
                  </div>
                  <dl className="grid gap-3 text-sm">
                    <OverviewLine label="Provider" value={client.details.assignedStaff} />
                    <OverviewLine label="Visit type" value="In-person" />
                    <OverviewLine label="Reminder" value={client.details.preferredChannel} />
                  </dl>
                </div>
              ) : (
                <p className="mt-4 rounded-[0.9rem] border border-dashed border-border/90 p-4 text-sm text-muted-foreground">
                  No upcoming appointment booked.
                </p>
              )}
            </section>

            <section className="surface-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">Appointment history</h2>
                <Link
                  href={`/calendar/new?client=${client.id}`}
                  className={cn(buttonVariants({ size: "sm" }), "rounded-[0.65rem]")}
                >
                  <CalendarPlus2 className="size-4" />
                  Book appointment
                </Link>
              </div>
              <div className="mt-4 overflow-hidden rounded-[0.85rem] border border-border/75">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Date & time</th>
                      <th className="px-4 py-3 text-left">Appointment</th>
                      <th className="px-4 py-3 text-left">Provider</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70 bg-white">
                    {client.appointments.map((appointment) => (
                      <tr key={appointment.id}>
                        <td className="px-4 py-3 font-medium text-foreground">{appointment.date}</td>
                        <td className="px-4 py-3 text-foreground">{appointment.title}</td>
                        <td className="px-4 py-3 text-muted-foreground">{client.details.assignedStaff}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={appointment.status.toLowerCase()} />
                        </td>
                        <td className="max-w-[260px] px-4 py-3 text-muted-foreground">{appointment.notes || "-"}</td>
                      </tr>
                    ))}
                    {client.appointments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-sm text-muted-foreground">No appointment history yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="grid content-start gap-3.5">
            <section className="surface-card p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">Upcoming reminders</h2>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {client.followUpReminders.length} upcoming
                </span>
              </div>
              <div className="mt-4 grid gap-2">
                <Input
                  value={reminderDraft.title}
                  onChange={(event) =>
                    setReminderDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="Reminder title"
                  className="h-10 rounded-[0.7rem] bg-white"
                />
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <Input
                    value={reminderDraft.remindAt}
                    onChange={(event) =>
                      setReminderDraft((current) => ({ ...current, remindAt: event.target.value }))
                    }
                    type="date"
                    className="h-10 rounded-[0.7rem] bg-white"
                  />
                  <Button
                    onClick={addFollowUpReminder}
                    disabled={isPending || !reminderDraft.title.trim() || !reminderDraft.remindAt}
                    className="h-10 rounded-[0.7rem]"
                  >
                    Add
                  </Button>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {client.followUpReminders.slice(0, 3).map((reminder) => (
                  <div key={reminder.id} className="rounded-[0.8rem] border border-border/75 px-3 py-3 text-sm">
                    <p className="font-semibold text-foreground">{reminder.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{reminder.remindAt} - {reminder.channel} - {reminder.status}</p>
                  </div>
                ))}
                {client.followUpReminders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No follow-up reminders scheduled.</p>
                ) : null}
              </div>
            </section>

            <section className="surface-card p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">Recent visits</h2>
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

            <section className="surface-card p-4">
              <h2 className="text-base font-semibold text-foreground">Appointment summary</h2>
              <div className="mt-4 space-y-3 text-sm">
                <SummaryRow label="Upcoming" value={upcomingAppointments.length} />
                <SummaryRow label="Completed" value={pastAppointments.length} />
                <SummaryRow label="Cancelled" value={client.appointmentStats.cancelled} />
                <SummaryRow label="Total recorded" value={client.appointments.length} strong />
              </div>
            </section>
          </aside>
        </TabsContent>

        <TabsContent value="medical" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <InfoCard icon={HeartPulse} title="Medical history" value={client.medical.medicalHistory} />
            <InfoCard icon={HeartPulse} title="Allergies" value={client.medical.allergies} />
            <InfoCard icon={HeartPulse} title="Important health notes" value={client.medical.importantHealthNotes} />
            <InfoCard icon={NotebookText} title="Previous treatments" value={client.medical.previousTreatments} />
            <InfoCard icon={NotebookText} title="Treatment plan" value={client.medical.treatmentPlan} />
          </div>

          <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-4">
            <h2 className="text-lg font-semibold text-foreground">Current medication</h2>
            <div className="mt-4 grid gap-3 lg:grid-cols-4">
              <Input
                value={medicationDraft.name}
                onChange={(event) =>
                  setMedicationDraft((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Medication name"
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
              <Input
                value={medicationDraft.dosage}
                onChange={(event) =>
                  setMedicationDraft((current) => ({ ...current, dosage: event.target.value }))
                }
                placeholder="Dosage"
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
              <Input
                value={medicationDraft.frequency}
                onChange={(event) =>
                  setMedicationDraft((current) => ({ ...current, frequency: event.target.value }))
                }
                placeholder="Frequency"
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
              <Button
                className="h-11 rounded-[0.9rem]"
                onClick={addMedication}
                disabled={isPending || !medicationDraft.name.trim()}
              >
                Add medication
              </Button>
              <Textarea
                value={medicationDraft.notes}
                onChange={(event) =>
                  setMedicationDraft((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Medication notes"
                className="min-h-20 rounded-[0.9rem] bg-white/84 px-3 py-3 lg:col-span-4"
              />
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {client.medications.length > 0 ? (
                client.medications.map((medication) => (
                  <div key={medication.id} className="rounded-[0.95rem] border border-border/80 bg-white/78 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-foreground">{medication.name}</p>
                      <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground">
                        {medication.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">Dosage: {medication.dosage}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Frequency: {medication.frequency}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{medication.notes}</p>
                  </div>
                ))
              ) : (
                <EmptyPanel icon={NotebookText} title="No medications yet" text="Add current medication when the patient record needs it." />
              )}
            </div>
          </section>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-4">
              <h2 className="text-lg font-semibold text-foreground">Structured health record</h2>
              <div className="mt-4 grid gap-3 lg:grid-cols-[160px_minmax(0,1fr)_160px]">
                <NativeSelect
                  value={healthDraft.type}
                  options={["Allergy", "Medical alert", "Chronic condition", "Vital detail", "Care fact"]}
                  onChange={(value) =>
                    setHealthDraft((current) => ({ ...current, type: value }))
                  }
                />
                <Input
                  value={healthDraft.label}
                  onChange={(event) =>
                    setHealthDraft((current) => ({ ...current, label: event.target.value }))
                  }
                  placeholder="Label, condition, or vital"
                  className="h-11 rounded-[0.9rem] bg-white/84"
                />
                <Input
                  value={healthDraft.value}
                  onChange={(event) =>
                    setHealthDraft((current) => ({ ...current, value: event.target.value }))
                  }
                  placeholder="Value"
                  className="h-11 rounded-[0.9rem] bg-white/84"
                />
                <Input
                  value={healthDraft.severity}
                  onChange={(event) =>
                    setHealthDraft((current) => ({ ...current, severity: event.target.value }))
                  }
                  placeholder="Severity"
                  className="h-11 rounded-[0.9rem] bg-white/84"
                />
                <Input
                  value={healthDraft.notes}
                  onChange={(event) =>
                    setHealthDraft((current) => ({ ...current, notes: event.target.value }))
                  }
                  placeholder="Notes"
                  className="h-11 rounded-[0.9rem] bg-white/84"
                />
                <Button
                  onClick={addHealthItem}
                  disabled={isPending || !healthDraft.label.trim()}
                  className="h-11 rounded-[0.9rem]"
                >
                  Add health item
                </Button>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {client.healthItems.length > 0 ? (
                  client.healthItems.map((item) => (
                    <div key={item.id} className="rounded-[0.95rem] border border-border/80 bg-white/78 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {item.type}
                          </p>
                          <p className="mt-1 font-semibold text-foreground">{item.label}</p>
                        </div>
                        {item.severity ? (
                          <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground">
                            {item.severity}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {[item.value, item.notes].filter(Boolean).join(" - ") || "No extra detail."}
                      </p>
                    </div>
                  ))
                ) : (
                  <EmptyPanel icon={HeartPulse} title="No structured health items" text="Add allergies, alerts, conditions, vitals, or care facts." />
                )}
              </div>
            </section>

            <aside className="grid content-start gap-3.5">
              <section className="rounded-[1.15rem] border border-border/80 bg-primary/5 p-4">
                <h2 className="text-lg font-semibold text-foreground">Medical summary</h2>
                <dl className="mt-4 space-y-3">
                  <OverviewLine label="Allergies" value={allergies.length ? `${allergies.length} recorded` : client.medical.allergies} />
                  <OverviewLine label="Alerts" value={alerts.length ? `${alerts.length} recorded` : client.medical.importantHealthNotes} />
                  <OverviewLine label="Medications" value={`${currentMedications.length} active`} />
                  <OverviewLine label="Care facts" value={`${careFacts.length} recorded`} />
                </dl>
              </section>

              <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-4">
                <h2 className="text-lg font-semibold text-foreground">Clinical alerts</h2>
                <div className="mt-4 space-y-3">
                  {[...alerts, ...allergies].slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-[0.9rem] border border-border/80 bg-white/78 px-3 py-3">
                      <p className="font-semibold text-foreground">{item.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[item.type, item.severity, item.value].filter(Boolean).join(" - ")}
                      </p>
                    </div>
                  ))}
                  {[...alerts, ...allergies].length === 0 ? (
                    <p className="text-sm text-muted-foreground">No allergy or medical alert records yet.</p>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-4">
              <h2 className="text-lg font-semibold text-foreground">Treatment plan summary</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
                <Input
                  value={treatmentDraft.title}
                  onChange={(event) =>
                    setTreatmentDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="Plan item"
                  className="h-11 rounded-[0.9rem] bg-white/84"
                />
                <NativeSelect
                  value={treatmentDraft.status}
                  options={["Pending", "Upcoming", "Completed", "On hold"]}
                  onChange={(value) =>
                    setTreatmentDraft((current) => ({ ...current, status: value }))
                  }
                />
                <Textarea
                  value={treatmentDraft.description}
                  onChange={(event) =>
                    setTreatmentDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Plan details"
                  className="min-h-20 rounded-[0.9rem] bg-white/84 px-3 py-3"
                />
                <div className="grid gap-3">
                  <Input
                    value={treatmentDraft.dueAt}
                    onChange={(event) =>
                      setTreatmentDraft((current) => ({ ...current, dueAt: event.target.value }))
                    }
                    type="date"
                    className="h-11 rounded-[0.9rem] bg-white/84"
                  />
                  <Button
                    onClick={addTreatmentItem}
                    disabled={isPending || !treatmentDraft.title.trim()}
                    className="h-11 rounded-[0.9rem]"
                  >
                    Add item
                  </Button>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {client.treatmentPlanItems.length > 0 ? (
                  client.treatmentPlanItems.map((item) => (
                    <div key={item.id} className="rounded-[0.95rem] border border-border/80 bg-white/78 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-foreground">{item.title}</p>
                        <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground">
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description || "No details."}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Due: {item.dueAt}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No structured treatment plan items yet.</p>
                )}
              </div>
            </section>

            <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-4">
              <h2 className="text-lg font-semibold text-foreground">Notes from provider</h2>
              <div className="mt-4 grid gap-3">
                <Input
                  value={careNoteDraft.title}
                  onChange={(event) =>
                    setCareNoteDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="Note title"
                  className="h-11 rounded-[0.9rem] bg-white/84"
                />
                <Textarea
                  value={careNoteDraft.body}
                  onChange={(event) =>
                    setCareNoteDraft((current) => ({ ...current, body: event.target.value }))
                  }
                  placeholder="Write a provider note"
                  className="min-h-24 rounded-[0.9rem] bg-white/84 px-3 py-3"
                />
                <Button
                  onClick={addCareNote}
                  disabled={isPending || !careNoteDraft.body.trim()}
                  className="h-11 rounded-[0.9rem]"
                >
                  Add note
                </Button>
              </div>
              <div className="mt-5 space-y-3">
                {client.careNotes.length > 0 ? (
                  client.careNotes.map((note) => (
                    <div key={note.id} className="rounded-[0.95rem] border border-border/80 bg-white/78 px-4 py-3">
                      <p className="font-semibold text-foreground">{note.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {note.notedAt} - {note.providerName}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{note.body}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No provider notes yet.</p>
                )}
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <section className="surface-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Documents</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Manage private PDF and image records for this client.</p>
                </div>
                <label className={cn(buttonVariants({ size: "sm" }), "h-10 cursor-pointer rounded-[0.65rem]")}>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="sr-only"
                    onChange={(event) => handleDocumentFile(event.target.files?.[0])}
                    disabled={isGalleryUploading}
                  />
                  <ImagePlus className="size-4" />
                  {isGalleryUploading ? "Uploading..." : "Upload document"}
                </label>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px_auto]">
                <Input
                  value={documentDraft.fileName}
                  onChange={(event) =>
                    setDocumentDraft((current) => ({ ...current, fileName: event.target.value }))
                  }
                  placeholder="File name"
                  className="h-10 rounded-[0.7rem] bg-white"
                />
                <NativeSelect
                  value={documentDraft.fileType}
                  options={["Insurance", "Consent", "Medical History", "Report", "Image / Scan", "Invoice", "Other"]}
                  onChange={(value) =>
                    setDocumentDraft((current) => ({ ...current, fileType: value }))
                  }
                />
                <Button
                  className="h-10 rounded-[0.7rem]"
                  onClick={addDocument}
                  disabled={isPending || !documentDraft.fileName.trim()}
                >
                  Add
                </Button>
              </div>
              <Textarea
                value={documentDraft.notes}
                onChange={(event) =>
                  setDocumentDraft((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="File notes"
                className="mt-3 min-h-16 rounded-[0.7rem] bg-white px-3 py-3"
              />
            </section>

            <section className="overflow-hidden rounded-[1rem] border border-border/80 bg-white shadow-[0_16px_36px_rgba(20,32,51,0.04)]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Document name</th>
                      <th className="px-4 py-3 text-left">Category</th>
                      <th className="px-4 py-3 text-left">Uploaded on</th>
                      <th className="px-4 py-3 text-left">Uploaded by</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {client.documents.map((document) => (
                      <tr key={document.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">{document.fileName}</p>
                          <p className="text-xs text-muted-foreground">{document.fileSize}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                            {document.category || document.fileType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{document.createdAt}</td>
                        <td className="px-4 py-3 text-muted-foreground">{document.uploadedBy || "Workspace staff"}</td>
                        <td className="px-4 py-3 text-right">
                          {document.fileUrl ? (
                            <a href={document.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                              <Download className="size-4" />
                              Open
                            </a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {client.documents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-sm text-muted-foreground">No documents uploaded yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            {client.gallery.length > 0 ? (
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {client.gallery.map((item) => (
                  <figure key={item.id} className="overflow-hidden rounded-[1rem] border border-border/80 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt={item.caption || "Client clinical image"}
                      className="aspect-[4/3] w-full object-cover"
                    />
                    <figcaption className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{item.caption || "No note"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Upload date: {item.createdAt}</p>
                    </figcaption>
                  </figure>
                ))}
              </section>
            ) : null}
          </div>

          <aside className="grid content-start gap-3.5">
            <section className="surface-card p-4">
              <h2 className="text-base font-semibold text-foreground">Documents summary</h2>
              <div className="mt-4 space-y-3 text-sm">
                {["Insurance", "Consent", "Medical History", "Report", "Image / Scan", "Invoice", "Other"].map((type) => {
                  const count = client.documents.filter((document) => (document.category || document.fileType) === type).length;
                  return <SummaryRow key={type} label={type} value={count} />;
                })}
                <div className="border-t border-border/70 pt-3">
                  <SummaryRow label="Total documents" value={client.documents.length} strong />
                </div>
              </div>
            </section>

            <section className="surface-card p-4">
              <h2 className="text-base font-semibold text-foreground">Selected document</h2>
              {client.documents[0] ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-[0.85rem] border border-border/80 p-4">
                    <p className="font-semibold text-foreground">{client.documents[0].fileName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {client.documents[0].category || client.documents[0].fileType} - {client.documents[0].fileSize}
                    </p>
                  </div>
                  <OverviewLine label="Uploaded on" value={client.documents[0].createdAt} />
                  <OverviewLine label="Uploaded by" value={client.documents[0].uploadedBy || "Workspace staff"} />
                  {client.documents[0].fileUrl ? (
                    <a href={client.documents[0].fileUrl} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 w-full rounded-[0.7rem] bg-white")}>
                      <Download className="size-4" />
                      Download document
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">Upload a document to preview its metadata.</p>
              )}
            </section>
          </aside>
        </TabsContent>

        <TabsContent value="messages" className="rounded-[1.15rem] border border-border/80 bg-white/74 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Messages</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Linked WhatsApp and inbox messages for this client.
              </p>
            </div>
            <Link href={`/inbox?client=${client.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-[0.8rem]")}>
              <Inbox className="size-4" />
              Open inbox
            </Link>
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Detail label="WhatsApp number" value={client.phone || "Not added"} />
            <Detail label="Last message sent" value={lastMessage} />
            <Detail label="Reminder status" value="Uses appointment reminder settings" />
            <Detail label="Preferred contact method" value={client.details.preferredChannel} />
          </dl>
          <div className="mt-5 space-y-3">
            {client.messages.length > 0 ? (
              client.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[760px] rounded-[0.95rem] px-4 py-3 text-sm leading-6 shadow-[0_14px_28px_rgba(20,32,51,0.04)]",
                    message.sender === "business"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-white/86 text-foreground ring-1 ring-border/75"
                  )}
                >
                  <p>{message.body}</p>
                  <p
                    className={cn(
                      "mt-2 text-xs",
                      message.sender === "business"
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground"
                    )}
                  >
                    {message.timestamp}
                  </p>
                </div>
              ))
            ) : (
              <EmptyPanel icon={Inbox} title="No messages yet" text="Messages will appear here once this client has an inbox thread." />
            )}
          </div>
        </TabsContent>

        <TabsContent value="payments" className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <section className="grid gap-3 surface-card p-4 md:grid-cols-4">
              <PaymentMetric label="Total billed" value={totalBilledDisplay} helper={`${client.payments.length} ledger entries`} />
              <PaymentMetric label="Total paid" value={client.paymentStats.totalPaidDisplay} helper={`${client.payments.filter((payment) => payment.status.toLowerCase() === "paid").length} paid entries`} tone="good" />
              <PaymentMetric label="Outstanding" value={client.paymentStats.unpaidBalanceDisplay} helper="Open balance" tone={client.paymentStats.unpaidBalanceCents > 0 ? "danger" : "default"} />
              <PaymentMetric label="Last payment" value={latestPayment?.paidAt ?? "-"} helper={latestPayment?.amountDisplay ?? "No payments yet"} />
            </section>

            <section className="overflow-hidden rounded-[1rem] border border-border/80 bg-white shadow-[0_16px_36px_rgba(20,32,51,0.04)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/75 px-5 py-4">
                <h2 className="text-base font-semibold text-foreground">Invoice & payment history</h2>
                <button type="button" onClick={downloadPaymentStatement} className="text-sm font-medium text-primary">Download statement</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Invoice #</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-left">Billed</th>
                      <th className="px-4 py-3 text-left">Paid</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70 bg-white">
                    {client.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-4 py-3 font-medium text-foreground">{payment.paidAt || payment.createdAt}</td>
                        <td className="px-4 py-3 text-muted-foreground">{payment.invoiceNumber || "-"}</td>
                        <td className="px-4 py-3 text-foreground">{payment.description || "Manual ledger entry"}</td>
                        <td className="px-4 py-3 text-foreground">{payment.amountDisplay}</td>
                        <td className="px-4 py-3 text-foreground">{payment.status.toLowerCase() === "paid" ? payment.amountDisplay : "-"}</td>
                        <td className="px-4 py-3"><StatusBadge status={payment.status.toLowerCase()} /></td>
                        <td className="px-4 py-3 text-right">
                          {payment.receiptUrl ? (
                            <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary">Receipt</a>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {client.payments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-sm text-muted-foreground">No payments yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="surface-card p-4">
              <h2 className="text-base font-semibold text-foreground">Manual ledger entry</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Input value={paymentDraft.amount} onChange={(event) => setPaymentDraft((current) => ({ ...current, amount: event.target.value }))} placeholder="Amount" className="h-10 rounded-[0.7rem] bg-white" />
                <NativeSelect value={paymentDraft.status} options={["Paid", "Unpaid", "Partial", "Refunded"]} onChange={(value) => setPaymentDraft((current) => ({ ...current, status: value }))} />
                <Input value={paymentDraft.invoiceNumber} onChange={(event) => setPaymentDraft((current) => ({ ...current, invoiceNumber: event.target.value }))} placeholder="Invoice number" className="h-10 rounded-[0.7rem] bg-white" />
                <Input value={paymentDraft.receiptNumber} onChange={(event) => setPaymentDraft((current) => ({ ...current, receiptNumber: event.target.value }))} placeholder="Receipt number" className="h-10 rounded-[0.7rem] bg-white" />
                <Input value={paymentDraft.description} onChange={(event) => setPaymentDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Description" className="h-10 rounded-[0.7rem] bg-white md:col-span-2" />
                <Input value={paymentDraft.paymentMethod} onChange={(event) => setPaymentDraft((current) => ({ ...current, paymentMethod: event.target.value }))} placeholder="Payment method" className="h-10 rounded-[0.7rem] bg-white" />
                <Input value={paymentDraft.paidAt} onChange={(event) => setPaymentDraft((current) => ({ ...current, paidAt: event.target.value }))} type="date" className="h-10 rounded-[0.7rem] bg-white" />
                <Textarea value={paymentDraft.billingNote} onChange={(event) => setPaymentDraft((current) => ({ ...current, billingNote: event.target.value }))} placeholder="Billing note" className="min-h-16 rounded-[0.7rem] bg-white px-3 py-3 md:col-span-2 xl:col-span-3" />
                <Button onClick={addPayment} disabled={isPending || !paymentDraft.amount.trim()} className="h-10 rounded-[0.7rem]">Add entry</Button>
              </div>
            </section>
          </div>

          <aside className="grid content-start gap-3.5">
            <section className="surface-card p-4">
              <h2 className="text-base font-semibold text-foreground">Payment status</h2>
              <div className="mt-4 flex items-start gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="size-5" />
                </span>
                <div>
                  <p className="font-semibold text-foreground">{client.paymentStats.paymentStatus}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Current balance {client.paymentStats.unpaidBalanceDisplay}.
                  </p>
                </div>
              </div>
              <dl className="mt-5 space-y-3">
                <OverviewLine label="Current balance" value={client.paymentStats.unpaidBalanceDisplay} />
                <OverviewLine label="Status" value={client.paymentStats.paymentStatus} />
                <OverviewLine label="Ledger entries" value={client.payments.length.toString()} />
              </dl>
            </section>

            <section className="surface-card p-4">
              <h2 className="text-base font-semibold text-foreground">Billing notes</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {latestPayment?.billingNote || client.notes || "No billing notes recorded."}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Last updated: {latestPayment?.createdAt ?? "No payments yet"}
              </p>
            </section>

            <section className="surface-card p-4">
              <h2 className="text-base font-semibold text-foreground">Ledger summary</h2>
              <div className="mt-4 space-y-3 text-sm">
                <SummaryRow label="Paid entries" value={client.payments.filter((payment) => payment.status.toLowerCase() === "paid").length} />
                <SummaryRow label="Open entries" value={client.payments.filter((payment) => payment.status.toLowerCase() !== "paid").length} />
                <SummaryRow label="Receipts linked" value={client.payments.filter((payment) => Boolean(payment.receiptUrl)).length} />
                <SummaryRow label="Last update" value={latestPayment?.createdAt ?? "No payments yet"} strong />
              </div>
            </section>
          </aside>
        </TabsContent>
      </Tabs>
    </WorkspacePage>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[0.95rem] border border-border/80 bg-white/72 px-4 py-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-2 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  value: string;
}) {
  return (
    <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">{title}</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{value}</p>
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-1 text-[11px] font-semibold capitalize",
        (normalized === "paid" || normalized === "completed" || normalized === "confirmed") &&
          "bg-emerald-100 text-emerald-700",
        (normalized === "cancelled" || normalized === "refunded") &&
          "bg-destructive/10 text-destructive",
        (normalized === "pending" || normalized === "partial" || normalized === "unpaid") &&
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
  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
        <HeartPulse className="size-4" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}

function OverviewLine({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center justify-end gap-2 text-right font-medium text-foreground">
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
        <span className="min-w-0 break-words">{value}</span>
      </dd>
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  text,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <WorkspaceEmptyState compact icon={Icon} title={title} description={text} />
  );
}
