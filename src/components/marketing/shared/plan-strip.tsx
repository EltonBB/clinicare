import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { proAddedFeatures, publicPlans } from "@/lib/public-plans";

/**
 * The two plans as one split strip (used on Home and Pricing, always this one
 * component). Each half links to that plan's checkout and lifts its own
 * background on hover; Pro's half lists only what it adds over Basic.
 */
export function PlanStrip() {
  const [basic, pro] = publicPlans;
  const halves = [
    { plan: basic, points: basic.features.slice(0, 4), lead: "Includes" },
    { plan: pro, points: proAddedFeatures.slice(0, 4), lead: "Adds" },
  ];

  return (
    <div className="grid overflow-hidden rounded-(--radius-mkt-card) border border-border/70 bg-white md:grid-cols-2">
      {halves.map(({ plan, points, lead }, i) => (
        <Link
          key={plan.key}
          href={`/checkout?plan=${plan.key}`}
          className={
            "group/plan relative flex flex-col p-8 transition-colors duration-(--duration-slow) ease-out-quint hover:bg-[var(--brand-wash)]/55 focus-visible:bg-[var(--brand-wash)]/55 focus-visible:outline-none sm:p-10 " +
            (i === 1 ? "border-t border-border/70 md:border-l md:border-t-0" : "")
          }
        >
          <h3 className="text-xl font-semibold text-[var(--brand-ink)]">{plan.name}</h3>
          <p className="mt-6 flex items-baseline gap-2">
            <span className="text-[clamp(3.5rem,6vw,5rem)] font-semibold leading-none tracking-[-0.04em] text-[var(--brand-ink)] tabular-nums transition-colors duration-(--duration-slow) group-hover/plan:text-primary">
              {plan.price}
            </span>
            <span className="text-sm text-muted-foreground">{plan.cadence}</span>
          </p>
          <p className="mt-5 max-w-sm text-[15px] leading-7 text-muted-foreground">{plan.description}</p>

          <p className="mt-8 text-xs font-semibold text-muted-foreground">{lead}</p>
          <ul className="mt-3 divide-y divide-border/60 border-y border-border/60">
            {points.map((point) => (
              <li key={point} className="py-2.5 text-sm font-medium text-foreground">
                {point}
              </li>
            ))}
          </ul>

          <span className="mt-auto inline-flex items-center gap-2 pt-8 text-sm font-semibold text-[var(--brand-ink)] transition-colors duration-(--duration-base) group-hover/plan:text-primary">
            Choose {plan.name}
            <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/plan:translate-x-1" />
          </span>
        </Link>
      ))}
    </div>
  );
}
