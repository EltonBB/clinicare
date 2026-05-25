"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Plus,
  Search,
  UserRoundCog,
  UsersRound,
} from "lucide-react";

import { checkInStaffAction, checkOutStaffAction } from "@/app/(workspace)/staff/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  WorkspaceCard,
  WorkspaceEmptyState,
  WorkspaceHeader,
  WorkspaceKpiCard,
  WorkspaceKpiGrid,
  WorkspacePage,
  WorkspaceTable,
  WorkspaceToolbar,
} from "@/components/workspace/workspace-layout";
import { cn } from "@/lib/utils";
import type { StaffStatus, StaffViewModel } from "@/lib/staff";

type StaffWorkspaceProps = {
  initialView: StaffViewModel;
};

const filters: Array<{ label: string; value: "all" | StaffStatus }> = [
  { label: "All status", value: "all" },
  { label: "On duty", value: "ACTIVE" },
  { label: "Away", value: "AWAY" },
  { label: "Off duty", value: "INACTIVE" },
];

function statusDot(status: StaffStatus) {
  return cn(
    "inline-block size-2 rounded-full",
    status === "ACTIVE" && "bg-primary",
    status === "AWAY" && "bg-amber-500",
    status === "INACTIVE" && "bg-border"
  );
}

function staffInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

export function StaffWorkspace({ initialView }: StaffWorkspaceProps) {
  const [staff, setStaff] = useState(initialView.staff);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | StaffStatus>("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [clockingId, setClockingId] = useState("");
  const [clockError, setClockError] = useState("");
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query);
  const hasStaff = staff.length > 0;
  const onDutyStaff = staff.filter(
    (member) => member.status === "ACTIVE" || member.isCheckedIn
  );
  const totalAppointmentsToday = staff.reduce((sum, member) => sum + member.appointmentsToday, 0);
  const activeStaffCount = staff.filter((member) => member.status !== "INACTIVE").length;
  const averageUtilization =
    activeStaffCount > 0
      ? Math.round(
          staff.reduce((sum, member) => sum + Math.min((member.appointmentsToday / 8) * 100, 100), 0) /
            activeStaffCount
        )
      : 0;
  const averageCompletion =
    activeStaffCount > 0
      ? Math.round(
          staff
            .filter((member) => member.status !== "INACTIVE")
            .reduce((sum, member) => sum + member.completionRate, 0) / activeStaffCount
        )
      : 0;
  const upcomingShiftStaff = staff
    .filter((member) => member.nextShift !== "-")
    .slice(0, 5);
  const roles = useMemo(
    () => Array.from(new Set(staff.map((member) => member.role || "Staff"))).sort(),
    [staff]
  );
  const scheduledStaff = staff
    .filter((member) => member.shiftLabel !== "-" || member.nextShift !== "-" || member.appointmentsToday > 0)
    .slice(0, 8);

  const filteredStaff = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return staff.filter((member) => {
      const matchesFilter = filter === "all" ? true : member.status === filter;
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
            className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-[0.9rem] px-4")}
          >
            <Plus className="size-4" />
            New staff member
          </Link>
        }
      />

      <WorkspaceKpiGrid>
        <WorkspaceKpiCard icon={UsersRound} label="Total staff" value={staff.length.toString()} helper={`${activeStaffCount} active team members`} />
        <WorkspaceKpiCard icon={CalendarClock} label="On duty today" value={onDutyStaff.length.toString()} helper={`${staff.length > 0 ? Math.round((onDutyStaff.length / staff.length) * 100) : 0}% of team`} />
        <WorkspaceKpiCard icon={BarChart3} label="Average utilization" value={`${averageUtilization}%`} helper={`${totalAppointmentsToday} appointments today`} />
        <WorkspaceKpiCard icon={CheckCircle2} label="Avg completion rate" value={`${averageCompletion}%`} helper="Finalized appointments" />
      </WorkspaceKpiGrid>

      <div className="surface-card section-reveal overflow-hidden p-0">
          <WorkspaceToolbar className="rounded-none border-0 border-b border-border/70 shadow-none">
            <div className="grid w-full gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_180px]">
            <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
                placeholder="Search staff by name, role, email, or phone..."
                className="h-10 rounded-[0.7rem] bg-white pl-9"
          />
        </div>
            <NativeRoleFilter value={roleFilter} roles={roles} onChange={setRoleFilter} />
            <NativeFilter value={filter} onChange={setFilter} />
            </div>
          </WorkspaceToolbar>
          {clockError ? (
            <div className="border-b border-border/75 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {clockError}
            </div>
          ) : null}

          <WorkspaceTable
            className="rounded-none border-0 shadow-none"
            headerClassName="border-b border-border/80 bg-secondary/25 py-2.5"
            headers={
              <div className="hidden grid-cols-[minmax(220px,1.45fr)_150px_120px_130px_170px] lg:grid">
                <span>Staff member</span>
                <span>Role / status</span>
                <span>Appts today</span>
                <span>Completion rate</span>
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
                  className="grid gap-3 px-3.5 py-2 transition-colors duration-200 hover:bg-[#f7f9fc] lg:min-h-[54px] lg:grid-cols-[minmax(210px,1.45fr)_142px_104px_120px_158px] lg:items-center"
              >
                <Link href={`/staff/${member.id}`} className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-10">
                    <AvatarFallback>{staffInitials(member.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{member.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{member.email || member.phone || "No contact added"}</p>
                  </div>
                </Link>
                  <div className="min-w-0">
                    <span className="w-fit rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      {member.role || "Staff"}
                    </span>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className={statusDot(member.status)} />
                      <span>{member.status === "ACTIVE" ? "On duty" : member.status === "AWAY" ? "Away" : "Off duty"}</span>
                      <span className="truncate">/ {member.shiftLabel !== "-" ? member.shiftLabel : member.nextShift}</span>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    <span className="font-medium lg:hidden">Appointments today: </span>
                    {member.appointmentsToday}
                  </p>
                  <div>
                    {member.completionRate > 0 ? (
                      <>
                        <p className="text-sm font-semibold text-foreground">{member.completionRate}%</p>
                        <div className="mt-1 h-1.5 w-28 rounded-full bg-secondary">
                          <div className="vela-gradient h-full rounded-full" style={{ width: `${Math.min(member.completionRate, 100)}%` }} />
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </div>
                  <div className="flex flex-nowrap justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={member.isCheckedIn ? "outline" : "default"}
                      className="h-8 min-w-[72px] rounded-[0.6rem] px-3 text-xs"
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
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-8 min-w-[66px] rounded-[0.6rem] px-3 text-xs"
                      )}
                      aria-label={`Open ${member.name}`}
                    >
                      Details
                    </Link>
                </div>
              </div>
            ))
          )}
          </WorkspaceTable>
          <div className="flex items-center justify-between border-t border-border/70 px-4 py-2.5 text-sm text-muted-foreground">
            <span>
              Showing 1 to {filteredStaff.length} of {staff.length} staff members
            </span>
            <span className="rounded-md bg-primary/10 px-3 py-1 font-semibold text-primary">1</span>
          </div>
      </div>

      <WorkspaceCard compact className="section-reveal" title="Team schedule" action={<Link href="/calendar" className="text-sm font-semibold text-primary">Open schedule</Link>}>
          <p className="mt-1 text-sm text-muted-foreground">Today&apos;s shifts and the next planned coverage from staff records.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {scheduledStaff.map((member) => (
              <Link
                key={member.id}
                href={`/staff/${member.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[0.72rem] border border-border/70 px-3.5 py-2.5 text-sm transition-colors hover:bg-secondary/25"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-foreground">{member.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {member.shiftLabel !== "-" ? member.shiftLabel : member.nextShift}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold text-foreground">{member.appointmentsToday}</span>
                  <span className="text-xs text-muted-foreground">appts</span>
                </span>
              </Link>
            ))}
            {scheduledStaff.length === 0 ? (
              <WorkspaceEmptyState
                icon={CalendarClock}
                title="No planned coverage"
                description="No staff shifts or appointments are scheduled for the visible period."
                compact
                className="md:col-span-2"
              />
            ) : null}
          </div>
      </WorkspaceCard>

      <div className="grid gap-3 lg:grid-cols-3">
        <WorkspaceCard fill compact title="On duty now" action={<span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{onDutyStaff.length}</span>}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {(onDutyStaff.length > 0 ? onDutyStaff : staff.slice(0, 5)).slice(0, 5).map((member) => (
              <Link key={member.id} href={`/staff/${member.id}`} className="flex items-center gap-3">
                  <Avatar className="size-9">
                  <AvatarFallback>{staffInitials(member.name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{member.name}</span>
                  <span className="text-xs text-muted-foreground">{member.role}</span>
                </span>
                <span className={statusDot(member.status)} />
              </Link>
            ))}
            {staff.length === 0 ? (
              <WorkspaceEmptyState
                icon={UserRoundCog}
                title="No staff yet"
                description="Add staff to see who's available today."
                compact
              />
            ) : null}
          </div>
        </WorkspaceCard>

        <WorkspaceCard fill compact title="Upcoming shifts">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {upcomingShiftStaff.map((member) => (
              <div key={member.id} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex size-8 items-center justify-center rounded-[0.75rem] bg-primary/10 text-primary">
                  <CalendarClock className="size-4" />
                </span>
                <span>
                  <span className="block font-semibold text-foreground">{member.name}</span>
                    <span className="text-xs text-muted-foreground">{member.nextShift}</span>
                </span>
              </div>
            ))}
              {upcomingShiftStaff.length === 0 ? (
              <WorkspaceEmptyState
                icon={CalendarClock}
                title="No planned shifts"
                description="Upcoming shifts will appear here."
                compact
              />
            ) : null}
          </div>
          <Link href="/calendar" className="mt-3 inline-flex text-sm font-semibold text-primary">
            View full schedule
          </Link>
        </WorkspaceCard>

        <WorkspaceCard fill compact title="Coverage summary">
          <div className="space-y-2.5 text-sm">
            <CoverageRow label="Appointments today" value={totalAppointmentsToday.toString()} />
            <CoverageRow label="On-duty coverage" value={`${onDutyStaff.length}/${staff.length}`} />
            <CoverageRow label="Average completion" value={`${averageCompletion}%`} />
            <CoverageRow label="Planned shifts" value={upcomingShiftStaff.length.toString()} />
          </div>
        </WorkspaceCard>
      </div>
    </WorkspacePage>
  );
}

function NativeFilter({
  value,
  onChange,
}: {
  value: "all" | StaffStatus;
  onChange: (value: "all" | StaffStatus) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as "all" | StaffStatus)}
      className="h-10 rounded-[0.7rem] border border-border bg-white px-3 text-sm font-medium text-foreground outline-none"
    >
      {filters.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

function NativeRoleFilter({
  value,
  roles,
  onChange,
}: {
  value: string;
  roles: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-[0.7rem] border border-border bg-white px-3 text-sm font-medium text-foreground outline-none"
    >
      <option value="all">All roles</option>
      {roles.map((role) => (
        <option key={role} value={role}>
          {role}
        </option>
      ))}
    </select>
  );
}

function CoverageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
