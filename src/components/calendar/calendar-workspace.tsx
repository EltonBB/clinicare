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
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  CalendarDays,
  CalendarX2,
  Plus,
  UsersRound,
  X,
} from "lucide-react";

import { loadCalendarMonthAction } from "@/app/(workspace)/calendar/actions";
import { buttonVariants } from "@/components/ui/button";
import {
  WorkspaceEmptyState,
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/workspace/workspace-layout";
import { MonthGrid } from "@/components/workspace/month-grid";
import { useDismissOnOutsideOrEscape } from "@/hooks/use-dismiss-on-outside-or-escape";
import { timeToMinutes } from "@/lib/calendar";
import { monthsToLoad, type CalendarRange } from "@/lib/calendar-range";
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
  /** The days the page already loaded; any other month is fetched on demand. */
  initialRange: CalendarRange;
  /** The real current date (`YYYY-MM-DD`), independent of the date being viewed. */
  today: string;
};

const views: CalendarView[] = ["day", "week", "month"];

// Source of truth for appointment-status color (AGENTS.md: "the same tone
// set as everywhere else") — lib/status-tone.ts mirrors these 4 colors as
// raw values for places (Reports' donut/legend) that need a CSS color
// rather than a Tailwind class; keep both in sync if these change.
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

// Adds newly loaded rows to what's already on screen. Neighbouring months' grids
// overlap by up to a week, so rows are keyed (a newer copy replaces an older one)
// rather than appended — an overlap must never show an appointment twice.
function mergeByKey<T>(current: T[], incoming: T[], keyOf: (item: T) => string) {
  const merged = new Map(current.map((item) => [keyOf(item), item]));

  for (const item of incoming) {
    merged.set(keyOf(item), item);
  }

  return [...merged.values()];
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
  detailed = false,
}: {
  appointment: CalendarAppointment;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
  // Month-grid cells are ~20px tall per row — same pill, smaller type/padding,
  // plus pointer-events-auto to punch through the cell's pointer-events-none
  // day-open overlay button.
  dense?: boolean;
  // Day view is one full-width column, where a name-left/time-right pill leaves
  // ~900px of dead space between the two. Same pill, laid out as a schedule row:
  // time first, then who, what and with whom, then the status in words.
  detailed?: boolean;
}) {
  return (
    <Link
      href={`/calendar/${appointment.id}/edit`}
      onClick={(event) => {
        // Always stop the day-cell's own click-to-navigate handler from
        // seeing this. A plain left click opens the quick-view popover
        // instead of navigating (unchanged behavior); a modified click
        // (ctrl/cmd/shift) or middle-click falls through to the browser's
        // native link handling — open in new tab, copy link, no-JS
        // navigation — none of which a plain <button> here could support (Codex).
        event.stopPropagation();
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }
        event.preventDefault();
        onOpen(event);
      }}
      className={cn(
        "flex w-full shrink-0 items-center justify-between gap-1.5 truncate rounded-(--radius-tile) text-left font-medium transition-[filter,transform] duration-(--duration-base) hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        dense
          ? "pointer-events-auto gap-1.5 px-2 py-1 text-[11px] active:scale-[0.97]"
          : "gap-2.5 px-3 py-2.5 text-sm active:scale-[0.98]",
        monthChipClasses[appointment.status]
      )}
    >
      {detailed ? (
        <>
          <span className="w-12 shrink-0 tabular-nums opacity-80">{appointment.startTime}</span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-semibold",
              appointment.status === "cancelled" && "line-through"
            )}
          >
            {appointment.clientName}
          </span>
          <span className="hidden min-w-0 flex-[2] truncate opacity-80 sm:block">
            {appointment.service} · {appointment.staffName}
          </span>
          <span className="hidden w-20 shrink-0 text-right text-xs font-semibold capitalize opacity-80 sm:block">
            {appointment.status}
          </span>
        </>
      ) : (
        <>
          <span className={cn("truncate font-semibold", appointment.status === "cancelled" && "line-through")}>
            {appointment.clientName}
          </span>
          <span className="shrink-0 tabular-nums opacity-80">{appointment.startTime}</span>
        </>
      )}
    </Link>
  );
}

function BlockPill({ block }: { block: CalendarScheduleBlock }) {
  return (
    <div className="flex w-full shrink-0 items-center justify-between gap-2 rounded-(--radius-tile) bg-slate-100 px-2.5 py-1.5 text-left text-xs font-medium text-slate-700">
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

const DAY_COLUMN_VISIBLE_CAP = 8;

// Week/Day columns can run well past a screen's worth of pills for a busy
// provider roster — cap what renders up front and let "View more" reveal the
// rest, rather than relying on scroll alone to surface a 30+ entry day.
function DayColumn({
  dayKey,
  entries,
  isToday,
  isSelectedColumn,
  isEmpty,
  onOpen,
  detailed = false,
}: {
  dayKey: string;
  entries: Array<CalendarAppointment | CalendarScheduleBlock>;
  isToday: boolean;
  isSelectedColumn: boolean;
  isEmpty: boolean;
  onOpen: (appointment: CalendarAppointment, event: MouseEvent<HTMLAnchorElement>) => void;
  // Day view: the one wide column lists every entry (the column scrolls), since
  // reading the whole day is what that view is for; week columns stay capped.
  detailed?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleEntries =
    expanded || detailed ? entries : entries.slice(0, DAY_COLUMN_VISIBLE_CAP);
  const hiddenCount = entries.length - visibleEntries.length;

  return (
    <div
      className={cn(
        "flex max-h-[520px] min-h-[200px] flex-col gap-1.5 overflow-y-auto border-l border-t border-border/75 p-2.5 first:border-l-0 lg:h-full lg:max-h-none lg:min-h-0",
        isEmpty && "justify-center",
        isToday ? "bg-[#f6f9ff]" : isSelectedColumn && "bg-[#f8fafd]"
      )}
    >
      {visibleEntries.map((entry) =>
        "status" in entry ? (
          <EventPill
            key={entry.id}
            appointment={entry}
            detailed={detailed}
            onOpen={(event) => onOpen(entry, event)}
          />
        ) : (
          <BlockPill key={entry.id} block={entry} />
        )
      )}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex shrink-0 items-center justify-center rounded-(--radius-tile) px-2.5 py-2 text-sm font-semibold text-primary transition-colors duration-(--duration-base) hover:bg-primary/5"
        >
          View {hiddenCount} more
        </button>
      ) : null}
      <Link
        href={`/calendar/new?date=${dayKey}`}
        className={cn(
          "flex shrink-0 items-center justify-center gap-1.5 rounded-(--radius-tile) px-2.5 py-2 text-xs font-medium text-muted-foreground transition-[background-color,color,transform] duration-(--duration-base) hover:bg-primary/5 hover:text-primary active:scale-[0.97]",
          isEmpty ? "border border-dashed border-border/70" : "mt-auto"
        )}
      >
        <Plus className="size-3.5" />
        Add
      </Link>
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
  // The upper bound is itself floored at 12 — on a viewport narrower than
  // width + 24 (a resized desktop window, a narrow foldable cover display),
  // `window.innerWidth - width - 12` drops below the 12px margin (or
  // negative), which would otherwise invert the clamp range and push the
  // card off the left edge of the screen (Codex).
  const left = Math.min(Math.max(anchorRect.left, 12), Math.max(window.innerWidth - width - 12, 12));
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
          <span className="text-muted-foreground">Doctor</span>
          <span className="truncate font-medium text-foreground">{appointment.staffName}</span>
        </div>
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

export function CalendarWorkspace({ initialView, initialRange, today }: CalendarWorkspaceProps) {
  const [view, setView] = useState<CalendarView>("week");
  const [activeDate, setActiveDate] = useState(() => parseISO(initialView.initialDate));
  const [quickView, setQuickView] = useState<{ appointment: CalendarAppointment; rect: DOMRect } | null>(null);
  // The page loads the viewed month; every other month is fetched when navigated
  // to (below) and merged in, so history and far-off dates are never silently empty.
  const [appointments, setAppointments] = useState(initialView.appointments);
  const [scheduleBlocks, setScheduleBlocks] = useState(initialView.scheduleBlocks);
  const [loadedRanges, setLoadedRanges] = useState<CalendarRange[]>([initialRange]);
  const [failedMonths, setFailedMonths] = useState<string[]>([]);
  // An expired session can't be fixed by retrying, so it gets a sign-in link
  // instead of "Try again".
  const [sessionExpired, setSessionExpired] = useState(false);
  const requestedMonths = useRef(new Set<string>());
  const hasClients = initialView.hasClients;
  const todayDate = useMemo(() => parseISO(today), [today]);

  const currentWeek = useMemo(() => weekDays(activeDate), [activeDate]);
  const currentMonth = useMemo(() => monthDays(activeDate), [activeDate]);
  // Which months the visible days need that aren't loaded yet. Derived from what
  // is on screen, so there's no separate "loading" state to keep in sync.
  const visibleDayKeys = useMemo(
    () =>
      (view === "day" ? [activeDate] : view === "week" ? currentWeek : currentMonth).map((day) =>
        format(day, "yyyy-MM-dd")
      ),
    [view, activeDate, currentWeek, currentMonth]
  );
  const missingMonths = useMemo(
    () => monthsToLoad(visibleDayKeys, loadedRanges, format(activeDate, "yyyy-MM")),
    [visibleDayKeys, loadedRanges, activeDate]
  );
  const pendingMonthsKey = missingMonths.filter((month) => !failedMonths.includes(month)).join(",");
  const isLoadingMonths = pendingMonthsKey !== "";
  const loadFailed = missingMonths.some((month) => failedMonths.includes(month));

  useEffect(() => {
    if (!pendingMonthsKey) {
      return;
    }

    for (const monthKey of pendingMonthsKey.split(",")) {
      if (requestedMonths.current.has(monthKey)) {
        continue;
      }

      requestedMonths.current.add(monthKey);
      // State is only set inside these async callbacks, never synchronously in the
      // effect body (react-hooks/set-state-in-effect).
      loadCalendarMonthAction(monthKey)
        .then((result) => {
          if (!result.ok) {
            if (result.sessionExpired) {
              setSessionExpired(true);
            }

            throw new Error(result.error);
          }

          setAppointments((current) => mergeByKey(current, result.appointments, (item) => item.id));
          setScheduleBlocks((current) =>
            mergeByKey(current, result.scheduleBlocks, (item) => `${item.id}|${item.date}`)
          );
          setLoadedRanges((current) => [...current, result.range]);
        })
        .catch(() => {
          setFailedMonths((current) => (current.includes(monthKey) ? current : [...current, monthKey]));
        })
        .finally(() => {
          requestedMonths.current.delete(monthKey);
        });
    }
  }, [pendingMonthsKey]);

  function retryLoading() {
    setFailedMonths([]);
  }

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

  function openQuickView(appointment: CalendarAppointment, event: MouseEvent<HTMLAnchorElement>) {
    event.stopPropagation();
    setQuickView({ appointment, rect: event.currentTarget.getBoundingClientRect() });
  }

  return (
    <WorkspacePage size="wide">
      <WorkspaceHeader title="Calendar" />

      <div className="section-reveal relative z-30 flex flex-wrap items-center gap-3 py-1">
        <div className="inline-flex items-center gap-1.5">
          {views.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => startTransition(() => setView(option))}
              className={cn(
                "h-8 rounded-(--radius-tile) border border-transparent px-3.5 text-sm font-semibold capitalize text-muted-foreground transition-[background-color,border-color,color] duration-(--duration-base) hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45",
                view === option &&
                  "border-primary/40 text-primary hover:bg-transparent hover:text-primary"
              )}
            >
              {option}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setActiveDate(todayDate)}
          className="text-sm font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
        >
          Today
        </button>

        {/* flex-wrap, not a fixed one-line row — the date label, date-jump
            popover, and New appointment CTA together don't fit one line at
            narrow widths, and the app shell clips horizontal overflow
            rather than scrolling it, so a non-wrapping cluster here just
            clipped part of the date or the CTA off-screen (Codex). */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
          {isLoadingMonths ? (
            <span role="status" className="text-sm text-muted-foreground">
              Loading…
            </span>
          ) : null}
          <span className="text-[17px] font-semibold tracking-tight text-foreground">
            {rangeLabel}
          </span>

          <DatePickerPopover
            activeDate={activeDate}
            todayDate={todayDate}
            appointmentDateKeys={appointmentDateKeys}
            onSelect={(day) => setActiveDate(day)}
          />

          {hasClients ? (
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
          )}
        </div>
      </div>

      <div className="space-y-3" aria-busy={isLoadingMonths}>
        {loadFailed ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-(--radius-card) border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
          >
            <span>
              {sessionExpired
                ? "Your session expired, so these dates couldn't load."
                : "We couldn't load these dates, so some appointments may be missing."}
            </span>
            {sessionExpired ? (
              <Link
                href="/login"
                className="shrink-0 font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
              >
                Log in again
              </Link>
            ) : (
              <button
                type="button"
                onClick={retryLoading}
                className="shrink-0 font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
              >
                Try again
              </button>
            )}
          </div>
        ) : null}
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
                  const visibleEntries = mergeEntriesByTime(items, blocks).slice(0, 2);
                  const overflowCount = items.length + blocks.length - visibleEntries.length;

                  return (
                    <div
                      key={key}
                      className={cn(
                        "relative min-h-20 overflow-hidden border-b border-r border-border/75",
                        !isSameMonth(day, activeDate) && "bg-muted/35 text-muted-foreground"
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
                        {/* The overflow count lives in the date row, not under the pills: the
                            cell clips its overflow, so on a busy day the line below two pills
                            fell outside it and the count — the one thing that says how full
                            the day is — was cut off. */}
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={cn(
                              "inline-flex size-6 items-center justify-center rounded-full text-sm font-medium",
                              isToday && "bg-primary font-semibold text-primary-foreground"
                            )}
                          >
                            {format(day, "d")}
                          </span>
                          {overflowCount > 0 ? (
                            <span
                              aria-label={`${overflowCount} more calendar entries`}
                              className="hidden shrink-0 text-[10px] font-semibold text-primary sm:block"
                            >
                              +{overflowCount}
                              <span className="hidden lg:inline"> more</span>
                            </span>
                          ) : null}
                        </div>
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
                    <DayColumn
                      key={key}
                      dayKey={key}
                      entries={dayEntries}
                      isToday={isToday}
                      isSelectedColumn={isSelectedColumn}
                      isEmpty={isEmpty}
                      detailed={view === "day"}
                      onOpen={openQuickView}
                    />
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
