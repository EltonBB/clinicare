"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentType } from "react";
import { useState, useTransition } from "react";
import {
  Archive,
  ArrowLeft,
  CalendarPlus2,
  FileText,
  ImagePlus,
  Images,
  Inbox,
  Mail,
  NotebookText,
  Phone,
  UserRoundPen,
} from "lucide-react";

import {
  addClientGalleryItemAction,
  archiveClientAction,
  deleteClientAction,
  saveClientAction,
} from "@/app/(workspace)/clients/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { uploadWorkspaceImage } from "@/lib/media-storage-client";
import { cn } from "@/lib/utils";
import type { ClientRecord, ClientStatus } from "@/lib/clients";

type ClientDetailsPageProps = {
  initialClient: ClientRecord;
};

type ClientDraft = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: ClientStatus;
  notes: string;
  preferredChannel: string;
  assignedStaff: string;
  tags: string;
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

function createDraft(client: ClientRecord): ClientDraft {
  return {
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    status: client.status,
    notes: client.notes === "No notes yet." ? "" : client.notes,
    preferredChannel: client.details.preferredChannel,
    assignedStaff: client.details.assignedStaff,
    tags: client.details.tags.join(", "),
  };
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
  const router = useRouter();
  const [client, setClient] = useState(initialClient);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<ClientDraft>(createDraft(initialClient));
  const [galleryCaption, setGalleryCaption] = useState("");
  const [galleryImage, setGalleryImage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isGalleryUploading, setIsGalleryUploading] = useState(false);
  const [isPending, startSaving] = useTransition();

  function openEditClient() {
    setDraft(createDraft(client));
    setErrorMessage("");
    setDrawerOpen(true);
  }

  function saveClient() {
    startSaving(async () => {
      const result = await saveClientAction({
        id: draft.id,
        name: draft.name,
        email: draft.email,
        phone: draft.phone,
        status: draft.status,
        notes: draft.notes,
        preferredChannel: draft.preferredChannel,
        assignedStaff: draft.assignedStaff,
        tags: draft.tags,
      });

      if (!result.ok || !result.client) {
        setErrorMessage(result.error ?? "We couldn't save the client.");
        setStatusMessage("");
        return;
      }

      setClient(result.client);
      setDrawerOpen(false);
      setErrorMessage("");
      setStatusMessage("Client details updated.");
    });
  }

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

  function deleteClient() {
    if (!window.confirm("Delete this client permanently?")) {
      return;
    }

    startSaving(async () => {
      const result = await deleteClientAction(client.id);

      if (!result.ok) {
        setErrorMessage(result.error ?? "We couldn't delete the client.");
        setStatusMessage("");
        return;
      }

      router.push("/clients");
    });
  }

  async function handleGalleryFile(file?: File) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Upload an image file for the client record.");
      setStatusMessage("");
      return;
    }

    if (file.size > 5_000_000) {
      setErrorMessage("Clinical image is too large. Upload an image under 5 MB.");
      setStatusMessage("");
      return;
    }

    setIsGalleryUploading(true);

    try {
      const uploadedImage = await uploadWorkspaceImage(file, {
        folder: "client-gallery",
        maxBytes: 5_000_000,
      });
      setGalleryImage(uploadedImage.storageUrl);
      setErrorMessage("");
      setStatusMessage("Image uploaded. Add it to save it to this client.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "We couldn't upload this image.");
      setStatusMessage("");
    } finally {
      setIsGalleryUploading(false);
    }
  }

  function addGalleryItem() {
    startSaving(async () => {
      const result = await addClientGalleryItemAction({
        clientId: client.id,
        imageUrl: galleryImage,
        caption: galleryCaption,
      });

      if (!result.ok || !result.client) {
        setErrorMessage(result.error ?? "We couldn't add this image.");
        setStatusMessage("");
        return;
      }

      setClient(result.client);
      setGalleryImage("");
      setGalleryCaption("");
      setErrorMessage("");
      setStatusMessage("Client media updated.");
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
          <Button variant="outline" className="rounded-[0.85rem]" onClick={openEditClient}>
            <UserRoundPen className="size-4" />
            Edit
          </Button>
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
          <TabsTrigger value="appointments">Past appointments</TabsTrigger>
          <TabsTrigger value="media">Images</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
            <h2 className="text-lg font-semibold text-foreground">Client data</h2>
            <dl className="mt-5 space-y-3">
              <OverviewLine label="Name" value={client.name} />
              <OverviewLine label="Status" value={statusLabels[client.status]} />
              <OverviewLine
                icon={Phone}
                label="Phone"
                value={client.phone || "Not added"}
              />
              <OverviewLine
                icon={Mail}
                label="Email"
                value={client.email || "Not added"}
              />
              <OverviewLine label="Preferred channel" value={client.details.preferredChannel} />
              <OverviewLine label="Assigned staff" value={client.details.assignedStaff} />
              <OverviewLine label="Last visit" value={client.lastVisit} />
              <OverviewLine label="Total visits" value={`${client.totalVisits}`} />
              <OverviewLine
                label="Tags"
                value={client.details.tags.length > 0 ? client.details.tags.join(", ") : "No tags"}
              />
            </dl>
          </section>

          <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-foreground">Recent activity</h2>
              <Link href={`/calendar/new?client=${client.id}`} className="text-sm font-semibold text-primary">
                Book next
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {client.history.slice(0, 4).map((entry) => (
                <div key={entry.id} className="rounded-[0.95rem] border border-border/80 bg-white/72 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-foreground">{entry.title}</p>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      {entry.date}
                    </p>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{entry.detail}</p>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="appointments" className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Past appointments and details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Completed, cancelled, pending, and historical visits linked to this client.
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
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <StatCard label="Completed" value={client.appointmentStats.completed} tone="primary" />
            <StatCard label="Cancelled" value={client.appointmentStats.cancelled} tone="danger" />
            <StatCard label="Pending" value={client.appointmentStats.pending} />
          </div>
          <div className="mt-5 space-y-3">
            {client.history.length > 0 ? (
              client.history.map((entry) => (
                <div key={entry.id} className="rounded-[0.95rem] border border-border/80 bg-white/72 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-foreground">{entry.title}</p>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {entry.date}
                    </p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.detail}</p>
                </div>
              ))
            ) : (
              <EmptyPanel icon={CalendarPlus2} title="No appointments yet" text="Book this client to start their visit history." />
            )}
          </div>
        </TabsContent>

        <TabsContent value="media" className="space-y-4">
          <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
                <ImagePlus className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Clinical images</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Save visual client records here, including progress photos, treatment images,
                  x-rays, scans, referral images, and other image-based clinical media.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_190px]">
              <Input
                value={galleryCaption}
                onChange={(event) => setGalleryCaption(event.target.value)}
                placeholder="Image note, for example CT scan, x-ray, before photo, after photo..."
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
              <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[0.9rem] border border-border bg-white/78 px-4 text-sm font-medium text-foreground transition-colors hover:bg-white">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => handleGalleryFile(event.target.files?.[0])}
                  disabled={isGalleryUploading}
                />
                <ImagePlus className="size-4" />
                {isGalleryUploading ? "Uploading..." : galleryImage ? "Image ready" : "Choose image"}
              </label>
            </div>
            <Button
              className="mt-3 rounded-[0.9rem]"
              onClick={addGalleryItem}
              disabled={!galleryImage || isPending || isGalleryUploading}
            >
              Add image to record
            </Button>
          </section>

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
                    <p className="text-sm font-medium text-foreground">{item.caption || "No note"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.createdAt}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <EmptyPanel icon={Images} title="No images yet" text="Upload the first clinical image for this client." />
          )}
        </TabsContent>

        <TabsContent value="documents" className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
          <EmptyPanel
            icon={FileText}
            title="Document records are ready for the next schema step"
            text="The current database stores client notes, messages, appointments, and image records. PDF/document upload needs its own storage model before it should be used with real clinic files."
          />
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

        <TabsContent value="notes" className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
          <div className="flex items-start gap-3">
            <NotebookText className="mt-1 size-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">Notes</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                {client.notes}
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="details" className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
          <h2 className="text-lg font-semibold text-foreground">Client details</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Detail label="Name" value={client.name} />
            <Detail label="Phone" value={client.phone} />
            <Detail label="Email" value={client.email || "Not added"} />
            <Detail label="Status" value={statusLabels[client.status]} />
            <Detail label="Preferred channel" value={client.details.preferredChannel} />
            <Detail label="Assigned staff" value={client.details.assignedStaff} />
          </dl>
        </TabsContent>
      </Tabs>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full max-w-[460px] p-0 sm:max-w-[460px]">
          <SheetHeader className="glass-divider rounded-t-[1.2rem] px-5 py-5">
            <SheetTitle>Edit client</SheetTitle>
            <SheetDescription>Update the client profile used across Vela.</SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-5 py-5">
            <div className="surface-soft grid gap-4 rounded-[1.05rem] p-4 sm:grid-cols-2">
              <Field label="Name" value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
              <Field label="Email" value={draft.email} onChange={(value) => setDraft((current) => ({ ...current, email: value }))} />
              <Field label="Phone" value={draft.phone} onChange={(value) => setDraft((current) => ({ ...current, phone: value }))} />
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Status
                </label>
                <NativeSelect
                  value={draft.status}
                  options={["active", "at-risk", "inactive", "archived"]}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, status: value as ClientStatus }))
                  }
                />
              </div>
            </div>
            <div className="surface-soft grid gap-4 rounded-[1.05rem] p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Preferred channel
                </label>
                <NativeSelect
                  value={draft.preferredChannel}
                  options={["WhatsApp", "Phone", "Email"]}
                  onChange={(value) => setDraft((current) => ({ ...current, preferredChannel: value }))}
                />
              </div>
              <Field label="Assigned staff" value={draft.assignedStaff} onChange={(value) => setDraft((current) => ({ ...current, assignedStaff: value }))} />
            </div>
            <div className="surface-soft space-y-2 rounded-[1.05rem] p-4">
              <Field label="Tags" value={draft.tags} onChange={(value) => setDraft((current) => ({ ...current, tags: value }))} placeholder="priority, whatsapp" />
            </div>
            <div className="surface-soft space-y-2 rounded-[1.05rem] p-4">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Notes
              </label>
              <Textarea
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                className="min-h-28 rounded-[0.9rem] bg-white/84 px-3 py-3"
              />
            </div>
          </div>

          <SheetFooter className="glass-divider rounded-b-[1.2rem] px-5 py-4">
            <Button
              variant="outline"
              className="rounded-[0.9rem] border-destructive/25 bg-white/70 text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={deleteClient}
              disabled={isPending}
            >
              Delete client
            </Button>
            <Button variant="outline" className="rounded-[0.9rem] bg-white/70" onClick={() => setDrawerOpen(false)} disabled={isPending}>
              Close
            </Button>
            <Button className="rounded-[0.9rem]" onClick={saveClient} disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
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

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-[0.9rem] bg-white/84"
      />
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
