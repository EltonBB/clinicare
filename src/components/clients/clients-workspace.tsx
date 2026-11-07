"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useI18n } from "@/i18n/client";
import { fmt, plural } from "@/i18n/format";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FilterChip,
  WorkspaceEmptyState,
  WorkspaceFirstRun,
  WorkspaceHeader,
  WorkspacePage,
  WorkspaceTable,
  WorkspaceToolbar,
  searchFieldClass,
} from "@/components/workspace/workspace-layout";
import { cn, getInitials } from "@/lib/utils";
import { CLIENT_DIRECTORY_FILTERS as filters } from "@/lib/skeleton-counts";
import type {
  ClientDirectoryFilter,
  ClientStatus,
  ClientsViewModel,
} from "@/lib/clients";
import { HoverPrefetchLink } from "@/components/workspace/hover-prefetch-link";

type ClientsWorkspaceProps = {
  initialView: ClientsViewModel;
  initialQuery: string;
  activeFilter: ClientDirectoryFilter;
};

const statusColors: Record<ClientStatus, string> = {
  active: "text-primary",
  "at-risk": "text-destructive",
  inactive: "text-muted-foreground",
  archived: "text-muted-foreground",
};

// Narrow minimums so the six columns fit a laptop-width card (~740px) instead
// of clipping Status and Actions; the fr shares still spread out on wide screens.
const clientTableGrid =
  "lg:grid-cols-[minmax(170px,1.5fr)_minmax(88px,0.7fr)_minmax(130px,1.25fr)_72px_104px_86px]";

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
  const { locale, m } = useI18n();
  const t = m.clients.directory;
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
        title={t.title}
        actions={
          <Link
            href="/clients/new"
            className={cn(buttonVariants({ variant: "solid" }), "h-10 rounded-(--radius-card) px-4")}
          >
            <Plus className="size-4" />
            {t.newClient}
          </Link>
        }
      />

      <div className="section-reveal space-y-3">
        <WorkspaceToolbar>
          {/* A floor so the filter chips can't squeeze it to a stub beside them (1024-1279). */}
          <div className="relative w-full flex-1 lg:min-w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.search}
              className={searchFieldClass}
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
                  {t.filters[item.value]}
                </FilterChip>
              );
            })}
          </div>
        </WorkspaceToolbar>

        {hasClients && isFiltering ? (
          <p className="text-xs font-medium text-muted-foreground">
            {plural(t.showing, view.total, locale, {
              range: view.clients.length === 0 ? "0" : `${rangeStart}–${rangeEnd}`,
            })}
          </p>
        ) : null}

        <div
          className={cn(
            "transition-opacity duration-(--duration-base)",
            isNavigating && "opacity-60"
          )}
        >
          <WorkspaceTable
            // Phones and tablets get one-line rows without columns, so no header bar.
            headerClassName="py-2.5 max-lg:hidden"
            headers={
              <div className={cn("hidden w-full gap-3 lg:grid", clientTableGrid)}>
                <span>{t.columns.name}</span>
                <span>{t.columns.lastVisit}</span>
                <span>{t.columns.latestAppointment}</span>
                <span>{t.columns.totalVisits}</span>
                <span>{t.columns.status}</span>
                <span className="text-right">{t.columns.actions}</span>
              </div>
            }
          >
            {!hasClients ? (
              <WorkspaceFirstRun
                gridClassName={clientTableGrid}
                cells={["identity", "text", "wide", "text", "pill", "action"]}
                title={t.firstRunTitle}
                description={t.firstRunCopy}
                actionHref="/clients/new"
                actionLabel={t.addClient}
              />
            ) : view.clients.length === 0 ? (
              <div className="px-6 py-8">
                <WorkspaceEmptyState
                  icon={Search}
                  title={t.noMatchTitle}
                  description={t.noMatchCopy}
                  compact
                />
              </div>
            ) : (
              view.clients.map((client) => (
                <Fragment key={client.id}>
                  {/* Below lg the six columns don't fit: one tappable row with the
                      name, last visit and service under it, and the status. */}
                  <HoverPrefetchLink
                    href={`/clients/${client.id}`}
                    className="flex items-center gap-3 px-3.5 py-2.5 transition-colors duration-(--duration-base) hover:bg-[#f7f9fc] lg:hidden"
                  >
                    <Avatar size="lg" shape="square">
                      <AvatarFallback className="bg-white text-xs font-semibold text-primary">
                        {getInitials(client.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{client.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {client.lastService ? `${client.lastVisit} · ${client.lastService}` : client.lastVisit}
                      </p>
                    </div>
                    <span className={cn("flex shrink-0 items-center gap-1.5 text-xs", statusColors[client.status])}>
                      <span className={statusDot(client.status)} />
                      {m.clients.status[client.status]}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </HoverPrefetchLink>
                  <div
                    className={cn(
                      "hidden min-h-[54px] items-center gap-3 px-3.5 py-2 transition-colors duration-(--duration-base) hover:bg-[#f7f9fc] lg:grid",
                      clientTableGrid
                    )}
                  >
                    <HoverPrefetchLink href={`/clients/${client.id}`} className="flex min-w-0 items-center gap-3">
                      <Avatar size="lg" shape="square">
                        <AvatarFallback className="bg-white text-xs font-semibold text-primary">
                          {getInitials(client.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{client.name}</p>
                      </div>
                    </HoverPrefetchLink>
                    <p className="text-sm text-muted-foreground">{client.lastVisit}</p>
                    <div className="min-w-0 text-sm">
                      {client.lastService ? (
                        <p className="truncate font-medium text-foreground">{client.lastService}</p>
                      ) : (
                        <p className="text-muted-foreground">{t.noAppointments}</p>
                      )}
                    </div>
                    <p className="text-sm text-foreground">{client.totalVisits}</p>
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "flex items-center gap-2 text-sm",
                          statusColors[client.status]
                        )}
                      >
                        <span className={statusDot(client.status)} />
                        <span>{m.clients.status[client.status]}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <HoverPrefetchLink
                        href={`/clients/${client.id}`}
                        className={cn(
                          buttonVariants({ variant: "solid", size: "sm" }),
                          "h-8 rounded-(--radius-tile) px-3 text-xs"
                        )}
                      >
                        {t.details}
                        <ChevronRight className="size-4" />
                      </HoverPrefetchLink>
                    </div>
                  </div>
                </Fragment>
              ))
            )}
          </WorkspaceTable>
        </div>

        {view.total > view.pageSize ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              {fmt(t.pageOf, { page: view.page, count: pageCount })}
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
                {t.previous}
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
                {t.next}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </WorkspacePage>
  );
}
