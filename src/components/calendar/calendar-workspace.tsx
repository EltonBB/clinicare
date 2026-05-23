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
import { startTransition, useMemo, useState } from "react";
import { CalendarX2, ChevronLeft, ChevronRight, Plus, UsersRound } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarAppointment, CalendarScheduleBlock, CalendarViewModel } from "@/lib/calendar";

type CalendarView = "day" | "week" | "month";

type CalendarWorkspaceProps = {
  initialView: CalendarViewModel;
  ownerName: string;
};

const views: CalendarView[] = ["day", "week", "month"];
const slotHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const hourRowHeight = 64;

const toneClasses: Record<CalendarAppointment["tone"], string> = {
  primary:
    "border-primary/20 bg-primary text-primary-foreground shadow-[0_18px_32px_rgba(20,32,51,0.12)]",
  secondary:
    "border-[#cfddf4] bg-[linear-gradient(135deg,rgba(240,245,255,0.95),rgba(224,238,255,0.98))] text-[#36588f]",
  muted:
    "border-[#efcfc8] bg-[linear-gradient(135deg,rgba(255,244,241,0.96),rgba(253,236,232,0.98))] text-[#b15f56]",
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

function AppointmentCard({ appointment }: { appointment: CalendarAppointment }) {
  return (
    <Link
      href={`/calendar/${appointment.id}/edit`}
      className={cn(
        "interactive-lift absolute inset-x-0 flex overflow-hidden rounded-none border px-4 py-2 text-left transition-[box-shadow,transform] duration-200",
        toneClasses[appointment.tone]
      )}
      style={{
        top: appointmentOffset(appointment.startTime),
        height: appointmentHeight(appointment.startTime, appointment.endTime),
      }}
    >
      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] opacity-90">
          {appointment.startTime} - {appointment.endTime}
        </span>
        <span className="mt-1 truncate text-[15px] font-semibold leading-5">
          {appointment.service || "Appointment"}
        </span>
        <span className="mt-1 truncate text-xs leading-5 opacity-90">
          {appointment.clientName}
        </span>
      </span>
    </Link>
  );
}

function BlockCard({ block }: { block: CalendarScheduleBlock }) {
  return (
    <div
      className="absolute inset-x-1 overflow-hidden rounded-[0.65rem] border border-slate-300/70 bg-slate-100/90 px-3 py-2 text-left text-slate-700 shadow-[0_10px_20px_rgba(20,32,51,0.06)]"
      style={{
        top: appointmentOffset(block.startTime),
        height: appointmentHeight(block.startTime, block.endTime),
      }}
    >
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
        <CalendarX2 className="size-3" />
        {block.startTime} - {block.endTime}
      </span>
      <span className="mt-1 block truncate text-sm font-semibold">{block.title}</span>
      {block.notes ? <span className="mt-1 block truncate text-xs opacity-80">{block.notes}</span> : null}
    </div>
  );
}

export function CalendarWorkspace({ initialView, ownerName }: CalendarWorkspaceProps) {
  const [view, setView] = useState<CalendarView>("week");
  const [activeDate, setActiveDate] = useState(() => parseISO(initialView.initialDate));
  const appointments = initialView.appointments;
  const scheduleBlocks = initialView.scheduleBlocks;
  const hasClients = initialView.clients.length > 0;

  const currentWeek = useMemo(() => weekDays(activeDate), [activeDate]);
  const currentMonth = useMemo(() => monthDays(activeDate), [activeDate]);
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

  const dayLabel =
    view === "month"
      ? format(activeDate, "MMMM yyyy")
      : `${format(currentWeek[0], "MMMM yyyy")}`;
  const selectedDayAppointments = appointments.filter(
    (appointment) => appointment.date === selectedDateKey
  );
  const selectedDayBlocks = scheduleBlocks.filter((block) => block.date === selectedDateKey);
  const upcomingAppointments = appointments
    .filter((appointment) => appointment.date >= selectedDateKey)
    .sort((left, right) => `${left.date}${left.startTime}`.localeCompare(`${right.date}${right.startTime}`))
    .slice(0, 5);
  const bookedMinutes = visibleAppointments.reduce(
    (sum, appointment) =>
      sum + Math.max(timeToMinutes(appointment.endTime) - timeToMinutes(appointment.startTime), 0),
    0
  );
  const capacityMinutes = visibleDates.reduce(
    (sum, day) => sum + dayCapacityMinutes(day, initialView.businessHours),
    0
  );
  const utilization = Math.min(Math.round((bookedMinutes / Math.max(capacityMinutes, 1)) * 100), 100);

  return (
    <div className="w-full space-y-3.5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="section-reveal">
          <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-foreground">
            Calendar
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Manage the clinic schedule, appointments, and blocked time.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-[0.7rem] border border-border/80 bg-white p-1 shadow-[0_16px_32px_rgba(20,32,51,0.04)]">
              {views.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => startTransition(() => setView(option))}
                  className={cn(
                    "rounded-[0.55rem] px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground transition-[background-color,color,transform] duration-200 hover:text-foreground",
                    view === option &&
                      "bg-white text-foreground shadow-[0_12px_28px_rgba(20,32,51,0.06)]"
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <span className="rounded-[0.9rem] border border-border/80 bg-white/80 px-4 py-2 text-sm font-semibold text-foreground shadow-[0_10px_24px_rgba(20,32,51,0.03)]">
              {dayLabel}
            </span>
            <input
              type="date"
              value={selectedDateKey}
              onChange={(event) => {
                if (event.target.value) {
                  setActiveDate(parseISO(event.target.value));
                }
              }}
              className="h-10 rounded-[0.8rem] border border-border/80 bg-white px-3 text-sm font-medium text-foreground shadow-[0_10px_24px_rgba(20,32,51,0.03)] outline-none"
              aria-label="Jump to date"
            />
          </div>
        </div>

        <div className="section-reveal-delayed flex items-center gap-3">
          <div className="inline-flex items-center rounded-[1rem] border border-border/80 bg-white/72 shadow-[0_16px_32px_rgba(20,32,51,0.05)]">
            <button
              type="button"
              onClick={() => shiftRange("prev")}
              className="px-3 py-2 text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveDate(parseISO(initialView.initialDate))}
              className="border-x border-border/80 px-4 py-2 text-sm font-medium text-foreground"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftRange("next")}
              className="px-3 py-2 text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {hasClients ? (
            <Link
              href={`/calendar/new?date=${selectedDateKey}`}
              data-tour="calendar-create"
              className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-[0.9rem] px-4")}
            >
              <Plus className="size-4" />
              New appointment
            </Link>
          ) : (
            <Link
              href="/clients/new?next=calendar"
              className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-[0.9rem] px-4")}
              data-tour="calendar-create"
            >
              <UsersRound className="size-4" />
              Add first client
            </Link>
          )}
        </div>
      </div>

      <div className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-3.5">
      {!hasClients ? (
        <section className="section-reveal overflow-hidden rounded-[1.25rem] border border-dashed border-primary/25 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),var(--primary-soft))] p-6 shadow-[0_18px_44px_rgba(20,32,51,0.055)]">
          <div className="mx-auto max-w-xl space-y-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-[1.05rem] bg-primary/12 text-primary">
              <UsersRound className="size-5" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Add a client before booking
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                Appointments need a client record so reminders, inbox threads,
                and visit history stay attached to the right person.
              </p>
            </div>
            <Link
              href="/clients/new?next=calendar"
              className={cn(buttonVariants({ size: "lg" }), "rounded-[0.95rem]")}
            >
              <Plus className="size-4" />
              Add first client
            </Link>
          </div>
        </section>
      ) : view === "month" ? (
        <div className="section-reveal overflow-hidden rounded-[1.15rem] border border-border/80 bg-white/94 shadow-[0_10px_24px_rgba(20,32,51,0.032)]">
          <div className="grid grid-cols-7 border-b border-border/80 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setActiveDate(day);
                    startTransition(() => setView("day"));
                  }}
                  className={cn(
                    "min-h-28 border-b border-r border-border/80 px-3 py-3 text-left transition-[background-color,color] duration-200",
                    !isSameMonth(day, activeDate) && "bg-muted/35 text-muted-foreground",
                    isSameDay(day, activeDate) && "bg-secondary/38"
                  )}
                >
                  <p className="text-sm font-medium">{format(day, "d")}</p>
                  <div className="mt-3 space-y-2">
                    {[...items.slice(0, 2), ...blocks.slice(0, 1)].map((entry) => (
                      <div
                        key={entry.id}
                        className={cn(
                          "truncate rounded-[0.55rem] px-2 py-1 text-xs font-medium",
                          "tone" in entry
                            ? [
                                entry.tone === "primary" && "bg-primary/12 text-primary",
                                entry.tone === "secondary" && "bg-[#e8eefc] text-[#36588f]",
                                entry.tone === "muted" && "bg-destructive/10 text-destructive",
                              ]
                            : "bg-slate-100 text-slate-700"
                        )}
                      >
                        {entry.startTime} {"service" in entry ? entry.service : entry.title}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="section-reveal overflow-hidden rounded-[1.15rem] border border-border/80 bg-white/94 shadow-[0_10px_24px_rgba(20,32,51,0.032)]">
          <div className="overflow-x-auto">
            <div className="min-w-[940px]">
              <div className={cn("grid border-b border-border/80", view === "day" ? "grid-cols-[76px_1fr]" : "grid-cols-[76px_repeat(7,minmax(0,1fr))]")}>
                <div className="px-3 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  GMT+2
                </div>
                {(view === "day" ? [activeDate] : currentWeek).map((day) => (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => setActiveDate(day)}
                    className={cn(
                      "border-l border-border/80 px-4 py-4 text-left transition-colors duration-200",
                      isSameDay(day, activeDate) && "bg-secondary/65"
                    )}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {format(day, "EEE")}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                      {format(day, "d")}
                    </p>
                  </button>
                ))}
              </div>

              <div className={cn("grid", view === "day" ? "grid-cols-[76px_1fr]" : "grid-cols-[76px_repeat(7,minmax(0,1fr))]")}>
                <div>
                  {slotHours.map((hour) => (
                    <div
                      key={hour}
                      className="flex h-16 items-start justify-end pr-3 pt-2 text-xs text-muted-foreground"
                    >
                      {format(new Date(2026, 3, 3, hour), "h a")}
                    </div>
                  ))}
                </div>

                {(view === "day" ? [activeDate] : currentWeek).map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const items = visibleAppointments.filter((appointment) => appointment.date === key);
                  const blocks = visibleBlocks.filter((block) => block.date === key);

                  return (
                    <div
                      key={key}
                      className={cn(
                        "relative border-l border-border/80",
                        isSameDay(day, activeDate) && "bg-secondary/28"
                      )}
                    >
                      {slotHours.map((hour) => (
                        <div key={hour} className="h-16 border-b border-border/75" />
                      ))}
                      {items.map((appointment) => (
                        <AppointmentCard key={appointment.id} appointment={appointment} />
                      ))}
                      {blocks.map((block) => (
                        <BlockCard key={block.id} block={block} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {hasClients ? (
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="section-reveal rounded-[1.05rem] border border-border/80 bg-white/94 px-4 py-3.5 shadow-[0_10px_24px_rgba(20,32,51,0.032)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Selected day</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {format(activeDate, "EEEE, MMMM d")}
                </p>
              </div>
              <Link
                href={`/calendar/new?date=${selectedDateKey}`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "rounded-[0.85rem] bg-white/72"
                )}
              >
                <Plus className="size-4" />
                Add booking
              </Link>
            </div>
            <div className="mt-3 space-y-2.5">
              {selectedDayAppointments
                .sort((left, right) => left.startTime.localeCompare(right.startTime))
                .map((appointment) => (
                  <Link
                    key={appointment.id}
                    href={`/calendar/${appointment.id}/edit`}
                    className="interactive-lift flex w-full items-start justify-between rounded-[0.95rem] border border-border/80 bg-white px-4 py-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-200 hover:border-border hover:bg-white hover:shadow-[0_16px_30px_rgba(20,32,51,0.05)]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {appointment.clientName}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {appointment.service} - {appointment.startTime}
                      </p>
                    </div>
                    <ChevronRight className="mt-0.5 size-4 text-muted-foreground" />
                  </Link>
                ))}
              {selectedDayBlocks
                .sort((left, right) => left.startTime.localeCompare(right.startTime))
                .map((block) => (
                  <div
                    key={block.id}
                    className="flex w-full items-start justify-between rounded-[0.95rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{block.title}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Blocked time - {block.startTime}
                      </p>
                    </div>
                    <CalendarX2 className="mt-0.5 size-4 text-slate-500" />
                  </div>
                ))}
              {selectedDayAppointments.length === 0 && selectedDayBlocks.length === 0 ? (
                <div className="rounded-[0.95rem] border border-dashed border-border/90 bg-white/54 px-4 py-4 text-sm text-muted-foreground">
                  No bookings for the selected day yet.
                </div>
              ) : null}
            </div>
          </div>

          <div className="section-reveal-delayed rounded-[1.05rem] border border-border/80 bg-white/94 px-4 py-3.5 shadow-[0_10px_24px_rgba(20,32,51,0.032)]">
            <p className="text-sm font-semibold text-foreground">Team assignment</p>
            <div className="mt-4 space-y-3">
              {(initialView.staffMembers.length > 0
                ? initialView.staffMembers
                : [{ id: "owner-fallback", name: ownerName }]
              ).map((member, index) => (
                <div key={member.name} className="flex items-center gap-3 text-sm">
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      index % 3 === 0 && "bg-primary",
                      index % 3 === 1 && "bg-[#6e63d9]",
                      index % 3 === 2 && "bg-[#b75d52]"
                    )}
                  />
                  <span className="text-muted-foreground">{member.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
        </div>

        <aside className="section-reveal-delayed grid content-start gap-3.5">
          <CalendarRailPanel title="Upcoming appointments" actionHref="/calendar" actionLabel="View all">
            <div className="space-y-4">
              {upcomingAppointments.length > 0 ? (
                upcomingAppointments.map((appointment, index) => (
                  <Link key={appointment.id} href={`/calendar/${appointment.id}/edit`} className="flex gap-3 text-sm">
                    <span className={cn(
                      "mt-1 size-2.5 rounded-full",
                      index % 3 === 0 && "bg-primary",
                      index % 3 === 1 && "bg-[#67a5ee]",
                      index % 3 === 2 && "bg-[#c084fc]"
                    )} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-foreground">
                        {appointment.clientName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {appointment.startTime} - {appointment.service}
                      </span>
                    </span>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming appointments in view.</p>
              )}
            </div>
          </CalendarRailPanel>

          <CalendarRailPanel title="Today's utilization">
            <div className="flex items-center gap-4">
              <div className="grid size-24 place-items-center rounded-full border-[7px] border-primary/85 bg-white text-center">
                <span>
                  <span className="block text-xl font-semibold text-foreground">{utilization}%</span>
                  <span className="text-[10px] text-muted-foreground">Utilization</span>
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <RailMetric label="Scheduled" value={`${Math.round(bookedMinutes / 60)}h ${bookedMinutes % 60}m`} />
                <RailMetric label="Available" value={`${Math.max(40 - Math.round(bookedMinutes / 60), 0)}h`} />
                <RailMetric label="Blocks" value={visibleBlocks.length.toString()} />
              </div>
            </div>
          </CalendarRailPanel>

          <CalendarRailPanel title="Schedule summary">
            <div className="space-y-3 text-sm">
              <RailMetric label="Appointments" value={selectedDayAppointments.length.toString()} />
              <RailMetric label="Completed" value={selectedDayAppointments.filter((appointment) => appointment.status === "completed").length.toString()} />
              <RailMetric label="Upcoming" value={selectedDayAppointments.filter((appointment) => appointment.status === "confirmed" || appointment.status === "pending").length.toString()} />
              <RailMetric label="Blocked time" value={selectedDayBlocks.length.toString()} />
              <RailMetric label="Open capacity" value={`${Math.round(capacityMinutes / 60)}h`} />
            </div>
          </CalendarRailPanel>

          <CalendarRailPanel title="Service legend">
            <div className="grid gap-2 text-sm text-muted-foreground">
              <LegendDot color="bg-primary" label="Confirmed / completed" />
              <LegendDot color="bg-[#67a5ee]" label="Pending" />
              <LegendDot color="bg-slate-400" label="Blocked time" />
            </div>
          </CalendarRailPanel>
        </aside>
      </div>
    </div>
  );
}

function CalendarRailPanel({
  title,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  actionHref?: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1rem] border border-border/80 bg-white/94 p-4 shadow-[0_14px_32px_rgba(20,32,51,0.04)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {actionHref && actionLabel ? (
          <Link href={actionHref} className="text-xs font-semibold text-primary">
            {actionLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn("size-2.5 rounded-full", color)} />
      {label}
    </span>
  );
}
