"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { ChevronRight, Plus, Search, UserRoundCog } from "lucide-react";

import { checkInStaffAction, checkOutStaffAction } from "@/app/(workspace)/staff/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import type { StaffStatus, StaffViewModel } from "@/lib/staff";

type StaffWorkspaceProps = {
  initialView: StaffViewModel;
};

type StaffFilter = "all" | StaffStatus | "checked-in";

const filters: Array<{ label: string; value: StaffFilter }> = [
  { label: "All", value: "all" },
  { label: "Active", value: "ACTIVE" },
  { label: "Away", value: "AWAY" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Checked in", value: "checked-in" },
];

const statusLabels: Record<StaffStatus, string> = {
  ACTIVE: "Active",
  AWAY: "Away",
  INACTIVE: "Inactive",
};

const staffTableGrid =
  "lg:grid-cols-[minmax(230px,1.4fr)_120px_130px_minmax(170px,1fr)_120px_170px]";

function statusDot(status: StaffStatus) {
  return cn(
    "inline-block size-2 rounded-full",
    status === "ACTIVE" && "bg-primary",
    status === "AWAY" && "bg-amber-500",
    status === "INACTIVE" && "bg-border"
  );
}

export function StaffWorkspace({ initialView }: StaffWorkspaceProps) {
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
          : [member.name, member.role, member.email, member.phone].some((value) =>
              value.toLowerCase().includes(normalizedQuery)
            );

      return matchesFilter && matchesRole && matchesQuery;
    });
  }, [staff, deferredQuery, filter, roleFilter]);

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
        setClockError(result.error ?? "Could not update staff time.");
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
        title="Staff"
        description="Manage your team, shifts, time tracking, and performance."
        actions={
          <Link
            href="/staff/new"
            className={cn(buttonVariants({ variant: "solid" }), "h-10 rounded-(--radius-card) px-4")}
          >
            <Plus className="size-4" />
            New staff member
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
              placeholder="Search staff by name, role, email, or phone..."
              className="h-10 rounded-(--radius-card) bg-white pl-9"
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
                {item.label}
              </FilterChip>
            ))}
            {roles.length > 1 ? (
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className="h-9 rounded-(--radius-card) border border-border/80 bg-white px-3 text-sm font-medium text-foreground outline-none transition-[border-color,box-shadow] duration-(--duration-base) focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <option value="all">All roles</option>
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
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
          headerClassName="py-2.5"
          headers={
            <div className={cn("hidden w-full gap-3 lg:grid", staffTableGrid)}>
              <span>Staff member</span>
              <span>Role</span>
              <span>Status</span>
              <span>Today</span>
              <span>Completion</span>
              <span className="text-right">Actions</span>
            </div>
          }
        >
          {!hasStaff ? (
            <div className="px-6 py-8">
              <WorkspaceEmptyState
                icon={UserRoundCog}
                title="Add the first staff member"
                description="Staff records connect bookings, time tracking, and completed work."
                actionHref="/staff/new"
                actionLabel="Add staff member"
                compact
              />
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="px-6 py-8">
              <WorkspaceEmptyState
                icon={Search}
                title="No staff match this view"
                description="Try a different search term, role, or status filter."
                compact
              />
            </div>
          ) : (
            filteredStaff.map((member) => (
              <div
                key={member.id}
                className={cn(
                  "grid gap-3 px-3.5 py-2 transition-colors duration-(--duration-base) hover:bg-[#f7f9fc] lg:min-h-[54px] lg:items-center",
                  staffTableGrid
                )}
              >
                <Link href={`/staff/${member.id}`} className="flex min-w-0 items-center gap-3">
                  <Avatar size="lg" shape="square">
                    <AvatarFallback className="bg-white text-xs font-semibold text-primary">
                      {getInitials(member.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{member.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {member.email || member.phone || "No contact added"}
                    </p>
                  </div>
                </Link>
                <div className="min-w-0">
                  <span className="inline-flex max-w-full truncate rounded-md bg-primary/8 px-2.5 py-1 text-xs font-semibold text-primary">
                    {member.role || "Staff"}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <span className={statusDot(member.status)} />
                    <span>{statusLabels[member.status]}</span>
                  </div>
                  {member.isCheckedIn ? (
                    <p className="mt-0.5 text-[11px] font-medium text-emerald-600">
                      Checked in now
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0 text-sm">
                  {member.shiftLabel ? (
                    <p className="truncate font-medium text-foreground">{member.shiftLabel}</p>
                  ) : member.nextShift ? (
                    <p className="truncate text-muted-foreground">Next: {member.nextShift}</p>
                  ) : (
                    <p className="text-muted-foreground">No shift planned</p>
                  )}
                  {member.appointmentsToday > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {member.appointmentsToday}{" "}
                      {member.appointmentsToday === 1 ? "appointment" : "appointments"} today
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0">
                  {member.completionRate > 0 ? (
                    <>
                      <p className="text-sm font-semibold text-foreground">
                        {member.completionRate}%
                      </p>
                      <div className="mt-1 h-1.5 w-24 rounded-full bg-secondary">
                        <div
                          className="vela-gradient h-full rounded-full"
                          style={{ width: `${Math.min(member.completionRate, 100)}%` }}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 min-w-[76px] rounded-(--radius-tile) px-3 text-xs"
                    onClick={() => toggleClock(member.id)}
                    disabled={
                      isPending ||
                      clockingId === member.id ||
                      (!member.isCheckedIn && !member.canClock)
                    }
                    title={!member.isCheckedIn ? member.clockDisabledReason : undefined}
                  >
                    {clockingId === member.id ? "Saving" : member.clockLabel}
                  </Button>
                  <Link
                    href={`/staff/${member.id}`}
                    className={cn(
                      buttonVariants({ variant: "solid", size: "sm" }),
                      "h-8 rounded-(--radius-tile) px-3 text-xs"
                    )}
                    aria-label={`Open ${member.name}`}
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
    </WorkspacePage>
  );
}
