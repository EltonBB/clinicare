"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useState, useTransition } from "react";
import {
  Archive,
  ArrowLeft,
  CalendarPlus2,
  CreditCard,
  Download,
  FileText,
  HeartPulse,
  ImagePlus,
  Images,
  Inbox,
  Mail,
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
  archiveClientAction,
} from "@/app/(workspace)/clients/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "primary" | "danger";
}) {
  return (
    <div className="rounded-[1rem] border border-border/80 bg-white/72 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold",
          tone === "primary" && "text-primary",
          tone === "danger" && "text-destructive",
          tone === "default" && "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
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
  const [isPending, startSaving] = useTransition();
  const upcomingAppointments = client.appointments.filter(
    (appointment) => appointment.status === "PENDING" || appointment.status === "CONFIRMED"
  );
  const pastAppointments = client.appointments.filter(
    (appointment) => appointment.status === "COMPLETED"
  );
  const cancelledAppointments = client.appointments.filter(
    (appointment) => appointment.status === "CANCELLED"
  );
  const firstVisit = client.appointments.at(-1)?.date ?? "No visits yet";
  const nextAppointment = upcomingAppointments[0]?.date ?? "No appointment booked";
  const lastMessage = client.messages[0]?.timestamp ?? "No messages yet";
  const latestAppointment = client.appointments[0];
  const currentMedications = client.medications.filter((medication) => medication.isActive);
  const latestPayment = client.payments[0];
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

  function archiveClient() {
    startSaving(async () => {
      const result = await archiveClientAction(client.id);

      if (!result.ok) {
        setErrorMessage(result.error ?? "We couldn't archive the client.");
        setStatusMessage("");
        return;
      }

      setClient((current) => ({ ...current, status: "archived" }));
      setErrorMessage("");
      setStatusMessage("Client archived.");
    });
  }

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/clients"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Clients
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/calendar/new?client=${client.id}`}
            className={cn(buttonVariants({ variant: "outline" }), "rounded-[0.85rem]")}
          >
            <CalendarPlus2 className="size-4" />
            Book
          </Link>
          <Link
            href={`/clients/${client.id}/edit`}
            className={cn(buttonVariants({ variant: "outline" }), "rounded-[0.85rem]")}
          >
            <UserRoundPen className="size-4" />
            Edit
          </Link>
          <Button
            variant="outline"
            className="rounded-[0.85rem]"
            onClick={archiveClient}
            disabled={isPending || client.status === "archived"}
          >
            <Archive className="size-4" />
            Archive
          </Button>
        </div>
      </div>

      <section className="section-reveal rounded-[1.2rem] border border-border/80 bg-white/78 px-5 py-5 shadow-[0_24px_52px_rgba(20,32,51,0.05)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar size="lg" className="size-14">
              <AvatarFallback>{clientInitials(client.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                  {client.name}
                </h1>
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground">
                  {statusLabels[client.status]}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{client.phone}</span>
                {client.email ? <span>{client.email}</span> : null}
                <span>Last visit: {client.lastVisit}</span>
              </div>
              {client.details.tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {client.details.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="grid min-w-[260px] gap-3 sm:grid-cols-3 lg:w-[460px]">
            <StatCard label="Visits" value={client.totalVisits} />
            <StatCard label="Completed" value={client.appointmentStats.completed} tone="primary" />
            <StatCard label="Pending" value={client.appointmentStats.pending} />
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

      <Tabs defaultValue="overview" className="section-reveal-delayed gap-5">
        <TabsList variant="line" className="flex-wrap rounded-none p-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="medical">Medical Info</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Upcoming" value={client.appointmentStats.upcoming} />
            <StatCard label="Completed" value={client.appointmentStats.completed} tone="primary" />
            <StatCard label="Cancelled" value={client.appointmentStats.cancelled} tone="danger" />
            <StatCard label="Balance" value={client.paymentStats.unpaidBalanceDisplay} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
            <h2 className="text-lg font-semibold text-foreground">Basic information</h2>
            <dl className="mt-5 space-y-3">
              <OverviewLine label="Full name" value={client.name} />
              <OverviewLine
                icon={Phone}
                label="Phone number"
                value={client.phone || "Not added"}
              />
              <OverviewLine
                icon={Mail}
                label="Email"
                value={client.email || "Not added"}
              />
              <OverviewLine label="Gender" value={client.gender} />
              <OverviewLine label="Date of birth" value={client.dateOfBirth} />
              <OverviewLine label="Address" value={client.address} />
              <OverviewLine label="Patient type" value={client.patientType} />
              <OverviewLine label="Status" value={statusLabels[client.status]} />
            </dl>
          </section>

          <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
            <h2 className="text-lg font-semibold text-foreground">Care summary</h2>
            <dl className="mt-5 space-y-3">
              <OverviewLine label="Assigned doctor / staff member" value={client.details.assignedStaff} />
              <OverviewLine label="First visit date" value={firstVisit} />
              <OverviewLine label="Last visit date" value={client.lastVisit} />
              <OverviewLine label="Next appointment" value={nextAppointment} />
              <OverviewLine label="Preferred contact" value={client.details.preferredChannel} />
              <OverviewLine label="Patient notes" value={client.notes} />
            </dl>
          </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <InfoCard
              icon={HeartPulse}
              title="Important health notes"
              value={client.medical.importantHealthNotes}
            />
            <InfoCard
              icon={HeartPulse}
              title="Allergies"
              value={client.medical.allergies}
            />
            <InfoCard
              icon={NotebookText}
              title="Treatment plan"
              value={client.medical.treatmentPlan}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
              <h2 className="text-lg font-semibold text-foreground">Latest appointment</h2>
              {latestAppointment ? (
                <div className="mt-4 rounded-[0.95rem] border border-border/80 bg-white/76 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-foreground">{latestAppointment.title}</p>
                    <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground">
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

            <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
              <h2 className="text-lg font-semibold text-foreground">Current medication</h2>
              <div className="mt-4 space-y-3">
                {currentMedications.length > 0 ? (
                  currentMedications.slice(0, 3).map((medication) => (
                    <div key={medication.id} className="rounded-[0.95rem] border border-border/80 bg-white/76 px-4 py-3">
                      <p className="font-semibold text-foreground">{medication.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {medication.dosage} - {medication.frequency}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    No active medications recorded.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
              <h2 className="text-lg font-semibold text-foreground">Payment snapshot</h2>
              <dl className="mt-4 space-y-3">
                <OverviewLine label="Payment status" value={client.paymentStats.paymentStatus} />
                <OverviewLine label="Total paid" value={client.paymentStats.totalPaidDisplay} />
                <OverviewLine label="Unpaid balance" value={client.paymentStats.unpaidBalanceDisplay} />
                <OverviewLine label="Latest payment" value={latestPayment?.amountDisplay ?? "No payments yet"} />
              </dl>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="appointments" className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Appointments</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Upcoming, past, cancelled, no-show, and appointment-note context for this patient.
              </p>
            </div>
            <Link
              href={`/calendar/new?client=${client.id}`}
              className={cn(buttonVariants({ size: "sm" }), "rounded-[0.8rem]")}
            >
              <CalendarPlus2 className="size-4" />
              Book appointment
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <StatCard label="Upcoming" value={client.appointmentStats.upcoming} />
            <StatCard label="Completed" value={client.appointmentStats.completed} tone="primary" />
            <StatCard label="Cancelled" value={client.appointmentStats.cancelled} tone="danger" />
            <StatCard label="No-shows" value={client.appointmentStats.noShows} />
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            <AppointmentList title="Upcoming appointments" entries={upcomingAppointments} emptyText="No upcoming appointments." />
            <AppointmentList title="Past appointments" entries={pastAppointments} emptyText="No completed appointments yet." />
            <AppointmentList title="Cancelled appointments" entries={cancelledAppointments} emptyText="No cancelled appointments." />
          </div>
        </TabsContent>

        <TabsContent value="medical" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <InfoCard icon={HeartPulse} title="Medical history" value={client.medical.medicalHistory} />
            <InfoCard icon={HeartPulse} title="Allergies" value={client.medical.allergies} />
            <InfoCard icon={HeartPulse} title="Important health notes" value={client.medical.importantHealthNotes} />
            <InfoCard icon={NotebookText} title="Previous treatments" value={client.medical.previousTreatments} />
            <InfoCard icon={NotebookText} title="Treatment plan" value={client.medical.treatmentPlan} />
          </div>

          <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
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

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
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

            <aside className="space-y-4">
              <section className="rounded-[1.15rem] border border-border/80 bg-primary/5 p-5">
                <h2 className="text-lg font-semibold text-foreground">Care overview</h2>
                <dl className="mt-4 space-y-3">
                  <OverviewLine label="Preferred contact" value={client.details.preferredChannel} />
                  <OverviewLine label="Assigned provider" value={client.details.assignedStaff} />
                  <OverviewLine label="Allergies" value={allergies.length ? `${allergies.length} recorded` : client.medical.allergies} />
                  <OverviewLine label="Alerts" value={alerts.length ? `${alerts.length} recorded` : client.medical.importantHealthNotes} />
                  <OverviewLine label="Care facts" value={`${careFacts.length} recorded`} />
                </dl>
              </section>

              <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
                <h2 className="text-lg font-semibold text-foreground">Follow-up reminders</h2>
                <div className="mt-4 grid gap-3">
                  <Input
                    value={reminderDraft.title}
                    onChange={(event) =>
                      setReminderDraft((current) => ({ ...current, title: event.target.value }))
                    }
                    placeholder="Reminder title"
                    className="h-11 rounded-[0.9rem] bg-white/84"
                  />
                  <Input
                    value={reminderDraft.remindAt}
                    onChange={(event) =>
                      setReminderDraft((current) => ({ ...current, remindAt: event.target.value }))
                    }
                    type="date"
                    className="h-11 rounded-[0.9rem] bg-white/84"
                  />
                  <Button
                    onClick={addFollowUpReminder}
                    disabled={isPending || !reminderDraft.title.trim() || !reminderDraft.remindAt}
                    className="h-11 rounded-[0.9rem]"
                  >
                    Add reminder
                  </Button>
                </div>
                <div className="mt-4 space-y-3">
                  {client.followUpReminders.slice(0, 4).map((reminder) => (
                    <div key={reminder.id} className="rounded-[0.9rem] border border-border/80 bg-white/78 px-3 py-3">
                      <p className="font-semibold text-foreground">{reminder.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {reminder.remindAt} - {reminder.channel} - {reminder.status}
                      </p>
                    </div>
                  ))}
                  {client.followUpReminders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No follow-up reminders yet.</p>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
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

            <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
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

        <TabsContent value="documents" className="space-y-4">
          <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
                <FileText className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Documents & images</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Use simple upload types: ID, Consent, Medical History, Report, Image / Scan, and Other.
                  PDF, image, and scan uploads are stored privately and opened with signed links.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Insurance", "Consent", "Medical History", "Report", "Image / Scan", "Invoice", "Other"].map((type) => (
                <span key={type} className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                  {type}
                </span>
              ))}
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px]">
              <Input
                value={documentDraft.fileName}
                onChange={(event) =>
                  setDocumentDraft((current) => ({ ...current, fileName: event.target.value }))
                }
                placeholder="File name"
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
              <NativeSelect
                value={documentDraft.fileType}
                options={["Insurance", "Consent", "Medical History", "Report", "Image / Scan", "Invoice", "Other"]}
                onChange={(value) =>
                  setDocumentDraft((current) => ({ ...current, fileType: value }))
                }
              />
              <Textarea
                value={documentDraft.notes}
                onChange={(event) =>
                  setDocumentDraft((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="File notes"
                className="min-h-20 rounded-[0.9rem] bg-white/84 px-3 py-3 lg:col-span-2"
              />
              <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[0.9rem] border border-border bg-white/78 px-4 text-sm font-medium text-foreground transition-colors hover:bg-white">
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="sr-only"
                  onChange={(event) => handleDocumentFile(event.target.files?.[0])}
                  disabled={isGalleryUploading}
                />
                <ImagePlus className="size-4" />
                {isGalleryUploading ? "Uploading..." : documentDraft.fileUrl ? "File ready" : "Attach PDF/image"}
              </label>
              <Button
                className="h-11 rounded-[0.9rem]"
                onClick={addDocument}
                disabled={isPending || !documentDraft.fileName.trim()}
              >
                Add document
              </Button>
            </div>
          </section>

          {client.documents.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {client.documents.map((document) => (
                <div key={document.id} className="rounded-[1rem] border border-border/80 bg-white/78 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {document.category || document.fileType}
                  </p>
                  <p className="mt-2 font-semibold text-foreground">{document.fileName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {document.fileSize} - Uploaded {document.createdAt} by {document.uploadedBy}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{document.notes}</p>
                  {document.fileUrl ? (
                    <a
                      href={document.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary"
                    >
                      <Download className="size-4" />
                      Open file
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {client.gallery.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {client.gallery.map((item) => (
                <figure key={item.id} className="overflow-hidden rounded-[1rem] border border-border/80 bg-white/78">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt={item.caption || "Client clinical image"}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <figcaption className="px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Image / Scan
                    </p>
                    <p className="text-sm font-medium text-foreground">{item.caption || "No note"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Upload date: {item.createdAt}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <EmptyPanel icon={Images} title="No images yet" text="Upload the first clinical image for this client." />
          )}
        </TabsContent>

        <TabsContent value="messages" className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
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

        <TabsContent value="payments" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <InfoCard icon={CreditCard} title="Total paid" value={client.paymentStats.totalPaidDisplay} />
            <InfoCard icon={CreditCard} title="Unpaid balance" value={client.paymentStats.unpaidBalanceDisplay} />
            <InfoCard icon={CreditCard} title="Payment status" value={client.paymentStats.paymentStatus} />
          </div>

          <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
            <h2 className="text-lg font-semibold text-foreground">Manual ledger entry</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Input
                value={paymentDraft.amount}
                onChange={(event) =>
                  setPaymentDraft((current) => ({ ...current, amount: event.target.value }))
                }
                placeholder="Amount"
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
              <NativeSelect
                value={paymentDraft.status}
                options={["Paid", "Unpaid", "Partial", "Refunded"]}
                onChange={(value) =>
                  setPaymentDraft((current) => ({ ...current, status: value }))
                }
              />
              <Input
                value={paymentDraft.invoiceNumber}
                onChange={(event) =>
                  setPaymentDraft((current) => ({
                    ...current,
                    invoiceNumber: event.target.value,
                  }))
                }
                placeholder="Invoice number"
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
              <Input
                value={paymentDraft.receiptNumber}
                onChange={(event) =>
                  setPaymentDraft((current) => ({
                    ...current,
                    receiptNumber: event.target.value,
                  }))
                }
                placeholder="Receipt number"
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
              <Input
                value={paymentDraft.description}
                onChange={(event) =>
                  setPaymentDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Description"
                className="h-11 rounded-[0.9rem] bg-white/84 md:col-span-2"
              />
              <Input
                value={paymentDraft.paymentMethod}
                onChange={(event) =>
                  setPaymentDraft((current) => ({
                    ...current,
                    paymentMethod: event.target.value,
                  }))
                }
                placeholder="Payment method"
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
              <Input
                value={paymentDraft.paidAt}
                onChange={(event) =>
                  setPaymentDraft((current) => ({ ...current, paidAt: event.target.value }))
                }
                type="date"
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
              <Textarea
                value={paymentDraft.billingNote}
                onChange={(event) =>
                  setPaymentDraft((current) => ({
                    ...current,
                    billingNote: event.target.value,
                  }))
                }
                placeholder="Billing note"
                className="min-h-20 rounded-[0.9rem] bg-white/84 px-3 py-3 md:col-span-2 xl:col-span-3"
              />
              <Button
                onClick={addPayment}
                disabled={isPending || !paymentDraft.amount.trim()}
                className="h-11 rounded-[0.9rem]"
              >
                Add ledger entry
              </Button>
            </div>
          </section>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {client.payments.length > 0 ? (
              client.payments.map((payment) => (
                <div key={payment.id} className="rounded-[0.95rem] border border-border/80 bg-white/78 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xl font-semibold text-foreground">{payment.amountDisplay}</p>
                    <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground">
                      {payment.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{payment.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Paid at: {payment.paidAt}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Invoice: {payment.invoiceNumber} - Receipt: {payment.receiptNumber}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Method: {payment.paymentMethod}
                  </p>
                  {payment.billingNote ? (
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {payment.billingNote}
                    </p>
                  ) : null}
                  {payment.appointmentId ? (
                    <p className="mt-1 text-xs text-muted-foreground">Linked to booked service</p>
                  ) : null}
                  {payment.receiptUrl ? (
                    <a
                      href={payment.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex text-sm font-semibold text-primary"
                    >
                      Open invoice / receipt
                    </a>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyPanel
                icon={CreditCard}
                title="No payments yet"
                text="Payments registered from bookings or appointment sessions will appear here as this patient's payment history."
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
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

function AppointmentList({
  title,
  entries,
  emptyText,
}: {
  title: string;
  entries: ClientRecord["appointments"];
  emptyText: string;
}) {
  return (
    <section className="rounded-[1rem] border border-border/80 bg-white/72 p-4">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <div className="mt-4 space-y-3">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <div key={entry.id} className="rounded-[0.9rem] border border-border/80 bg-white/78 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-foreground">{entry.title}</p>
                <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-foreground">
                  {entry.status.toLowerCase()}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {entry.date}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {entry.notes}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-[0.9rem] border border-dashed border-border/90 bg-white/54 px-3 py-4 text-sm text-muted-foreground">
            {emptyText}
          </p>
        )}
      </div>
    </section>
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
    <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
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
    <div className="rounded-[1rem] border border-dashed border-border/90 bg-white/54 px-5 py-8 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-[0.95rem] bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}
