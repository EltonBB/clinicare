"use client";

import Link from "next/link";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { startTransition, useCallback, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  CalendarDays,
  CalendarX2,
  Plus,
  UsersRound,
  X,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  WorkspaceEmptyState,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/workspace/workspace-layout";
import { MonthGrid } from "@/components/workspace/month-grid";
import { useDismissOnOutsideOrEscape } from "@/hooks/use-dismiss-on-outside-or-escape";
import { timeToMinutes } from "@/lib/calendar";
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

// Fills the viewport below the header + toolbar so the grid reads as the whole
// page rather than a card floating above empty space (mirrors Inbox's own
// lg:h-[calc(100vh-174px)] fill pattern, offset for Calendar's extra toolbar row).
const calendarGridHeightClass = "surface-card section-reveal step-enter flex flex-col overflow-clip p-0 lg:h-[calc(100vh-230px)]";

// Appointments and blocks share one chronological list, not two stacked ones
// — a 09:00 block must sit above a 10:00 appointment, not below every
// appointment regardless of time. Shared by month cells and week/day columns.
function mergeEntriesByTime(items: CalendarAppointment[], blocks: CalendarScheduleBlock[]) {
  return [...items, ...blocks].sort(
    (left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime)
  );
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

// Uniform pill for an appointment — every card is the same shape regardless
// of duration (there's no time-axis grid to position against anymore):
// name left, start time right, tinted by status.
function EventPill({
  appointment,
  onOpen,
  dense = false,
}: {
  appointment: CalendarAppointment;
  onOpen: (event: MouseEvent<HTMLButtonElement>) => void;
  // Month-grid cells are ~20px tall per row — same pill, smaller type/padding,
  // plus pointer-events-auto to punch through the cell's pointer-events-none
  // day-open overlay button.
  dense?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-center justify-between gap-1.5 truncate rounded-(--radius-tile) text-left font-medium transition-[filter,transform] duration-(--duration-base) hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        dense
          ? "pointer-events-auto gap-1.5 px-2 py-1 text-[11px] active:scale-[0.97]"
          : "gap-2 px-2.5 py-1.5 text-xs active:scale-[0.98]",
        monthChipClasses[appointment.status]
      )}
    >
      <span className={cn("truncate font-semibold", appointment.status === "cancelled" && "line-through")}>
        {appointment.clientName}
      </span>
      <span className="shrink-0 tabular-nums opacity-80">{appointment.startTime}</span>
    </button>
  );
}

function BlockPill({ block }: { block: CalendarScheduleBlock }) {
  return (
    <div className="flex w-full items-center justify-between gap-2 rounded-(--radius-tile) bg-slate-100 px-2.5 py-1.5 text-left text-xs font-medium text-slate-700">
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        <CalendarX2 className="size-3 shrink-0" />
        <span className="truncate">{block.title}</span>
      </span>
      <span className="shrink-0 tabular-nums opacity-80">
        {block.startTime} – {block.endTime}
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

  useDismissOnOutsideOrEscape(containerRef, () => setOpen(false), { active: open });

  return (
    <div ref={containerRef} className="relative">
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
          className="state-pop absolute right-0 top-[calc(100%+8px)] z-50 w-[284px] origin-top-right rounded-(--radius-card) border border-border/80 bg-white p-3 shadow-(--shadow-pop)"
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
          <div className="mt-2 text-right">
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

// Anchored to the clicked chip's bounding rect (not a portal) so it renders
// above the surrounding surface-card's overflow-clip without needing to
// change that ancestor's overflow behavior.
function AppointmentQuickView({
  appointment,
  anchorRect,
  onClose,
}: {
  appointment: CalendarAppointment;
  anchorRect: DOMRect;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useDismissOnOutsideOrEscape(containerRef, onClose, { dismissOnScroll: true });

  const width = 264;
  const left = Math.min(Math.max(anchorRect.left, 12), window.innerWidth - width - 12);
  // Rendered below the anchor on the first paint (there's no real content to
  // measure before it's in the DOM); corrected to flip above from the card's
  // actual rendered height the moment it mounts (a ref callback fires during
  // the same commit, before the browser paints, so a wrong first guess is
  // never visible) — replacing a hardcoded height guess that could silently
  // drift out of sync with this card's real content.
  const [top, setTop] = useState(() => anchorRect.bottom + 8);

  const measureRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (!node) return;
      const fitsBelow = anchorRect.bottom + 8 + node.offsetHeight <= window.innerHeight;
      setTop(fitsBelow ? anchorRect.bottom + 8 : Math.max(anchorRect.top - node.offsetHeight - 8, 12));
    },
    [anchorRect]
  );

  return (
    <div
      ref={measureRef}
      role="dialog"
      aria-label={`${appointment.clientName} appointment details`}
      className="state-pop fixed z-50 origin-top rounded-(--radius-card) border border-border/80 bg-white p-3.5 shadow-(--shadow-pop)"
      style={{ left, top, width }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{appointment.clientName}</p>
          <p className="text-xs text-muted-foreground">{format(parseISO(appointment.date), "EEEE, MMMM d")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-(--duration-base) hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="mt-2.5 space-y-1.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Time</span>
          <span className="font-medium text-foreground">
            {appointment.startTime} – {appointment.endTime}
          </span>
        </div>
        {appointment.service ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Service</span>
            <span className="truncate font-medium text-foreground">{appointment.service}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Status</span>
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize", monthChipClasses[appointment.status])}>
            {appointment.status}
          </span>
        </div>
      </div>
      <Link
        href={`/calendar/${appointment.id}/edit`}
        className="mt-3 flex h-8 items-center justify-center rounded-(--radius-card) border border-border/75 bg-white text-sm font-semibold text-foreground transition-colors duration-(--duration-base) hover:bg-[#f7f9fc]"
      >
        View appointment
      </Link>
    </div>
  );
}

export function CalendarWorkspace({ initialView }: CalendarWorkspaceProps) {
  const [view, setView] = useState<CalendarView>("week");
  const [activeDate, setActiveDate] = useState(() => parseISO(initialView.initialDate));
  const [quickView, setQuickView] = useState<{ appointment: CalendarAppointment; rect: DOMRect } | null>(null);
  const appointments = initialView.appointments;
  const scheduleBlocks = initialView.scheduleBlocks;
  const hasClients = initialView.hasClients;
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
  // Grouped once per appointments/scheduleBlocks change so month/week/day cells
  // do an O(1) Map lookup instead of an O(n) filter over the whole ~6-month
  // window on every render (a click that only opens the quick-view popover was
  // re-scanning the full window per visible day before this).
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (const appointment of appointments) {
      const bucket = map.get(appointment.date);
      if (bucket) {
        bucket.push(appointment);
      } else {
        map.set(appointment.date, [appointment]);
      }
    }
    return map;
  }, [appointments]);
  const scheduleBlocksByDate = useMemo(() => {
    const map = new Map<string, CalendarScheduleBlock[]>();
    for (const block of scheduleBlocks) {
      const bucket = map.get(block.date);
      if (bucket) {
        bucket.push(block);
      } else {
        map.set(block.date, [block]);
      }
    }
    return map;
  }, [scheduleBlocks]);
  const selectedDateKey = format(activeDate, "yyyy-MM-dd");
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
  // Remounts the grid subtree on a real navigation (view switch or jumping to
  // a different day/week/month) so per-view local state resets cleanly —
  // just the anchor date for each view, not the full visible-date list.
  const gridKey =
    view === "day"
      ? `day-${format(activeDate, "yyyy-MM-dd")}`
      : view === "week"
        ? `week-${format(weekStart, "yyyy-MM-dd")}`
        : `month-${format(startOfMonth(activeDate), "yyyy-MM-dd")}`;

  function openQuickView(appointment: CalendarAppointment, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setQuickView({ appointment, rect: event.currentTarget.getBoundingClientRect() });
  }

  return (
    <WorkspacePage size="wide">
      <WorkspaceHeader
        title="Calendar"
        actions={
          hasClients ? (
            <Link
              href={`/calendar/new?date=${selectedDateKey}`}
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

      <div className="section-reveal relative z-30 flex flex-wrap items-center gap-3 py-1">
        <div className="inline-flex items-center gap-1.5">
          {views.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => startTransition(() => setView(option))}
              className={cn(
                "h-8 rounded-(--radius-tile) px-3.5 text-sm font-semibold capitalize text-muted-foreground transition-[background-color,color] duration-(--duration-base) hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45",
                view === option &&
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
              )}
            >
              {option}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setActiveDate(parseISO(initialView.initialDate))}
          className="text-sm font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
        >
          Today
        </button>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-[17px] font-semibold tracking-tight text-foreground">
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
            <div key={gridKey} className={calendarGridHeightClass}>
              <div className="z-30 grid shrink-0 grid-cols-7 border-b border-border/80 bg-white text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                  <div key={label} className="px-4 py-3">
                    {label}
                  </div>
                ))}
              </div>
              <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <div className="grid grid-cols-7 lg:h-full lg:auto-rows-fr">
                {currentMonth.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const items = appointmentsByDate.get(key) ?? [];
                  const blocks = scheduleBlocksByDate.get(key) ?? [];
                  const isToday = isSameDay(day, todayDate);
                  const isSelected = isSameDay(day, activeDate);
                  const visibleEntries = mergeEntriesByTime(items, blocks).slice(0, 3);
                  const overflowCount = items.length + blocks.length - visibleEntries.length;

                  return (
                    <div
                      key={key}
                      className={cn(
                        "relative min-h-20 border-b border-r border-border/75",
                        !isSameMonth(day, activeDate) && "bg-muted/35 text-muted-foreground",
                        isSelected && !isToday && "bg-[#f5f8fd]",
                        isToday && "bg-[#f6f9ff]"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveDate(day);
                          startTransition(() => setView("day"));
                        }}
                        aria-label={`Open ${format(day, "MMMM d")}`}
                        className="absolute inset-0 transition-colors duration-(--duration-base) hover:bg-[#f7f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
                      />
                      <div className="pointer-events-none relative px-2.5 py-2">
                        <span
                          className={cn(
                            "inline-flex size-6 items-center justify-center rounded-full text-sm font-medium",
                            isToday && "bg-primary font-semibold text-primary-foreground"
                          )}
                        >
                          {format(day, "d")}
                        </span>
                        {/* Below sm, a column is ~45px — full chips truncate to unreadable
                            fragments ("0...", "1..."), so mobile gets the same density-only
                            dot summary as the week/day header (see the day-column buttons
                            below); tapping the day still opens Day view for full detail. */}
                        <div className="mt-1.5 hidden space-y-1 sm:block">
                          {visibleEntries.map((entry) =>
                            "status" in entry ? (
                              <EventPill
                                key={entry.id}
                                dense
                                appointment={entry}
                                onOpen={(event) => openQuickView(entry, event)}
                              />
                            ) : (
                              <div
                                key={entry.id}
                                className="pointer-events-none truncate rounded-(--radius-tile) bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700"
                              >
                                {entry.startTime} {entry.title}
                              </div>
                            )
                          )}
                          {overflowCount > 0 ? (
                            <p className="px-2 text-[10px] font-medium text-muted-foreground">+{overflowCount} more</p>
                          ) : null}
                        </div>
                        {items.length > 0 || blocks.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1 sm:hidden">
                            {items.slice(0, 4).map((item) => (
                              <span
                                key={item.id}
                                className={cn("size-1.5 rounded-full", statusDotClasses[item.status])}
                              />
                            ))}
                            {blocks.length > 0 ? (
                              <span className="size-1.5 rounded-full bg-slate-400" />
                            ) : null}
                            {items.length > 4 ? (
                              <span className="text-[9px] font-semibold leading-none text-muted-foreground">
                                +{items.length - 4}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
          ) : (
            <div key={gridKey} className={calendarGridHeightClass}>
              <div className="min-h-0 overflow-x-auto lg:flex lg:flex-1 lg:flex-col">
                <div className={cn("lg:flex lg:h-full lg:min-h-0 lg:flex-col", view === "week" && "min-w-[720px]")}>
              <div className={cn("grid shrink-0 border-b border-border/80 bg-white", view === "day" ? "grid-cols-1" : "grid-cols-7")}>
                {(view === "day" ? [activeDate] : currentWeek).map((day) => {
                  const isToday = isSameDay(day, todayDate);
                  const isSelected = isSameDay(day, activeDate);

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => setActiveDate(day)}
                      className={cn(
                        "border-l border-border/80 px-3.5 py-3 text-left transition-colors duration-(--duration-base) first:border-l-0 hover:bg-[#f7f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
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
                    </button>
                  );
                })}
              </div>

              <div className={cn("grid lg:min-h-0 lg:flex-1", view === "day" ? "grid-cols-1" : "grid-cols-7")}>
                {(view === "day" ? [activeDate] : currentWeek).map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const items = appointmentsByDate.get(key) ?? [];
                  const blocks = scheduleBlocksByDate.get(key) ?? [];
                  const dayEntries = mergeEntriesByTime(items, blocks);
                  const isToday = isSameDay(day, todayDate);
                  const isSelectedColumn = isSameDay(day, activeDate);

                  const isEmpty = items.length === 0 && blocks.length === 0;

                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex max-h-[520px] min-h-[200px] flex-col gap-1.5 overflow-y-auto border-l border-t border-border/75 p-2.5 first:border-l-0 lg:h-full lg:max-h-none lg:min-h-0",
                        isEmpty && "justify-center",
                        isToday ? "bg-[#f6f9ff]" : isSelectedColumn && "bg-[#f8fafd]"
                      )}
                    >
                      {dayEntries.map((entry) =>
                        "status" in entry ? (
                          <EventPill
                            key={entry.id}
                            appointment={entry}
                            onOpen={(event) => openQuickView(entry, event)}
                          />
                        ) : (
                          <BlockPill key={entry.id} block={entry} />
                        )
                      )}
                      <Link
                        href={`/calendar/new?date=${key}`}
                        className={cn(
                          "flex items-center justify-center gap-1.5 rounded-(--radius-tile) px-2.5 py-2 text-xs font-medium text-muted-foreground transition-[background-color,color,transform] duration-(--duration-base) hover:bg-primary/5 hover:text-primary active:scale-[0.97]",
                          isEmpty ? "border border-dashed border-border/70" : "mt-auto"
                        )}
                      >
                        <Plus className="size-3.5" />
                        Add
                      </Link>
                    </div>
                  );
                })}
              </div>
                </div>
              </div>
            </div>
          )}
        </div>

      {quickView ? (
        <AppointmentQuickView
          appointment={quickView.appointment}
          anchorRect={quickView.rect}
          onClose={() => setQuickView(null)}
        />
      ) : null}
    </WorkspacePage>
  );
}
