"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  MoreVertical,
  Plus,
  Search,
  SlidersHorizontal,
  UserRoundCog,
  UsersRound,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    status === "ACTIVE" && "bg-emerald-500",
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
  const staff = initialView.staff;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | StaffStatus>("all");
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

  const filteredStaff = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return staff.filter((member) => {
      const matchesFilter = filter === "all" ? true : member.status === filter;
      const matchesQuery =
        normalizedQuery.length === 0
          ? true
          : [member.name, member.role, member.email, member.phone].some((value) =>
              value.toLowerCase().includes(normalizedQuery)
            );

      return matchesFilter && matchesQuery;
    });
  }, [staff, deferredQuery, filter]);

  return (
    <div className="mx-auto w-full max-w-[1536px] space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="section-reveal space-y-2">
          <div className="space-y-2">
            <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-foreground">
              Staff
            </h1>
            <p className="max-w-2xl text-[15px] text-muted-foreground">
              Manage your team, shifts, time tracking, and performance.
            </p>
          </div>
        </div>
        <Link
          href="/staff/new"
          className={cn(
            buttonVariants({ size: "lg" }),
            "section-reveal-delayed h-11 rounded-[0.9rem] px-4"
          )}
        >
          <Plus className="size-4" />
          New staff member
        </Link>
      </div>

      <div className="section-reveal grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StaffMetric icon={UsersRound} label="Total staff" value={staff.length.toString()} helper={`${activeStaffCount} active team members`} />
        <StaffMetric icon={CalendarClock} label="On duty today" value={onDutyStaff.length.toString()} helper={`${staff.length > 0 ? Math.round((onDutyStaff.length / staff.length) * 100) : 0}% of team`} />
        <StaffMetric icon={BarChart3} label="Average utilization" value={`${averageUtilization}%`} helper={`${totalAppointmentsToday} appointments today`} />
        <StaffMetric icon={CheckCircle2} label="Avg completion rate" value={`${averageCompletion}%`} helper="Finalized appointments" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="section-reveal overflow-hidden rounded-[1rem] border border-border/80 bg-white shadow-[0_16px_36px_rgba(20,32,51,0.04)]">
          <div className="grid gap-3 border-b border-border/75 p-4 lg:grid-cols-[minmax(260px,1fr)_180px_180px_48px]">
            <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
                placeholder="Search staff by name, role, email, or phone..."
                className="h-10 rounded-[0.7rem] bg-white pl-9"
          />
        </div>
            <NativeFilter value={filter} onChange={setFilter} />
            <NativeRoleFilter />
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-[0.7rem] border border-border bg-white text-muted-foreground"
              aria-label="Filter staff"
            >
              <SlidersHorizontal className="size-4" />
            </button>
          </div>

          <div className="hidden grid-cols-[minmax(250px,1.5fr)_120px_120px_160px_150px_70px] border-b border-border/80 bg-secondary/25 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:grid">
            <span>Staff member</span>
            <span>Role</span>
            <span>Status</span>
            <span>Appts today</span>
            <span>Completion rate</span>
            <span className="text-right">Actions</span>
        </div>

        <div className="divide-y divide-border/75">
          {!hasStaff ? (
            <div className="px-6 py-14">
              <div className="mx-auto max-w-md space-y-5 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-[1.05rem] bg-primary/12 text-primary">
                  <UserRoundCog className="size-5" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">
                    Add the first staff member
                  </h2>
                  <p className="text-sm leading-7 text-muted-foreground">
                    Staff records connect bookings, time tracking, and completed work.
                  </p>
                </div>
                <Link
                  href="/staff/new"
                  className={cn(buttonVariants({ size: "lg" }), "rounded-[0.95rem]")}
                >
                  <Plus className="size-4" />
                  Add staff member
                </Link>
              </div>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              No staff members match this search or filter.
            </div>
          ) : (
            filteredStaff.map((member) => (
              <div
                key={member.id}
                  className="grid gap-3 px-4 py-3 transition-colors duration-200 hover:bg-secondary/25 lg:grid-cols-[minmax(250px,1.5fr)_120px_120px_160px_150px_70px] lg:items-center"
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
                  <span className="w-fit rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {member.role || "Staff"}
                  </span>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className={statusDot(member.status)} />
                    <span>{member.status === "ACTIVE" ? "On duty" : member.status === "AWAY" ? "Away" : "Off duty"}</span>
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
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(member.completionRate, 100)}%` }} />
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Link
                      href={`/staff/${member.id}`}
                      className="inline-flex size-8 items-center justify-center rounded-[0.55rem] text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label={`Open ${member.name}`}
                    >
                      <MoreVertical className="size-4" />
                    </Link>
                </div>
              </div>
            ))
          )}
        </div>
          <div className="flex items-center justify-between border-t border-border/75 px-4 py-3 text-sm text-muted-foreground">
            <span>
              Showing 1 to {filteredStaff.length} of {staff.length} staff members
            </span>
            <span className="rounded-md bg-primary/10 px-3 py-1 font-semibold text-primary">1</span>
          </div>
        </div>

        <aside className="section-reveal-delayed space-y-3">
          <section className="rounded-[1rem] border border-border/80 bg-white p-4 shadow-[0_16px_36px_rgba(20,32,51,0.04)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">On duty now</h2>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {onDutyStaff.length}
            </span>
          </div>
            <div className="space-y-3">
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
              <p className="text-sm text-muted-foreground">Add staff to see who&apos;s available today.</p>
            ) : null}
          </div>
        </section>

          <section className="rounded-[1rem] border border-border/80 bg-white p-4 shadow-[0_16px_36px_rgba(20,32,51,0.04)]">
          <h2 className="text-base font-semibold text-foreground">Upcoming shifts</h2>
            <div className="mt-4 space-y-3">
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
              <p className="text-sm text-muted-foreground">No planned shifts yet.</p>
            ) : null}
          </div>
          <Link href="/calendar" className="mt-5 inline-flex text-sm font-semibold text-primary">
            View full schedule
          </Link>
        </section>

          <section className="rounded-[1rem] border border-border/80 bg-white p-4 shadow-[0_16px_36px_rgba(20,32,51,0.04)]">
          <h2 className="text-base font-semibold text-foreground">Quick actions</h2>
          <div className="mt-4 grid gap-2">
              <Link href="/staff/new" className={cn(buttonVariants({ size: "lg" }), "h-10 rounded-[0.7rem]")}>
              <Plus className="size-4" />
              Add staff member
            </Link>
              <Link href="/calendar" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 rounded-[0.7rem] bg-white")}>
              <CalendarClock className="size-4" />
              Manage shifts
            </Link>
              <Link href="/reports" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 rounded-[0.7rem] bg-white")}>
              <BarChart3 className="size-4" />
              Performance reports
            </Link>
          </div>
        </section>
      </aside>
      </div>
    </div>
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

function NativeRoleFilter() {
  return (
    <select className="h-10 rounded-[0.7rem] border border-border bg-white px-3 text-sm font-medium text-foreground outline-none">
      <option>All roles</option>
      <option>Specialist</option>
      <option>Receptionist</option>
      <option>Manager</option>
      <option>Assistant</option>
    </select>
  );
}

function StaffMetric({
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
    <section className="rounded-[1rem] border border-border/80 bg-white p-5 shadow-[0_16px_36px_rgba(20,32,51,0.04)]">
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
