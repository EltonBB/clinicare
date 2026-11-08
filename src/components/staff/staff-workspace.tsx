"use client";

import Link from "next/link";
import { Fragment, useDeferredValue, useMemo, useState, useTransition } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";

import { checkInStaffAction, checkOutStaffAction } from "@/app/(workspace)/staff/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiValue } from "@/components/workspace/kpi-value";
import { useI18n, useServerText } from "@/i18n/client";
import { fmt, numberFormatter, plural, storedLabel } from "@/i18n/format";
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
import { STAFF_DIRECTORY_FILTERS as filters } from "@/lib/skeleton-counts";
import type { StaffDirectoryFilter as StaffFilter } from "@/lib/skeleton-counts";
import type { StaffStatus, StaffViewModel } from "@/lib/staff";
import { HoverPrefetchLink } from "@/components/workspace/hover-prefetch-link";

type StaffWorkspaceProps = {
  initialView: StaffViewModel;
};

// Every row is its own grid, so the actions column is a fixed width, sized for
// the longer Albanian check-in label ("Regjistro hyrjen") beside Details.
// The table starts at xl (the ~880px it needs without Completion fits a 1280px
// laptop beside the sidebar); Completion joins at 1400px (written 87.5rem: a px breakpoint
// sorts unpredictably against the rem-based xl), where its ~1070px
// fit. Below xl each member is one compact row instead.
const staffTableGrid =
  "xl:grid-cols-[minmax(200px,1.4fr)_120px_120px_minmax(150px,1fr)_210px] min-[87.5rem]:grid-cols-[minmax(230px,1.4fr)_120px_130px_minmax(170px,1fr)_120px_210px]";
// The first-run ghost rows are decoration, so they just share the width out.
const staffFirstRunGrid =
  "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,0.6fr)_minmax(0,1fr)]";

function statusDot(status: StaffStatus) {
  return cn(
    "inline-block size-2 rounded-full",
    status === "ACTIVE" && "bg-primary",
    status === "AWAY" && "bg-amber-500",
    status === "INACTIVE" && "bg-border"
  );
}

export function StaffWorkspace({ initialView }: StaffWorkspaceProps) {
  const { locale, m } = useI18n();
  const t = m.staff.directory;
  const serverText = useServerText();
  const roleLabel = (role: string) => (role ? storedLabel(m.staff.roles, role) : m.staff.noRole);
  const [staff, setStaff] = useState(initialView.staff);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StaffFilter>("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [clockingId, setClockingId] = useState("");
  const [clockError, setClockError] = useState("");
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query);
  const hasStaff = staff.length > 0;
  const roles = useMemo(
    () => Array.from(new Set(staff.map((member) => member.role || "Staff"))).sort(),
    [staff]
  );
  const counts = useMemo(
    () => ({
      all: staff.length,
      ACTIVE: staff.filter((member) => member.status === "ACTIVE").length,
      AWAY: staff.filter((member) => member.status === "AWAY").length,
      INACTIVE: staff.filter((member) => member.status === "INACTIVE").length,
      "checked-in": staff.filter((member) => member.isCheckedIn).length,
    }),
    [staff]
  );

  const filteredStaff = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return staff.filter((member) => {
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "checked-in"
            ? member.isCheckedIn
            : member.status === filter;
      const matchesRole = roleFilter === "all" ? true : (member.role || "Staff") === roleFilter;
      const matchesQuery =
        normalizedQuery.length === 0
          ? true
          : [member.name, member.role, storedLabel(m.staff.roles, member.role), member.email, member.phone].some((value) =>
              value.toLowerCase().includes(normalizedQuery)
            );

      return matchesFilter && matchesRole && matchesQuery;
    });
  }, [staff, deferredQuery, filter, roleFilter, m.staff.roles]);

  function toggleClock(staffId: string) {
    const member = staff.find((item) => item.id === staffId);

    if (!member) {
      return;
    }

    setClockingId(staffId);
    setClockError("");
    startTransition(async () => {
      const result = member.isCheckedIn
        ? await checkOutStaffAction(staffId)
        : await checkInStaffAction(staffId);

      if (!result.ok || !result.staff) {
        setClockError(serverText(result.error) ?? t.clockFailed);
        setClockingId("");
        return;
      }

      setStaff((current) =>
        current.map((item) =>
          item.id === staffId
            ? {
                ...item,
                status: result.staff!.status,
                isCheckedIn: result.staff!.isCheckedIn,
                weeklyHours: result.staff!.weeklyHours,
                shiftLabel: result.staff!.shiftLabel,
                canClock: result.staff!.canClock,
                clockLabel: result.staff!.clockLabel,
                clockDisabledReason: result.staff!.clockDisabledReason,
              }
            : item
        )
      );
      setClockingId("");
    });
  }

  return (
    <WorkspacePage>
      <WorkspaceHeader
        title={t.title}
        actions={
          <Link
            href="/staff/new"
            className={cn(buttonVariants({ variant: "solid" }), "h-10 rounded-(--radius-card) px-4")}
          >
            <Plus className="size-4" />
            {t.newMember}
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
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((item) => (
              <FilterChip
                key={item.value}
                active={filter === item.value}
                count={counts[item.value]}
                onClick={() => setFilter(item.value)}
              >
                {t.filters[item.value]}
              </FilterChip>
            ))}
            {roles.length > 1 ? (
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className="h-9 rounded-(--radius-card) border border-border/80 bg-white px-3 text-sm font-medium text-foreground outline-none transition-[border-color,box-shadow] duration-(--duration-base) focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <option value="all">{t.allRoles}</option>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role === "Staff" ? m.staff.noRole : roleLabel(role)}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </WorkspaceToolbar>

        {clockError ? (
          <div className="state-pop rounded-(--radius-card) border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            {clockError}
          </div>
        ) : null}

        <WorkspaceTable
          headerClassName="py-2.5 max-xl:hidden"
          headers={
            <div className={cn("hidden w-full gap-3 xl:grid", staffTableGrid)}>
              <span>{t.columns.member}</span>
              <span>{t.columns.role}</span>
              <span>{t.columns.status}</span>
              <span>{t.columns.today}</span>
              <span className="hidden min-[87.5rem]:block">{t.columns.completion}</span>
              <span className="text-right">{t.columns.actions}</span>
            </div>
          }
        >
          {!hasStaff ? (
            <WorkspaceFirstRun
              gridClassName={staffFirstRunGrid}
              cells={["identity", "pill", "pill", "wide", "text", "action"]}
              title={t.firstRunTitle}
              description={t.firstRunCopy}
              actionHref="/staff/new"
              actionLabel={t.addMember}
            />
          ) : filteredStaff.length === 0 ? (
            <div className="px-6 py-8">
              <WorkspaceEmptyState
                icon={Search}
                title={t.noMatchTitle}
                description={t.noMatchCopy}
                compact
              />
            </div>
          ) : (
            filteredStaff.map((member) => {
              const href =
                member.unreadMessages > 0 ? `/staff/${member.id}?tab=messages` : `/staff/${member.id}`;
              const avatar = (
                <Avatar size="lg" shape="square">
                  <AvatarFallback className="bg-white text-xs font-semibold text-primary">
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>
              );
              const nameLine = (
                <p className="flex items-center gap-1.5 font-semibold text-foreground">
                  <span className="min-w-0 truncate">{member.name}</span>
                  {member.unreadMessages > 0 || member.hasUnseenCheckIn ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-primary"
                      aria-label={
                        member.unreadMessages > 0 && member.hasUnseenCheckIn
                          ? fmt(t.unreadAndCheckIn, {
                              messages: plural(m.staff.unreadMessages, member.unreadMessages, locale),
                            })
                          : member.unreadMessages > 0
                            ? plural(m.staff.unreadMessages, member.unreadMessages, locale)
                            : t.checkInToReview
                      }
                    />
                  ) : null}
                </p>
              );
              const shift = member.shiftLabel
                ? member.shiftLabel
                : member.nextShift
                  ? fmt(t.next, { shift: member.nextShift })
                  : t.noShiftPlanned;
              const status = (
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <span className={statusDot(member.status)} />
                    <span>{m.staff.status[member.status]}</span>
                  </div>
                  {member.isCheckedIn ? (
                    <p className="mt-0.5 text-[11px] font-medium text-emerald-600">
                      {m.staff.checkedInNow}
                    </p>
                  ) : null}
                </div>
              );
              const clockButton = (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 min-w-[76px] shrink-0 rounded-(--radius-tile) px-3 text-xs"
                  onClick={() => toggleClock(member.id)}
                  disabled={
                    isPending ||
                    clockingId === member.id ||
                    (!member.isCheckedIn && !member.canClock)
                  }
                  title={!member.isCheckedIn ? member.clockDisabledReason : undefined}
                >
                  {clockingId === member.id ? m.common.saving : member.clockLabel}
                </Button>
              );

              return (
                <Fragment key={member.id}>
                  {/* Below xl: one row with the name, role and today's shift under
                      it, the status (from sm), and check-in; the row opens the profile. */}
                  <div className="flex items-center gap-3 px-3.5 py-2.5 transition-colors duration-(--duration-base) hover:bg-[#f7f9fc] xl:hidden">
                    <HoverPrefetchLink href={href} className="flex min-w-0 flex-1 items-center gap-3">
                      {avatar}
                      <div className="min-w-0">
                        {nameLine}
                        <p className="truncate text-xs text-muted-foreground">
                          {roleLabel(member.role)} · {shift}
                        </p>
                      </div>
                    </HoverPrefetchLink>
                    <div className="hidden w-32 shrink-0 sm:block">{status}</div>
                    {clockButton}
                  </div>
                  <div
                    className={cn(
                      "hidden min-h-[54px] items-center gap-3 px-3.5 py-2 transition-colors duration-(--duration-base) hover:bg-[#f7f9fc] xl:grid",
                      staffTableGrid
                    )}
                  >
                    <HoverPrefetchLink href={href} className="flex min-w-0 items-center gap-3">
                      {avatar}
                      <div className="min-w-0">{nameLine}</div>
                    </HoverPrefetchLink>
                    <div className="min-w-0">
                      <span className="inline-flex max-w-full truncate rounded-md bg-primary/8 px-2.5 py-1 text-xs font-semibold text-primary">
                        {roleLabel(member.role)}
                      </span>
                    </div>
                    {status}
                    <div className="min-w-0 text-sm">
                      <p
                        className={cn(
                          "truncate",
                          member.shiftLabel ? "font-medium text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {shift}
                      </p>
                    </div>
                    <div className="hidden min-w-0 min-[87.5rem]:block">
                      {member.completionRate > 0 ? (
                        <>
                          <p className="text-sm font-semibold text-foreground">
                            <KpiValue value={`${numberFormatter(locale).format(member.completionRate)}%`} animateOnMount />
                          </p>
                          {/* Mount-once CSS entrance (.bar-grow), not framer-motion — unlike
                              Reports' staff-load bar, this directory has no period selector,
                              so there's no "retarget an already-mounted bar" case to support. */}
                          <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="bar-grow h-full bg-primary"
                              style={{ width: `${Math.min(member.completionRate, 100)}%` }}
                            />
                          </div>
                        </>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {clockButton}
                      <HoverPrefetchLink
                        href={`/staff/${member.id}`}
                        className={cn(
                          buttonVariants({ variant: "solid", size: "sm" }),
                          "h-8 rounded-(--radius-tile) px-3 text-xs"
                        )}
                        aria-label={fmt(t.open, { name: member.name })}
                      >
                        {t.details}
                        <ChevronRight className="size-4" />
                      </HoverPrefetchLink>
                    </div>
                  </div>
                </Fragment>
              );
            })
          )}
        </WorkspaceTable>
      </div>
    </WorkspacePage>
  );
}
