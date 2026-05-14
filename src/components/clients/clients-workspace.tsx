"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import {
  CalendarPlus2,
  ChevronRight,
  FileText,
  MessageSquareText,
  Plus,
  Search,
  UsersRound,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ClientStatus, ClientsViewModel } from "@/lib/clients";

type ClientsWorkspaceProps = {
  initialView: ClientsViewModel;
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

export function ClientsWorkspace({
  initialView,
}: ClientsWorkspaceProps) {
  const clients = initialView.clients;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | ClientStatus>("all");
  const deferredQuery = useDeferredValue(query);
  const hasClients = clients.length > 0;
  const activeClients = clients.filter((client) => client.status === "active");
  const atRiskClients = clients.filter((client) => client.status === "at-risk");
  const totalVisits = clients.reduce((sum, client) => sum + client.totalVisits, 0);

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

  return (
    <div className="mx-auto w-full max-w-[1536px] space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="section-reveal space-y-2">
          <div className="space-y-2">
            <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-foreground">
              Clients
            </h1>
            <p className="max-w-2xl text-[15px] text-muted-foreground">
              Manage client records, visit history, documents, messages, and follow-up.
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

      <div className="section-reveal grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ClientMetric icon={UsersRound} label="Total clients" value={clients.length.toString()} helper={`${activeClients.length} active`} />
        <ClientMetric icon={CalendarPlus2} label="Recorded visits" value={totalVisits.toString()} helper="Across client records" />
        <ClientMetric icon={MessageSquareText} label="Needs attention" value={atRiskClients.length.toString()} helper="At-risk status" />
        <ClientMetric icon={FileText} label="Recent updates" value={clients.slice(0, 5).length.toString()} helper="Latest records ready" />
      </div>

      <div className="section-reveal rounded-[1rem] border border-border/80 bg-white p-4 shadow-[0_16px_36px_rgba(20,32,51,0.04)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="section-reveal overflow-hidden rounded-[1.2rem] border border-border/80 bg-white/94 shadow-[0_24px_52px_rgba(20,32,51,0.05)] backdrop-blur-sm">
        <div className="hidden grid-cols-[minmax(260px,1.8fr)_180px_130px_130px_120px] border-b border-border/80 px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground lg:grid">
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
                className="grid gap-4 px-5 py-4 transition-colors duration-200 hover:bg-white/58 lg:grid-cols-[minmax(260px,1.8fr)_180px_130px_130px_120px] lg:items-center"
              >
                <Link href={`/clients/${client.id}`} className="flex min-w-0 items-center gap-3">
                  <Avatar size="lg">
                    <AvatarFallback>{clientInitials(client.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{client.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {client.phone || client.email || "No contact added"}
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
                </div>
              </div>
            ))
          )}
        </div>
      </section>
      <aside className="section-reveal-delayed space-y-5">
        <section className="rounded-[1rem] border border-border/80 bg-white/94 p-5 shadow-[0_14px_32px_rgba(20,32,51,0.04)]">
          <h2 className="text-base font-semibold text-foreground">Client segments</h2>
          <div className="mt-4 space-y-3 text-sm">
            <SegmentRow label="Active" value={activeClients.length} tone="primary" />
            <SegmentRow label="At risk" value={atRiskClients.length} tone="danger" />
            <SegmentRow label="Inactive" value={clients.filter((client) => client.status === "inactive").length} />
            <SegmentRow label="Archived" value={clients.filter((client) => client.status === "archived").length} />
          </div>
        </section>

        <section className="rounded-[1rem] border border-border/80 bg-white/94 p-5 shadow-[0_14px_32px_rgba(20,32,51,0.04)]">
          <h2 className="text-base font-semibold text-foreground">Quick actions</h2>
          <div className="mt-4 grid gap-2">
            <Link href="/clients/new" className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-[0.85rem]")}>
              <Plus className="size-4" />
              New client
            </Link>
            <Link href="/calendar/new" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 rounded-[0.85rem] bg-white")}>
              <CalendarPlus2 className="size-4" />
              Book appointment
            </Link>
            <Link href="/inbox" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 rounded-[0.85rem] bg-white")}>
              <MessageSquareText className="size-4" />
              Open inbox
            </Link>
          </div>
        </section>

        <section className="rounded-[1rem] border border-border/80 bg-white/94 p-5 shadow-[0_14px_32px_rgba(20,32,51,0.04)]">
          <h2 className="text-base font-semibold text-foreground">Recently updated</h2>
          <div className="mt-4 space-y-3">
            {clients.slice(0, 5).map((client) => (
              <Link key={client.id} href={`/clients/${client.id}`} className="flex items-center gap-3 text-sm">
                <Avatar size="lg">
                  <AvatarFallback>{clientInitials(client.name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-foreground">{client.name}</span>
                  <span className="text-xs text-muted-foreground">{client.lastVisit}</span>
                </span>
              </Link>
            ))}
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No client records yet.</p>
            ) : null}
          </div>
        </section>
      </aside>
      </div>
    </div>
  );
}

function ClientMetric({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <section className="rounded-[1rem] border border-border/80 bg-white/94 p-5 shadow-[0_14px_32px_rgba(20,32,51,0.04)]">
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
        </div>
      </div>
    </section>
  );
}

function SegmentRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "primary" | "danger";
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/70 pb-3 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-semibold text-foreground",
          tone === "primary" && "text-primary",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </span>
    </div>
  );
}
