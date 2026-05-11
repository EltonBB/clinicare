"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import {
  Archive,
  CalendarPlus2,
  ChevronRight,
  Plus,
  Search,
  UserRoundPen,
  UsersRound,
} from "lucide-react";

import {
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ClientRecord, ClientStatus, ClientsViewModel } from "@/lib/clients";

type ClientsWorkspaceProps = {
  initialView: ClientsViewModel;
  initialNewClientOpen?: boolean;
  nextAfterCreate?: "calendar";
};

type ClientDraft = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  status: ClientStatus;
  notes: string;
  preferredChannel: string;
  assignedStaff: string;
  tags: string;
};

const filters: Array<{ label: string; value: "all" | ClientStatus }> = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "At risk", value: "at-risk" },
  { label: "Archived", value: "archived" },
];

const statusColors: Record<ClientStatus, string> = {
  active: "text-primary",
  "at-risk": "text-destructive",
  inactive: "text-muted-foreground",
  archived: "text-muted-foreground",
};

function createDraft(client?: ClientRecord): ClientDraft {
  return client
    ? {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        status: client.status,
        notes: client.notes === "No notes yet." ? "" : client.notes,
        preferredChannel: client.details.preferredChannel,
        assignedStaff: client.details.assignedStaff,
        tags: client.details.tags.join(", "),
      }
    : {
        name: "",
        email: "",
        phone: "",
        status: "active",
        notes: "",
        preferredChannel: "WhatsApp",
        assignedStaff: "Workspace staff",
        tags: "",
      };
}

function statusDot(status: ClientStatus) {
  return cn(
    "inline-block size-2 rounded-full",
    status === "active" && "bg-primary",
    status === "at-risk" && "bg-destructive",
    (status === "inactive" || status === "archived") && "bg-border"
  );
}

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

export function ClientsWorkspace({
  initialView,
  initialNewClientOpen = false,
  nextAfterCreate,
}: ClientsWorkspaceProps) {
  const [clients, setClients] = useState(initialView.clients);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | ClientStatus>("all");
  const [drawerOpen, setDrawerOpen] = useState(initialNewClientOpen);
  const [draft, setDraft] = useState<ClientDraft>(createDraft());
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [nextStepClient, setNextStepClient] = useState<ClientRecord | null>(null);
  const [isPending, startSaving] = useTransition();
  const deferredQuery = useDeferredValue(query);
  const hasClients = clients.length > 0;

  const filteredClients = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return clients.filter((client) => {
      const matchesFilter = filter === "all" ? true : client.status === filter;
      const matchesQuery =
        normalizedQuery.length === 0
          ? true
          : [client.name, client.email, client.phone].some((value) =>
              value.toLowerCase().includes(normalizedQuery)
            );

      return matchesFilter && matchesQuery;
    });
  }, [clients, deferredQuery, filter]);

  function replaceClientUrl(clientId?: string) {
    const nextPath = clientId ? `/clients?client=${clientId}` : "/clients";
    window.history.replaceState(null, "", nextPath);
  }

  function openEditClient(client: ClientRecord) {
    setDraft(createDraft(client));
    setErrorMessage("");
    setNextStepClient(null);
    setDrawerOpen(true);
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open && initialNewClientOpen) {
      replaceClientUrl();
    }
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

      setClients((current) => {
        const index = current.findIndex((client) => client.id === result.client!.id);

        if (index === -1) {
          return [result.client!, ...current];
        }

        const clone = [...current];
        clone[index] = result.client!;
        return clone;
      });

      setDrawerOpen(false);
      setErrorMessage("");
      replaceClientUrl(result.client.id);

      if (!draft.id && nextAfterCreate === "calendar") {
        setNextStepClient(result.client);
        setStatusMessage("Client created. Book their first appointment next.");
        return;
      }

      setNextStepClient(null);
      setStatusMessage(draft.id ? "Client updated." : "Client created.");
    });
  }

  function archiveClient(clientId: string) {
    startSaving(async () => {
      const result = await archiveClientAction(clientId);

      if (!result.ok) {
        setErrorMessage(result.error ?? "We couldn't archive the client.");
        setStatusMessage("");
        return;
      }

      setClients((current) =>
        current.map((client) =>
          client.id === clientId ? { ...client, status: "archived" } : client
        )
      );
      setErrorMessage("");
      setStatusMessage("Client archived.");
    });
  }

  function deleteClient(clientId: string) {
    if (!window.confirm("Delete this client permanently?")) {
      return;
    }

    startSaving(async () => {
      const result = await deleteClientAction(clientId);

      if (!result.ok) {
        setErrorMessage(result.error ?? "We couldn't delete the client.");
        setStatusMessage("");
        return;
      }

      setClients((current) => current.filter((client) => client.id !== clientId));
      setDrawerOpen(false);
      setErrorMessage("");
      setStatusMessage("Client deleted.");
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="section-reveal space-y-2">
          <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Client directory
          </p>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">
              Manage relationships
            </h1>
            <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground">
              Search clients, open their full record, and keep profile details ready for
              bookings and follow-up.
            </p>
          </div>
        </div>
        <Link
          href="/clients/new"
          data-tour="clients-create"
          className={cn(
            buttonVariants({ size: "lg" }),
            "section-reveal-delayed h-11 rounded-[0.9rem] px-4"
          )}
        >
          <Plus className="size-4" />
          New client
        </Link>
      </div>

      <div className="section-reveal flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-3xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search clients by name, email, or phone..."
            className="h-11 rounded-[0.9rem] bg-white/78 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={cn(
                "rounded-[0.9rem] border border-transparent bg-white/36 px-3 py-2 text-sm font-medium text-muted-foreground transition-[background-color,color,border-color,box-shadow] duration-200 hover:border-border/70 hover:bg-white/70 hover:text-foreground",
                filter === item.value &&
                  "border-border/80 bg-white text-foreground shadow-[0_14px_28px_rgba(20,32,51,0.05)]"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      {!errorMessage && statusMessage ? (
        <div className="flex flex-col gap-3 rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary sm:flex-row sm:items-center sm:justify-between">
          <span>{statusMessage}</span>
          {nextStepClient ? (
            <Link
              href={`/calendar/new?client=${nextStepClient.id}`}
              className="inline-flex items-center gap-2 font-semibold text-primary transition-transform duration-200 hover:translate-x-0.5"
            >
              Book appointment
              <CalendarPlus2 className="size-4" />
            </Link>
          ) : null}
        </div>
      ) : null}

      <section className="section-reveal overflow-hidden rounded-[1.2rem] border border-border/80 bg-white/74 shadow-[0_24px_52px_rgba(20,32,51,0.05)] backdrop-blur-sm">
        <div className="hidden grid-cols-[minmax(260px,1.8fr)_180px_130px_130px_220px] border-b border-border/80 px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:grid">
          <span>Name</span>
          <span>Last visit</span>
          <span>Total visits</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        <div className="divide-y divide-border/75">
          {!hasClients ? (
            <div className="px-6 py-14">
              <div className="mx-auto max-w-md space-y-5 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-[1.05rem] bg-primary/12 text-primary">
                  <UsersRound className="size-5" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">
                    Add the first client
                  </h2>
                  <p className="text-sm leading-7 text-muted-foreground">
                    Clients are the base record for bookings, inbox threads, visit
                    history, documents, and clinical media.
                  </p>
                </div>
                <Link
                  href="/clients/new"
                  className={cn(buttonVariants({ size: "lg" }), "rounded-[0.95rem]")}
                >
                  <Plus className="size-4" />
                  Add first client
                </Link>
              </div>
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              No clients match this search or filter.
            </div>
          ) : (
            filteredClients.map((client) => (
              <div
                key={client.id}
                className="grid gap-4 px-5 py-4 transition-colors duration-200 hover:bg-white/58 lg:grid-cols-[minmax(260px,1.8fr)_180px_130px_130px_220px] lg:items-center"
              >
                <Link href={`/clients/${client.id}`} className="flex min-w-0 items-center gap-3">
                  <Avatar size="lg">
                    <AvatarFallback>{clientInitials(client.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{client.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {client.email || client.phone}
                    </p>
                  </div>
                </Link>
                <p className="text-sm text-muted-foreground lg:block">
                  <span className="font-medium text-foreground lg:hidden">Last visit: </span>
                  {client.lastVisit}
                </p>
                <p className="text-sm text-foreground">
                  <span className="font-medium lg:hidden">Visits: </span>
                  {client.totalVisits}
                </p>
                <div className={cn("flex items-center gap-2 text-sm", statusColors[client.status])}>
                  <span className={statusDot(client.status)} />
                  <span className="capitalize">{client.status}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Link
                    href={`/clients/${client.id}`}
                    className={cn(
                      buttonVariants({ variant: "default", size: "sm" }),
                      "rounded-[0.85rem]"
                    )}
                  >
                    Details
                    <ChevronRight className="size-4" />
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-[0.85rem] bg-white/72"
                    onClick={() => openEditClient(client)}
                  >
                    <UserRoundPen className="size-4" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-[0.85rem] bg-white/72"
                    onClick={() => archiveClient(client.id)}
                  >
                    <Archive className="size-4" />
                    Archive
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <Sheet open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
        <SheetContent
          side="right"
          className="w-full max-w-[460px] p-0 sm:max-w-[460px]"
          data-tour="clients-form"
        >
          <SheetHeader className="glass-divider rounded-t-[1.2rem] px-5 py-5">
            <SheetTitle>{draft.id ? "Edit client" : "Add client"}</SheetTitle>
            <SheetDescription>Keep the client profile accurate for bookings.</SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-5 py-5">
            <div className="surface-soft grid gap-4 rounded-[1.05rem] p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Name
                </label>
                <Input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  className="h-11 rounded-[0.9rem] bg-white/84"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Email
                </label>
                <Input
                  value={draft.email}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, email: event.target.value }))
                  }
                  className="h-11 rounded-[0.9rem] bg-white/84"
                />
              </div>
            </div>

            <div className="surface-soft grid gap-4 rounded-[1.05rem] p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Phone
                </label>
                <Input
                  value={draft.phone}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, phone: event.target.value }))
                  }
                  className="h-11 rounded-[0.9rem] bg-white/84"
                />
              </div>
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
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, preferredChannel: value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Assigned staff
                </label>
                <Input
                  value={draft.assignedStaff}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      assignedStaff: event.target.value,
                    }))
                  }
                  className="h-11 rounded-[0.9rem] bg-white/84"
                />
              </div>
            </div>

            <div className="surface-soft space-y-2 rounded-[1.05rem] p-4">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Tags
              </label>
              <Input
                value={draft.tags}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, tags: event.target.value }))
                }
                placeholder="priority, whatsapp"
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
            </div>

            <div className="surface-soft space-y-2 rounded-[1.05rem] p-4">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Notes
              </label>
              <Textarea
                value={draft.notes}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, notes: event.target.value }))
                }
                className="min-h-28 rounded-[0.9rem] bg-white/84 px-3 py-3"
              />
            </div>
          </div>

          <SheetFooter className="glass-divider rounded-b-[1.2rem] px-5 py-4">
            {draft.id ? (
              <Button
                variant="outline"
                className="rounded-[0.9rem] border-destructive/25 bg-white/70 text-destructive hover:bg-destructive/5 hover:text-destructive"
                onClick={() => deleteClient(draft.id!)}
                disabled={isPending}
              >
                Delete client
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="rounded-[0.9rem] bg-white/70"
              onClick={() => setDrawerOpen(false)}
              disabled={isPending}
            >
              Close
            </Button>
            <Button className="rounded-[0.9rem]" onClick={saveClient} disabled={isPending}>
              {isPending ? "Saving..." : draft.id ? "Save changes" : "Create client"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
