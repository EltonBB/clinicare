import Link from "next/link";
import {
  ArrowRight,
  CalendarPlus2,
  CirclePlus,
  MessageSquareMore,
  Sparkles,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import type {
  DashboardAppointment,
  DashboardAppointmentStatus,
  DashboardViewModel,
} from "@/lib/dashboard";

const statusStyles: Record<DashboardAppointmentStatus, string> = {
  confirmed: "bg-primary/12 text-primary",
  pending: "bg-secondary text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

function AppointmentStatus({ status }: { status: DashboardAppointmentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
        statusStyles[status]
      )}
    >
      {status}
    </span>
  );
}

function AppointmentRow({ appointment }: { appointment: DashboardAppointment }) {
  return (
    <div className="grid gap-4 rounded-[0.95rem] border border-border/85 bg-card px-5 py-5 sm:grid-cols-[112px_1fr_auto] sm:items-center">
      <div className="border-border/80 sm:border-r sm:pr-5">
        <p className="text-lg font-semibold tracking-tight text-primary">
          {appointment.time}
        </p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {appointment.durationMinutes} min
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">
          {appointment.clientName}
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          {appointment.service} - {appointment.staffName}
        </p>
      </div>
      <div className="sm:justify-self-end">
        <AppointmentStatus status={appointment.status} />
      </div>
    </div>
  );
}

export function DashboardOverview({ view }: { view: DashboardViewModel }) {
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_326px] xl:gap-0">
      <section className="space-y-6 xl:pr-10">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            {view.heading}
          </h1>
          <p className="text-lg text-muted-foreground">{view.dateLabel}</p>
        </div>

        <div className="space-y-3">
          {view.appointments.map((appointment) => (
            <AppointmentRow key={appointment.id} appointment={appointment} />
          ))}
        </div>
      </section>

      <aside className="xl:pl-8">
        <div className="space-y-8 border-border/80 xl:border-l xl:pl-8">
          <section className="space-y-4">
            <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Quick actions
            </p>
            <div className="grid gap-3">
            {view.quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className={cn(
                  buttonVariants({
                    variant: action.tone === "primary" ? "default" : "outline",
                    size: "lg",
                  }),
                  "h-11 w-full justify-between rounded-[0.75rem] px-4 shadow-none",
                  action.tone === "secondary" && "bg-white"
                )}
              >
                <span>{action.label}</span>
                {action.tone === "primary" ? (
                  <CalendarPlus2 className="size-4" />
                ) : (
                  <CirclePlus className="size-4" />
                )}
              </Link>
            ))}
            </div>
          </section>

          <section className="border-t border-border/80 pt-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <MessageSquareMore className="size-4 text-primary" />
                <p className="text-base font-semibold text-foreground">
                  {view.unreadSummary.title}
                </p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-primary">
                {view.unreadSummary.unreadCount} new
              </span>
            </div>
            <div className="mt-4 border-l-2 border-primary/70 pl-4">
              <p className="text-sm leading-7 text-muted-foreground">
                {view.unreadSummary.description}
              </p>
              <a
                href="/inbox"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary"
              >
                Go to inbox
                <ArrowRight className="size-4" />
              </a>
            </div>
          </section>

          <section className="border-t border-border/80 pt-6">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <p className="text-base font-semibold text-foreground">
                {view.planSummary.planName}
              </p>
            </div>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-foreground">Trial status</p>
                  <p className="text-sm font-semibold text-primary">
                    {view.planSummary.trialLabel}
                  </p>
                </div>
                <p className="text-sm leading-7 text-muted-foreground">
                  {view.planSummary.detail}
                </p>
              </div>

              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground"
              >
                View plans
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>

          <section className="border-t border-border/80 pt-6">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-foreground">Daily capacity</p>
              <p className="text-sm font-semibold text-primary">
                {view.planSummary.capacityUsedPercent}%
              </p>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-white/70">
              <div
                className="h-1.5 rounded-full bg-primary"
                style={{ width: `${view.planSummary.capacityUsedPercent}%` }}
              />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              {view.planSummary.remainingSlotsLabel}
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
