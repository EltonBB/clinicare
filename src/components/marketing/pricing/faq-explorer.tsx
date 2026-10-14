"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, m } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { EASE } from "../motion/ease";

export type Faq = { q: string; a: ReactNode };

/**
 * Questions on the left, one answer at a time on the right (a side-by-side
 * reader instead of an accordion). The active question carries a cobalt bar;
 * the answer crossfades in. Arrow keys move through the questions. On small
 * screens the questions are disclosures, each opening its answer beneath it.
 */
export function FaqExplorer({ items }: { items: Faq[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (active + step + items.length) % items.length;
    setActive(next);
    refs.current[next]?.focus();
  };

  const questionClass = (on: boolean) =>
    cn(
      "relative flex w-full items-center justify-between gap-4 px-6 py-5 text-left text-[15px] font-medium transition-colors duration-(--duration-base) focus-visible:bg-[var(--brand-wash)]/60 focus-visible:outline-none sm:px-8",
      on ? "bg-[var(--brand-wash)]/50 text-[var(--brand-ink)]" : "text-muted-foreground hover:text-[var(--brand-ink)]",
    );
  const bar = (on: boolean) => (
    <span aria-hidden className={cn("absolute inset-y-0 left-0 w-0.5 origin-top bg-primary transition-transform duration-300 ease-out-quint", on ? "scale-y-100" : "scale-y-0")} />
  );

  return (
    <div className="grid overflow-hidden rounded-(--radius-mkt-card) border border-border/70 bg-white lg:grid-cols-[1fr_1.1fr]">
      {/* Small screens: each question is a disclosure that opens its own answer. */}
      <div className="divide-y divide-border/60 lg:hidden">
        {items.map((item, i) => {
          const on = i === active;
          return (
            <div key={item.q}>
              <button type="button" aria-expanded={on} aria-controls={`faq-answer-${i}`} onClick={() => setActive(i)} className={questionClass(on)}>
                {bar(on)}
                {item.q}
              </button>
              <p id={`faq-answer-${i}`} hidden={!on} className="px-6 pb-5 text-sm leading-7 text-muted-foreground sm:px-8">
                {item.a}
              </p>
            </div>
          );
        })}
      </div>

      {/* Wide screens: questions as tabs beside one answer panel. */}
      <div role="tablist" aria-orientation="vertical" aria-label="Pricing questions" onKeyDown={onKeyDown} className="hidden divide-y divide-border/60 lg:block lg:border-r lg:border-border/60">
        {items.map((item, i) => {
          const on = i === active;
          return (
            <button
              key={item.q}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`faq-tab-${i}`}
              aria-selected={on}
              aria-controls="faq-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(i)}
              className={questionClass(on)}
            >
              {bar(on)}
              {item.q}
              <ArrowRight className={cn("size-4 shrink-0 transition-[opacity,transform] duration-(--duration-base)", on ? "translate-x-0 text-primary opacity-100" : "-translate-x-1 opacity-0")} />
            </button>
          );
        })}
      </div>

      <div id="faq-panel" role="tabpanel" aria-labelledby={`faq-tab-${active}`} className="relative hidden min-h-[22rem] flex-col justify-between p-10 lg:flex">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={active}
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            transition={{ duration: 0.28, ease: EASE }}
          >
            <p className="text-sm font-semibold text-primary tabular-nums">
              {String(active + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
            </p>
            <p className="mt-4 text-2xl font-semibold leading-snug tracking-tight text-[var(--brand-ink)]">{items[active].q}</p>
            <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">{items[active].a}</p>
          </m.div>
        </AnimatePresence>
        <div className="flex items-center justify-between border-t border-border/60 pt-6 text-sm">
          <span className="text-muted-foreground">Still unsure?</span>
          <Link href="/contact" className="group/c inline-flex items-center gap-1.5 font-semibold text-primary">
            Talk to us
            <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/c:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  );
}
