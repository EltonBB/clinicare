"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus2,
  CheckCircle2,
  Clock3,
  CirclePlus,
  LockKeyhole,
  LineChart,
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

const contentWidgetValues: DashboardWidget[] = [
  "todayAppointments",
  "lastClients",
  "nextStaffAppointment",
  "analytics",
];

const dashboardWidgetOptions: Array<{
  value: DashboardWidget;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
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
  {
    value: "analytics",
    title: "Analytics",
    description: "Shows performance insights for Pro workspaces.",
    icon: <LineChart className="size-5" />,
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

function buildActionWidgets(view: DashboardViewModel): DashboardViewModel["quickActions"] {
  const recentClientId = view.workspaceState.recentClientId;
  return [
    {
      label:
        view.workspaceState.appointmentCount === 0
          ? "Book first appointment"
          : "New appointment",
      href: recentClientId
        ? `/calendar?new=1&client=${recentClientId}`
        : "/calendar?new=1",
      tone: "primary",
    },
    {
      label:
        view.workspaceState.clientCount === 0 ? "Add first client" : "New client",
      href:
        view.workspaceState.clientCount === 0
          ? "/clients?new=1&next=calendar"
          : "/clients?new=1",
      tone: "secondary",
    },
    {
      label: "Open inbox",
      href: "/inbox",
      tone: "secondary",
    },
  ];
}

function TodayAppointmentsWidget({ view }: { view: DashboardViewModel }) {
  return (
    <section className="space-y-3 rounded-[1.2rem] border border-border/80 bg-white/92 p-5 shadow-[0_12px_28px_rgba(20,32,51,0.035)] lg:col-span-2">
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
        <p className="rounded-[0.9rem] bg-muted/45 px-4 py-3 text-sm text-muted-foreground">
          No appointments scheduled today.
        </p>
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

function AnalyticsWidget({ view }: { view: DashboardViewModel }) {
  const isPro = view.planSummary.isPro;

  return (
    <section
      className={cn(
        "rounded-[1.2rem] border border-border/80 bg-white/92 p-5 shadow-[0_12px_28px_rgba(20,32,51,0.035)]",
        !isPro && "bg-[linear-gradient(135deg,rgba(255,255,255,0.96),var(--primary-soft))]"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="flex size-11 items-center justify-center rounded-[1rem] bg-primary/10 text-primary">
          {isPro ? <LineChart className="size-5" /> : <LockKeyhole className="size-5" />}
        </span>
        {!isPro ? (
          <span className="rounded-full border border-primary/20 bg-white/80 px-3 py-1 text-xs font-semibold text-primary">
            Pro
          </span>
        ) : null}
      </div>
      <p className="mt-5 text-base font-semibold text-foreground">
        {isPro ? "Analytics" : "Analytics locked"}
      </p>
      {isPro ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-3">
          <div className="rounded-[0.9rem] bg-muted/45 px-4 py-3">
            <p className="text-2xl font-semibold text-primary">
              {view.appointments.length}
            </p>
            <p className="text-xs text-muted-foreground">Today</p>
          </div>
          <div className="rounded-[0.9rem] bg-muted/45 px-4 py-3">
            <p className="text-2xl font-semibold text-primary">
              {view.workspaceState.clientCount}
            </p>
            <p className="text-xs text-muted-foreground">Clients</p>
          </div>
          <div className="rounded-[0.9rem] bg-muted/45 px-4 py-3">
            <p className="text-2xl font-semibold text-primary">
              {view.unreadSummary.unreadCount}
            </p>
            <p className="text-xs text-muted-foreground">Unread</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Upgrade to Pro to unlock appointment, client, and message performance stats.
          </p>
          <Link
            href="/pricing"
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "h-11 w-full justify-between rounded-[0.9rem] px-4"
            )}
          >
            <span>Upgrade to Pro</span>
            <LineChart className="size-4" />
          </Link>
        </div>
      )}
    </section>
  );
}

function DashboardCustomizer({
  selectedWidgets,
  onSelectedWidgetsChange,
}: {
  selectedWidgets: DashboardWidget[];
  onSelectedWidgetsChange: (widgets: DashboardWidget[]) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [widgets, setWidgets] = useState<DashboardWidget[]>(selectedWidgets);
  const [savedWidgets, setSavedWidgets] = useState<DashboardWidget[]>(selectedWidgets);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggleWidget(widget: DashboardWidget) {
    setWidgets((current) => {
      const nextWidgets = current.includes(widget)
        ? current.filter((item) => item !== widget)
        : [...current, widget];
      onSelectedWidgetsChange(nextWidgets);
      return nextWidgets;
    });
  }

  function cancelChanges() {
    setWidgets(savedWidgets);
    onSelectedWidgetsChange(savedWidgets);
    setMessage("");
    setOpen(false);
  }

  function saveWidgets() {
    startTransition(async () => {
      const result = await saveDashboardWidgetsAction(widgets);

      if (!result.ok) {
        setMessage(result.error ?? "Could not update dashboard widgets.");
        return;
      }

      const nextWidgets = result.widgets ?? widgets;
      setWidgets(nextWidgets);
      setSavedWidgets(nextWidgets);
      onSelectedWidgetsChange(nextWidgets);
      setMessage("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="relative">
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
        <div className="absolute right-0 top-12 z-50 w-[min(760px,calc(100vw-2rem))] rounded-[1.35rem] border border-border bg-white p-5 shadow-[0_18px_48px_rgba(20,32,51,0.13)]">
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
                onClick={cancelChanges}
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
                      "rounded-[1rem] border p-4 text-left transition-[border-color,background-color,transform] hover:-translate-y-0.5",
                      selected
                        ? "border-primary/45 bg-primary/6 ring-1 ring-primary/15"
                        : "border-border bg-white hover:border-primary/25"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
                        {option.icon}
                      </span>
                      <span
                        className={cn(
                          "inline-flex size-7 items-center justify-center rounded-full border transition-colors",
                          selected
                            ? "border-primary/25 bg-primary text-primary-foreground"
                            : "border-border bg-white/80 text-transparent"
                        )}
                      >
                        <CheckCircle2 className="size-4" />
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
                onClick={cancelChanges}
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
      ) : null}
    </div>
  );
}

export function DashboardOverview({ view }: { view: DashboardViewModel }) {
  const [selectedWidgets, setSelectedWidgets] = useState<DashboardWidget[]>(
    view.workspaceState.selectedWidgets
  );
  const actionWidgets = buildActionWidgets(view);
  const selectedContentWidgets = selectedWidgets.filter((widget) =>
    contentWidgetValues.includes(widget)
  );

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-8">
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
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {selectedWidgets.includes("todayAppointments") ? (
            <TodayAppointmentsWidget view={view} />
          ) : null}
          {selectedWidgets.includes("lastClients") ? (
            <LastClientsWidget view={view} />
          ) : null}
          {selectedWidgets.includes("nextStaffAppointment") ? (
            <NextStaffAppointmentWidget view={view} />
          ) : null}
          {selectedWidgets.includes("analytics") ? (
            <AnalyticsWidget view={view} />
          ) : null}
          {selectedContentWidgets.length === 0 ? (
            <div className="rounded-[1.2rem] border border-dashed border-border bg-white/72 p-6 text-sm text-muted-foreground lg:col-span-3">
              Select extra widgets such as today&apos;s appointments, last
              clients, or next staff appointment to fill this workspace area.
            </div>
          ) : null}
        </div>
      </section>

      <aside className="section-reveal-delayed xl:pt-[7.15rem]">
        <div className="space-y-5 rounded-[1.2rem] border border-border/75 bg-white/92 p-5 shadow-[0_10px_24px_rgba(20,32,51,0.032)] xl:min-h-[calc(100vh-11rem)] xl:p-6">
          <DashboardCustomizer
            selectedWidgets={selectedWidgets}
            onSelectedWidgetsChange={setSelectedWidgets}
          />

          <section className="space-y-4" data-tour="dashboard-quick-actions">
            <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Quick actions
            </p>
            <div className="grid gap-3">
              {actionWidgets.length > 0 ? (
                actionWidgets.map((action) => (
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
                    {action.href === "/inbox" ? (
                      <MessageSquareText className="size-4" />
                    ) : action.href.startsWith("/clients") ? (
                      <CirclePlus className="size-4" />
                    ) : (
                      <CalendarPlus2 className="size-4" />
                    )}
                  </Link>
                ))
              ) : (
                <p className="rounded-[0.9rem] bg-muted/45 px-4 py-3 text-sm text-muted-foreground">
                  Select appointment, client, or inbox actions from Customize
                  dashboard.
                </p>
              )}
            </div>
          </section>

          <DashboardUnreadCard initialSummary={view.unreadSummary} />

          <section className="overflow-hidden rounded-[1.1rem] border border-border/80 bg-white/88 shadow-[0_14px_30px_rgba(20,32,51,0.04)]">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 px-4 py-4">
                <span className="flex size-10 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
                  <CalendarPlus2 className="size-4" />
                </span>
                <p className="text-sm font-semibold text-foreground">
                  Appointments today
                </p>
              </div>
              <p className="px-4 text-4xl font-semibold tracking-tight text-primary">
                {view.appointments.length}
              </p>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
