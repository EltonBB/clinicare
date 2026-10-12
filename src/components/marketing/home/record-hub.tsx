"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { useMarketingScroll } from "../motion/scroll-context";
import { MODULE_GLYPHS } from "../shared/module-glyphs";
import { MODULES } from "../shared/modules";

// Node positions in a 360 x 200 box: three modules down each side, the record
// in the middle. Percentages place the HTML tiles over the same SVG geometry.
const W = 360;
const H = 200;
const CENTER = { x: 180, y: 100 };
const NODES = [
  { x: 34, y: 34 },
  { x: 34, y: 100 },
  { x: 34, y: 166 },
  { x: 326, y: 34 },
  { x: 326, y: 100 },
  { x: 326, y: 166 },
];
const wire = (n: { x: number; y: number }) => {
  const dir = n.x < CENTER.x ? 1 : -1;
  return `M ${n.x + dir * 18} ${n.y} C ${n.x + dir * 90} ${n.y}, ${CENTER.x - dir * 70} ${CENTER.y}, ${CENTER.x - dir * 30} ${CENTER.y}`;
};

/**
 * "One record underneath", drawn: the six modules wired into a single patient
 * record. Small pulses travel each wire into the record, one module after
 * another; pointing at a module lights its wire and names what it adds.
 * Reduced motion: wires only, no pulses.
 */
export function RecordHub() {
  const { reduced } = useMarketingScroll();
  const [hovered, setHovered] = useState<number | null>(null);
  const adds = ["Visits", "History", "Provider", "Messages", "Files & balance", "Trends"];

  return (
    <div className="relative mx-auto aspect-[9/5] w-full max-w-[26rem]" onPointerLeave={() => setHovered(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
        {NODES.map((n, i) => (
          <path
            key={i}
            id={`hub-wire-${i}`}
            d={wire(n)}
            fill="none"
            strokeWidth={hovered === i ? 2 : 1.25}
            className="transition-[stroke,stroke-width] duration-300"
            stroke={hovered === i ? "var(--primary)" : "rgba(20,21,47,0.14)"}
          />
        ))}
        {!reduced
          ? NODES.map((_, i) => (
              <circle key={i} r={2.5} fill="var(--primary)" opacity={hovered === null || hovered === i ? 1 : 0.25}>
                <animateMotion dur="3.6s" begin={`${i * 0.6}s`} repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear">
                  <mpath href={`#hub-wire-${i}`} />
                </animateMotion>
                <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="3.6s" begin={`${i * 0.6}s`} repeatCount="indefinite" />
              </circle>
            ))
          : null}
      </svg>

      {NODES.map((n, i) => {
        const Glyph = MODULE_GLYPHS[i];
        const on = hovered === i;
        return (
          <span
            key={i}
            onPointerEnter={() => setHovered(i)}
            title={MODULES[i].label}
            className={cn(
              "absolute flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-(--radius-mkt-tile) border bg-white transition-[border-color,box-shadow,transform] duration-300 ease-out-quint",
              on ? "scale-110 border-primary/40 shadow-[0_8px_20px_-8px_rgba(10,34,255,0.5)]" : "border-border/80",
            )}
            style={{ left: `${(n.x / W) * 100}%`, top: `${(n.y / H) * 100}%` }}
          >
            <Glyph active={on} className={cn("size-6", on ? "text-primary" : "text-muted-foreground")} />
          </span>
        );
      })}

      <div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
        style={{ left: `${(CENTER.x / W) * 100}%`, top: `${(CENTER.y / H) * 100}%` }}
      >
        <span className="flex size-14 items-center justify-center rounded-(--radius-mkt-field) bg-[var(--brand-ink)] text-sm font-bold text-white shadow-[0_14px_30px_-14px_rgba(20,21,47,0.7)]">
          MN
        </span>
        <span className="mt-2 whitespace-nowrap text-[11px] font-semibold text-[var(--brand-ink)]">
          {hovered === null ? "One patient record" : `+ ${adds[hovered]}`}
        </span>
      </div>
    </div>
  );
}
