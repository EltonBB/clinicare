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
import {
  WorkspaceCard,
  WorkspaceEmptyState,
  WorkspaceHeader,
  WorkspaceKpiCard,
  WorkspaceKpiGrid,
  WorkspaceMainGrid,
  WorkspacePage,
  WorkspaceRail,
  WorkspaceTable,
} from "@/components/workspace/workspace-layout";
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
    <WorkspacePage>
      <WorkspaceHeader
        title="Clients"
        description="Manage client records, visit history, documents, messages, and follow-up."
        actions={
          <Link
            href="/clients/new"
            data-tour="clients-create"
            className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-[0.9rem] px-4")}
          >
            <Plus className="size-4" />
            New client
          </Link>
        }
      />

      <WorkspaceKpiGrid>
        <WorkspaceKpiCard icon={UsersRound} label="Total clients" value={clients.length.toString()} helper={`${activeClients.length} active`} />
        <WorkspaceKpiCard icon={CalendarPlus2} label="Recorded visits" value={totalVisits.toString()} helper="Across client records" />
        <WorkspaceKpiCard icon={MessageSquareText} label="Needs attention" value={atRiskClients.length.toString()} helper="At-risk status" tone={atRiskClients.length > 0 ? "danger" : "default"} />
        <WorkspaceKpiCard icon={FileText} label="Recent updates" value={clients.slice(0, 5).length.toString()} helper="Latest records ready" />
      </WorkspaceKpiGrid>

      <div className="section-reveal rounded-[1rem] border border-border/80 bg-white p-3.5 shadow-[0_16px_36px_rgba(20,32,51,0.04)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full flex-1">
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

      <WorkspaceMainGrid railWidth="sm">
        <div className="section-reveal space-y-3.5">
          <WorkspaceTable
            headerClassName="py-2.5"
            headers={
              <div className="hidden grid-cols-[minmax(230px,1.45fr)_130px_minmax(220px,1.15fr)_110px_110px_110px] lg:grid">
                <span>Name</span>
                <span>Last visit</span>
                <span>Latest appointment</span>
                <span>Total visits</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
              </div>
            }
          >
          {!hasClients ? (
            <div className="px-6 py-8">
              <WorkspaceEmptyState
                icon={UsersRound}
                title="Add the first client"
                description="Clients are the base record for bookings, inbox threads, visit history, documents, and clinical media."
                actionHref="/clients/new"
                actionLabel="Add first client"
                compact
              />
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="px-6 py-8">
              <WorkspaceEmptyState
                icon={Search}
                title="No clients match this view"
                description="Try a different search term or filter."
                compact
              />
            </div>
          ) : (
            filteredClients.map((client) => (
              <div
                key={client.id}
                  className="grid gap-3 px-5 py-3 transition-colors duration-200 hover:bg-white/58 lg:min-h-[64px] lg:grid-cols-[minmax(230px,1.45fr)_130px_minmax(220px,1.15fr)_110px_110px_110px] lg:items-center"
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
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium text-foreground">{client.lastService}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {client.lastProvider} - {client.lastDiagnosis}
                  </p>
                </div>
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
          </WorkspaceTable>
        </div>
        <WorkspaceRail>
        <WorkspaceCard compact title="Client segments">
          <div className="mt-4 space-y-3 text-sm">
            <SegmentRow label="Active" value={activeClients.length} tone="primary" />
            <SegmentRow label="At risk" value={atRiskClients.length} tone="danger" />
            <SegmentRow label="Inactive" value={clients.filter((client) => client.status === "inactive").length} />
            <SegmentRow label="Archived" value={clients.filter((client) => client.status === "archived").length} />
          </div>
        </WorkspaceCard>

        <WorkspaceCard compact title="Directory health">
          <div className="mt-4 space-y-3 text-sm">
            <SegmentRow label="Average visits" value={clients.length > 0 ? Math.round(totalVisits / clients.length) : 0} />
            <SegmentRow label="With visits" value={clients.filter((client) => client.totalVisits > 0).length} />
            <SegmentRow label="No visits yet" value={clients.filter((client) => client.totalVisits === 0).length} />
          </div>
        </WorkspaceCard>

        <WorkspaceCard compact title="Recently updated">
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
              <WorkspaceEmptyState
                icon={UsersRound}
                title="No client records yet"
                description="Recently updated clients will appear here."
                compact
              />
            ) : null}
          </div>
        </WorkspaceCard>
        </WorkspaceRail>
      </WorkspaceMainGrid>
    </WorkspacePage>
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
