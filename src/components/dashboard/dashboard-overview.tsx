"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CalendarPlus2,
  Check,
  Clock3,
  CirclePlus,
  LineChart,
  MessageSquareText,
  MoreVertical,
  Settings2,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";

import { saveDashboardWidgetsAction } from "@/app/(workspace)/dashboard/actions";
import { DashboardUnreadCard } from "@/components/dashboard/dashboard-unread-card";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  WorkspaceCard,
  WorkspaceEmptyState,
  WorkspaceHeader,
  WorkspaceKpiCard,
  WorkspaceKpiGrid,
  WorkspaceMainGrid,
  WorkspacePage,
  WorkspaceRail,
  WorkspaceSectionGrid,
} from "@/components/workspace/workspace-layout";
import { cn } from "@/lib/utils";
import type {
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
    value: "todayAppointments",
    title: "Today's appointments",
    description: "Shows today's appointments on the dashboard.",
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
    description: "Shows performance insights and upgrade-only stats.",
    icon: <LineChart className="size-5" />,
  },
];

const statusStyles: Record<DashboardAppointmentStatus, string> = {
  confirmed: "bg-primary/12 text-primary ring-1 ring-primary/10",
  completed: "bg-primary/12 text-primary ring-1 ring-primary/10",
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

function DashboardCustomizer({
  availableWidgets,
  selectedWidgets,
  onSelectedWidgetsChange,
}: {
  availableWidgets: DashboardWidget[];
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
    <div className="relative z-[90] flex justify-end">
      <Button
        type="button"
        variant="outline"
        className="h-10 rounded-[0.7rem] bg-white px-3.5"
        onClick={() => setOpen(true)}
        data-tour="dashboard-customize"
      >
        <Settings2 className="size-4" />
        Customize dashboard
      </Button>
      {open ? (
          <div className="absolute right-0 top-12 z-[120] w-[min(680px,calc(100vw-2rem))] rounded-[0.78rem] border border-border/80 bg-white p-3.5 shadow-[0_18px_42px_rgba(20,21,47,0.16)] backdrop-blur-xl">
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
                if (!availableWidgets.includes(option.value)) {
                  return null;
                }

                const selected = widgets.includes(option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleWidget(option.value)}
                    className={cn(
                      "rounded-[0.75rem] border bg-white p-3.5 text-left transition-[border-color,background-color,box-shadow] duration-150",
                      selected
                        ? "border-primary/45 bg-[linear-gradient(135deg,rgba(10,34,255,0.08),rgba(100,182,255,0.08))] shadow-[0_6px_16px_rgba(10,34,255,0.09)]"
                        : "border-border hover:border-primary/25"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 items-center justify-center rounded-[0.9rem] border border-border/80 bg-white text-primary">
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
                        <Check className="size-4" />
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
  const actionWidgets = view.quickActions;
  const completedToday = view.appointments.filter(
    (appointment) => appointment.status === "completed"
  ).length;
  const cancelledToday = view.appointments.filter(
    (appointment) => appointment.status === "cancelled"
  ).length;
  const upcomingToday = view.appointments.filter(
    (appointment) => appointment.status === "confirmed" || appointment.status === "pending"
  );
  const totalTodayMinutes = view.appointments.reduce(
    (sum, appointment) => sum + appointment.durationMinutes,
    0
  );
  const uniqueStaff = Array.from(
    new Map(
      view.appointments.map((appointment) => [
        appointment.staffName,
        view.appointments.filter((entry) => entry.staffName === appointment.staffName),
      ])
    )
  );
  const utilization = Math.min(
    Math.round((totalTodayMinutes / Math.max(8 * 60, 1)) * 100),
    100
  );
  const showTodayAppointments = selectedWidgets.includes("todayAppointments");
  const showLastClients = selectedWidgets.includes("lastClients");
  const showStaffAppointment = selectedWidgets.includes("nextStaffAppointment");
  const showAnalytics = selectedWidgets.includes("analytics");
  const hasVisibleWidgets =
    showTodayAppointments || showLastClients || showStaffAppointment || showAnalytics;

  return (
    <WorkspacePage data-tour="dashboard-overview">
      <WorkspaceHeader
        eyebrow={`Welcome back to ${view.businessName}`}
        title="Dashboard"
        description={view.dateLabel}
        actions={
          <div className="hidden 2xl:block">
            <DashboardCustomizer
              availableWidgets={view.availableWidgets}
              selectedWidgets={selectedWidgets}
              onSelectedWidgetsChange={setSelectedWidgets}
            />
          </div>
        }
      />

      <WorkspaceKpiGrid>
        <WorkspaceKpiCard
          icon={CalendarPlus2}
          label="Appointments today"
          value={view.appointments.length.toString()}
          helper={view.appointments.length > 0 ? `${upcomingToday.length} still upcoming` : "No visits booked"}
        />
        <WorkspaceKpiCard
          icon={TrendingUp}
          label="Completion rate"
          value={`${view.analyticsSummary.completionRate}%`}
          helper={`${view.analyticsSummary.completedThisMonth} completed this month`}
        />
        <WorkspaceKpiCard
          icon={UsersRound}
          label="Active clients"
          value={view.analyticsSummary.activeClients.toString()}
          helper={`${view.lastClients.length} recent records`}
        />
        <WorkspaceKpiCard
          icon={Clock3}
          label="Avg visit length"
          value={`${view.analyticsSummary.averageDurationMinutes || 0}m`}
          helper={`${totalTodayMinutes} min scheduled today`}
          tone={view.analyticsSummary.averageDurationMinutes > 60 ? "warning" : "default"}
        />
      </WorkspaceKpiGrid>

      <WorkspaceMainGrid railWidth="sm" className="gap-2.5 xl:grid-cols-[minmax(0,1fr)_248px]">
        <div className="grid gap-3">
          {!hasVisibleWidgets ? (
            <WorkspaceEmptyState
              compact
              icon={Settings2}
              title="No dashboard widgets selected"
              description="Open Customize dashboard and choose the sections this workspace should show."
            />
          ) : null}

          {showTodayAppointments ? (
          <WorkspaceCard
            fill
            title={
              <span className="inline-flex items-center gap-3">
                Today&apos;s appointments
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {view.appointments.length}
                </span>
              </span>
            }
            action={<Link href="/calendar" className="text-sm font-semibold text-primary">
                View full calendar
              </Link>}
          >
            <div className="divide-y divide-border/70">
              {view.appointments.length > 0 ? (
                view.appointments.map((appointment) => (
                  <Link
                    key={appointment.id}
                    href={`/calendar/${appointment.id}/edit`}
                    className="grid gap-3 rounded-[0.65rem] px-2.5 py-2 text-sm transition-colors hover:bg-[#f7f9fc] md:min-h-[56px] md:grid-cols-[72px_1fr_132px_96px_22px] md:items-center"
                  >
                    <div>
                      <p className="font-semibold text-foreground">{appointment.time}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{appointment.durationMinutes}m</p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{appointment.clientName}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{appointment.service}</p>
                    </div>
                    <p className="text-xs font-medium text-muted-foreground">{appointment.staffName}</p>
                    <AppointmentStatus status={appointment.status} />
                    <MoreVertical className="size-4 justify-self-end text-muted-foreground" />
                  </Link>
                ))
              ) : (
                <WorkspaceEmptyState
                  icon={CalendarPlus2}
                  title="No appointments scheduled today"
                  description="Create one to start filling the clinic day."
                  actionHref="/calendar/new"
                  actionLabel="New appointment"
                  compact
                  className="border-0 bg-transparent"
                />
              )}
            </div>
          </WorkspaceCard>
          ) : null}

          {showStaffAppointment ? (
          <WorkspaceSectionGrid columns={2}>
            <WorkspaceCard fill title="Next appointment">
              {view.nextAppointment ? (
                <Link
                  href={`/calendar/${view.nextAppointment.id}/edit`}
                  className="block rounded-[0.55rem] border border-primary/12 bg-[linear-gradient(135deg,rgba(10,34,255,0.08),rgba(100,182,255,0.1))] p-3 transition-colors hover:bg-primary/10"
                >
                  <p className="text-sm font-medium text-muted-foreground">Next up</p>
                  <p className="vela-gradient-text mt-1.5 text-2xl font-semibold tracking-tight">
                    {view.nextAppointment.time}
                  </p>
                  <p className="mt-3 font-semibold text-foreground">
                    {view.nextAppointment.clientName}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {view.nextAppointment.service} - {view.nextAppointment.durationMinutes} min
                  </p>
                  <p className="mt-4 text-sm font-medium text-muted-foreground">
                    {view.nextAppointment.staffName}
                  </p>
                </Link>
              ) : (
                <WorkspaceEmptyState
                  icon={Clock3}
                  title="No upcoming appointment"
                  description="The next appointment will appear here when it is booked."
                  compact
                />
              )}
            </WorkspaceCard>

            <WorkspaceCard
              fill
              title="Staff schedule today"
              action={<Link href="/staff" className="text-xs font-semibold text-primary">View all staff</Link>}
            >
              <div className="space-y-3">
                {uniqueStaff.length > 0 ? (
                  uniqueStaff.slice(0, 4).map(([staffName, entries]) => (
                    <div key={staffName} className="grid grid-cols-[1fr_60px_92px] items-center gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{staffName}</p>
                        <p className="text-xs text-muted-foreground">Workspace staff</p>
                      </div>
                      <p className="text-right font-semibold text-foreground">{entries.length}</p>
                      <p className="text-right text-xs text-muted-foreground">
                        {Math.min(entries.length * 25, 100)}% booked
                      </p>
                    </div>
                  ))
                ) : (
                  <WorkspaceEmptyState
                    icon={UsersRound}
                    title="No staff activity scheduled"
                    description="Assigned staff activity will appear here."
                    compact
                  />
                )}
              </div>
            </WorkspaceCard>
          </WorkspaceSectionGrid>
          ) : null}

          {(showLastClients || showAnalytics) ? (
          <WorkspaceSectionGrid columns={2}>
            {showLastClients ? (
            <WorkspaceCard fill title="Recent activity">
              <div className="space-y-3">
                {view.lastClients.slice(0, 5).map((client, index) => (
                  <Link key={client.id} href={`/clients/${client.id}`} className="flex items-center gap-3 text-sm">
                    <span className="flex size-9 items-center justify-center rounded-[0.9rem] border border-border/80 bg-white text-xs font-semibold text-primary">
                      {client.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-foreground">{client.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {index === 0 ? "Recently updated" : "Client record updated"}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{index + 1}h ago</span>
                  </Link>
                ))}
                {view.lastClients.length === 0 ? (
                  <WorkspaceEmptyState
                    icon={UsersRound}
                    title="No recent client activity"
                    description="Client record updates will appear here."
                    compact
                  />
                ) : null}
              </div>
            </WorkspaceCard>
            ) : null}

            {showAnalytics ? (
            <WorkspaceCard
              fill
              title="Clinic health"
              action={<span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground">Live</span>}
            >
              <HealthMetric label="Schedule utilization" value={utilization} />
              <HealthMetric label="Completion rate" value={view.analyticsSummary.completionRate} />
              <HealthMetric
                label="Patient follow-up"
                value={view.unreadSummary.unreadCount > 0 ? 72 : 96}
              />
              <Link href="/reports" className="mt-4 inline-flex text-sm font-semibold text-primary">
                View full reports
              </Link>
            </WorkspaceCard>
            ) : null}
          </WorkspaceSectionGrid>
          ) : null}
        </div>

        <WorkspaceRail className="gap-2.5">
          <WorkspaceCard title="Command center" compact className="self-start">
            <div className="grid gap-2">
              {actionWidgets.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className={cn(
                    buttonVariants({
                      variant: action.tone === "primary" ? "default" : "outline",
                      size: "lg",
                    }),
                    "h-10 w-full justify-center rounded-[0.72rem] px-3",
                    action.tone === "secondary" && "bg-white"
                  )}
                >
                  {action.href === "/inbox" ? (
                    <MessageSquareText className="size-4" />
                  ) : action.href.startsWith("/clients") ? (
                    <CirclePlus className="size-4" />
                  ) : (
                    <CalendarPlus2 className="size-4" />
                  )}
                  {action.label}
                </Link>
              ))}
            </div>
            <div className="mt-3 space-y-2.5 border-t border-border/70 pt-3 text-sm">
              <GlanceRow label="Appointments" value={view.appointments.length} />
              <GlanceRow label="Completed" value={completedToday} tone="good" />
              <GlanceRow label="Cancelled" value={cancelledToday} tone="danger" />
              <GlanceRow label="Upcoming" value={upcomingToday.length} />
            </div>
            <Link href="/calendar" className="mt-3 inline-flex text-sm font-semibold text-primary">
              View today&apos;s calendar
            </Link>
          </WorkspaceCard>

          {showAnalytics ? <DashboardUnreadCard initialSummary={view.unreadSummary} /> : null}
        </WorkspaceRail>
      </WorkspaceMainGrid>
    </WorkspacePage>
  );
}

function HealthMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-2 border-b border-border/70 py-3 last:border-b-0">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,var(--brand-start),var(--brand-end))]" style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function GlanceRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "good" | "danger";
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/70 pb-3 last:border-b-0 last:pb-0">
      <span className="flex items-center gap-2 text-muted-foreground">
        {tone === "good" ? (
          <Check className="size-4 text-emerald-600" />
        ) : tone === "danger" ? (
          <X className="size-4 text-destructive" />
        ) : (
          <Activity className="size-4 text-primary" />
        )}
        {label}
      </span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
