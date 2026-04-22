import Link from "next/link";
import {
  ArrowRight,
  CalendarPlus2,
  CirclePlus,
  MessageSquareText,
  BadgeCheck,
  UsersRound,
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

function DashboardEmptyState({ view }: { view: DashboardViewModel }) {
  const { scheduleState, recentClientId } = view.workspaceState;
  const isNoClients = scheduleState === "no-clients";
  const isNoAppointments = scheduleState === "no-appointments";
  const bookingHref = recentClientId
    ? `/calendar?new=1&client=${recentClientId}`
    : "/calendar?new=1";

  const title = isNoClients
    ? "Start by adding your first client"
    : isNoAppointments
      ? "Book the first appointment"
      : "No appointments today";
  const description = isNoClients
    ? "Create a client once, then Clinicare can carry that person into booking, inbox, and future history."
    : isNoAppointments
      ? "Your client list is ready. Add the first appointment so the calendar and dashboard start showing real work."
      : "Your schedule is clear for today. Book another visit or open the calendar to review upcoming days.";

  return (
    <div className="overflow-hidden rounded-[1.25rem] border border-dashed border-primary/25 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),var(--primary-soft))] p-6 shadow-[0_18px_44px_rgba(20,32,51,0.055)]">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl space-y-3">
          <div className="flex size-11 items-center justify-center rounded-[1rem] bg-primary/12 text-primary">
            {isNoClients ? <UsersRound className="size-5" /> : <CalendarPlus2 className="size-5" />}
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            <p className="max-w-xl text-sm leading-7 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:w-56 lg:ml-auto">
          <Link
            href={isNoClients ? "/clients?new=1&next=calendar" : bookingHref}
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "w-full justify-between rounded-[0.95rem]"
            )}
          >
            <span>{isNoClients ? "Add first client" : "Book appointment"}</span>
            <ArrowRight className="size-4" />
          </Link>
          {!isNoClients ? (
            <Link
              href="/clients?new=1"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "w-full justify-between rounded-[0.95rem] bg-white/72"
              )}
            >
              <span>New client</span>
              <CirclePlus className="size-4" />
            </Link>
          ) : null}
          <Link
            href="/inbox"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "w-full justify-between rounded-[0.95rem] bg-white/72"
            )}
          >
            <span>Open inbox</span>
            <MessageSquareText className="size-4" />
          </Link>
        </div>
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
          {view.appointments.length > 0 ? (
            view.appointments.map((appointment) => (
              <AppointmentRow key={appointment.id} appointment={appointment} />
            ))
          ) : (
            <DashboardEmptyState view={view} />
          )}
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

          <section className="surface-soft space-y-3 rounded-[1.1rem] px-4 py-4">
            <div className="flex items-center gap-2">
              <BadgeCheck className="size-4 text-primary" />
              <p className="text-base font-semibold text-foreground">
                Vela {view.planSummary.planName} plan
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-border/70 pt-3">
              <p className="text-sm text-muted-foreground">Plan status</p>
              <p className="text-sm font-semibold text-primary">
                {view.planSummary.statusLabel}
              </p>
            </div>
          </section>

          <section className="surface-soft space-y-4 rounded-[1.1rem] px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-foreground">
                Appointments for today
              </p>
              <p className="text-3xl font-semibold tracking-tight text-primary">
                {view.appointments.length}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {view.appointments.length === 1
                ? "1 appointment scheduled today."
                : `${view.appointments.length} appointments scheduled today.`}
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
