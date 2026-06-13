"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const navButtonClasses =
  "inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors duration-(--duration-base) hover:bg-[#f1f4f9] hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45";

export type MonthGridDayState = {
  /** Dim days that spill in from the adjacent month. */
  isOutsideMonth?: boolean;
  /** Today's outline — applied only when the day isn't selected or in range. */
  isToday?: boolean;
  /** Solid primary fill: a selected day, or a range edge (start/end). */
  isSelected?: boolean;
  /** Soft primary tint: a day strictly inside a selected range. */
  isInRange?: boolean;
  /** Small dot under the number (e.g. a day that has appointments). */
  showDot?: boolean;
};

/**
 * Shared Monday-first month grid used by the Calendar date picker and the
 * Reports range picker. The grid renders the month header, weekday row, and day
 * cells; callers own the surrounding popover/dialog chrome, the month cursor,
 * and any footer (e.g. "Go to today" or a range caption). Per-day appearance is
 * driven entirely by `getDayState`, so single-date and range selection share
 * one set of cell styles.
 */
export function MonthGrid({
  monthCursor,
  onMonthChange,
  getDayState,
  onSelectDay,
}: {
  monthCursor: Date;
  onMonthChange: (month: Date) => void;
  getDayState: (day: Date) => MonthGridDayState;
  onSelectDay: (day: Date) => void;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 1 }),
  });

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2.5">
        <span className="text-sm font-semibold text-foreground">
          {format(monthCursor, "MMMM yyyy")}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => onMonthChange(subMonths(monthCursor, 1))}
            className={navButtonClasses}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => onMonthChange(addMonths(monthCursor, 1))}
            className={navButtonClasses}
          >
            <ChevronRight className="size-4" />
          </button>
        </span>
      </div>
      <div className="grid grid-cols-7 pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="py-1">
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day) => {
          const state = getDayState(day);

          return (
            <button
              key={format(day, "yyyy-MM-dd")}
              type="button"
              onClick={() => onSelectDay(day)}
              className={cn(
                "relative mx-auto flex size-9 items-center justify-center rounded-full text-sm font-medium text-foreground transition-colors duration-(--duration-base) hover:bg-[#f1f4f9] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45",
                state.isOutsideMonth && "text-muted-foreground/55",
                state.isToday &&
                  !state.isSelected &&
                  !state.isInRange &&
                  "border border-primary/45 font-semibold text-primary",
                state.isInRange &&
                  !state.isSelected &&
                  "bg-primary/12 text-primary hover:bg-primary/16",
                state.isSelected &&
                  "bg-primary font-semibold text-primary-foreground hover:bg-primary"
              )}
            >
              {format(day, "d")}
              {state.showDot && !state.isSelected ? (
                <span
                  className="absolute bottom-1 size-1 rounded-full bg-primary"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
