"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useState, useTransition } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarCheck2,
  CalendarClock,
  ChevronRight,
  Clock3,
  Mail,
  Phone,
  UserRoundPen,
} from "lucide-react";

import { checkInStaffAction, checkOutStaffAction } from "@/app/(workspace)/staff/actions";
import { MobileAccessCard } from "@/components/staff/mobile-access-card";
import { StaffMessagesTab } from "@/components/staff/staff-messages-tab";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspaceEmptyState, WorkspacePage } from "@/components/workspace/workspace-layout";
import { HeaderStat } from "@/components/workspace/header-stat";
import { cn, getInitials } from "@/lib/utils";
import type { AdminThreadView } from "@/lib/mobile/admin-inbox";
import type { MobileAccessStatus } from "@/lib/mobile/admin";
import type { StaffRecord, StaffStatus } from "@/lib/staff";

type StaffDetailsPageProps = {
  initialStaff: StaffRecord;
  mobileAccess: MobileAccessStatus;
  adminThread: AdminThreadView;
  initialTab?: "overview" | "messages";
};

const statusLabels: Record<StaffStatus, string> = {
  ACTIVE: "Active",
  AWAY: "Away",
  INACTIVE: "Inactive",
};

const statusBadgeStyles: Record<StaffStatus, string> = {
  ACTIVE: "bg-primary/10 text-primary",
  AWAY: "bg-amber-100 text-amber-700",
  INACTIVE: "bg-secondary text-muted-foreground",
};

export function StaffDetailsPage({
  initialStaff,
  mobileAccess,
  adminThread,
  initialTab = "overview",
}: StaffDetailsPageProps) {
  const [staff, setStaff] = useState(initialStaff);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedTab, setSelectedTab] = useState(initialTab);
  const [isPending, startTransition] = useTransition();

  function toggleClock() {
    startTransition(async () => {
      const result = staff.isCheckedIn
        ? await checkOutStaffAction(staff.id)
        : await checkInStaffAction(staff.id);

      if (!result.ok || !result.staff) {
        setError(result.error ?? "We couldn't update staff time.");
        setMessage("");
        return;
      }

      setStaff(result.staff);
      setError("");
      setMessage(staff.isCheckedIn ? "Staff checked out." : "Staff checked in.");
    });
  }

  return (
    <WorkspacePage>
      <section className="section-reveal space-y-3.5 pb-1">
        <Link
          href="/staff"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to staff
        </Link>

        <div className="flex flex-col gap-3.5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <Avatar shape="square" className="size-20">
              <AvatarFallback className="bg-white text-3xl font-semibold text-primary">
                {getInitials(staff.name)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-[28px] font-semibold leading-tight tracking-tight text-foreground">
                  {staff.name}
                </h1>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    statusBadgeStyles[staff.status]
                  )}
                >
                  {statusLabels[staff.status]}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2 font-medium text-foreground">
                  <BriefcaseBusiness className="size-4 text-muted-foreground" />
                  {staff.role || "Staff"}
                </span>
                {staff.phone ? (
                  <span className="inline-flex items-center gap-2">
                    <Phone className="size-4 text-muted-foreground" />
                    {staff.phone}
                  </span>
                ) : null}
                {staff.email ? (
                  <span className="inline-flex items-center gap-2">
                    <Mail className="size-4 text-muted-foreground" />
                    {staff.email}
                  </span>
                ) : null}
                {!staff.phone && !staff.email ? <span>No contact details yet</span> : null}
              </div>

              {staff.isCheckedIn || staff.shiftLabel || staff.nextShift ? (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                  {staff.isCheckedIn ? (
                    <span className="inline-flex items-center gap-2 font-medium text-emerald-600">
                      <span className="inline-block size-2 rounded-full bg-emerald-500" />
                      Checked in now
                    </span>
                  ) : null}
                  {staff.shiftLabel ? (
                    <span>
                      {staff.isCheckedIn ? "· " : ""}
                      Today&apos;s shift: {staff.shiftLabel}
                    </span>
                  ) : staff.nextShift ? (
                    <span>Next shift: {staff.nextShift}</span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </div>

          <div className="w-full space-y-3 xl:w-[560px]">
            <div className="surface-card stagger-children grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-border/70">
              <HeaderStat label="Appts today" value={staff.appointmentsToday.toString()} />
              <HeaderStat
                label="This month"
                value={staff.completedThisMonth.toString()}
                tone="good"
              />
              <HeaderStat label="Completion" value={`${staff.completionRate}%`} />
              <HeaderStat label="Weekly hours" value={`${staff.weeklyHours}h`} />
            </div>
            <div className="flex flex-wrap justify-end gap-2.5">
              <Button
                className="h-10 rounded-(--radius-tile) px-4"
                variant={staff.isCheckedIn ? "outline" : "default"}
                onClick={toggleClock}
                disabled={isPending || (!staff.isCheckedIn && !staff.canClock)}
                title={!staff.isCheckedIn ? staff.clockDisabledReason : undefined}
              >
                <Clock3 className="size-4" />
                {staff.clockLabel}
              </Button>
              <Link
                href={`/staff/${staff.id}/edit`}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-10 rounded-(--radius-tile) px-4"
                )}
              >
                <UserRoundPen className="size-4" />
                Edit profile
              </Link>
            </div>
            {!staff.isCheckedIn && !staff.canClock && staff.clockDisabledReason ? (
              <p className="text-right text-xs text-muted-foreground">
                {staff.clockDisabledReason}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <div className="state-pop rounded-(--radius-card) border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {!error && message ? (
        <div className="state-pop rounded-(--radius-card) border border-primary/20 bg-primary/8 px-3 py-2.5 text-sm text-primary">
          {message}
        </div>
      ) : null}

      <Tabs
        value={selectedTab}
        onValueChange={setSelectedTab}
        className="section-reveal-delayed gap-3.5"
      >
        <TabsList
          variant="line"
          className="w-full justify-start gap-6 overflow-x-auto rounded-none border-b border-border/80 p-0"
        >
          <TabsTrigger className="flex-none px-0 pb-3" value="overview">
            Overview
          </TabsTrigger>
          <TabsTrigger className="flex-none px-0 pb-3" value="schedule">
            Schedule
          </TabsTrigger>
          <TabsTrigger className="flex-none px-0 pb-3" value="messages">
            Messages
            {adminThread.unreadForAdmin > 0 ? (
              <span
                className="size-2 rounded-full bg-primary"
                aria-label={`${adminThread.unreadForAdmin} unread message${adminThread.unreadForAdmin === 1 ? "" : "s"}`}
              />
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="overview"
          className="grid items-start gap-3.5 xl:grid-cols-[320px_minmax(0,1fr)]"
        >
          <aside>
            <section className="surface-card flex flex-col p-3.5 xl:sticky xl:top-[76px]">
              <div className="flex items-center gap-3">
                <Avatar size="lg" shape="square">
                  <AvatarFallback className="bg-white text-xs font-semibold text-primary">
                    {getInitials(staff.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-foreground">
                    {staff.name}
                  </h2>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                    {staff.role || "Staff"}
                  </p>
                </div>
              </div>
              <dl className="mt-4 space-y-2.5">
                <OverviewLine label="Phone" value={staff.phone} />
                <OverviewLine label="Email" value={staff.email} />
                <OverviewLine label="Status" value={statusLabels[staff.status]} />
                <OverviewLine label="Weekly hours" value={`${staff.weeklyHours}h`} />
              </dl>
              {staff.profileNote ? (
                <div className="mt-3 border-t border-border/70 pt-3">
                  <p className="text-sm text-muted-foreground">Staff notes</p>
                  <p className="mt-1 text-sm leading-5 text-foreground">{staff.profileNote}</p>
                </div>
              ) : null}
              <Link
                href={`/staff/${staff.id}/edit`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "mt-4 w-full rounded-(--radius-tile) bg-white"
                )}
              >
                <UserRoundPen className="size-4" />
                Edit profile
              </Link>

              <div className="mt-5 border-t border-border/70 pt-4">
                <SidebarSectionHeader icon={CalendarClock} title="Today" />
                {staff.shiftLabel ? (
                  <div className="mt-3 rounded-(--radius-card) bg-primary/7 px-3.5 py-3">
                    <p className="text-sm font-semibold text-foreground">{staff.shiftLabel}</p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {staff.appointmentsToday > 0
                        ? `${staff.appointmentsToday} ${
                            staff.appointmentsToday === 1 ? "appointment" : "appointments"
                          } assigned`
                        : "No appointments assigned"}
                    </p>
                  </div>
                ) : staff.nextShift ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No shift today. Next shift: {staff.nextShift}.
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No shift planned.</p>
                )}
                <Link
                  href="/calendar"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors duration-(--duration-base) hover:text-foreground"
                >
                  View in calendar
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            </section>
            <MobileAccessCard staffId={staff.id} initial={mobileAccess} />
          </aside>

          <div className="grid gap-3">
            {staff.todayAppointments.length > 0 ? (
              <section className="surface-card p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[15px] font-semibold leading-5 text-foreground">
                    Today&apos;s appointments
                  </h2>
                  <Link
                    href="/calendar"
                    className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
                  >
                    Open calendar
                  </Link>
                </div>
                <div className="mt-2 divide-y divide-border/65">
                  {staff.todayAppointments.map((appointment) => (
                    <div key={appointment.id} className="flex items-center gap-3 py-2.5">
                      <span className="w-[72px] shrink-0 text-sm font-semibold tabular-nums text-foreground">
                        {appointment.time}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {appointment.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {appointment.clientName}
                        </p>
                      </div>
                      <AppointmentStatusBadge status={appointment.status} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="surface-card p-3.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold leading-5 text-foreground">
                Recent completed work
              </h2>
              <Link
                href="/calendar"
                className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
              >
                Open calendar
              </Link>
            </div>
            {staff.recentAppointments.length > 0 ? (
              <div className="mt-2 divide-y divide-border/65">
                {staff.recentAppointments.map((appointment) => (
                  <div key={appointment.id} className="flex items-start gap-3 py-2.5">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-(--radius-tile) border border-border/80 bg-white text-primary">
                      <CalendarCheck2 className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {appointment.title}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {appointment.date} · {appointment.time}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {appointment.clientName}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3">
                <WorkspaceEmptyState
                  icon={CalendarCheck2}
                  title="No completed appointments yet"
                  description="Completed appointments assigned to this staff member will appear here."
                  compact
                />
              </div>
            )}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="schedule" className="grid items-start gap-3 xl:grid-cols-2">
          <section className="surface-card p-3.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold leading-5 text-foreground">
                Planned shifts
              </h2>
              <Link
                href={`/staff/${staff.id}/edit`}
                className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
              >
                Manage shifts
              </Link>
            </div>
            {staff.schedule.length > 0 ? (
              <div className="mt-2 divide-y divide-border/65">
                {staff.schedule.map((shift) => (
                  <div key={shift.id} className="flex items-center gap-3 py-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-tile) border border-border/80 bg-white text-primary">
                      <CalendarClock className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{shift.day}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {shift.startTime} – {shift.endTime}
                      </p>
                    </div>
                    {shift.status && shift.status !== "Scheduled" ? (
                      <span className="inline-flex rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                        {shift.status}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3">
                <WorkspaceEmptyState
                  icon={CalendarClock}
                  title="No planned shifts"
                  description="Plan this week's shifts from the staff edit page."
                  actionHref={`/staff/${staff.id}/edit`}
                  actionLabel="Manage shifts"
                  compact
                />
              </div>
            )}
          </section>

          <section className="surface-card p-3.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold leading-5 text-foreground">
                Time tracked this week
              </h2>
              <span className="text-xs font-semibold text-muted-foreground">
                {staff.weeklyHours}h total
              </span>
            </div>
            {staff.weekTimeEntries.length > 0 ? (
              <div className="mt-2 divide-y divide-border/65">
                {staff.weekTimeEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 py-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-tile) border border-border/80 bg-white text-primary">
                      <Clock3 className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{entry.day}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {entry.checkedIn}
                        {entry.checkedOut ? ` – ${entry.checkedOut}` : ""}
                      </p>
                    </div>
                    {entry.checkedOut ? (
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                        {entry.duration}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                        <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                        In progress
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No time tracked this week yet. Check-ins and check-outs will appear here.
              </p>
            )}
          </section>
        </TabsContent>

        <TabsContent value="messages">
          <StaffMessagesTab
            staffId={staff.id}
            staffName={staff.name}
            initial={adminThread}
          />
        </TabsContent>
      </Tabs>
    </WorkspacePage>
  );
}

function AppointmentStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold capitalize",
        (normalized === "completed" || normalized === "confirmed") &&
          "bg-emerald-100 text-emerald-700",
        normalized === "cancelled" && "bg-destructive/10 text-destructive",
        normalized === "pending" && "bg-primary/10 text-primary",
        normalized === "scheduled" && "bg-secondary text-muted-foreground"
      )}
    >
      {normalized}
    </span>
  );
}

function SidebarSectionHeader({
  icon: Icon,
  title,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <h2 className="inline-flex items-center gap-3 text-[15px] font-semibold leading-5 text-foreground">
      <span className="flex size-8 items-center justify-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
        <Icon className="size-4" />
      </span>
      {title}
    </h2>
  );
}

function OverviewLine({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }

  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
