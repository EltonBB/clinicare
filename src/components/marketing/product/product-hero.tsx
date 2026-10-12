"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";

import { cn } from "@/lib/utils";
import { EASE } from "../motion/ease";
import { useMarketingScroll } from "../motion/scroll-context";
import { WordReveal } from "../motion/word-reveal";
import { PrimaryCta, SecondaryCta } from "../shared/cta-links";
import { MODULE_GLYPHS } from "../shared/module-glyphs";
import { MODULES, selectModule } from "../shared/modules";

/**
 * Product hero: a fixed lead line over a cobalt last line that rolls through
 * the modules, and a rail of the six modules underneath that follows the roll.
 * Pointing at a tile takes over the headline (and pauses the roll); clicking
 * one opens that module in the explorer below. Screen readers get the whole
 * sentence once; under reduced motion nothing rolls.
 */
export function ProductHero() {
  const { reduced } = useMarketingScroll();
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (reduced || held) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % MODULES.length), 2400);
    return () => window.clearInterval(id);
  }, [reduced, held]);

  return (
    <section className="pb-20 pt-20 sm:pb-24 sm:pt-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="display-1 text-[var(--brand-ink)]">
          <span className="sr-only">One workspace for scheduling, patient records, staff, messages, payments, and reports.</span>
          <span aria-hidden className="block">
            <WordReveal>One workspace for</WordReveal>
          </span>
          {/* The rolling word can't wrap, so on narrow phones the line scales with
              the viewport ("patient records." is the longest) instead of clipping. */}
          <span aria-hidden className="relative block h-[1.1em] overflow-hidden text-[min(1em,10vw)] text-primary">
            <AnimatePresence initial={false} mode="popLayout">
              <m.span
                key={MODULES[index].word}
                className="block whitespace-nowrap"
                initial={{ transform: "translateY(85%)", opacity: 0, filter: "blur(10px)" }}
                animate={{ transform: "translateY(0%)", opacity: 1, filter: "blur(0px)" }}
                exit={{ transform: "translateY(-85%)", opacity: 0, filter: "blur(10px)" }}
                transition={{ duration: 0.7, ease: EASE }}
              >
                {MODULES[index].word}.
              </m.span>
            </AnimatePresence>
          </span>
        </h1>
        <div className="hero-follow mt-8 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <p className="max-w-lg text-lg leading-8 text-muted-foreground">
            Six modules built together, so a booking, a message, and a payment all land on the same patient record.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <PrimaryCta href="/sign-up">Start free</PrimaryCta>
            <SecondaryCta href="/pricing">View pricing</SecondaryCta>
          </div>
        </div>

        <ul
          className="section-reveal mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-(--radius-mkt-card) border border-border/70 bg-border/70 sm:grid-cols-3 lg:mt-20 lg:grid-cols-6"
          onPointerLeave={() => setHeld(false)}
        >
          {MODULES.map((mod, i) => {
            const Glyph = MODULE_GLYPHS[i];
            const on = i === index;
            return (
              <li key={mod.label} className="bg-white">
                <a
                  href="#modules"
                  onPointerEnter={() => {
                    setHeld(true);
                    setIndex(i);
                  }}
                  onFocus={() => {
                    setHeld(true);
                    setIndex(i);
                  }}
                  onBlur={() => setHeld(false)}
                  onClick={() => selectModule(i)}
                  className={cn(
                    "relative flex h-full flex-col gap-6 p-5 outline-none transition-colors duration-(--duration-slow) ease-out-quint focus-visible:bg-[var(--brand-wash)]/60 sm:p-6",
                    on ? "bg-[var(--brand-wash)]/60 text-primary" : "text-muted-foreground hover:text-[var(--brand-ink)]",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-0 top-0 h-0.5 origin-left bg-primary transition-transform duration-500 ease-out-quint",
                      on ? "scale-x-100" : "scale-x-0",
                    )}
                  />
                  <Glyph active={on} />
                  <span>
                    <span className="block text-sm font-semibold text-[var(--brand-ink)]">{mod.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{mod.line}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
