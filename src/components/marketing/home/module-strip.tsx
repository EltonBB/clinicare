"use client";

import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { MODULE_GLYPHS } from "../shared/module-glyphs";
import { MODULES } from "../shared/modules";

/**
 * The six modules as a slow, endless strip under the hero, each with its drawn
 * glyph and one line. Pointing at one (or tabbing to it) stops the strip,
 * lights its glyph, and dims the rest; each item opens the product explorer
 * on its own module. Reduced motion: the strip stands still (the shared
 * `.animate-marquee` rule).
 */
export function ModuleStrip() {
  const [hovered, setHovered] = useState<number | null>(null);
  const items = [...MODULES, ...MODULES];

  return (
    <nav
      aria-label="Modules"
      className="group/strip relative overflow-hidden border-y border-border/60 marquee-mask"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHovered(null);
      }}
    >
      <ul
        className="animate-marquee flex w-max group-focus-within/strip:[animation-play-state:paused] group-hover/strip:[animation-play-state:paused]"
        onPointerLeave={() => setHovered(null)}
      >
        {items.map((mod, i) => {
          const index = i % MODULES.length;
          const Glyph = MODULE_GLYPHS[index];
          const on = hovered === index;
          return (
            <li key={i} aria-hidden={i >= MODULES.length || undefined} className="border-r border-border/60">
              <Link
                href={`/product?module=${index}#modules`}
                tabIndex={i >= MODULES.length ? -1 : undefined}
                onPointerEnter={() => setHovered(index)}
                onFocus={() => setHovered(index)}
                className={cn(
                  "flex w-72 items-center gap-4 px-7 py-5 transition-[opacity,background-color] duration-(--duration-slow) ease-out-quint focus-visible:bg-[var(--brand-wash)]/60 focus-visible:outline-none",
                  hovered !== null && !on && "opacity-40",
                  on && "bg-[var(--brand-wash)]/50",
                )}
              >
                <Glyph active={on} className={cn("size-9", on ? "text-primary" : "text-muted-foreground")} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--brand-ink)]">{mod.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{mod.line}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
