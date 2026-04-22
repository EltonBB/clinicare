"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarPlus2,
  Clock3,
  MessageSquareText,
  Settings2,
  UsersRound,
  X,
} from "lucide-react";

import { saveDashboardWidgetsAction } from "@/app/(workspace)/dashboard/actions";
import { DashboardUnreadCard } from "@/components/dashboard/dashboard-unread-card";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import type {
  DashboardAppointment,
  DashboardAppointmentStatus,
  DashboardWidget,
  DashboardViewModel,
} from "@/lib/dashboard";

const dashboardWidgetOptions: Array<{
  value: DashboardWidget;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: "appointments",
    title: "Book appointments",
    description: "Shows a focused action for creating appointments.",
    icon: <CalendarPlus2 className="size-5" />,
  },
  {
    value: "clients",
    title: "Add clients",
    description: "Shows a focused action for registering clients.",
    icon: <UsersRound className="size-5" />,
  },
  {
    value: "inbox",
    title: "Open inbox",
    description: "Shows a focused action for WhatsApp conversations.",
    icon: <MessageSquareText className="size-5" />,
  },
  {
    value: "todayAppointments",
    title: "Today's appointments",
    description: "Shows today's appointments as a dashboard widget.",
    icon: <CalendarPlus2 className="size-5" />,
  },
  {
    value: "lastClients",
    title: "Last 5 clients",
    description: "Shows recently updated clients for quick access.",
    icon: <UsersRound className="size-5" />,
  },
  {
    value: "nextStaffAppointment",
    title: "Next staff appointment",
    description: "Shows the next upcoming appointment with staff.",
    icon: <Clock3 className="size-5" />,
  },
];

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

function DashboardEmptyState({
  view,
  actionHref,
  actionLabel,
}: {
  view: DashboardViewModel;
  actionHref: string;
  actionLabel: string;
}) {
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
            href={actionHref || (isNoClients ? "/clients?new=1&next=calendar" : bookingHref)}
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "w-full justify-between rounded-[0.95rem]"
            )}
          >
            <span>{actionLabel || (isNoClients ? "Add first client" : "Book appointment")}</span>
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ActionWidget({ action }: { action: DashboardViewModel["quickActions"][number] }) {
  return (
    <section className="rounded-[1.2rem] border border-border/80 bg-white/92 p-5 shadow-[0_12px_28px_rgba(20,32,51,0.035)]">
      <div className="flex items-start justify-between gap-4">
        <span className="flex size-11 items-center justify-center rounded-[1rem] bg-primary/10 text-primary">
          {action.href === "/inbox" ? (
            <MessageSquareText className="size-5" />
          ) : action.href.startsWith("/clients") ? (
            <UsersRound className="size-5" />
          ) : (
            <CalendarPlus2 className="size-5" />
          )}
        </span>
      </div>
      <p className="mt-5 text-base font-semibold text-foreground">
        {action.label}
      </p>
      <Link
        href={action.href}
        className={cn(
          buttonVariants({
            variant: action.tone === "primary" ? "default" : "outline",
            size: "lg",
          }),
          "mt-4 h-11 w-full justify-between rounded-[0.9rem] px-4",
          action.tone === "secondary" && "bg-white/78"
        )}
      >
        <span>{action.label}</span>
        <ArrowRight className="size-4" />
      </Link>
    </section>
  );
}

function TodayAppointmentsWidget({ view }: { view: DashboardViewModel }) {
  const appointmentAction = view.quickActions.find((action) =>
    action.href.startsWith("/calendar")
  );

  return (
    <section className="space-y-3 rounded-[1.2rem] border border-border/80 bg-white/92 p-5 shadow-[0_12px_28px_rgba(20,32,51,0.035)] md:col-span-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">
            Today&apos;s appointments
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {view.appointments.length} scheduled today
          </p>
        </div>
        <span className="text-3xl font-semibold text-primary">
          {view.appointments.length}
        </span>
      </div>
      {view.appointments.length > 0 ? (
        <div className="space-y-3">
          {view.appointments.map((appointment) => (
            <AppointmentRow key={appointment.id} appointment={appointment} />
          ))}
        </div>
      ) : (
        <DashboardEmptyState
          view={view}
          actionHref={appointmentAction?.href ?? "/calendar?new=1"}
          actionLabel={appointmentAction?.label ?? "Book appointment"}
        />
      )}
    </section>
  );
}

function LastClientsWidget({ view }: { view: DashboardViewModel }) {
  return (
    <section className="rounded-[1.2rem] border border-border/80 bg-white/92 p-5 shadow-[0_12px_28px_rgba(20,32,51,0.035)]">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-foreground">Last 5 clients</p>
        <UsersRound className="size-4 text-primary" />
      </div>
      <div className="mt-4 space-y-2">
        {view.lastClients.length > 0 ? (
          view.lastClients.map((client) => (
            <Link
              key={client.id}
              href={`/clients?client=${client.id}`}
              className="block rounded-[0.9rem] bg-muted/45 px-4 py-3 transition-colors hover:bg-primary/8"
            >
              <p className="text-sm font-semibold text-foreground">{client.name}</p>
              <p className="text-xs text-muted-foreground">{client.phone || "No phone"}</p>
            </Link>
          ))
        ) : (
          <p className="rounded-[0.9rem] bg-muted/45 px-4 py-3 text-sm text-muted-foreground">
            No clients yet.
          </p>
        )}
      </div>
    </section>
  );
}

function NextStaffAppointmentWidget({ view }: { view: DashboardViewModel }) {
  const appointment = view.nextAppointment;

  return (
    <section className="rounded-[1.2rem] border border-border/80 bg-white/92 p-5 shadow-[0_12px_28px_rgba(20,32,51,0.035)]">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-foreground">
          Next staff appointment
        </p>
        <Clock3 className="size-4 text-primary" />
      </div>
      {appointment ? (
        <div className="mt-5 rounded-[1rem] bg-primary/8 p-4">
          <p className="text-lg font-semibold text-primary">{appointment.time}</p>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {appointment.service}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {appointment.clientName} with {appointment.staffName}
          </p>
        </div>
      ) : (
        <p className="mt-4 rounded-[0.9rem] bg-muted/45 px-4 py-3 text-sm text-muted-foreground">
          No upcoming staff appointments.
        </p>
      )}
    </section>
  );
}

function DashboardCustomizer({
  selectedWidgets,
}: {
  selectedWidgets: DashboardWidget[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [widgets, setWidgets] = useState<DashboardWidget[]>(selectedWidgets);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggleWidget(widget: DashboardWidget) {
    setWidgets((current) =>
      current.includes(widget)
        ? current.filter((item) => item !== widget)
        : [...current, widget]
    );
  }

  function saveWidgets() {
    startTransition(async () => {
      const result = await saveDashboardWidgetsAction(widgets);

      if (!result.ok) {
        setMessage(result.error ?? "Could not update dashboard widgets.");
        return;
      }

      setMessage("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10 rounded-[0.9rem] bg-white/82"
        onClick={() => setOpen(true)}
      >
        <Settings2 className="size-4" />
        Customize dashboard
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/18 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[1.35rem] border border-border bg-white p-5 shadow-[0_28px_80px_rgba(20,32,51,0.18)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold text-foreground">
                  Select dashboard widgets
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose what appears when this workspace opens the dashboard.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setOpen(false)}
                aria-label="Close dashboard customization"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {dashboardWidgetOptions.map((option) => {
                const selected = widgets.includes(option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleWidget(option.value)}
                    className={cn(
                      "rounded-[1rem] border p-4 text-left transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-0.5",
                      selected
                        ? "border-primary/45 bg-primary/8 shadow-[0_16px_34px_var(--primary-shadow)]"
                        : "border-border bg-white"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
                        {option.icon}
                      </span>
                      <span
                        className={cn(
                          "inline-flex h-7 items-center rounded-full border px-3 text-xs font-semibold",
                          selected
                            ? "border-primary/25 bg-primary text-primary-foreground"
                            : "border-border bg-white/80 text-muted-foreground"
                        )}
                      >
                        {selected ? "Selected" : "Select"}
                      </span>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-foreground">
                      {option.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>
            {message ? (
              <p className="mt-4 rounded-[0.9rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {message}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-[0.9rem] bg-white"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-[0.9rem]"
                onClick={saveWidgets}
                disabled={isPending}
              >
                {isPending ? "Saving..." : "Save widgets"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function DashboardOverview({ view }: { view: DashboardViewModel }) {
  const selectedWidgets = view.workspaceState.selectedWidgets;
  const actionWidgets = view.quickActions;

  return (
    <div className="space-y-8">
      <section
        className="section-reveal space-y-6"
        data-tour="dashboard-overview"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
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
          <DashboardCustomizer selectedWidgets={selectedWidgets} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {actionWidgets.map((action) => (
            <ActionWidget key={action.label} action={action} />
          ))}
          {selectedWidgets.includes("todayAppointments") ? (
            <TodayAppointmentsWidget view={view} />
          ) : null}
          {selectedWidgets.includes("lastClients") ? (
            <LastClientsWidget view={view} />
          ) : null}
          {selectedWidgets.includes("nextStaffAppointment") ? (
            <NextStaffAppointmentWidget view={view} />
          ) : null}
          {selectedWidgets.includes("inbox") ? (
            <DashboardUnreadCard initialSummary={view.unreadSummary} />
          ) : null}
          {selectedWidgets.length === 0 ? (
            <div className="rounded-[1.2rem] border border-border bg-white/92 p-6 text-sm text-muted-foreground">
              No widgets selected. Use Customize dashboard to add widgets.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
