"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarPlus2,
  UsersRound,
} from "lucide-react";

import { DashboardMessagesCard } from "@/components/dashboard/dashboard-messages-card";
import { KpiValue } from "@/components/workspace/kpi-value";
import {
  WorkspaceCard,
  WorkspaceEmptyState,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/workspace/workspace-layout";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn, getInitials } from "@/lib/utils";
import type {
  DashboardAppointmentStatus,
  DashboardTrendTone,
  DashboardViewModel,
} from "@/lib/dashboard";

const statusDotStyles: Record<DashboardAppointmentStatus, string> = {
  confirmed: "bg-primary",
  completed: "bg-emerald-500",
  pending: "bg-amber-500",
  cancelled: "bg-destructive",
};

const statusTextStyles: Record<DashboardAppointmentStatus, string> = {
  confirmed: "text-primary",
  completed: "text-emerald-600",
  pending: "text-amber-600",
  cancelled: "text-destructive",
};

const solidButtonClasses = cn(
  buttonVariants({ variant: "solid" }),
  "rounded-(--radius-card) px-3.5"
);

type KpiChipTone = "neutral" | "good" | "attention" | "accent";

const kpiChipStyles: Record<KpiChipTone, string> = {
  neutral: "bg-secondary/80 text-muted-foreground",
  good: "bg-emerald-50 text-emerald-700",
  attention: "bg-amber-50 text-amber-700",
  accent: "bg-primary/8 text-primary",
};

function KpiTile({
  label,
  value,
  chipLabel,
  chipTone = "neutral",
  href,
  className,
}: {
  label: string;
  value: string;
  chipLabel: string;
  chipTone?: KpiChipTone;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "surface-card card-hover group/kpi relative flex min-h-[104px] flex-col justify-between p-3.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45",
        className
      )}
    >
      <ArrowUpRight className="absolute right-3 top-3 size-3.5 text-muted-foreground opacity-0 transition-opacity duration-(--duration-base) group-hover/kpi:opacity-100" />
      <p className="text-[10px] font-semibold uppercase leading-3 tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-[1.6rem] font-semibold leading-none tracking-tight text-foreground">
        <KpiValue key={value} value={value} />
      </p>
      <p
        className={cn(
          "mt-2.5 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4",
          kpiChipStyles[chipTone]
        )}
      >
        {chipLabel}
      </p>
    </Link>
  );
}

function TrendChip({ label, tone }: { label: string; tone: DashboardTrendTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4",
        tone === "up"
          ? "bg-emerald-50 text-emerald-700"
          : tone === "down"
            ? "bg-red-50 text-red-600"
            : "bg-secondary/80 text-muted-foreground"
      )}
    >
      {tone === "up" ? (
        <ArrowUpRight className="size-3" />
      ) : tone === "down" ? (
        <ArrowDownRight className="size-3" />
      ) : null}
      {label}
    </span>
  );
}

function NextUpCountdown({ startAtIso }: { startAtIso: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const compute = () => {
      const diffMinutes = Math.round(
        (new Date(startAtIso).getTime() - Date.now()) / 60000
      );

      if (diffMinutes <= 0 || diffMinutes > 720) {
        setLabel(null);
        return;
      }

      if (diffMinutes < 60) {
        setLabel(`in ${diffMinutes} min`);
        return;
      }

      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      setLabel(minutes === 0 ? `in ${hours} h` : `in ${hours} h ${minutes} min`);
    };

    compute();
    const interval = window.setInterval(compute, 30000);

    return () => window.clearInterval(interval);
  }, [startAtIso]);

  if (!label) {
    return null;
  }

  return (
    <span className="text-[10px] font-semibold normal-case tracking-normal text-primary/70">
      · {label}
    </span>
  );
}

export function DashboardOverview({ view }: { view: DashboardViewModel }) {
  const primaryAction = view.quickActions[0];
  const completedToday = view.appointments.filter(
    (appointment) => appointment.status === "completed"
  ).length;
  const upcomingToday = view.appointments.filter(
    (appointment) => appointment.status === "confirmed" || appointment.status === "pending"
  );
  const visits = view.visitsSummary;
  const revenue = view.revenueSummary;
  const maxVisits = Math.max(...visits.days.map((day) => day.count), 1);

  return (
    <WorkspacePage size="wide">
      <WorkspaceHeader
        title="Dashboard"
        description={view.dateLabel}
        actions={
          primaryAction ? (
            <Link href={primaryAction.href} className={solidButtonClasses}>
              <CalendarPlus2 className="size-4" />
              {primaryAction.label}
            </Link>
          ) : null
        }
      />

      <div className="stagger-children grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          label="Appointments today"
          href="/calendar"
          value={view.appointments.length.toString()}
          chipLabel={
            upcomingToday.length > 0
              ? `${upcomingToday.length} upcoming`
              : view.appointments.length > 0
                ? "Day complete"
                : "None booked"
          }
          chipTone={
            upcomingToday.length > 0
              ? "accent"
              : view.appointments.length > 0
                ? "good"
                : "neutral"
          }
        />
        <KpiTile
          label="Completion rate"
          href="/reports"
          value={`${view.analyticsSummary.completionRate}%`}
          chipLabel={`${view.analyticsSummary.completedThisMonth} done this month`}
          chipTone={completedToday > 0 ? "good" : "neutral"}
        />
        <KpiTile
          label="Active clients"
          href="/clients"
          value={view.analyticsSummary.activeClients.toString()}
          chipLabel={
            view.lastClients.length > 0
              ? `${view.lastClients.length} recently active`
              : "No records yet"
          }
        />
        <KpiTile
          label="Revenue this month"
          href="/reports"
          value={revenue.monthToDateDisplay}
          chipLabel={
            revenue.hasOutstanding
              ? `${revenue.outstandingDisplay} outstanding`
              : revenue.paidCountThisMonth > 0
                ? `${revenue.paidCountThisMonth} payments recorded`
                : "No payments yet"
          }
          chipTone={
            revenue.hasOutstanding
              ? "attention"
              : revenue.paidCountThisMonth > 0
                ? "good"
                : "neutral"
          }
        />
        <KpiTile
          label="Unread messages"
          href="/inbox"
          value={view.unreadSummary.unreadCount.toString()}
          chipLabel={
            view.unreadSummary.unreadCount > 0 ? "Needs replies" : "All caught up"
          }
          chipTone={view.unreadSummary.unreadCount > 0 ? "attention" : "good"}
          className="max-lg:col-span-2"
        />
      </div>

      <div className="section-reveal grid grid-cols-1 items-stretch gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <WorkspaceCard
          fill
          title="Visits"
          description="Booked visits, cancellations excluded."
          className="flex flex-col"
          contentClassName="flex-1"
          action={
            <Link
              href="/reports"
              className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
            >
              View reports
            </Link>
          }
        >
          <div className="grid h-full gap-4 sm:grid-cols-[176px_minmax(0,1fr)]">
            <div className="grid grid-cols-1 content-start gap-2 min-[480px]:grid-cols-3 sm:grid-cols-1">
              <div className="rounded-(--radius-card) border border-border/75 bg-[#fafbfd] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Last 7 days
                </p>
                <p className="mt-1.5 text-xl font-semibold leading-none tracking-tight text-foreground">
                  {visits.lastSevenDays}
                </p>
                <div className="mt-2">
                  <TrendChip
                    label={visits.deltaLabel ?? "No prior week data"}
                    tone={visits.deltaTone}
                  />
                </div>
              </div>
              <div className="rounded-(--radius-card) border border-border/75 bg-[#fafbfd] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Last 30 days
                </p>
                <p className="mt-1.5 text-xl font-semibold leading-none tracking-tight text-foreground">
                  {visits.lastThirtyDays}
                </p>
              </div>
              <div className="rounded-(--radius-card) border border-border/75 bg-[#fafbfd] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  All time
                </p>
                <p className="mt-1.5 text-xl font-semibold leading-none tracking-tight text-foreground">
                  {visits.allTime}
                </p>
              </div>
            </div>
            <div className="flex h-full min-h-[12rem] items-end gap-2 sm:gap-3">
              {visits.days.map((day, index) => (
                <div
                  key={day.key}
                  className="group/bar relative flex h-full min-w-0 flex-1 flex-col items-center gap-1.5"
                >
                  <span className="pointer-events-none absolute -top-6 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#1b2540] px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 shadow-(--shadow-pop) transition-opacity duration-(--duration-fast) group-hover/bar:opacity-100">
                    {day.count} {day.count === 1 ? "visit" : "visits"} · {day.label}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold leading-3 transition-colors duration-(--duration-fast)",
                      day.count > 0 ? "text-foreground" : "text-muted-foreground/70",
                      "group-hover/bar:text-primary"
                    )}
                  >
                    {day.count}
                  </span>
                  <div className="relative w-full max-w-9 flex-1 overflow-hidden rounded-full bg-[#eef2f7] transition-colors duration-(--duration-fast) group-hover/bar:bg-[#e6ecf5]">
                    <div
                      className="bar-rise absolute inset-x-0 bottom-0 rounded-full bg-primary transition-colors duration-(--duration-fast) group-hover/bar:bg-(--primary-hover)"
                      style={{
                        height:
                          day.count > 0
                            ? `${Math.max((day.count / maxVisits) * 100, 9)}%`
                            : "0%",
                        animationDelay: `${index * 50}ms`,
                      }}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-[11px] leading-4",
                      day.isToday
                        ? "font-semibold text-primary"
                        : "font-medium text-muted-foreground"
                    )}
                  >
                    {day.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </WorkspaceCard>

        <WorkspaceCard
          fill
          title={
            <span className="inline-flex items-center gap-2">
              Today&apos;s schedule
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary/8 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary">
                {view.appointments.length}
              </span>
            </span>
          }
          action={
            <Link
              href="/calendar"
              className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
            >
              Open calendar
            </Link>
          }
        >
          {view.nextAppointment ? (
            <Link
              href={`/calendar/${view.nextAppointment.id}/edit`}
              className="mb-3 block rounded-(--radius-card) border border-primary/15 bg-primary/[0.05] p-3 transition-colors duration-(--duration-base) hover:bg-primary/[0.08]"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-(--radius-tile) bg-primary text-xs font-semibold text-primary-foreground">
                  {getInitials(view.nextAppointment.clientName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                      Next up
                    </span>
                    <NextUpCountdown
                      startAtIso={view.nextAppointment.startAtIso}
                    />
                  </span>
                  <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
                    {view.nextAppointment.clientName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {view.nextAppointment.service} · {view.nextAppointment.staffName}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold leading-4 text-primary-foreground">
                  {view.nextAppointment.time}
                </span>
              </div>
            </Link>
          ) : null}

          {view.appointments.length > 0 ? (
            <div
              className={cn(
                "max-h-[268px] divide-y divide-border/65 overflow-y-auto pr-1",
                view.appointments.length > 4 &&
                  "[mask-image:linear-gradient(to_bottom,black_calc(100%-32px),transparent)]"
              )}
            >
              {view.appointments.map((appointment) => (
                <Link
                  key={appointment.id}
                  href={`/calendar/${appointment.id}/edit`}
                  className="flex items-center gap-3 rounded-(--radius-tile) px-1.5 py-2.5 transition-colors duration-(--duration-base) hover:bg-[#f7f9fc]"
                >
                  <span className="w-16 shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {appointment.time}
                  </span>
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      statusDotStyles[appointment.status]
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm font-semibold text-foreground",
                        appointment.status === "cancelled" &&
                          "text-muted-foreground line-through"
                      )}
                    >
                      {appointment.clientName}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {appointment.service} · {appointment.staffName}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em]",
                      statusTextStyles[appointment.status]
                    )}
                  >
                    {appointment.status}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-1.5 py-8 text-center">
              <span className="mb-1 flex size-9 items-center justify-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
                <CalendarPlus2 className="size-4" />
              </span>
              <p className="text-sm font-semibold text-foreground">
                No appointments today
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                The day&apos;s schedule will appear here.
              </p>
              <Link
                href="/calendar/new"
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
              >
                Book an appointment
                <ArrowUpRight className="size-3" />
              </Link>
            </div>
          )}
        </WorkspaceCard>
      </div>

      <div className="section-reveal-delayed grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <WorkspaceCard
          fill
          title="Recent activity"
          action={
            <Link
              href="/clients"
              className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
            >
              View clients
            </Link>
          }
        >
          {view.lastClients.length > 0 ? (
            <div className="divide-y divide-border/65">
              {view.lastClients.slice(0, 4).map((client) => (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="flex items-center gap-3 rounded-(--radius-tile) px-1.5 py-2.5 transition-colors duration-(--duration-base) hover:bg-[#f7f9fc]"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-tile) border border-border/80 bg-white text-xs font-semibold text-primary">
                    {getInitials(client.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {client.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {client.updatedLabel}
                    </span>
                  </span>
                  <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          ) : (
            <WorkspaceEmptyState
              icon={UsersRound}
              title="No recent client activity"
              description="Client record updates will appear here."
              compact
            />
          )}
        </WorkspaceCard>

        <DashboardMessagesCard
          initialUnreadCount={view.unreadSummary.unreadCount}
          conversations={view.conversationPreviews}
        />

        <WorkspaceCard
          fill
          title="Staff today"
          action={
            <Link
              href="/staff"
              className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
            >
              View staff
            </Link>
          }
        >
          {view.staffToday.length > 0 ? (
            <div className="divide-y divide-border/65">
              {view.staffToday.slice(0, 4).map((staffMember) => (
                <div
                  key={staffMember.id}
                  className="flex items-center gap-3 px-1.5 py-2.5"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-tile) border border-border/80 bg-white text-xs font-semibold text-primary">
                    {getInitials(staffMember.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {staffMember.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {staffMember.role}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4",
                      staffMember.appointmentsToday > 0
                        ? "bg-primary/8 text-primary"
                        : "bg-secondary/80 text-muted-foreground"
                    )}
                  >
                    {staffMember.appointmentsToday > 0
                      ? `${staffMember.appointmentsToday} today`
                      : "Free"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <WorkspaceEmptyState
              icon={UsersRound}
              title="No active staff yet"
              description="Add staff members to see today's coverage here."
              actionHref="/staff/new"
              actionLabel="Add staff"
              compact
            />
          )}
        </WorkspaceCard>
      </div>
    </WorkspacePage>
  );
}
