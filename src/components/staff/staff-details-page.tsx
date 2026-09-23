"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Clock3,
  UserRoundPen,
} from "lucide-react";

import {
  checkInStaffAction,
  checkOutStaffAction,
  markStaffCheckInsSeenAction,
} from "@/app/(workspace)/staff/actions";
import { MobileAccessCard } from "@/components/staff/mobile-access-card";
import { StaffMessagesTab } from "@/components/staff/staff-messages-tab";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WorkspaceCard,
  WorkspaceEmptyState,
  WorkspacePage,
} from "@/components/workspace/workspace-layout";
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

// The <TabsTrigger> count below (Overview, Schedule, Messages) is mirrored
// as STAFF_DETAIL_TAB_COUNT in lib/skeleton-counts.ts, not exported from
// here — this is a "use client" module, and staff/[staffId]/loading.tsx (a
// Server Component) importing a value from one gets a client reference, not
// the number itself (Codex). Keep both in sync if the tab list changes.

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
  const [selectedTab, setSelectedTab] = useState<string>(initialTab);
  // Local mirror of adminThread.unreadForAdmin: the prop is an SSR snapshot
  // that never changes after mount, but opening the Messages tab marks it
  // read server-side — without this, the dot would stay lit for the rest of
  // this page's client session even while the admin is looking at the read
  // messages. Zeroed here (not just server-side) for instant feedback.
  const [unreadForAdmin, setUnreadForAdmin] = useState(
    initialTab === "messages" ? 0 : adminThread.unreadForAdmin
  );
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Viewing this staff member's page (their checked-in status is in the
    // header regardless of tab) acknowledges any pending check-in the bell
    // is holding for them.
    void markStaffCheckInsSeenAction(staff.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTabChange(value: string) {
    setSelectedTab(value);
    if (value === "messages") {
      setUnreadForAdmin(0);
    }
  }

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
          <div className="flex min-w-0 items-center gap-3.5">
            <Avatar shape="square" className="size-20">
              <AvatarFallback className="bg-white text-3xl font-semibold text-primary">
                {getInitials(staff.name)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
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

              {staff.isCheckedIn ? (
                <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-emerald-600">
                  <span className="inline-block size-2 rounded-full bg-emerald-500" />
                  Checked in now
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-2.5 xl:justify-end">
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
              <p className="text-xs text-muted-foreground xl:text-right">
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
        onValueChange={handleTabChange}
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
            {unreadForAdmin > 0 ? (
              <span
                className="size-2 rounded-full bg-primary"
                aria-label={`${unreadForAdmin} unread message${unreadForAdmin === 1 ? "" : "s"}`}
              />
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="overview"
          className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
        >
          <div className="grid gap-3">
            <WorkspaceCard
              title="Today"
              action={
                staff.shiftLabel ? (
                  <span className="text-xs font-semibold text-muted-foreground">{staff.shiftLabel}</span>
                ) : undefined
              }
            >
              {staff.todayAppointments.length > 0 ? (
                <div className="-mx-2">
                  {staff.todayAppointments.map((appointment) => (
                    <div
                      key={appointment.id}
                      className="flex items-center gap-3 rounded-(--radius-card) px-2 py-2.5 transition-colors duration-(--duration-base) hover:bg-secondary/40"
                    >
                      <span className="w-[72px] shrink-0 text-sm font-semibold tabular-nums text-foreground">
                        {appointment.time}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{appointment.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{appointment.clientName}</p>
                      </div>
                      <AppointmentStatusBadge status={appointment.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {staff.shiftLabel
                    ? "No appointments today."
                    : staff.nextShift
                      ? `No shift today. Next shift: ${staff.nextShift}.`
                      : "No shift planned."}
                </p>
              )}
            </WorkspaceCard>

            <WorkspaceCard
              title="Recent work"
              action={
                <Link
                  href="/calendar"
                  className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
                >
                  Open calendar
                </Link>
              }
            >
              {staff.recentAppointments.length > 0 ? (
                <div className="-mx-2">
                  {staff.recentAppointments.map((appointment) => (
                    <div
                      key={appointment.id}
                      className="rounded-(--radius-card) px-2 py-2.5 transition-colors duration-(--duration-base) hover:bg-secondary/40"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-foreground">{appointment.title}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {appointment.date} · {appointment.time}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{appointment.clientName}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No completed appointments yet.</p>
              )}
            </WorkspaceCard>
          </div>

          <div className="grid gap-3">
            <WorkspaceCard title="Profile">
              <dl className="space-y-2.5">
                <OverviewLine label="Role" value={staff.role || "Staff"} />
                <OverviewLine label="Phone" value={staff.phone} />
                <OverviewLine label="Email" value={staff.email} />
              </dl>
              {staff.profileNote ? (
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="mt-1 text-sm leading-5 text-foreground">{staff.profileNote}</p>
                </div>
              ) : null}
            </WorkspaceCard>
            <MobileAccessCard staffId={staff.id} initial={mobileAccess} />
          </div>
        </TabsContent>

        <TabsContent value="schedule">
          {staff.schedule.length === 0 && staff.weekTimeEntries.length === 0 ? (
            <WorkspaceEmptyState
              icon={CalendarClock}
              title="No shifts planned"
              className="py-12"
              actionHref={`/staff/${staff.id}/edit`}
              actionLabel="Plan shifts"
            />
          ) : (
            <div className="grid items-start gap-3 xl:grid-cols-2">
              <WorkspaceCard
                title="Planned shifts"
                action={
                  <Link
                    href={`/staff/${staff.id}/edit`}
                    className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
                  >
                    Manage
                  </Link>
                }
              >
                {staff.schedule.length > 0 ? (
                  <div className="-mx-2">
                    {staff.schedule.map((shift) => (
                      <div
                        key={shift.id}
                        className="flex items-center justify-between gap-3 rounded-(--radius-card) px-2 py-2.5 transition-colors duration-(--duration-base) hover:bg-secondary/40"
                      >
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
                  <p className="text-sm text-muted-foreground">No shifts planned.</p>
                )}
              </WorkspaceCard>

              <WorkspaceCard
                title="Time tracked this week"
                action={
                  <span className="text-xs font-semibold text-muted-foreground">
                    {staff.weeklyHours}h total
                  </span>
                }
              >
                {staff.weekTimeEntries.length > 0 ? (
                  <div className="-mx-2">
                    {staff.weekTimeEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center gap-3 rounded-(--radius-card) px-2 py-2.5 transition-colors duration-(--duration-base) hover:bg-secondary/40"
                      >
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
                  <p className="text-sm text-muted-foreground">No time tracked yet.</p>
                )}
              </WorkspaceCard>
            </div>
          )}
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

function AppointmentStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold capitalize",
        normalized === "completed" && "bg-emerald-100 text-emerald-700",
        normalized === "confirmed" && "bg-primary/10 text-primary",
        normalized === "cancelled" && "bg-destructive/10 text-destructive",
        normalized === "pending" && "bg-amber-100 text-amber-700",
        normalized === "scheduled" && "bg-secondary text-muted-foreground"
      )}
    >
      {normalized}
    </span>
  );
}
