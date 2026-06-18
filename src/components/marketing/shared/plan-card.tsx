import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import type { PublicPlan } from "@/lib/public-plans";

/**
 * Premium plan card shared by the pricing page and the home pricing preview.
 * Pro (highlighted) gets a gradient top bar, accent border, glow, and ribbon;
 * Basic stays clean and neutral. Both link to the real checkout route.
 */
export function PlanCard({ plan }: { plan: PublicPlan }) {
  const pro = Boolean(plan.highlighted);

  return (
    <div
      className={
        "relative flex h-full flex-col overflow-hidden rounded-(--radius-hero) bg-white p-7 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 sm:p-8 " +
        (pro
          ? "border-2 border-primary/55 shadow-[0_36px_100px_rgba(10,34,255,0.18)]"
          : "border border-border/80 shadow-[0_24px_70px_rgba(20,21,47,0.06)]")
      }
    >
      {pro ? (
        <>
          <span aria-hidden className="vela-gradient absolute inset-x-0 top-0 h-1.5" />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[radial-gradient(circle,rgba(100,182,255,0.2),transparent_65%)] blur-2xl"
          />
        </>
      ) : null}

      <div className="relative flex items-center justify-between gap-3">
        <h3 className="text-2xl font-semibold text-[var(--brand-ink)]">{plan.name}</h3>
        {pro ? (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Most popular</span>
        ) : null}
      </div>
      <p className="relative mt-2 text-sm leading-6 text-muted-foreground">{plan.description}</p>

      <div className="relative mt-6 flex items-end gap-1.5">
        <span className="text-5xl font-semibold tracking-tight text-[var(--brand-ink)]">{plan.price}</span>
        <span className="pb-2 text-sm font-semibold text-muted-foreground">{plan.cadence}</span>
      </div>
      <p className="relative mt-2 text-xs font-semibold text-muted-foreground">{plan.audience}</p>

      <Link
        href={`/checkout?plan=${plan.key}`}
        className={
          "relative mt-7 inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-field) px-4 text-sm font-bold transition-transform duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45 " +
          (pro
            ? "vela-gradient text-white shadow-[0_18px_36px_rgba(10,34,255,0.24)]"
            : "border border-border/80 bg-white text-foreground hover:border-primary/40 hover:text-primary")
        }
      >
        Choose {plan.name}
        <ArrowRight className="size-4" />
      </Link>

      <div className="relative mt-7 border-t border-border/60 pt-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">What&apos;s included</p>
        <ul className="mt-4 grid gap-3">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm font-semibold text-foreground">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check className="size-3" />
              </span>
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
