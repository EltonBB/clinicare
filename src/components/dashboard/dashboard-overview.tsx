import Link from "next/link";
import {
  ArrowRight,
  CalendarPlus2,
  CirclePlus,
  Sparkles,
} from "lucide-react";

import { DashboardUnreadCard } from "@/components/dashboard/dashboard-unread-card";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import type {
  DashboardAppointment,
  DashboardAppointmentStatus,
  DashboardViewModel,
} from "@/lib/dashboard";

const statusStyles: Record<DashboardAppointmentStatus, string> = {
  confirmed: "bg-primary/12 text-primary ring-1 ring-primary/10",
  pending: "bg-secondary/92 text-muted-foreground ring-1 ring-border/70",
  cancelled: "bg-destructive/10 text-destructive ring-1 ring-destructive/10",
};

function AppointmentStatus({ status }: { status: DashboardAppointmentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
        statusStyles[status]
      )}
    >
      {status}
    </span>
  );
}

function AppointmentRow({ appointment }: { appointment: DashboardAppointment }) {
  return (
    <div className="interactive-lift grid gap-4 rounded-[1.05rem] border border-border/80 bg-white/94 px-5 py-5 shadow-[0_10px_24px_rgba(20,32,51,0.032)] transition-[box-shadow,transform,border-color] duration-200 hover:border-border hover:shadow-[0_14px_28px_rgba(20,32,51,0.04)] sm:grid-cols-[124px_1fr_auto] sm:items-center">
      <div className="border-border/75 sm:border-r sm:pr-5">
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
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-0">
      <section
        className="section-reveal space-y-6 xl:pr-10"
        data-tour="dashboard-overview"
      >
        <div className="space-y-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Today overview
          </p>
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground sm:text-[2.8rem]">
            {view.heading}
          </h1>
          <p className="max-w-lg text-lg leading-8 text-muted-foreground">
            {view.dateLabel}
          </p>
        </div>

        <div className="space-y-3">
          {view.appointments.map((appointment) => (
            <AppointmentRow key={appointment.id} appointment={appointment} />
          ))}
        </div>
      </section>

      <aside className="section-reveal-delayed xl:pl-8">
        <div className="space-y-5 rounded-[1.2rem] border border-border/75 bg-white/92 p-5 shadow-[0_10px_24px_rgba(20,32,51,0.032)] xl:min-h-[calc(100vh-11rem)] xl:p-6">

          <section className="space-y-4" data-tour="dashboard-quick-actions">
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
                    "h-11 w-full justify-between rounded-[0.9rem] px-4",
                    action.tone === "secondary" && "bg-white/78"
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

          <DashboardUnreadCard
            businessName={view.businessName}
            initialSummary={view.unreadSummary}
          />

          <section className="surface-soft space-y-4 rounded-[1.1rem] px-4 py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <p className="text-base font-semibold text-foreground">
                {view.planSummary.planName}
              </p>
            </div>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-foreground">Plan status</p>
                  <p className="text-sm font-semibold text-primary">
                    {view.planSummary.statusLabel}
                  </p>
                </div>
                <p className="text-sm leading-7 text-muted-foreground">
                  {view.planSummary.detail}
                </p>
              </div>

              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground transition-transform duration-200 hover:translate-x-0.5"
              >
                View plans
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>

          <section className="surface-soft space-y-4 rounded-[1.1rem] px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-foreground">Daily capacity</p>
              <p className="text-sm font-semibold text-primary">
                {view.planSummary.capacityUsedPercent}%
              </p>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/80 shadow-[inset_0_1px_2px_rgba(20,32,51,0.08)]">
              <div
                className="h-2 rounded-full bg-[linear-gradient(90deg,rgba(92,143,212,0.9),rgba(38,137,135,0.92))]"
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
