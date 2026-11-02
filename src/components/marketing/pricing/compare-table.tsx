"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";
import { localizedPlans } from "@/lib/public-plans";
import { type PlanPricing, usePlanPrice } from "../shared/plan-strip-interactive";

type Cell = true | false | "standard" | "priority";
// What each plan gets, row by row; the labels are `marketing.pricing.compare.groups`, in this order.
const GROUPS: [Cell, Cell][][] = [
  [
    [true, true],
    [true, true],
    [true, true],
    [true, true],
    [true, true],
    [false, true],
    [false, true],
  ],
  [
    [true, true],
    [false, true],
    [false, true],
    [false, true],
    [false, true],
  ],
  [["standard", "priority"]],
];

const COLS = "grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.75fr)_minmax(0,0.75fr)]";

function Value({ value, pro }: { value: Cell; pro: boolean }) {
  const t = useI18n().m.marketing.pricing.compare;
  if (value === true) {
    return (
      <span className={cn("mx-auto flex size-6 items-center justify-center rounded-full", pro ? "bg-primary text-white" : "bg-[var(--brand-wash)] text-primary")}>
        <Check className="size-3.5" strokeWidth={2.5} />
        <span className="sr-only">{t.included}</span>
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="mx-auto flex size-6 items-center justify-center text-muted-foreground/50">
        <Minus className="size-4" />
        <span className="sr-only">{t.notIncluded}</span>
      </span>
    );
  }
  return <span className={cn("text-sm", pro ? "font-semibold text-primary" : "text-muted-foreground")}>{t[value]}</span>;
}

/**
 * Basic against Pro, grouped by what the clinic is doing (daily work, insight,
 * support). Pointing anywhere in a plan's column lights that whole column, so
 * the eye can read one plan top to bottom.
 */
export function CompareTable({ pricing }: { pricing: PlanPricing }) {
  const [col, setCol] = useState<0 | 1 | null>(null);
  const priceOf = usePlanPrice(pricing);
  const { m } = useI18n();
  const t = m.marketing.pricing.compare;
  const [basic, pro] = localizedPlans(m.common.plans);
  const groups = t.groups.map((group, g) => ({
    title: group.title,
    rows: group.rows.map((feature, r) => [feature, ...GROUPS[g][r]] as const),
  }));

  const colTint = (c: 0 | 1) => (col === c ? "bg-[var(--brand-wash)]/70" : "");

  return (
    <div className="overflow-hidden rounded-(--radius-mkt-card) border border-border/70 bg-white [&>div:last-child>div:last-child]:border-b-0" onPointerLeave={() => setCol(null)}>
      <div className={cn(COLS, "border-b border-border/70")}>
        <div className="px-4 py-6 sm:px-8">
          <p className="text-sm font-medium text-muted-foreground">{t.title}</p>
        </div>
        {[basic, pro].map((plan, c) => (
          <div
            key={plan.key}
            onPointerEnter={() => setCol(c as 0 | 1)}
            className={cn("px-2 py-6 text-center transition-colors duration-300", colTint(c as 0 | 1))}
          >
            <p className={cn("text-base font-semibold", c === 1 ? "text-primary" : "text-[var(--brand-ink)]")}>{plan.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {priceOf(plan, "MONTH")} {plan.cadence}
            </p>
          </div>
        ))}
      </div>

      {groups.map((group) => (
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
