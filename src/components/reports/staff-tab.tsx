"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { WorkspaceEmptyState } from "@/components/workspace/workspace-layout";
import { cn, getInitials } from "@/lib/utils";
import type { ReportPeriodView } from "@/lib/reports";

type SortKey = "appointments" | "bookedMinutes" | "completion";

const columns: Array<{ key: SortKey; label: string }> = [
  { key: "appointments", label: "Visits" },
  { key: "bookedMinutes", label: "Load" },
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
      <section className="rounded-(--radius-card) border border-border/80 bg-white p-3.5 shadow-(--shadow-card)">
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
    <section className="rounded-(--radius-card) border border-border/80 bg-white p-3.5 shadow-(--shadow-card)">
      <div className="flex items-center gap-3 border-b border-border/70 px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="flex-1">Provider</span>
        {columns.map((column) => (
          <button
            key={column.key}
            type="button"
            onClick={() => toggleSort(column.key)}
            className={cn(
              "flex w-11 shrink-0 items-center justify-end gap-1 text-right transition-colors duration-(--duration-base) hover:text-foreground sm:w-20",
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

      <div className="divide-y divide-border/65">
        {sortedRows.map((row) => {
          const rowKey = row.id;
          const loadShare = maxBookedMinutes > 0 ? (row.bookedMinutes / maxBookedMinutes) * 100 : 0;
          const bookedHours = Math.round((row.bookedMinutes / 60) * 10) / 10;

          return (
            <div key={rowKey}>
              <button
                type="button"
                onClick={() => setOpenRowId((current) => (current === rowKey ? null : rowKey))}
                className="flex w-full items-center gap-3 py-2.5 text-left transition-colors duration-(--duration-base) hover:bg-secondary/35"
              >
                <Avatar shape="square">
                  <AvatarFallback className="bg-white text-xs font-semibold text-primary">
                    {getInitials(row.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.role}</p>
                </div>
                <span className="w-11 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground sm:w-20">
                  {row.appointments}
                </span>
                <span className="hidden w-20 shrink-0 sm:block">
                  <span className="block h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(loadShare, 100)}%` }}
                    />
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
            </div>
          );
        })}
      </div>
    </section>
  );
}
