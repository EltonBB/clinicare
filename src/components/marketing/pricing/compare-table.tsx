"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { publicPlans } from "@/lib/public-plans";

type Cell = true | false | string;
const GROUPS: { title: string; rows: [string, Cell, Cell][] }[] = [
  {
    title: "Daily work",
    rows: [
      ["Appointments and calendar", true, true],
      ["Patient record timeline", true, true],
      ["Documents, scans, and images", true, true],
      ["WhatsApp-ready inbox", true, true],
      ["Payment and thank-you message drafts", true, true],
      ["Waiting list with slot-offer drafts", false, true],
      ["Rebooking nudge drafts", false, true],
    ],
  },
  {
    title: "Insight",
    rows: [
      ["Daily dashboard", true, true],
      ["Reports and analytics", false, true],
      ["AI-assisted insights", false, true],
      ["Staff activity and utilization", false, true],
      ["No-show tracking and risk alerts", false, true],
    ],
  },
  {
    title: "Support",
    rows: [["Setup support", "Standard", "Priority"]],
  },
];

const COLS = "grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.75fr)_minmax(0,0.75fr)]";

function Value({ value, pro }: { value: Cell; pro: boolean }) {
  if (value === true) {
    return (
      <span className={cn("mx-auto flex size-6 items-center justify-center rounded-full", pro ? "bg-primary text-white" : "bg-[var(--brand-wash)] text-primary")}>
        <Check className="size-3.5" strokeWidth={2.5} />
        <span className="sr-only">Included</span>
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="mx-auto flex size-6 items-center justify-center text-muted-foreground/50">
        <Minus className="size-4" />
        <span className="sr-only">Not included</span>
      </span>
    );
  }
  return <span className={cn("text-sm", pro ? "font-semibold text-primary" : "text-muted-foreground")}>{value}</span>;
}

/**
 * Basic against Pro, grouped by what the clinic is doing (daily work, insight,
 * support). Pointing anywhere in a plan's column lights that whole column, so
 * the eye can read one plan top to bottom.
 */
export function CompareTable() {
  const [col, setCol] = useState<0 | 1 | null>(null);
  const [basic, pro] = publicPlans;

  const colTint = (c: 0 | 1) => (col === c ? "bg-[var(--brand-wash)]/70" : "");

  return (
    <div className="overflow-hidden rounded-(--radius-mkt-card) border border-border/70 bg-white [&>div:last-child>div:last-child]:border-b-0" onPointerLeave={() => setCol(null)}>
      <div className={cn(COLS, "border-b border-border/70")}>
        <div className="px-4 py-6 sm:px-8">
          <p className="text-sm font-medium text-muted-foreground">Compare plans</p>
        </div>
        {[basic, pro].map((plan, c) => (
          <div
            key={plan.key}
            onPointerEnter={() => setCol(c as 0 | 1)}
            className={cn("px-2 py-6 text-center transition-colors duration-300", colTint(c as 0 | 1))}
          >
            <p className={cn("text-base font-semibold", c === 1 ? "text-primary" : "text-[var(--brand-ink)]")}>{plan.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {plan.price} {plan.cadence}
            </p>
          </div>
        ))}
      </div>

      {GROUPS.map((group) => (
        <div key={group.title}>
          <div className={cn(COLS, "border-b border-border/60 bg-[var(--brand-wash)]/35")}>
            <p className="px-4 py-2.5 text-xs font-semibold text-muted-foreground sm:px-8">{group.title}</p>
            <span className={cn("transition-colors duration-300", colTint(0))} />
            <span className={cn("transition-colors duration-300", colTint(1))} />
          </div>
          {group.rows.map(([feature, b, p]) => (
            <div key={feature} className={cn(COLS, "group/row border-b border-border/60")}>
              <span className="px-4 py-4 text-sm font-medium text-[var(--brand-ink)] transition-colors group-hover/row:text-primary sm:px-8">{feature}</span>
              <span onPointerEnter={() => setCol(0)} className={cn("flex items-center justify-center px-2 py-4 transition-colors duration-300", colTint(0))}>
                <Value value={b} pro={false} />
              </span>
              <span onPointerEnter={() => setCol(1)} className={cn("flex items-center justify-center px-2 py-4 transition-colors duration-300", colTint(1))}>
                <Value value={p} pro />
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
