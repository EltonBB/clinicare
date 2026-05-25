"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useState, useTransition } from "react";
import {
  ArrowLeft,
  BarChart3,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Mail,
  Phone,
  UserRoundPen,
} from "lucide-react";

import { checkInStaffAction, checkOutStaffAction } from "@/app/(workspace)/staff/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WorkspaceKpiCard,
  WorkspaceKpiGrid,
  WorkspacePage,
  WorkspaceRail,
} from "@/components/workspace/workspace-layout";
import { cn } from "@/lib/utils";
import type { StaffRecord } from "@/lib/staff";

type StaffDetailsPageProps = {
  initialStaff: StaffRecord;
};

function staffInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

function statusLabel(status: StaffRecord["status"]) {
  if (status === "ACTIVE") return "Active";
  if (status === "AWAY") return "Away";
  return "Inactive";
}

function statusDot(status: StaffRecord["status"]) {
  return cn(
    "inline-block size-2 rounded-full",
    status === "ACTIVE" && "bg-primary",
    status === "AWAY" && "bg-amber-500",
    status === "INACTIVE" && "bg-border"
  );
}

export function StaffDetailsPage({ initialStaff }: StaffDetailsPageProps) {
  const [staff, setStaff] = useState(initialStaff);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedTab, setSelectedTab] = useState("overview");
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
      <section className="space-y-3.5 pb-1">
        <Link
          href="/staff"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to staff
        </Link>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_640px] xl:items-start">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar className="size-20 rounded-full bg-primary/10 text-primary">
              <AvatarFallback className="bg-primary/10 text-3xl font-semibold text-primary">
                {staffInitials(staff.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate text-[28px] font-semibold leading-tight tracking-tight text-foreground">
                  {staff.name}
                </h1>
                <span className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {statusLabel(staff.status)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2 font-medium text-foreground">
                  <CalendarClock className="size-4 text-muted-foreground" />
                  {staff.role || "Staff"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Phone className="size-4 text-muted-foreground" />
                  {staff.phone || "No phone saved"}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Mail className="size-4 text-muted-foreground" />
                  {staff.email || "No email saved"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className={statusDot(staff.status)} />
                  {staff.isCheckedIn ? "Checked in now" : statusLabel(staff.status)}
                </span>
                <span className="hidden text-border sm:inline">/</span>
                <span>Today shift: {staff.shiftLabel}</span>
              </div>
            </div>
          </div>

          <div className="w-full space-y-3 xl:justify-self-end">
            <WorkspaceKpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
              <WorkspaceKpiCard compact icon={CalendarClock} label="Appts today" value={staff.appointmentsToday.toString()} helper="Assigned today" />
              <WorkspaceKpiCard compact icon={CheckCircle2} label="Completion" value={`${staff.completionRate}%`} helper="Finalized work" />
              <WorkspaceKpiCard compact icon={CalendarCheck2} label="This month" value={staff.completedThisMonth.toString()} helper="Completed visits" />
              <WorkspaceKpiCard compact icon={Clock3} label="Weekly hours" value={`${staff.weeklyHours}h`} helper="Tracked time" />
            </WorkspaceKpiGrid>
            <div className="flex flex-wrap justify-start gap-3 xl:justify-end">
              <Button
                className="h-10 rounded-[0.65rem] px-4"
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
                className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-[0.65rem] px-4")}
              >
                <UserRoundPen className="size-4" />
                Edit
              </Link>
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {!error && message ? (
        <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
          {message}
        </div>
      ) : null}

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="section-reveal-delayed gap-3.5">
        <TabsList variant="line" className="w-full justify-start gap-6 overflow-x-auto rounded-none border-b border-border/80 p-0">
          <TabsTrigger className="flex-none px-0 pb-3" value="overview">Overview</TabsTrigger>
          <TabsTrigger className="flex-none px-0 pb-3" value="schedule">Schedule</TabsTrigger>
          <TabsTrigger className="flex-none px-0 pb-3" value="appointments">Appointments</TabsTrigger>
          <TabsTrigger className="flex-none px-0 pb-3" value="profile">Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid items-start gap-3 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="grid gap-3 xl:col-start-2">
            <div className="grid gap-3.5 lg:grid-cols-2">
              <Panel title="Staff information" icon={CheckCircle2} actionHref={`/staff/${staff.id}/edit`} actionLabel="Edit">
                <dl className="mt-5 space-y-4">
                  <Detail label="Name" value={staff.name} />
                  <Detail label="Role" value={staff.role || "Staff"} />
                  <Detail label="Status" value={statusLabel(staff.status)} />
                  <Detail icon={Phone} label="Phone" value={staff.phone || "No phone saved"} />
                  <Detail icon={Mail} label="Email" value={staff.email || "No email saved"} />
                </dl>
              </Panel>

              <Panel title="Operational summary" icon={BarChart3}>
                <dl className="mt-5 space-y-4">
                  <Detail label="Appointments today" value={staff.appointmentsToday.toString()} />
                  <Detail label="Completed this month" value={staff.completedThisMonth.toString()} />
                  <Detail label="Completion rate" value={`${staff.completionRate}%`} />
                  <Detail label="Weekly hours" value={`${staff.weeklyHours}h`} />
                  <Detail label="Current shift" value={staff.shiftLabel} />
                </dl>
              </Panel>
            </div>

            <Panel title="Recent completed appointments" icon={CalendarCheck2}>
              <div className="mt-3 overflow-hidden rounded-[0.72rem] border border-border/75">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Appointment</th>
                      <th className="px-4 py-3 text-left">Client</th>
                      <th className="px-4 py-3 text-left">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70 bg-white">
                    {staff.recentAppointments.map((appointment) => (
                      <tr key={appointment.id}>
                        <td className="px-4 py-3 font-medium text-foreground">{appointment.date}</td>
                        <td className="px-4 py-3 text-foreground">{appointment.title}</td>
                        <td className="px-4 py-3 text-muted-foreground">{appointment.clientName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{appointment.time}</td>
                      </tr>
                    ))}
                    {staff.recentAppointments.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-sm text-muted-foreground">
                          No completed appointments yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <WorkspaceRail className="xl:col-start-1 xl:row-start-1">
            <Panel title="Today schedule" icon={CalendarClock}>
              <div className="mt-4 rounded-[0.9rem] bg-primary/6 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">Shift</p>
                <p className="mt-2 text-xl font-semibold text-foreground">{staff.shiftLabel}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {staff.appointmentsToday} appointments assigned today.
                </p>
              </div>
              <Detail label="Next shift" value={staff.nextShift} className="mt-4" />
            </Panel>

            <Panel title="Performance snapshot" icon={BarChart3}>
              <div className="mt-4 space-y-4">
                <ProgressRow label="Completion rate" value={staff.completionRate} />
                <ProgressRow label="Today utilization" value={Math.min(staff.appointmentsToday * 25, 100)} />
              </div>
            </Panel>

            <Panel title="Record health">
              <div className="mt-4 space-y-3 text-sm">
                <Detail label="Completed this month" value={staff.completedThisMonth.toString()} />
                <Detail label="Recent completed" value={staff.recentAppointments.length.toString()} />
                <Detail label="Checked in" value={staff.isCheckedIn ? "Yes" : "No"} />
              </div>
            </Panel>
          </WorkspaceRail>
        </TabsContent>

        <TabsContent value="schedule" className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Panel title="Schedule coverage" icon={CalendarClock}>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <MiniMetric label="Today shift" value={staff.shiftLabel} />
              <MiniMetric label="Next shift" value={staff.nextShift} />
              <MiniMetric label="Weekly hours" value={`${staff.weeklyHours}h`} />
            </div>
            <div className="mt-4 overflow-hidden rounded-[0.72rem] border border-border/75">
              <div className="grid grid-cols-[minmax(0,1fr)_100px_100px_100px] bg-secondary/35 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                <span>Day</span>
                <span>Start</span>
                <span>End</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-border/70">
                {staff.schedule.map((shift) => (
                  <div key={shift.id} className="grid grid-cols-[minmax(0,1fr)_100px_100px_100px] px-4 py-3 text-sm">
                    <span className="font-medium text-foreground">{shift.day}</span>
                    <span className="text-muted-foreground">{shift.startTime}</span>
                    <span className="text-muted-foreground">{shift.endTime}</span>
                    <span className="font-medium text-primary">{shift.status}</span>
                  </div>
                ))}
                {staff.schedule.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-muted-foreground">
                    No planned shifts. Add shifts from the staff edit page.
                  </div>
                ) : null}
              </div>
            </div>
          </Panel>
          <Panel title="Shift status" icon={Clock3}>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {staff.isCheckedIn
                ? "This staff member is currently checked in."
                : "This staff member is not checked in right now."}
            </p>
          </Panel>
        </TabsContent>

        <TabsContent value="appointments" className="surface-card p-3.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">Completed work</h2>
            <Link href="/calendar" className="text-sm font-semibold text-primary">Open calendar</Link>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {staff.recentAppointments.map((appointment) => (
              <div key={appointment.id} className="rounded-[0.72rem] border border-border/75 px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-foreground">{appointment.title}</p>
                  <p className="text-xs text-muted-foreground">{appointment.date}</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{appointment.time} - {appointment.clientName}</p>
              </div>
            ))}
            {staff.recentAppointments.length === 0 ? (
              <p className="rounded-[0.9rem] border border-dashed border-border/90 px-4 py-6 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                No completed appointments yet.
              </p>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="profile" className="grid gap-3.5 lg:grid-cols-2">
          <Panel title="Contact profile" icon={UserRoundPen}>
            <dl className="mt-5 space-y-4">
              <Detail label="Name" value={staff.name} />
              <Detail label="Role" value={staff.role || "Staff"} />
              <Detail icon={Phone} label="Phone" value={staff.phone || "No phone saved"} />
              <Detail icon={Mail} label="Email" value={staff.email || "No email saved"} />
            </dl>
          </Panel>
          <Panel title="Operational note">
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              {staff.profileNote || "No staff note yet."}
            </p>
          </Panel>
        </TabsContent>
      </Tabs>
    </WorkspacePage>
  );
}

function Panel({
  title,
  children,
  icon: Icon,
  actionHref,
  actionLabel,
}: {
  title: string;
  children: React.ReactNode;
  icon?: ComponentType<{ className?: string }>;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <section className="surface-card p-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-3 text-base font-semibold text-foreground">
          {Icon ? (
            <span className="vela-icon-tile size-8 rounded-[0.68rem]">
              <Icon className="size-4" />
            </span>
          ) : null}
          {title}
        </h2>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-[0.65rem]")}>
            {actionLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Detail({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[120px_minmax(0,1fr)] items-start gap-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)]", className)}>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center justify-end gap-2 text-right font-medium text-foreground">
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
        <span className="min-w-0 break-words">{value}</span>
      </dd>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[0.9rem] border border-border/75 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div className="vela-gradient h-full rounded-full" style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}
