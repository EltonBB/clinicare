"use client";

import { Fragment, useState } from "react";
import { Clock3, UserX, Zap } from "lucide-react";

import { WorkspaceEmptyState } from "@/components/workspace/workspace-layout";
import {
  DEMAND_HEATMAP_BANDS,
  DEMAND_HEATMAP_DAYS,
  type ReportPeriodView,
} from "@/lib/reports";
import { LegendRow } from "./overview-tab";

const mixColors: Record<string, string> = {
  active: "var(--primary)",
  atRisk: "#f59e0b",
  inactive: "#94a3b8",
  archived: "#cbd5e1",
};

function intensity(count: number, max: number) {
  if (max <= 0 || count <= 0) return 0;
  return count / max;
}

export function DemandTab({ period }: { period: ReportPeriodView }) {
  const [hoverCell, setHoverCell] = useState<string | null>(null);
  const { heatmap } = period.diagnostics.demandWindows;
  const { bookingBehavior } = period.diagnostics;
  const maxCount = Math.max(...heatmap.map((cell) => cell.count), 1);
  const hasBookings = heatmap.some((cell) => cell.count > 0);
  const cellByKey = new Map(heatmap.map((cell) => [`${cell.day}__${cell.band}`, cell]));

  return (
    <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
      <section className="rounded-(--radius-card) border border-border/80 bg-white p-3.5 shadow-(--shadow-card)">
        <h2 className="px-1 text-[15px] font-semibold text-foreground">Booking patterns</h2>
        <p className="px-1 text-sm text-muted-foreground">When appointments actually land</p>

        {hasBookings ? (
          <div className="mt-3">
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `72px repeat(${DEMAND_HEATMAP_DAYS.length}, 1fr)` }}
            >
              <div />
              {DEMAND_HEATMAP_DAYS.map((day) => (
                <div key={day} className="pb-1 text-center text-[10px] font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
              {DEMAND_HEATMAP_BANDS.map((band) => (
                <Fragment key={band.key}>
                  <div className="flex items-center text-[11px] text-muted-foreground">
                    {band.label}
                  </div>
                  {DEMAND_HEATMAP_DAYS.map((day) => {
                    const cell = cellByKey.get(`${day}__${band.label}`);
                    const count = cell?.count ?? 0;
                    const cellKey = `${day}__${band.label}`;
                    const alpha = 0.08 + intensity(count, maxCount) * 0.82;

                    return (
                      <div
                        key={cellKey}
                        className="relative"
                        onMouseEnter={() => setHoverCell(cellKey)}
                        onMouseLeave={() => setHoverCell((current) => (current === cellKey ? null : current))}
                      >
                        <div
                          className="h-6 rounded-[4px]"
                          style={{
                            background:
                              count > 0
                                ? `color-mix(in srgb, var(--primary) ${Math.round(alpha * 100)}%, white)`
                                : "var(--secondary)",
                          }}
                        />
                        {hoverCell === cellKey ? (
                          <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-(--radius-tile) border border-border/80 bg-white px-2 py-1 text-[11px] font-medium text-foreground shadow-[0_6px_16px_rgba(20,21,47,0.12)]">
                            {day} {band.label}: {count}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <WorkspaceEmptyState
              compact
              icon={Clock3}
              title="No booking pattern yet"
              description="The heat-grid fills in once appointments are booked this period."
            />
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap gap-3 border-t border-border/70 pt-3">
          <div className="flex flex-1 items-center gap-2.5 rounded-(--radius-tile) border border-border/70 px-3 py-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
              <Clock3 className="size-3.5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {bookingBehavior.averageLeadTimeHours}h
              </p>
              <p className="text-xs text-muted-foreground">Avg booking lead time</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-2.5 rounded-(--radius-tile) border border-border/70 px-3 py-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
              <Zap className="size-3.5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{bookingBehavior.sameDayBookings}</p>
              <p className="text-xs text-muted-foreground">Same-day bookings</p>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-2.5 rounded-(--radius-tile) border border-border/70 px-3 py-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
              <UserX className="size-3.5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {bookingBehavior.unassignedAppointments}
              </p>
              <p className="text-xs text-muted-foreground">Unassigned appointments</p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col rounded-(--radius-card) border border-border/80 bg-white p-3.5 shadow-(--shadow-card)">
        <h2 className="px-1 text-[15px] font-semibold text-foreground">Client mix</h2>
        {period.clientMixTotal > 0 ? (
          <>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-secondary">
              {period.clientMixSegments.map((segment) =>
                segment.count > 0 ? (
                  <div
                    key={segment.key}
                    style={{ width: `${segment.percent}%`, background: mixColors[segment.key] }}
                  />
                ) : null
              )}
            </div>
            <div className="mt-2 divide-y divide-border/65 text-sm">
              {period.clientMixSegments.map((segment) => (
                <LegendRow
                  key={segment.key}
                  color={mixColors[segment.key]}
                  label={segment.label}
                  value={`${segment.count}`}
                  detail={`${segment.percent.toFixed(0)}%`}
                  muted={segment.count === 0}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="mt-3">
            <WorkspaceEmptyState
              compact
              icon={UserX}
              title="No client records yet"
              description="Client mix appears once client records exist."
            />
          </div>
        )}
      </section>
    </div>
  );
}
