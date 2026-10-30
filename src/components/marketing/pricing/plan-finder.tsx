"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { publicPlans } from "@/lib/public-plans";
import { type PlanPricing, usePlanPrice } from "../shared/plan-strip-interactive";
import { EASE } from "../motion/ease";

// Each question maps to a real Pro-only line on the plan cards.
const QUESTIONS = [
  { key: "insight", ask: "Should reports suggest what to fix next?", because: "AI-assisted operational insights" },
  { key: "staff", ask: "Do you want to see staff activity and utilization?", because: "Staff activity and utilization" },
  { key: "setup", ask: "Would priority help with setup be useful?", because: "Priority setup support" },
] as const;

type Key = (typeof QUESTIONS)[number]["key"];

/**
 * "Which plan fits?": three yes/no questions, each tied to something only Pro
 * includes. The verdict card on the right updates as answers change and says
 * exactly why. No answers needed for Basic; any Pro need tips it to Pro.
 */
export function PlanFinder({ pricing }: { pricing: PlanPricing }) {
  const [yes, setYes] = useState<Set<Key>>(new Set());
  const priceOf = usePlanPrice(pricing);
  const pro = yes.size > 0;
  const plan = publicPlans.find((p) => p.key === (pro ? "pro" : "basic"))!;
  const reasons = QUESTIONS.filter((q) => yes.has(q.key)).map((q) => q.because);

  const answer = (key: Key, value: boolean) =>
    setYes((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <div className="grid overflow-hidden rounded-(--radius-mkt-card) border border-border/70 bg-white lg:grid-cols-[1.4fr_1fr]">
      <ol className="divide-y divide-border/60">
        {QUESTIONS.map((q, i) => {
          const value = yes.has(q.key);
          return (
            <li key={q.key} className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <p className="text-base font-medium text-[var(--brand-ink)]">
                <span className="mr-3 text-sm font-semibold text-primary tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                {q.ask}
              </p>
              <div role="radiogroup" aria-label={q.ask} className="relative grid shrink-0 grid-cols-2 self-start rounded-full sm:self-auto bg-[var(--brand-wash)] p-1 text-sm font-semibold">
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-[0_1px_3px_rgba(20,21,47,0.12)] transition-transform duration-300 ease-out-quint",
                    value ? "translate-x-full" : "translate-x-0",
                  )}
                />
                {/* Native radios: one tab stop per question, arrow keys switch the answer. */}
                {[false, true].map((v) => (
                  <label
                    key={String(v)}
                    className={cn(
                      "relative z-10 w-16 cursor-pointer rounded-full py-1.5 text-center transition-colors duration-200 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/40",
                      value === v ? "text-[var(--brand-ink)]" : "text-muted-foreground",
                    )}
                  >
                    <input
                      type="radio"
                      name={`plan-finder-${q.key}`}
                      checked={value === v}
                      onChange={() => answer(q.key, v)}
                      className="sr-only"
                    />
                    {v ? "Yes" : "No"}
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      <div className={cn("relative flex flex-col justify-between gap-8 p-8 transition-colors duration-500 lg:border-l lg:border-border/60", pro ? "bg-[var(--brand-ink)] text-white" : "bg-[var(--brand-wash)]/50")}>
        <div aria-live="polite">
          <p className={cn("text-sm font-medium", pro ? "text-white/55" : "text-muted-foreground")}>Your fit</p>
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={plan.key}
              initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <p className="mt-2 flex items-baseline gap-3">
                <span className="text-4xl font-semibold tracking-tight">{plan.name}</span>
                <span className={cn("text-lg tabular-nums", pro ? "text-white/70" : "text-muted-foreground")}>
                  {priceOf(plan, "MONTH")} {plan.cadence}
                </span>
              </p>
            </m.div>
          </AnimatePresence>
          <p className={cn("mt-4 text-sm leading-6", pro ? "text-white/70" : "text-muted-foreground")}>
            {pro ? "Because you want:" : "Everything a clinic needs to run the day. Answer yes to any question if you need more."}
          </p>
          {pro ? (
            <ul className="mt-2 space-y-1.5">
              {reasons.map((r) => (
                <li key={r} className="flex items-center gap-2 text-sm font-medium">
                  <span className="size-1.5 rounded-full bg-[#64B6FF]" />
                  {r}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Link
          href={`/checkout?plan=${plan.key}`}
          className={cn(
            "group/fit inline-flex h-12 items-center justify-center gap-2 rounded-(--radius-mkt-field) px-6 text-sm font-semibold transition-[transform,background-color] duration-(--duration-base) ease-out-quint active:scale-[0.97]",
            pro ? "bg-white text-[var(--brand-ink)]" : "bg-[var(--brand-ink)] text-white",
          )}
        >
          Choose {plan.name}
          <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/fit:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
