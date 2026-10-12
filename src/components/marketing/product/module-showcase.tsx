"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, m, useInView } from "framer-motion";

import { cn } from "@/lib/utils";
import { EASE } from "../motion/ease";
import { Reveal } from "../motion/reveal";
import { SectionHeader } from "../shared/section-header";
import { MODULE_VISUALS } from "./module-visuals";
import { MODULES, onSelectModule } from "../shared/modules";

/**
 * Vertical module tabs beside a detail card. Auto-advances while in view and
 * not hovered or focused; the active tab's progress bar is the timer (its animationend
 * advances), so pausing the bar pauses the cycle. Reduced motion: the bar
 * doesn't animate, so it never auto-advances. The hero rail can open a module
 * directly (`selectModule`).
 */
export function ModuleShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const inView = useInView(ref, { margin: "0px 0px -25% 0px" });
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Pointer or keyboard focus inside the explorer holds the current module.
  const paused = hovered || focused || !inView;
  const mod = MODULES[active];
  const Visual = MODULE_VISUALS[active];

  useEffect(() => onSelectModule(setActive), []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (active + step + MODULES.length) % MODULES.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <section id="modules" className="scroll-mt-16 border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader className="mb-12" lead="Every surface, all day." rest="Six modules, one record underneath." />

        <Reveal>
          <div
            ref={ref}
            className="grid grid-cols-1 gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-10"
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
            }}
          >
            <div role="tablist" aria-orientation="vertical" aria-label="Product modules" className="border-b border-border/60" onKeyDown={onKeyDown}>
              {MODULES.map((item, i) => {
                const selected = i === active;
                return (
                  <button
                    key={item.label}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`module-tab-${i}`}
                    aria-selected={selected}
                    aria-controls="module-panel"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActive(i)}
                    className={cn(
                      "relative flex w-full items-baseline gap-4 border-t border-border/60 py-5 text-left transition-colors duration-(--duration-base) ease-out-quint focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45",
                      selected ? "text-[var(--brand-ink)]" : "text-muted-foreground/70 hover:text-[var(--brand-ink)]",
                    )}
                  >
                    <span className="w-6 shrink-0 text-xs font-semibold tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-lg font-semibold sm:text-xl">{item.label}</span>
                    {selected ? (
                      <span
                        aria-hidden
                        className="animate-progress absolute inset-x-0 -bottom-px h-0.5 bg-primary"
                        style={{ animationPlayState: paused ? "paused" : "running" }}
                        onAnimationEnd={() => setActive((a) => (a + 1) % MODULES.length)}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div
              id="module-panel"
              role="tabpanel"
              aria-labelledby={`module-tab-${active}`}
              className="grid overflow-hidden rounded-(--radius-mkt-card) border border-border/70 bg-white"
            >
              <AnimatePresence initial={false}>
                <m.div
                  key={active}
                  className="col-start-1 row-start-1 flex flex-col"
                  initial={{ opacity: 0, filter: "blur(6px)", transform: "translateY(8px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)", transform: "translateY(0px)" }}
                  exit={{ opacity: 0, filter: "blur(6px)" }}
                  transition={{ duration: 0.32, ease: EASE }}
                >
                  <div className="p-8 sm:p-10">
                    <p className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-[var(--brand-ink)]">{mod.title}</p>
                    <p className="mt-3 max-w-lg text-[15px] leading-7 text-muted-foreground">{mod.copy}</p>
                    <ul className="mt-5 flex flex-wrap gap-2">
                      {mod.points.map((point) => (
                        <li key={point} className="rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-foreground">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-auto h-80 border-t border-border/60 bg-[var(--brand-wash)]/45">
                    <Visual />
                  </div>
                </m.div>
              </AnimatePresence>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
