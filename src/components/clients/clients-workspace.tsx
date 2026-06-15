"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronRight, Plus, Search, UsersRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FilterChip,
  WorkspaceEmptyState,
  WorkspaceHeader,
  WorkspacePage,
  WorkspaceTable,
  WorkspaceToolbar,
} from "@/components/workspace/workspace-layout";
import { cn, getInitials } from "@/lib/utils";
import type {
  ClientDirectoryFilter,
  ClientStatus,
  ClientsViewModel,
} from "@/lib/clients";

type ClientsWorkspaceProps = {
  initialView: ClientsViewModel;
  initialQuery: string;
  activeFilter: ClientDirectoryFilter;
};

const filters: Array<{ label: string; value: ClientDirectoryFilter }> = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Archived", value: "archived" },
  { label: "Attention", value: "attention" },
  { label: "No visits", value: "no-visits" },
];

const statusColors: Record<ClientStatus, string> = {
  active: "text-primary",
  "at-risk": "text-destructive",
  inactive: "text-muted-foreground",
  archived: "text-muted-foreground",
};

const clientTableGrid =
  "lg:grid-cols-[minmax(240px,1.5fr)_140px_minmax(240px,1.25fr)_110px_130px_110px]";

function statusDot(status: ClientStatus) {
  return cn(
    "inline-block size-2 rounded-full",
    status === "active" && "bg-primary",
    status === "at-risk" && "bg-destructive",
    (status === "inactive" || status === "archived") && "bg-border"
  );
}

function buildDirectoryUrl(query: string, filter: ClientDirectoryFilter, page: number) {
  const params = new URLSearchParams();

  if (query.trim()) {
    params.set("q", query.trim());
  }

  if (filter !== "all") {
    params.set("status", filter);
  }

  if (page > 1) {
    params.set("page", page.toString());
  }

  const suffix = params.toString();

  return suffix ? `/clients?${suffix}` : "/clients";
}

export function ClientsWorkspace({
  initialView,
  initialQuery,
  activeFilter,
}: ClientsWorkspaceProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [isNavigating, startNavigating] = useTransition();
  const skipNextSearchSync = useRef(true);
  const activeFilterRef = useRef(activeFilter);
  const view = initialView;
  const counts = view.counts;
  const hasClients = counts.all > 0;
  const isFiltering = initialQuery.trim().length > 0 || activeFilter !== "all";
  const rangeStart = view.total === 0 ? 0 : (view.page - 1) * view.pageSize + 1;
  const rangeEnd = Math.min(view.page * view.pageSize, view.total);
  const pageCount = Math.max(Math.ceil(view.total / view.pageSize), 1);

  useEffect(() => {
    activeFilterRef.current = activeFilter;
  }, [activeFilter]);

  useEffect(() => {
    if (skipNextSearchSync.current) {
      skipNextSearchSync.current = false;
      return;
    }

    const handle = window.setTimeout(() => {
      startNavigating(() => {
        router.replace(buildDirectoryUrl(query, activeFilterRef.current, 1), {
          scroll: false,
        });
      });
    }, 300);

    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function applyFilter(filter: ClientDirectoryFilter) {
    startNavigating(() => {
      router.replace(buildDirectoryUrl(query, filter, 1), { scroll: false });
    });
  }

  function goToPage(page: number) {
    startNavigating(() => {
      router.replace(buildDirectoryUrl(query, activeFilter, page), { scroll: false });
    });
  }

  return (
    <WorkspacePage>
      <WorkspaceHeader
        title="Clients"
        description="Manage client records, visit history, documents, messages, and follow-up."
        actions={
          <Link
            href="/clients/new"
            data-tour="clients-create"
            className={cn(buttonVariants({ variant: "solid" }), "h-10 rounded-(--radius-card) px-4")}
          >
            <Plus className="size-4" />
            New client
          </Link>
        }
      />

      <div className="section-reveal space-y-3">
        <WorkspaceToolbar>
          <div className="relative w-full flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search clients by name, email, or phone..."
              className="h-10 rounded-(--radius-card) bg-white pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => {
              const count =
                item.value === "all"
                  ? counts.all
                  : item.value === "active"
                    ? counts.active
                    : item.value === "inactive"
                      ? counts.inactive
                      : item.value === "archived"
                        ? counts.archived
                        : item.value === "attention"
                          ? counts.attention
                          : counts.noVisits;

              return (
                <FilterChip
                  key={item.value}
                  active={activeFilter === item.value}
                  count={count}
                  onClick={() => applyFilter(item.value)}
                >
                  {item.label}
                </FilterChip>
              );
            })}
          </div>
        </WorkspaceToolbar>

        {hasClients && isFiltering ? (
          <p className="text-xs font-medium text-muted-foreground">
            Showing {view.clients.length === 0 ? 0 : `${rangeStart}–${rangeEnd}`} of{" "}
            {view.total} matching clients
          </p>
        ) : null}

        <div
          className={cn(
            "transition-opacity duration-(--duration-base)",
            isNavigating && "opacity-60"
          )}
        >
          <WorkspaceTable
            headerClassName="py-2.5"
            headers={
              <div className={cn("hidden w-full gap-3 lg:grid", clientTableGrid)}>
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
            ) : view.clients.length === 0 ? (
              <div className="px-6 py-8">
                <WorkspaceEmptyState
                  icon={Search}
                  title="No clients match this view"
                  description="Try a different search term or filter."
                  compact
                />
              </div>
            ) : (
              view.clients.map((client) => (
                <div
                  key={client.id}
                  className={cn(
                    "grid gap-3 px-3.5 py-2 transition-colors duration-(--duration-base) hover:bg-[#f7f9fc] lg:min-h-[54px] lg:items-center",
                    clientTableGrid
                  )}
                >
                  <Link href={`/clients/${client.id}`} className="flex min-w-0 items-center gap-3">
                    <Avatar size="lg" shape="square">
                      <AvatarFallback className="bg-white text-xs font-semibold text-primary">
                        {getInitials(client.name)}
                      </AvatarFallback>
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
                    {client.lastService ? (
                      <>
                        <p className="truncate font-medium text-foreground">{client.lastService}</p>
                        {client.lastProvider ? (
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {client.lastProvider}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-muted-foreground">No appointments yet</p>
                    )}
                  </div>
                  <p className="text-sm text-foreground">
                    <span className="font-medium lg:hidden">Visits: </span>
                    {client.totalVisits}
                  </p>
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "flex items-center gap-2 text-sm",
                        statusColors[client.status]
                      )}
                    >
                      <span className={statusDot(client.status)} />
                      <span className="capitalize">{client.status}</span>
                    </div>
                    {client.needsAttention ? (
                      <p className="mt-0.5 truncate text-[11px] font-medium text-amber-600">
                        {client.attentionReason}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Link
                      href={`/clients/${client.id}`}
                      className={cn(
                        buttonVariants({ variant: "solid", size: "sm" }),
                        "h-8 rounded-(--radius-tile) px-3 text-xs"
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

        {view.total > view.pageSize ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              Page {view.page} of {pageCount}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => goToPage(view.page - 1)}
                disabled={view.page <= 1 || isNavigating}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "rounded-(--radius-tile)"
                )}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => goToPage(view.page + 1)}
                disabled={view.page >= pageCount || isNavigating}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "rounded-(--radius-tile)"
                )}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </WorkspacePage>
  );
}
