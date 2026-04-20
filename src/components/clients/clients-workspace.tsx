"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { Archive, MoreHorizontal, Plus, Search, UserRoundPen } from "lucide-react";

import {
  archiveClientAction,
  deleteClientAction,
  saveClientAction,
} from "@/app/(workspace)/clients/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import type { ClientRecord, ClientStatus, ClientsViewModel } from "@/lib/clients";

type ClientsWorkspaceProps = {
  initialView: ClientsViewModel;
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
        notes: client.notes,
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

function NativeSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-[0.9rem] border border-border/80 bg-white/84 px-3 text-sm outline-none transition-[border-color,background-color,box-shadow] duration-200 focus:border-ring focus:bg-white focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

export function ClientsWorkspace({ initialView }: ClientsWorkspaceProps) {
  const [clients, setClients] = useState(initialView.clients);
  const [selectedClientId, setSelectedClientId] = useState(initialView.initialSelectedClientId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | ClientStatus>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<ClientDraft>(createDraft());
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isPending, startSaving] = useTransition();
  const deferredQuery = useDeferredValue(query);

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

  const selectedClient =
    clients.find((client) => client.id === selectedClientId) ?? filteredClients[0] ?? clients[0];

  function openNewClient() {
    setDraft(createDraft());
    setErrorMessage("");
    setDrawerOpen(true);
  }

  function openEditClient(client: ClientRecord) {
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

      setClients((current) => {
        const index = current.findIndex((client) => client.id === result.client!.id);

        if (index === -1) {
          return [result.client!, ...current];
        }

        const clone = [...current];
        clone[index] = result.client!;
        return clone;
      });

      setSelectedClientId(result.client.id);
      setDrawerOpen(false);
      setErrorMessage("");
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

      const nextVisible = filteredClients.find((client) => client.id !== clientId);
      if (nextVisible) {
        setSelectedClientId(nextVisible.id);
      }

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

      setClients((current) => {
        const nextClients = current.filter((client) => client.id !== clientId);
        setSelectedClientId(nextClients[0]?.id ?? "");
        return nextClients;
      });
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
              Oversee active client engagement, recent history, notes, and
              message context from one workspace.
            </p>
          </div>
        </div>
        <Button
          size="lg"
          className="section-reveal-delayed h-11 rounded-[0.9rem] px-4"
          onClick={openNewClient}
          data-tour="clients-create"
        >
          <Plus className="size-4" />
          New client
        </Button>
      </div>

      <div className="section-reveal flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search clients..."
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
        <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_420px]">
        <section className="section-reveal overflow-hidden rounded-[1.2rem] border border-border/80 bg-white/74 shadow-[0_24px_52px_rgba(20,32,51,0.05)] backdrop-blur-sm">
          <div className="hidden grid-cols-[minmax(0,1.5fr)_160px_120px_120px_40px] border-b border-border/80 px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:grid">
            <span>Name</span>
            <span>Last visit</span>
            <span>Total visits</span>
            <span>Status</span>
            <span />
          </div>

          <div className="divide-y divide-border/75">
            {filteredClients.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => setSelectedClientId(client.id)}
                className={cn(
                  "interactive-lift grid w-full gap-4 px-5 py-4 text-left transition-[background-color,transform] duration-200 md:grid-cols-[minmax(0,1.5fr)_160px_120px_120px_40px] md:items-center",
                  selectedClient?.id === client.id
                    ? "bg-secondary/38"
                    : "hover:bg-white/58"
                )}
              >
                <div className="flex items-center gap-3">
                  <Avatar size="lg">
                    <AvatarFallback>
                      {client.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{client.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{client.email}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{client.lastVisit}</p>
                <p className="text-sm text-foreground">{client.totalVisits}</p>
                <div className={cn("flex items-center gap-2 text-sm", statusColors[client.status])}>
                  <span className={statusDot(client.status)} />
                  <span className="capitalize">{client.status}</span>
                </div>
                <MoreHorizontal className="hidden size-4 text-muted-foreground md:block" />
              </button>
            ))}
          </div>
        </section>

        <aside className="section-reveal-delayed overflow-hidden rounded-[1.2rem] border border-border/80 bg-white/74 shadow-[0_24px_52px_rgba(20,32,51,0.05)] backdrop-blur-sm">
          {selectedClient ? (
            <>
              <div className="glass-divider px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <Avatar size="lg" className="size-12">
                      <AvatarFallback>
                        {selectedClient.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-xl font-semibold text-foreground">
                        {selectedClient.name}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedClient.email}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selectedClient.phone}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-[0.85rem] bg-white/72"
                      onClick={() => openEditClient(selectedClient)}
                    >
                      <UserRoundPen className="size-4" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-[0.85rem] bg-white/72"
                      onClick={() => archiveClient(selectedClient.id)}
                    >
                      <Archive className="size-4" />
                      Archive
                    </Button>
                  </div>
                </div>
              </div>

              <Tabs defaultValue="history" className="gap-0">
                <div className="border-b border-border/80 px-5 pt-4">
                  <TabsList variant="line" className="rounded-none p-0">
                    <TabsTrigger value="history">History</TabsTrigger>
                    <TabsTrigger value="notes">Notes</TabsTrigger>
                    <TabsTrigger value="messages">Messages</TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                  </TabsList>
                </div>

                <div className="px-5 py-5">
                  <TabsContent value="history" className="space-y-4">
                    {selectedClient.history.length > 0 ? selectedClient.history.map((entry) => (
                      <div key={entry.id} className="rounded-[0.95rem] border border-border/80 bg-white/68 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-foreground">{entry.title}</p>
                          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                            {entry.date}
                          </p>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {entry.detail}
                        </p>
                      </div>
                    )) : (
                      <div className="rounded-[0.95rem] border border-dashed border-border/90 bg-white/54 px-4 py-4 text-sm text-muted-foreground">
                        No history yet.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="notes" className="space-y-4">
                    <div className="rounded-[0.95rem] border border-border/80 bg-white/68 px-4 py-4">
                      <p className="text-sm leading-7 text-muted-foreground">
                        {selectedClient.notes}
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="messages" className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-[0.95rem] border border-border/80 bg-white/68 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Inbox thread
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Open or restart this client conversation in the inbox. Live delivery
                          status and WhatsApp replies continue there.
                        </p>
                      </div>
                      <Link
                        href={`/inbox?client=${selectedClient.id}`}
                        className="inline-flex h-9 shrink-0 items-center justify-center rounded-[0.85rem] border border-border/80 bg-white px-3 text-sm font-medium text-foreground transition-[background-color,border-color] duration-200 hover:bg-secondary/50"
                      >
                        Open conversation
                      </Link>
                    </div>
                    {selectedClient.messages.length > 0 ? selectedClient.messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                            "max-w-[88%] rounded-[0.95rem] px-4 py-3 text-sm leading-6 shadow-[0_14px_28px_rgba(20,32,51,0.04)]",
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
                    )) : (
                      <div className="rounded-[0.95rem] border border-dashed border-border/90 bg-white/54 px-4 py-4 text-sm text-muted-foreground">
                        No messages linked to this client yet.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="details" className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-[0.95rem] border border-border/80 bg-white/68 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Preferred channel
                        </p>
                        <p className="mt-2 font-medium text-foreground">
                          {selectedClient.details.preferredChannel}
                        </p>
                      </div>
                      <div className="rounded-[0.95rem] border border-border/80 bg-white/68 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Assigned staff
                        </p>
                        <p className="mt-2 font-medium text-foreground">
                          {selectedClient.details.assignedStaff}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-[0.95rem] border border-border/80 bg-white/68 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Tags
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedClient.details.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-secondary/88 px-3 py-1 text-xs font-medium text-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </>
          ) : (
            <div className="px-5 py-8 text-sm text-muted-foreground">
              No clients match the current filter.
            </div>
          )}
        </aside>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="right"
          className="w-full max-w-[460px] p-0 sm:max-w-[460px]"
          data-tour="clients-form"
        >
          <SheetHeader className="glass-divider rounded-t-[1.2rem] px-5 py-5">
            <SheetTitle>{draft.id ? "Edit client" : "Add client"}</SheetTitle>
            <SheetDescription>
              Keep the client record clean and MVP-focused.
            </SheetDescription>
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
