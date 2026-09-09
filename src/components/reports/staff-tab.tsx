"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";

import { WorkspaceEmptyState } from "@/components/workspace/workspace-layout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, getInitials } from "@/lib/utils";
import { staggerChildren, staggerItem } from "@/lib/motion";
import type { ReportPeriodView } from "@/lib/reports";

type SortKey = "appointments" | "bookedMinutes" | "completion";

const columns: Array<{ key: SortKey; label: string }> = [
  { key: "appointments", label: "Visits" },
  { key: "bookedMinutes", label: "Booked time" },
  { key: "completion", label: "Completion" },
];

function completionValue(completionRate: string) {
  return completionRate ? Number.parseFloat(completionRate) : -1;
}

export function StaffTab({ period }: { period: ReportPeriodView }) {
  const [sortKey, setSortKey] = useState<SortKey>("appointments");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const { staffLoad } = period.diagnostics;
  const maxBookedMinutes = Math.max(...staffLoad.map((row) => row.bookedMinutes), 1);
  const totalVisits = staffLoad.reduce((sum, row) => sum + row.appointments, 0);
  const avgBookedMinutes = staffLoad.length > 0
    ? staffLoad.reduce((sum, row) => sum + row.bookedMinutes, 0) / staffLoad.length
    : 0;
  const avgLoadShare = maxBookedMinutes > 0 ? Math.min((avgBookedMinutes / maxBookedMinutes) * 100, 100) : 0;
  const avgAppointments = staffLoad.length > 0 ? totalVisits / staffLoad.length : 0;

  const sortedRows = useMemo(() => {
    const rows = [...staffLoad];
    const direction = sortDir === "asc" ? 1 : -1;

    rows.sort((left, right) => {
      if (sortKey === "completion") {
        return (completionValue(left.completionRate) - completionValue(right.completionRate)) * direction;
      }
      return (left[sortKey] - right[sortKey]) * direction;
    });

    return rows;
  }, [staffLoad, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDir("desc");
  }

  if (staffLoad.length === 0) {
    return (
      <section className="flex flex-col rounded-(--radius-card) border border-border/80 bg-white p-3.5 shadow-(--shadow-card)">
        <h2 className="px-1 pb-2 text-[15px] font-semibold text-foreground">Staff performance</h2>
        <WorkspaceEmptyState
          compact
          icon={ChevronRight}
          title="No staff activity yet"
          description="Provider performance appears once appointments are assigned this period."
        />
      </section>
    );
  }

  return (
    <section className="flex flex-col rounded-(--radius-card) border border-border/80 bg-white p-3.5 shadow-(--shadow-card)">
      <h2 className="px-1 pb-2 text-[15px] font-semibold text-foreground">Staff performance</h2>
      <div className="flex items-center gap-3 px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="min-w-0 max-w-[240px] flex-1">Provider</span>
        {columns.map((column) => (
          <button
            key={column.key}
            type="button"
            onClick={() => toggleSort(column.key)}
            className={cn(
              "flex items-center justify-end gap-1 text-right transition-colors duration-(--duration-base) hover:text-foreground",
              column.key === "completion"
                ? "w-14 shrink-0 sm:w-20"
                : column.key === "bookedMinutes"
                  ? "flex-1"
                  : "w-16 shrink-0 sm:w-24",
              column.key === "bookedMinutes" && "hidden sm:flex",
              sortKey === column.key && "text-primary"
            )}
          >
            {column.label}
            {sortKey === column.key ? (
              sortDir === "desc" ? (
                <ArrowDown className="size-3" />
              ) : (
                <ArrowUp className="size-3" />
              )
            ) : null}
          </button>
        ))}
      </div>

      <m.div variants={staggerChildren} initial="initial" animate="animate">
        {sortedRows.map((row) => {
          const rowKey = row.id;
          const loadShare = maxBookedMinutes > 0 ? (row.bookedMinutes / maxBookedMinutes) * 100 : 0;
          const bookedHours = Math.round((row.bookedMinutes / 60) * 10) / 10;
          const vsAverage =
            avgAppointments > 0 ? Math.round(((row.appointments - avgAppointments) / avgAppointments) * 100) : 0;

          return (
            <m.div variants={staggerItem} key={rowKey}>
              <button
                type="button"
                onClick={() => setOpenRowId((current) => (current === rowKey ? null : rowKey))}
                aria-expanded={openRowId === rowKey}
                className="flex w-full items-center gap-3 py-2.5 text-left transition-[background-color,transform] duration-(--duration-base) hover:bg-secondary/35 active:scale-[0.99]"
              >
                <span className="flex min-w-0 max-w-[240px] flex-1 items-center gap-3">
                  <Avatar shape="square">
                    <AvatarFallback className="bg-white text-xs font-semibold text-primary">
                      {getInitials(row.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.role}</p>
                  </span>
                </span>
                <span className="w-16 shrink-0 text-right sm:w-24">
                  <span className="text-sm font-semibold tabular-nums text-foreground">{row.appointments}</span>
                  {avgAppointments > 0 && vsAverage !== 0 ? (
                    <span
                      className={cn(
                        "ml-1 text-[10px] font-semibold tabular-nums",
                        vsAverage > 0 ? "text-emerald-600" : "text-red-500"
                      )}
                    >
                      {vsAverage > 0 ? "+" : ""}
                      {vsAverage}%
                    </span>
                  ) : null}
                </span>
                <span className="hidden flex-1 flex-col items-end gap-1 sm:flex">
                  <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                    {bookedHours}h
                  </span>
                  <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(loadShare, 100)}%` }}
                    />
                    {avgLoadShare > 0 ? (
                      <span
                        className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-foreground/40"
                        style={{ left: `${avgLoadShare}%` }}
                        title="Team average load"
                      />
                    ) : null}
                  </span>
                </span>
                <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground sm:w-20">
                  {row.completionRate || "—"}
                </span>
              </button>

              {openRowId === rowKey ? (
                <div className="state-pop mb-2 rounded-(--radius-tile) border border-dashed border-primary/25 bg-primary/5 px-3 py-2.5 text-sm">
                  <p className="text-foreground">
                    {row.appointments} visit{row.appointments === 1 ? "" : "s"} this period, {bookedHours}{" "}
                    booked hour{bookedHours === 1 ? "" : "s"} ({row.utilizationShare} of total staff load)
                    {row.completionRate ? `, ${row.completionRate} completion rate.` : ", no finalized visits yet."}
                    {avgAppointments > 0 && vsAverage !== 0
                      ? ` That's ${Math.abs(vsAverage)}% ${vsAverage > 0 ? "above" : "below"} the team average of ${avgAppointments.toFixed(1)} visits.`
                      : ""}
                  </p>
                  <Link
                    href={`/staff/${row.id}`}
                    className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  >
                    View profile
                    <ChevronRight className="size-3.5" />
                  </Link>
                </div>
              ) : null}
            </m.div>
          );
        })}
      </m.div>
    </section>
  );
}
