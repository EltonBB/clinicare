"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
  startOfMonth,
} from "date-fns";
import { CalendarDays, RefreshCw } from "lucide-react";

import { refreshAnalyticsInsightsAction } from "@/app/(workspace)/reports/actions";
import { fieldInputClass, WorkspaceHeader, WorkspacePage } from "@/components/workspace/workspace-layout";
import { MonthGrid } from "@/components/workspace/month-grid";
import { LazyMotionProvider } from "@/components/layout/motion-provider";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { useDismissOnOutsideOrEscape } from "@/hooks/use-dismiss-on-outside-or-escape";
import { cn } from "@/lib/utils";
import type { ReportPeriodKey, ReportsViewModel } from "@/lib/reports";
import { AppointmentStatusCard, HighlightsCard, OverviewTab } from "./overview-tab";
import { StaffTab } from "./staff-tab";
import { BookingPatternsCard } from "./demand-tab";

/** Month-grid range picker built on the shared MonthGrid. */
function RangeCalendar({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const fromDate = from ? parseISO(from) : null;
  const toDate = to ? parseISO(to) : null;
  const [monthCursor, setMonthCursor] = useState<Date>(() => startOfMonth(fromDate ?? new Date()));

  function handleSelect(day: Date) {
    const key = format(day, "yyyy-MM-dd");

    if (!fromDate || (fromDate && toDate)) {
      onChange(key, "");
      return;
    }

    if (isBefore(day, fromDate)) {
      onChange(key, from);
    } else {
      onChange(from, key);
    }
  }

  const rangeCaption = fromDate
    ? toDate
      ? `${format(fromDate, "MMM d, yyyy")} — ${format(toDate, "MMM d, yyyy")}`
      : `${format(fromDate, "MMM d, yyyy")} — pick an end date`
    : "Pick a start date";

  // Typing a date (or using the native picker) jumps straight there instead
  // of paging the grid month by month — the grid stays in sync either way,
  // since both write through the same onChange the day-click handler uses.
  function handleInput(nextFrom: string, nextTo: string, typedValue: string) {
    onChange(nextFrom, nextTo);
    if (typedValue) setMonthCursor(startOfMonth(parseISO(typedValue)));
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <label className="space-y-1 text-left">
          <span className="text-xs font-medium text-muted-foreground">From</span>
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => handleInput(event.target.value, to, event.target.value)}
            className={fieldInputClass}
          />
        </label>
        <label className="space-y-1 text-left">
          <span className="text-xs font-medium text-muted-foreground">To</span>
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => handleInput(from, event.target.value, event.target.value)}
            className={fieldInputClass}
          />
        </label>
      </div>
      <MonthGrid
        monthCursor={monthCursor}
        onMonthChange={setMonthCursor}
        onSelectDay={handleSelect}
        getDayState={(day) => {
          const isEdge =
            (fromDate ? isSameDay(day, fromDate) : false) || (toDate ? isSameDay(day, toDate) : false);

          return {
            isOutsideMonth: !isSameMonth(day, monthCursor),
            isToday: isSameDay(day, new Date()),
            isSelected: isEdge,
            isInRange:
              fromDate && toDate ? isWithinInterval(day, { start: fromDate, end: toDate }) && !isEdge : false,
          };
        }}
      />
      <p className="mt-3 text-center text-xs font-medium text-muted-foreground">
        {rangeCaption}
      </p>
    </div>
  );
}

export function ReportsOverview({ view }: { view: ReportsViewModel }) {
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriodKey>(view.defaultPeriod);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeError, setRangeError] = useState("");
  const rangeContainerRef = useRef<HTMLDivElement>(null);
  useDismissOnOutsideOrEscape(rangeContainerRef, () => setRangeOpen(false), { active: rangeOpen });
  const router = useRouter();
  const period = view.periods[selectedPeriod];
  const [fromInput, setFromInput] = useState(period.periodStartKey);
  const [toInput, setToInput] = useState(period.periodEndKey);

  const customStart = view.periods.custom.periodStartKey;
  const customEnd = view.periods.custom.periodEndKey;

  useEffect(() => {
    if (view.defaultPeriod !== "custom") return;
    setSelectedPeriod("custom");
    setFromInput(customStart);
    setToInput(customEnd);
  }, [view.defaultPeriod, customStart, customEnd]);

  function refreshInsights() {
    setIsRefreshing(true);
    setRefreshMessage(null);

    startTransition(async () => {
      try {
        const result = await refreshAnalyticsInsightsAction();
        setRefreshMessage(result.message);
        router.refresh();
      } catch {
        setRefreshMessage("Analysis could not refresh right now. Current reports are still using saved metrics.");
      } finally {
        setIsRefreshing(false);
      }
    });
  }

  function selectPeriod(key: ReportPeriodKey) {
    const item = view.periods[key];
    setSelectedPeriod(key);
    setFromInput(item.periodStartKey);
    setToInput(item.periodEndKey);
    setRangeError("");
  }

  function applyRange() {
    if (!fromInput || !toInput) {
      setRangeError("Pick both a start and an end date.");
      return;
    }
    if (toInput < fromInput) {
      setRangeError("End date must be after the start date.");
      return;
    }

    setRangeError("");
    setRangeOpen(false);
    router.push(`/reports?from=${fromInput}&to=${toInput}`);
  }

  return (
    <LazyMotionProvider>
      <div className="-mx-4 -mt-3 px-3 pt-3 pb-28 sm:-mx-5 sm:px-3 lg:-mx-6 lg:-mt-4 lg:-mb-4 lg:px-3 lg:pt-3 lg:pb-3">
        <WorkspacePage>
          <WorkspaceHeader
            title="Reports"
            actions={
              <>
                <div className="inline-flex h-10 items-center gap-1">
                  {view.periodOrder.map((key) => {
                    const item = view.periods[key];
                    const selected = selectedPeriod === key;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => selectPeriod(item.key)}
                        className={cn(
                          "h-9 rounded-(--radius-tile) px-3 text-sm font-medium transition-[background-color,color,transform] duration-(--duration-base) ease-(--ease-out-quint) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:scale-[0.97]",
                          selected ? "bg-primary/8 text-primary" : "text-muted-foreground hover:bg-secondary"
                        )}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                <div ref={rangeContainerRef} className="relative">
                  <button
                    type="button"
                    aria-label="Choose a custom date range"
                    aria-haspopup="dialog"
                    aria-expanded={rangeOpen}
                    onClick={() => setRangeOpen((current) => !current)}
                    className={cn(
                      "grid size-10 place-items-center rounded-(--radius-card) border bg-white transition-[background-color,border-color,color,transform] duration-(--duration-base) ease-(--ease-out-quint) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:scale-[0.97]",
                      rangeOpen || selectedPeriod === "custom"
                        ? "border-primary/40 text-primary"
                        : "border-border/80 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    )}
                  >
                    <CalendarDays className="size-4" />
                  </button>
                  {rangeOpen ? (
                    <div
                      role="dialog"
                      aria-label="Custom range"
                      className="state-pop absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] origin-top-right rounded-(--radius-card) border border-border/80 bg-white p-4 shadow-(--shadow-pop)"
                    >
                      <RangeCalendar
                        from={fromInput}
                        to={toInput}
                        onChange={(nextFrom, nextTo) => {
                          setFromInput(nextFrom);
                          setToInput(nextTo);
                          setRangeError("");
                        }}
                      />
                      {rangeError ? (
                        <p className="mt-2 text-center text-xs font-medium text-destructive">{rangeError}</p>
                      ) : null}
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setRangeOpen(false)}
                          className="inline-flex h-9 items-center justify-center rounded-(--radius-card) border border-border/75 bg-white px-3.5 text-sm font-semibold text-foreground transition-[background-color,border-color] duration-(--duration-base) hover:border-border hover:bg-[#f7f9fc] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={applyRange}
                          disabled={!fromInput || !toInput}
                          className={cn(buttonVariants({ variant: "solid" }), "rounded-(--radius-card) px-3.5")}
                        >
                          Analyse range
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={refreshInsights}
                  disabled={isRefreshing}
                  className="inline-flex h-10 items-center gap-2 rounded-(--radius-card) border border-border/80 bg-white px-3 text-sm font-medium text-foreground transition-[background-color,border-color,color,transform] duration-(--duration-base) ease-(--ease-out-quint) hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
                >
                  <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
                  Refresh AI
                </button>
              </>
            }
          />

          {refreshMessage ? (
            <div className="rounded-(--radius-card) border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
              {refreshMessage}
            </div>
          ) : null}

          <div className="space-y-3">
            <OverviewTab period={period} />
            <StaffTab period={period} />
            <div className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <AppointmentStatusCard period={period} />
              <HighlightsCard period={period} />
              <BookingPatternsCard period={period} />
            </div>
          </div>
        </WorkspacePage>
      </div>
    </LazyMotionProvider>
  );
}
