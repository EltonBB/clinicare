"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { BarChart3, CalendarClock, ChevronRight, Clock3, Plus, Search, UserRoundCog, UsersRound } from "lucide-react";

import { checkInStaffAction, checkOutStaffAction } from "@/app/(workspace)/staff/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { StaffDirectoryItem, StaffStatus, StaffViewModel } from "@/lib/staff";

type StaffWorkspaceProps = {
  initialView: StaffViewModel;
};

const filters: Array<{ label: string; value: "all" | StaffStatus }> = [
  { label: "All", value: "all" },
  { label: "Active", value: "ACTIVE" },
  { label: "Away", value: "AWAY" },
  { label: "Inactive", value: "INACTIVE" },
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

function upsertStaff(records: StaffDirectoryItem[], staff: StaffDirectoryItem) {
  const index = records.findIndex((item) => item.id === staff.id);

  if (index === -1) {
    return [staff, ...records];
  }

  const clone = [...records];
  clone[index] = staff;
  return clone;
}

export function StaffWorkspace({ initialView }: StaffWorkspaceProps) {
  const [staff, setStaff] = useState(initialView.staff);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | StaffStatus>("all");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isPending, startSaving] = useTransition();
  const deferredQuery = useDeferredValue(query);
  const hasStaff = staff.length > 0;
  const onDutyStaff = staff.filter(
    (member) => member.status === "ACTIVE" || member.isCheckedIn
  );
  const totalWeeklyHours = staff.reduce((sum, member) => sum + member.weeklyHours, 0);
  const completedThisMonth = staff.reduce(
    (sum, member) => sum + member.completedThisMonth,
    0
  );
  const activeStaffCount = staff.filter((member) => member.status !== "INACTIVE").length;
  const averageUtilization =
    activeStaffCount > 0 ? Math.round((totalWeeklyHours / (activeStaffCount * 40)) * 100) : 0;

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

  function toggleClock(member: StaffDirectoryItem) {
    startSaving(async () => {
      const result = member.isCheckedIn
        ? await checkOutStaffAction(member.id)
        : await checkInStaffAction(member.id);

      if (!result.ok || !result.staff) {
        setErrorMessage(result.error ?? "We couldn't update staff time.");
        setStatusMessage("");
        return;
      }

      setStaff((current) => upsertStaff(current, result.staff!));
      setErrorMessage("");
      setStatusMessage(member.isCheckedIn ? "Staff checked out." : "Staff checked in.");
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="section-reveal space-y-2">
          <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Staff workspace
          </p>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">
              Manage staff
            </h1>
            <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground">
              Keep staff profiles, work time, and completed appointment records in one place.
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

      <div className="section-reveal grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StaffMetric icon={UsersRound} label="Total staff" value={staff.length.toString()} helper={`${activeStaffCount} active`} />
        <StaffMetric icon={CalendarClock} label="On duty today" value={onDutyStaff.length.toString()} helper={`${staff.length > 0 ? Math.round((onDutyStaff.length / staff.length) * 100) : 0}% of team`} />
        <StaffMetric icon={BarChart3} label="Average utilization" value={`${averageUtilization}%`} helper={`${totalWeeklyHours}h logged this week`} />
        <StaffMetric icon={Clock3} label="Completed visits" value={completedThisMonth.toString()} helper="This month" />
      </div>

      <div className="section-reveal flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search staff..."
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

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <section className="section-reveal overflow-hidden rounded-[1.2rem] border border-border/80 bg-white/94 shadow-[0_24px_52px_rgba(20,32,51,0.05)] backdrop-blur-sm">
        <div className="hidden grid-cols-[minmax(0,1.3fr)_130px_130px_120px_220px] border-b border-border/80 px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground md:grid">
          <span>Name</span>
          <span>Status</span>
          <span>This week</span>
          <span>Completed</span>
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
                className="grid gap-4 px-5 py-4 transition-colors duration-200 hover:bg-white/58 md:grid-cols-[minmax(0,1.3fr)_130px_130px_120px_220px] md:items-center"
              >
                <Link href={`/staff/${member.id}`} className="flex min-w-0 items-center gap-3">
                  <Avatar size="lg">
                    <AvatarFallback>{staffInitials(member.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{member.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{member.role}</p>
                  </div>
                </Link>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className={statusDot(member.status)} />
                  <span className="capitalize">{member.status.toLowerCase()}</span>
                </div>
                <p className="text-sm font-medium text-foreground">
                  <span className="font-medium md:hidden">This week: </span>
                  {member.weeklyHours}h
                </p>
                <p className="text-sm font-medium text-foreground">
                  <span className="font-medium md:hidden">Completed: </span>
                  {member.completedThisMonth}
                </p>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Button
                    variant={member.isCheckedIn ? "outline" : "secondary"}
                    size="sm"
                    className="rounded-[0.85rem]"
                    onClick={() => toggleClock(member)}
                    disabled={isPending}
                  >
                    <Clock3 className="size-4" />
                    {member.isCheckedIn ? "Out" : "In"}
                  </Button>
                  <Link
                    href={`/staff/${member.id}`}
                    className={cn(buttonVariants({ size: "sm" }), "rounded-[0.85rem]")}
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
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">On duty now</h2>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              {onDutyStaff.length}
            </span>
          </div>
          <div className="space-y-4">
            {(onDutyStaff.length > 0 ? onDutyStaff : staff.slice(0, 5)).slice(0, 5).map((member) => (
              <Link key={member.id} href={`/staff/${member.id}`} className="flex items-center gap-3">
                <Avatar size="lg">
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

        <section className="rounded-[1rem] border border-border/80 bg-white/94 p-5 shadow-[0_14px_32px_rgba(20,32,51,0.04)]">
          <h2 className="text-base font-semibold text-foreground">Upcoming shifts</h2>
          <div className="mt-4 space-y-4">
            {staff.slice(0, 4).map((member, index) => (
              <div key={member.id} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex size-8 items-center justify-center rounded-[0.75rem] bg-primary/10 text-primary">
                  <CalendarClock className="size-4" />
                </span>
                <span>
                  <span className="block font-semibold text-foreground">{member.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {index === 0 ? "Today" : "Tomorrow"}, {index % 2 === 0 ? "9:00 AM" : "10:00 AM"}
                  </span>
                </span>
              </div>
            ))}
            {staff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No planned shifts yet.</p>
            ) : null}
          </div>
          <Link href="/calendar" className="mt-5 inline-flex text-sm font-semibold text-primary">
            View full schedule
          </Link>
        </section>

        <section className="rounded-[1rem] border border-border/80 bg-white/94 p-5 shadow-[0_14px_32px_rgba(20,32,51,0.04)]">
          <h2 className="text-base font-semibold text-foreground">Quick actions</h2>
          <div className="mt-4 grid gap-2">
            <Link href="/staff/new" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 rounded-[0.85rem] bg-white")}>
              <Plus className="size-4" />
              Add staff member
            </Link>
            <Link href="/calendar" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 rounded-[0.85rem] bg-white")}>
              <CalendarClock className="size-4" />
              Manage shifts
            </Link>
            <Link href="/reports" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 rounded-[0.85rem] bg-white")}>
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
