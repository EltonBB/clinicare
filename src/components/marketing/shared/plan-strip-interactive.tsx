"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { type PaddleClientConfig, useLocalizedPrices } from "@/components/billing/use-paddle";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { TRIAL_DAYS } from "@/lib/checkout-state";
import { localizedPlans, type PublicPlan, type PublicPlanKey } from "@/lib/public-plans";
import { cn } from "@/lib/utils";

type Interval = "MONTH" | "YEAR";

/** What the browser needs to show plan prices in the visitor's currency (see `planPricing`). */
export type PlanPricing = {
  paddle: PaddleClientConfig | null;
  previewPriceIds: Record<PublicPlanKey, Record<Interval, string>> | null;
};

/**
 * A plan's price in the visitor's currency once Paddle answers, its list price
 * until then (or when billing is off). Every caller asks for the same four
 * prices, so a page showing plans in several places makes one request.
 */
export function usePlanPrice({ paddle, previewPriceIds }: PlanPricing): (plan: PublicPlan, interval: Interval) => string {
  const localized = useLocalizedPrices(
    paddle,
    previewPriceIds ? [previewPriceIds.basic.MONTH, previewPriceIds.basic.YEAR, previewPriceIds.pro.MONTH, previewPriceIds.pro.YEAR] : []
  );
  return (plan, interval) => {
    const previewId = previewPriceIds?.[plan.key][interval];
    return (previewId && localized[previewId]) || (interval === "YEAR" ? plan.yearlyPrice : plan.price);
  };
}

/** One plan's monthly price in the visitor's currency, its list price until Paddle answers. */
export function LocalPlanPrice({ pricing, plan }: { pricing: PlanPricing; plan: PublicPlan }) {
  return usePlanPrice(pricing)(plan, "MONTH");
}

/**
 * Each half links to that plan's checkout (with the chosen billing period)
 * and lifts its own background on hover; Pro's half lists only what it adds
 * over Basic. Prices show in the visitor's currency once Paddle answers.
 */
export function PlanStripInteractive({ pricing }: { pricing: PlanPricing }) {
  const [interval, setBillingInterval] = useState<Interval>("MONTH");
  const priceOf = usePlanPrice(pricing);
  const { m } = useI18n();
  const t = m.marketing.planStrip;
  const [basic, pro] = localizedPlans(m.common.plans);
  const halves = [
    { plan: basic, points: basic.features.slice(0, 4), lead: t.includes },
    // Pro's list after its "Everything in Basic" connector is what it adds.
    { plan: pro, points: pro.features.slice(1, 5), lead: t.adds },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label={t.billingPeriod}>
        {(["MONTH", "YEAR"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setBillingInterval(option)}
            aria-pressed={interval === option}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium transition-colors duration-(--duration-base) active:scale-[0.97]",
              interval === option
                ? "bg-[var(--brand-ink)] text-white"
                : "text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:text-[var(--brand-ink)]"
            )}
          >
            {option === "MONTH" ? t.monthly : t.yearly}
          </button>
        ))}
      </div>

      <div className="grid overflow-hidden rounded-(--radius-mkt-card) border border-border/70 bg-white md:grid-cols-2">
        {halves.map(({ plan, points, lead }, i) => {
          const price = priceOf(plan, interval);
          // Only Basic starts with the free trial; Pro is billed from day one.
          const trial = plan.key === "basic";
          return (
            <Link
              key={plan.key}
              href={`/checkout?plan=${plan.key}${interval === "YEAR" ? "&interval=year" : ""}`}
              className={
                "group/plan relative flex flex-col p-8 transition-colors duration-(--duration-slow) ease-out-quint hover:bg-[var(--brand-wash)]/55 focus-visible:bg-[var(--brand-wash)]/55 focus-visible:outline-none sm:p-10 " +
                (i === 1 ? "border-t border-border/70 md:border-l md:border-t-0" : "")
              }
            >
              <h3 className="text-xl font-semibold text-[var(--brand-ink)]">{plan.name}</h3>
              <p className="mt-6 flex items-baseline gap-2">
                <span className="text-[clamp(3.5rem,6_*_var(--mkt-vw),5rem)] font-semibold leading-none tracking-[-0.04em] text-[var(--brand-ink)] tabular-nums transition-colors duration-(--duration-slow) group-hover/plan:text-primary">
                  {price}
                </span>
                <span className="text-sm text-muted-foreground">{interval === "YEAR" ? m.common.plans.perYear : plan.cadence}</span>
              </p>
              <p className="mt-2 text-sm font-medium text-primary">
                {trial ? fmt(t.trial, { days: TRIAL_DAYS }) : t.paidFromStart}
              </p>
              <p className="mt-4 max-w-sm text-[15px] leading-7 text-muted-foreground">{plan.description}</p>

              <p className="mt-8 text-xs font-semibold text-muted-foreground">{lead}</p>
              <ul className="mt-3 divide-y divide-border/60 border-y border-border/60">
                {points.map((point) => (
                  <li key={point} className="py-2.5 text-sm font-medium text-foreground">
                    {point}
                  </li>
                ))}
              </ul>

              <span className="mt-auto inline-flex items-center gap-2 pt-8 text-sm font-semibold text-[var(--brand-ink)] transition-colors duration-(--duration-base) group-hover/plan:text-primary">
                {trial ? t.startTrial : t.choosePro}
                <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/plan:translate-x-1" />
              </span>
            </Link>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t.vat}</p>
    </div>
  );
}
