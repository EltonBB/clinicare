"use client";

import Link from "next/link";
import { m } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PublicPlan } from "@/lib/public-plans";
import { EASE } from "../appframe/ease";

/**
 * Interactive plan card shared by the pricing page and the home pricing preview.
 * Pro is the rich cobalt card (white text); Basic stays clean white. The card is
 * selectable — clicking it brings the plan forward (scale + spotlight ring) while
 * the other eases back, so the two cards behave like one simple plan chooser.
 */
export function PlanCard({
  plan,
  selected = false,
  onSelect,
}: {
  plan: PublicPlan;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const pro = Boolean(plan.highlighted);

  return (
    <m.div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Choose the ${plan.name} plan`}
      onClick={onSelect}
      onKeyDown={(e) => {
        // Only act when the card itself has focus — never swallow Enter/Space
        // meant for the nested "Choose …" checkout link (which would block its
        // navigation for keyboard users).
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect?.();
        }
      }}
      animate={{ scale: selected ? 1 : 0.99 }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: selected ? 0.99 : 0.98 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={cn(
        "relative isolate flex h-full cursor-pointer flex-col overflow-hidden rounded-(--radius-hero) p-7 outline-none transition-shadow duration-300 sm:p-8",
        pro
          ? "text-white shadow-[0_2px_10px_rgba(10,34,255,0.12),0_44px_96px_-26px_rgba(10,34,255,0.5)]"
          : "border border-border/80 bg-white text-[var(--brand-ink)] shadow-[0_24px_70px_rgba(20,21,47,0.06)]",
        selected ? (pro ? "ring-2 ring-white/55" : "ring-2 ring-primary/70") : "ring-0",
      )}
    >
      {pro ? (
        <>
          <span
            aria-hidden
            className="absolute inset-0 -z-10 bg-[linear-gradient(160deg,#0e22e6_0%,#0A22FF_52%,#0a18a8_100%)]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 -z-10 size-56 rounded-full bg-[radial-gradient(circle,rgba(90,150,255,0.28),transparent_65%)] blur-2xl"
          />
          <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-white/30" />
        </>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h3 className={cn("text-2xl font-semibold", pro ? "text-white" : "text-[var(--brand-ink)]")}>{plan.name}</h3>
        {pro ? (
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white backdrop-blur">Most popular</span>
        ) : selected ? (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Selected</span>
        ) : null}
      </div>
      <p className={cn("mt-2 text-sm leading-6", pro ? "text-white/75" : "text-muted-foreground")}>{plan.description}</p>

      <div className="mt-6 flex items-end gap-1.5">
        <span className={cn("text-5xl font-semibold tracking-tight", pro ? "text-white" : "text-[var(--brand-ink)]")}>
          {plan.price}
        </span>
        <span className={cn("pb-2 text-sm font-semibold", pro ? "text-white/70" : "text-muted-foreground")}>
          {plan.cadence}
        </span>
      </div>
      <p className={cn("mt-2 text-xs font-semibold", pro ? "text-white/65" : "text-muted-foreground")}>{plan.audience}</p>

      <Link
        href={`/checkout?plan=${plan.key}`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "group/cta relative mt-7 inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-field) px-4 text-sm font-bold transition-[transform,background-color,border-color] duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45",
          pro
            ? "bg-white text-primary shadow-[0_18px_36px_rgba(0,0,0,0.18)]"
            : selected
              ? "vela-gradient text-white shadow-[0_18px_36px_rgba(10,34,255,0.24)]"
              : "border border-border/80 bg-white text-foreground hover:border-primary/40 hover:text-primary",
        )}
      >
        Choose {plan.name}
        <ArrowRight className="size-4 transition-transform duration-300 group-hover/cta:translate-x-0.5" />
      </Link>

      <div className={cn("mt-7 border-t pt-6", pro ? "border-white/15" : "border-border/60")}>
        <p
          className={cn(
            "text-[11px] font-bold uppercase tracking-[0.14em]",
            pro ? "text-white/60" : "text-muted-foreground",
          )}
        >
          What&apos;s included
        </p>
        <ul className="mt-4 grid gap-3">
          {plan.features.map((feature) => (
            <li
              key={feature}
              className={cn("flex items-start gap-2.5 text-sm font-semibold", pro ? "text-white" : "text-foreground")}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                  pro ? "bg-white/15 text-white" : "bg-primary/10 text-primary",
                )}
              >
                <Check className="size-3" />
              </span>
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </m.div>
  );
}
