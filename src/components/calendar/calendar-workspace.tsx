"use client";

import Link from "next/link";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Plus,
  UsersRound,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  WorkspaceEmptyState,
  WorkspaceCard,
  WorkspaceHeader,
  WorkspaceMainGrid,
  WorkspacePage,
  WorkspaceRail,
} from "@/components/workspace/workspace-layout";
import { MonthGrid } from "@/components/workspace/month-grid";
import { cn } from "@/lib/utils";
import type {
  CalendarAppointment,
  CalendarAppointmentStatus,
  CalendarScheduleBlock,
  CalendarViewModel,
} from "@/lib/calendar";

type CalendarView = "day" | "week" | "month";

type CalendarWorkspaceProps = {
  initialView: CalendarViewModel;
  ownerName: string;
};

const views: CalendarView[] = ["day", "week", "month"];
const slotHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const hourRowHeight = 64;

const eventClasses: Record<CalendarAppointmentStatus, string> = {
  confirmed: "border-primary/25 bg-[#eef2ff] text-[#16219c] hover:bg-[#e4eaff]",
  pending: "border-amber-300/70 bg-amber-50 text-amber-900 hover:bg-amber-100/70",
  completed:
    "border-emerald-300/70 bg-emerald-50 text-emerald-900 hover:bg-emerald-100/60",
  cancelled: "border-border/80 bg-[#f6f7f9] text-muted-foreground hover:bg-[#eef0f4]",
};

const eventBarClasses: Record<CalendarAppointmentStatus, string> = {
  confirmed: "bg-primary",
  pending: "bg-amber-400",
  completed: "bg-emerald-500",
  cancelled: "bg-slate-300",
};

const statusDotClasses: Record<CalendarAppointmentStatus, string> = {
  confirmed: "bg-primary",
  completed: "bg-emerald-500",
  pending: "bg-amber-500",
  cancelled: "bg-destructive",
};

const monthChipClasses: Record<CalendarAppointmentStatus, string> = {
  confirmed: "bg-primary/10 text-primary",
  pending: "bg-amber-50 text-amber-800",
  completed: "bg-emerald-50 text-emerald-800",
  cancelled: "bg-[#f1f3f6] text-muted-foreground line-through",
};

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function weekDays(activeDate: Date) {
  const start = startOfWeek(activeDate, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function monthDays(activeDate: Date) {
  const monthStart = startOfMonth(activeDate);
  const monthEnd = endOfMonth(activeDate);

  return eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
    end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
  });
}

function appointmentHeight(startTime: string, endTime: string) {
  const duration = Math.max(timeToMinutes(endTime) - timeToMinutes(startTime), 30);
  return `${Math.max((duration / 60) * hourRowHeight, 42)}px`;
}

function appointmentOffset(startTime: string) {
  const firstMinute = slotHours[0] * 60;
  const startMinute = timeToMinutes(startTime);
  return `${Math.max(((startMinute - firstMinute) / 60) * hourRowHeight, 0)}px`;
}

function dayCapacityMinutes(date: Date, businessHours: CalendarViewModel["businessHours"]) {
  const weekday = (date.getDay() + 6) % 7;
  const hours = businessHours.find((item) => item.weekday === weekday);

  if (!hours || !hours.enabled) {
    return 0;
  }

  return Math.max(timeToMinutes(hours.end) - timeToMinutes(hours.start), 0);
}

function hourOpenForDay(
  date: Date,
  hour: number,
  businessHours: CalendarViewModel["businessHours"]
) {
  const weekday = (date.getDay() + 6) % 7;
  const hours = businessHours.find((item) => item.weekday === weekday);

  if (!hours || !hours.enabled) {
    return false;
  }

  const cellStart = hour * 60;
  const cellEnd = cellStart + 60;

  return cellEnd > timeToMinutes(hours.start) && cellStart < timeToMinutes(hours.end);
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function AppointmentCard({
  appointment,
  index,
}: {
  appointment: CalendarAppointment;
  index: number;
}) {
  return (
    <Link
      href={`/calendar/${appointment.id}/edit`}
      className={cn(
        "event-enter absolute inset-x-1 flex flex-col justify-center overflow-hidden rounded-(--radius-tile) border py-1 pl-3.5 pr-2.5 text-left transition-[background-color,border-color,box-shadow,transform] duration-(--duration-base) ease-out-quint hover:z-20 hover:-translate-y-px hover:shadow-(--shadow-card-hover)",
        eventClasses[appointment.status]
      )}
      style={{
        top: appointmentOffset(appointment.startTime),
        height: appointmentHeight(appointment.startTime, appointment.endTime),
        animationDelay: `${Math.min(index, 6) * 45}ms`,
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-1 left-1 w-[3px] rounded-full",
          eventBarClasses[appointment.status]
        )}
      />
      <span
        className={cn(
          "block truncate text-xs font-semibold leading-4",
          appointment.status === "cancelled" && "line-through"
        )}
      >
        {appointment.clientName}
      </span>
      <span className="block truncate text-[11px] leading-4 opacity-80">
        {appointment.startTime} · {appointment.service || "Appointment"}
      </span>
    </Link>
  );
}

function BlockCard({ block, index }: { block: CalendarScheduleBlock; index: number }) {
  return (
    <div
      className="event-enter absolute inset-x-1 flex flex-col justify-center overflow-hidden rounded-(--radius-tile) border border-slate-300/70 bg-slate-100/90 py-1 pl-3.5 pr-2.5 text-left text-slate-700"
      style={{
        top: appointmentOffset(block.startTime),
        height: appointmentHeight(block.startTime, block.endTime),
        animationDelay: `${Math.min(index, 6) * 45}ms`,
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 w-[3px] rounded-full bg-slate-400"
      />
      <span className="flex items-center gap-1 truncate text-xs font-semibold leading-4">
        <CalendarX2 className="size-3 shrink-0" />
        {block.title}
      </span>
      <span className="block truncate text-[11px] leading-4 opacity-80">
        {block.startTime} - {block.endTime}
      </span>
    </div>
  );
}

function DatePickerPopover({
  activeDate,
  todayDate,
  appointmentDateKeys,
  onSelect,
}: {
  activeDate: Date;
  todayDate: Date;
  appointmentDateKeys: Set<string>;
  onSelect: (day: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(activeDate));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative ml-auto">
      <button
        type="button"
        aria-label="Jump to date"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setMonthCursor(startOfMonth(activeDate));
          setOpen((current) => !current);
        }}
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-(--radius-card) border border-border/75 bg-white text-muted-foreground transition-colors duration-(--duration-base) hover:bg-[#f7f9fc] hover:text-foreground active:bg-[#eef2f8] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45",
          open && "border-primary/40 bg-[#f5f8ff] text-primary"
        )}
      >
        <CalendarDays className="size-4" />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Choose a date"
          className="state-pop absolute right-0 top-[calc(100%+8px)] z-50 w-[284px] rounded-(--radius-card) border border-border/80 bg-white p-3 shadow-(--shadow-pop)"
        >
          <MonthGrid
            monthCursor={monthCursor}
            onMonthChange={setMonthCursor}
            onSelectDay={(day) => {
              onSelect(day);
              setOpen(false);
            }}
            getDayState={(day) => ({
              isOutsideMonth: !isSameMonth(day, monthCursor),
              isToday: isSameDay(day, todayDate),
              isSelected: isSameDay(day, activeDate),
              showDot: appointmentDateKeys.has(format(day, "yyyy-MM-dd")),
            })}
          />
          <div className="mt-2 border-t border-border/70 pt-2 text-right">
            <button
              type="button"
              onClick={() => {
                onSelect(todayDate);
                setOpen(false);
              }}
              className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
            >
              Go to today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NowLine() {
  const [topPx, setTopPx] = useState<number | null>(null);

  useEffect(() => {
    const compute = () => {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const start = slotHours[0] * 60;
      const end = (slotHours[slotHours.length - 1] + 1) * 60;

      setTopPx(
        minutes < start || minutes > end
          ? null
          : ((minutes - start) / 60) * hourRowHeight
      );
    };

    compute();
    const interval = window.setInterval(compute, 60000);

    return () => window.clearInterval(interval);
  }, []);

  if (topPx === null) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: topPx }}>
      <div className="relative h-px bg-primary">
        <span
          aria-hidden="true"
          className="now-ping absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary"
        />
        <span className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary" />
      </div>
    </div>
  );
}

function UtilizationRing({ value }: { value: number }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setProgress(value));
      return () => cancelAnimationFrame(frame);
    }

    const duration = 750;
    let startedAt: number | null = null;
    let frame = 0;

    const tick = (now: number) => {
      startedAt = startedAt ?? now;
      const elapsed = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - elapsed, 4);
      setProgress(Math.round(value * eased));

      if (elapsed < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <div
      className="grid size-20 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(var(--primary) ${progress}%, #eef2f7 0)`,
      }}
    >
      <div className="grid size-16 place-items-center rounded-full bg-white text-center">
        <span>
          <span className="block text-lg font-semibold leading-5 tabular-nums text-foreground">
            {progress}%
          </span>
          <span className="text-[9px] text-muted-foreground">Booked</span>
        </span>
      </div>
    </div>
  );
}

export function CalendarWorkspace({ initialView }: CalendarWorkspaceProps) {
  const [view, setView] = useState<CalendarView>("week");
  const [activeDate, setActiveDate] = useState(() => parseISO(initialView.initialDate));
  const appointments = initialView.appointments;
  const scheduleBlocks = initialView.scheduleBlocks;
  const hasClients = initialView.clients.length > 0;
  const todayDate = useMemo(
    () => parseISO(initialView.initialDate),
    [initialView.initialDate]
  );

  const currentWeek = useMemo(() => weekDays(activeDate), [activeDate]);
  const currentMonth = useMemo(() => monthDays(activeDate), [activeDate]);
  const appointmentDateKeys = useMemo(
    () =>
      new Set(
        appointments
          .filter((appointment) => appointment.status !== "cancelled")
          .map((appointment) => appointment.date)
      ),
    [appointments]
  );
  const selectedDateKey = format(activeDate, "yyyy-MM-dd");
  const visibleDates = useMemo(() => {
    if (view === "day") {
      return [activeDate];
    }

    if (view === "week") {
      return currentWeek;
    }

    return currentMonth.filter((day) => isSameMonth(day, activeDate));
  }, [activeDate, currentMonth, currentWeek, view]);

  const visibleAppointments = useMemo(() => {
    if (view === "day") {
      return appointments.filter((appointment) => appointment.date === selectedDateKey);
    }

    if (view === "week") {
      const visibleKeys = new Set(currentWeek.map((day) => format(day, "yyyy-MM-dd")));
      return appointments.filter((appointment) => visibleKeys.has(appointment.date));
    }

    const visibleKeys = new Set(currentMonth.map((day) => format(day, "yyyy-MM-dd")));
    return appointments.filter((appointment) => visibleKeys.has(appointment.date));
  }, [appointments, currentMonth, currentWeek, selectedDateKey, view]);

  const visibleBlocks = useMemo(() => {
    if (view === "day") {
      return scheduleBlocks.filter((block) => block.date === selectedDateKey);
    }

    if (view === "week") {
      const visibleKeys = new Set(currentWeek.map((day) => format(day, "yyyy-MM-dd")));
      return scheduleBlocks.filter((block) => visibleKeys.has(block.date));
    }

    const visibleKeys = new Set(currentMonth.map((day) => format(day, "yyyy-MM-dd")));
    return scheduleBlocks.filter((block) => visibleKeys.has(block.date));
  }, [currentMonth, currentWeek, scheduleBlocks, selectedDateKey, view]);

  function shiftRange(direction: "prev" | "next") {
    startTransition(() => {
      setActiveDate((current) => {
        if (view === "day") {
          return addDays(current, direction === "next" ? 1 : -1);
        }

        if (view === "week") {
          return direction === "next" ? addWeeks(current, 1) : subWeeks(current, 1);
        }

        return direction === "next" ? addMonths(current, 1) : subMonths(current, 1);
      });
    });
  }

  const weekStart = currentWeek[0];
  const weekEnd = currentWeek[6];
  const rangeLabel =
    view === "day"
      ? format(activeDate, "EEEE, MMMM d")
      : view === "month"
        ? format(activeDate, "MMMM yyyy")
        : isSameMonth(weekStart, weekEnd)
          ? `${format(weekStart, "MMM d")} – ${format(weekEnd, "d, yyyy")}`
          : `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;
  const gridKey = `${view}-${format(visibleDates[0] ?? activeDate, "yyyy-MM-dd")}`;
  const selectedDayAppointments = appointments
    .filter((appointment) => appointment.date === selectedDateKey)
    .sort((left, right) => left.startTime.localeCompare(right.startTime));
  const selectedDayBlocks = scheduleBlocks.filter((block) => block.date === selectedDateKey);
  // Cancelled appointments free their slot — exclude them from every booked /
  // utilization figure so the ring, "Scheduled", and the header description agree
  // (and match Reports, which counts only booked statuses).
  const activeVisibleAppointments = visibleAppointments.filter(
    (appointment) => appointment.status !== "cancelled"
  );
  const activeBookedMinutes = activeVisibleAppointments.reduce(
    (sum, appointment) =>
      sum + Math.max(timeToMinutes(appointment.endTime) - timeToMinutes(appointment.startTime), 0),
    0
  );
  const capacityMinutes = visibleDates.reduce(
    (sum, day) => sum + dayCapacityMinutes(day, initialView.businessHours),
    0
  );
  const availableMinutes = Math.max(capacityMinutes - activeBookedMinutes, 0);
  const utilization = Math.min(
    Math.round((activeBookedMinutes / Math.max(capacityMinutes, 1)) * 100),
    100
  );
  const utilizationScope =
    view === "day" ? "Selected day" : view === "week" ? "This week" : "This month";
  const scopeLabel =
    view === "day"
      ? `on ${format(activeDate, "MMMM d")}`
      : view === "week"
        ? `in the week of ${format(currentWeek[0], "MMMM d")}`
        : `in ${format(activeDate, "MMMM yyyy")}`;
  const headerDescription =
    activeVisibleAppointments.length === 0
      ? `No appointments ${scopeLabel} yet — the schedule is open.`
      : `${activeVisibleAppointments.length} appointment${
          activeVisibleAppointments.length === 1 ? "" : "s"
        } ${scopeLabel} · ${formatMinutes(activeBookedMinutes)} booked.`;

  const quietControlClasses =
    "inline-flex h-9 items-center justify-center text-muted-foreground transition-colors duration-(--duration-base) hover:bg-[#f7f9fc] hover:text-foreground active:bg-[#eef2f8] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45";

  return (
    <WorkspacePage size="wide">
      <WorkspaceHeader
        title="Calendar"
        description={headerDescription}
        actions={
          hasClients ? (
            <Link
              href={`/calendar/new?date=${selectedDateKey}`}
              data-tour="calendar-create"
              className={cn(
                buttonVariants({ variant: "solid" }),
                "h-9 rounded-(--radius-card) px-3.5"
              )}
            >
              <Plus className="size-4" />
              New appointment
            </Link>
          ) : (
            <Link
              href="/clients/new?next=calendar"
              data-tour="calendar-create"
              className={cn(
                buttonVariants({ variant: "solid" }),
                "h-9 rounded-(--radius-card) px-3.5"
              )}
            >
              <UsersRound className="size-4" />
              Add first client
            </Link>
          )
        }
      />

      <div className="surface-card section-reveal relative z-30 p-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex gap-0.5 rounded-(--radius-card) border border-border/75 bg-[#f1f4f9] p-0.5">
            {views.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => startTransition(() => setView(option))}
                className={cn(
                  "h-8 rounded-(--radius-tile) px-3.5 text-sm font-semibold capitalize text-muted-foreground transition-[background-color,color,box-shadow] duration-(--duration-base) hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45",
                  view === option &&
                    "bg-primary text-primary-foreground hover:text-primary-foreground"
                )}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center overflow-hidden rounded-(--radius-card) border border-border/75 bg-white">
            <button
              type="button"
              onClick={() => shiftRange("prev")}
              aria-label="Previous period"
              className={cn(quietControlClasses, "px-3")}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveDate(parseISO(initialView.initialDate))}
              className={cn(
                quietControlClasses,
                "border-x border-border/75 px-3.5 text-sm font-semibold text-foreground"
              )}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftRange("next")}
              aria-label="Next period"
              className={cn(quietControlClasses, "px-3")}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <span className="px-1.5 text-[17px] font-semibold tracking-tight text-foreground">
            {rangeLabel}
          </span>

          <DatePickerPopover
            activeDate={activeDate}
            todayDate={todayDate}
            appointmentDateKeys={appointmentDateKeys}
            onSelect={(day) => setActiveDate(day)}
          />
        </div>
      </div>

      <WorkspaceMainGrid railWidth="md">
        <div className="space-y-3">
          {!hasClients ? (
            <WorkspaceEmptyState
              icon={UsersRound}
              title="Add a client before booking"
              description="Appointments need a client record so reminders, inbox threads, and visit history stay attached to the right person."
              actionHref="/clients/new?next=calendar"
              actionLabel="Add first client"
            />
          ) : view === "month" ? (
            <div key={gridKey} className="surface-card section-reveal step-enter overflow-clip p-0">
              <div className="z-30 grid grid-cols-7 border-b border-border/80 bg-white text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:sticky lg:top-[57px]">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                  <div key={label} className="px-4 py-3">
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {currentMonth.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const items = appointments.filter((appointment) => appointment.date === key);
                  const blocks = scheduleBlocks.filter((block) => block.date === key);
                  const isToday = isSameDay(day, todayDate);
                  const isSelected = isSameDay(day, activeDate);
                  const isClosed = dayCapacityMinutes(day, initialView.businessHours) === 0;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setActiveDate(day);
                        startTransition(() => setView("day"));
                      }}
                      className={cn(
                        "min-h-24 border-b border-r border-border/75 px-3 py-2.5 text-left transition-colors duration-(--duration-base) hover:bg-[#f7f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                        !isSameMonth(day, activeDate) && "bg-muted/35 text-muted-foreground",
                        isSameMonth(day, activeDate) &&
                          (isClosed ? "bg-rose-50/60" : "bg-emerald-50/30"),
                        isSelected && !isToday && "bg-[#f5f8fd]",
                        isToday && "bg-[#f6f9ff]"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex size-6 items-center justify-center rounded-full text-sm font-medium",
                          isToday && "bg-primary font-semibold text-primary-foreground"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      <div className="mt-2 space-y-1.5">
                        {[...items.slice(0, 2), ...blocks.slice(0, 1)].map((entry) => (
                          <div
                            key={entry.id}
                            className={cn(
                              "truncate rounded-(--radius-tile) px-2 py-1 text-xs font-medium",
                              "status" in entry
                                ? monthChipClasses[entry.status]
                                : "bg-slate-100 text-slate-700"
                            )}
                          >
                            {entry.startTime}{" "}
                            {"service" in entry ? entry.service : entry.title}
                          </div>
                        ))}
                        {items.length + blocks.length > 3 ? (
                          <p className="px-2 text-[11px] font-medium text-muted-foreground">
                            +{items.length + blocks.length - 3} more
                          </p>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div key={gridKey} className="surface-card section-reveal step-enter overflow-clip p-0">
              <div className="overflow-x-auto min-[1660px]:overflow-x-clip">
                <div className="min-w-[940px]">
                  <div
                    className={cn(
                      "z-30 grid border-b border-border/80 bg-white min-[1660px]:sticky min-[1660px]:top-[57px]",
                      view === "day" ? "grid-cols-[76px_1fr]" : "grid-cols-[76px_repeat(7,minmax(0,1fr))]"
                    )}
                  >
                    <div className="px-3 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {initialView.timeZoneLabel}
                    </div>
                    {(view === "day" ? [activeDate] : currentWeek).map((day) => {
                      const isToday = isSameDay(day, todayDate);
                      const isSelected = isSameDay(day, activeDate);
                      const dayItems = appointments
                        .filter((appointment) => appointment.date === format(day, "yyyy-MM-dd"))
                        .sort((left, right) => left.startTime.localeCompare(right.startTime));

                      return (
                        <button
                          key={day.toISOString()}
                          type="button"
                          onClick={() => setActiveDate(day)}
                          className={cn(
                            "border-l border-border/80 px-3.5 py-3 text-left transition-colors duration-(--duration-base) hover:bg-[#f7f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                            isToday ? "bg-[#f6f9ff]" : isSelected && "bg-[#f5f8fd]"
                          )}
                        >
                          <p
                            className={cn(
                              "text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
                              isToday && "text-primary"
                            )}
                          >
                            {format(day, "EEE")}
                          </p>
                          <p className="mt-1.5">
                            <span
                              className={cn(
                                "inline-flex size-8 items-center justify-center rounded-full text-xl font-semibold tracking-tight text-foreground",
                                isToday && "bg-primary text-primary-foreground"
                              )}
                            >
                              {format(day, "d")}
                            </span>
                          </p>
                          <span className="mt-1.5 flex h-1.5 items-center gap-1">
                            {dayItems.slice(0, 3).map((appointment) => (
                              <span
                                key={appointment.id}
                                className={cn(
                                  "size-1.5 rounded-full",
                                  statusDotClasses[appointment.status]
                                )}
                                aria-hidden="true"
                              />
                            ))}
                            {dayItems.length > 3 ? (
                              <span className="text-[9px] font-semibold leading-none text-muted-foreground">
                                +{dayItems.length - 3}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className={cn("grid", view === "day" ? "grid-cols-[76px_1fr]" : "grid-cols-[76px_repeat(7,minmax(0,1fr))]")}>
                    <div>
                      {slotHours.map((hour, index) => (
                        <div
                          key={hour}
                          className="flex h-16 items-start justify-end pr-3 text-xs text-muted-foreground"
                        >
                          <span className={cn("leading-none", index === 0 ? "pt-2" : "-translate-y-1/2")}>
                            {format(new Date(2026, 3, 3, hour), "h a")}
                          </span>
                        </div>
                      ))}
                    </div>

                    {(view === "day" ? [activeDate] : currentWeek).map((day) => {
                      const key = format(day, "yyyy-MM-dd");
                      const items = visibleAppointments.filter((appointment) => appointment.date === key);
                      const blocks = visibleBlocks.filter((block) => block.date === key);
                      const isToday = isSameDay(day, todayDate);
                      const isSelectedColumn = isSameDay(day, activeDate);

                      return (
                        <div
                          key={key}
                          className={cn(
                            "relative border-l border-border/80",
                            isToday ? "bg-[#f6f9ff]" : isSelectedColumn && "bg-[#f8fafd]"
                          )}
                        >
                          {slotHours.map((hour) =>
                            hourOpenForDay(day, hour, initialView.businessHours) ? (
                              <Link
                                key={hour}
                                href={`/calendar/new?date=${key}&time=${String(hour).padStart(2, "0")}:00`}
                                tabIndex={-1}
                                aria-label={`Book ${format(day, "MMMM d")} at ${format(new Date(2026, 3, 3, hour), "h a")}`}
                                className={cn(
                                  "group/slot relative block h-16 border-b border-border/75",
                                  !isToday && !isSelectedColumn && "bg-emerald-50/40"
                                )}
                              >
                                <span className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-(--radius-tile) border border-dashed border-primary/35 bg-primary/5 opacity-0 transition-opacity duration-(--duration-base) group-hover/slot:opacity-100">
                                  <Plus className="size-3.5 text-primary/80" />
                                </span>
                              </Link>
                            ) : (
                              <div key={hour} className="h-16 border-b border-border/75 bg-rose-50/60" />
                            )
                          )}
                          {items.map((appointment, index) => (
                            <AppointmentCard key={appointment.id} appointment={appointment} index={index} />
                          ))}
                          {blocks.map((block, index) => (
                            <BlockCard key={block.id} block={block} index={items.length + index} />
                          ))}
                          {isToday ? <NowLine /> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <WorkspaceRail className="section-reveal-delayed gap-3">
          <WorkspaceCard
            compact
            title="Selected day"
            action={
              <Link
                href={`/calendar/new?date=${selectedDateKey}`}
                className="text-xs font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
              >
                Add appointment
              </Link>
            }
          >
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {format(activeDate, "EEEE, MMMM d")}
            </p>
            {selectedDayAppointments.length > 0 || selectedDayBlocks.length > 0 ? (
              <div className="divide-y divide-border/65">
                {selectedDayAppointments.map((appointment) => (
                  <Link
                    key={appointment.id}
                    href={`/calendar/${appointment.id}/edit`}
                    className="flex items-center gap-2.5 rounded-(--radius-tile) px-1 py-2 transition-colors duration-(--duration-base) hover:bg-[#f7f9fc]"
                  >
                    <span className="w-11 shrink-0 text-xs font-semibold tabular-nums text-foreground">
                      {appointment.startTime}
                    </span>
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        statusDotClasses[appointment.status]
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
                        {appointment.service}
                      </span>
                    </span>
                  </Link>
                ))}
                {selectedDayBlocks.map((block) => (
                  <div key={block.id} className="flex items-center gap-2.5 px-1 py-2">
                    <span className="w-11 shrink-0 text-xs font-semibold tabular-nums text-foreground">
                      {block.startTime}
                    </span>
                    <span className="size-2 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {block.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        Blocked time
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 py-5 text-center">
                <span className="mb-1 flex size-8 items-center justify-center rounded-full border border-border/75 bg-[#f7f9fc] text-primary">
                  <CalendarX2 className="size-3.5" />
                </span>
                <p className="text-sm font-semibold text-foreground">No bookings</p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Add a booking or blocked time for this date.
                </p>
              </div>
            )}
          </WorkspaceCard>

          <WorkspaceCard
            compact
            title="Utilization"
            action={
              <span className="text-[11px] font-medium text-muted-foreground">
                {utilizationScope}
              </span>
            }
          >
            <div className="flex items-center gap-4">
              <UtilizationRing value={utilization} />
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <RailMetric label="Scheduled" value={formatMinutes(activeBookedMinutes)} />
                <RailMetric label="Available" value={formatMinutes(availableMinutes)} />
                <RailMetric label="Blocks" value={visibleBlocks.length.toString()} />
              </div>
            </div>
          </WorkspaceCard>
        </WorkspaceRail>
      </WorkspaceMainGrid>
    </WorkspacePage>
  );
}

function RailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
