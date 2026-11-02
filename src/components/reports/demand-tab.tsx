"use client";

import { Fragment, useState } from "react";
import { m as motion } from "framer-motion";
import { Clock3 } from "lucide-react";

import { WorkspaceEmptyState } from "@/components/workspace/workspace-layout";
import { useI18n } from "@/i18n/client";
import { fmt, plural, storedLabel } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { fadeIn } from "@/lib/motion";
import {
  DEMAND_HEATMAP_BANDS,
  DEMAND_HEATMAP_DAYS,
  type ReportPeriodView,
} from "@/lib/reports";

const FULL_DAY: Record<string, keyof Messages["common"]["weekdays"]> = {
  Mon: "monday",
  Tue: "tuesday",
  Wed: "wednesday",
  Thu: "thursday",
  Fri: "friday",
  Sat: "saturday",
  Sun: "sunday",
};

function intensity(count: number, max: number) {
  if (max <= 0 || count <= 0) return 0;
  return count / max;
}

export function BookingPatternsCard({ period }: { period: ReportPeriodView }) {
  const { locale, m } = useI18n();
  const t = m.reports.patterns;
  const dayName = (day: string) => storedLabel(t.days, day);
  const bandName = (band: string) => storedLabel(t.bands, band);
  const fullDayName = (day: string) => {
    const key = FULL_DAY[day];
    // Albanian writes day names in lower case mid-sentence; English keeps the capital.
    const name = key ? m.common.weekdays[key].name : day;
    return locale === "en" ? name : name.toLowerCase();
  };
  const [hoverCell, setHoverCell] = useState<string | null>(null);
  const { heatmap } = period.diagnostics.demandWindows;
  const { bookingBehavior } = period.diagnostics;
  const maxCount = Math.max(...heatmap.map((cell) => cell.count), 1);
  const hasBookings = heatmap.some((cell) => cell.count > 0);
  const cellByKey = new Map(heatmap.map((cell) => [`${cell.day}__${cell.band}`, cell]));
  const peakCell = heatmap.reduce(
    (best, cell) => (cell.count > (best?.count ?? 0) ? cell : best),
    null as (typeof heatmap)[number] | null
  );

  return (
    <motion.section
      key={period.key}
      variants={fadeIn}
      initial="initial"
      animate="animate"
      className="surface-card flex h-full flex-col p-3.5"
    >
      <h2 className="px-1 text-[15px] font-semibold text-foreground">{t.title}</h2>

      {peakCell && peakCell.count > 0 ? (
        <div className="mx-1 mt-2.5 rounded-(--radius-tile) bg-primary/6 px-3 py-2">
          <p className="text-sm text-foreground">
            {plural(t.peak, peakCell.count, locale, {
              window: fmt(t.peakWindow, { day: fullDayName(peakCell.day), band: bandName(peakCell.band).toLowerCase() }),
            })}
          </p>
        </div>
      ) : null}

      {hasBookings ? (
        <div className="mt-3">
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `40px repeat(${DEMAND_HEATMAP_DAYS.length}, 1fr)` }}
          >
            <div />
            {DEMAND_HEATMAP_DAYS.map((day) => (
              <div key={day} className="pb-1 text-center text-[10px] font-medium text-muted-foreground">
                {dayName(day)}
              </div>
            ))}
            {DEMAND_HEATMAP_BANDS.map((band) => (
              <Fragment key={band.key}>
                <div className="flex items-center text-[10px] leading-tight text-muted-foreground">
                  {storedLabel(t.bandsShort, band.label)}
                </div>
                {DEMAND_HEATMAP_DAYS.map((day) => {
                  const cell = cellByKey.get(`${day}__${band.label}`);
                  const count = cell?.count ?? 0;
                  const cellKey = `${day}__${band.label}`;
                  const alpha = 0.08 + intensity(count, maxCount) * 0.82;

                  return (
                    <div
                      key={cellKey}
                      role="button"
                      tabIndex={0}
                      aria-label={plural(t.cell, count, locale, { day: dayName(day), band: bandName(band.label) })}
                      className="relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                      onMouseEnter={() => setHoverCell(cellKey)}
                      onMouseLeave={() => setHoverCell((current) => (current === cellKey ? null : current))}
                      onFocus={() => setHoverCell(cellKey)}
                      onBlur={() => setHoverCell((current) => (current === cellKey ? null : current))}
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
                          {dayName(day)}, {bandName(band.label)}: {count}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-end gap-1.5" aria-hidden="true">
            {[0.12, 0.35, 0.6, 0.9].map((alpha) => (
              <span
                key={alpha}
                className="size-2.5 rounded-[2px]"
                style={{ background: `color-mix(in srgb, var(--primary) ${Math.round(alpha * 100)}%, white)` }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex-1">
          <WorkspaceEmptyState
            compact
            icon={Clock3}
            title={t.emptyTitle}
            description={t.emptyCopy}
          />
        </div>
      )}

      {hasBookings ? (
        <div className="mt-3.5 flex flex-1 flex-wrap items-end gap-2">
          {(
            [
              { value: fmt(t.leadHours, { count: bookingBehavior.averageLeadTimeHours }), label: t.leadTime },
              { value: bookingBehavior.sameDayBookings, label: t.sameDay },
              { value: bookingBehavior.unassignedAppointments, label: t.unassigned },
            ] as const
          ).map((stat) => (
            <div key={stat.label} className="flex-1 rounded-(--radius-tile) bg-secondary/40 px-3 py-2">
              <p className="text-sm font-semibold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      ) : null}
    </motion.section>
  );
}
