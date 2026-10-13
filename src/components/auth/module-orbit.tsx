"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { MODULE_GLYPHS } from "@/components/marketing/shared/module-glyphs";
import { MODULES } from "@/components/marketing/shared/modules";

const RADIUS = 41; // % of the stage, where the module tiles ride
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The auth panel's one idea: everything a clinic runs, around one centre.
 * The six modules ride a slow ring around the Vela mark, each wired to it,
 * and a pulse runs in from whichever module is lit. The lit module cycles on
 * its own; pointing at (or tabbing to) a tile takes over, pauses the ring,
 * and reads that module out below. The stage tilts a little toward the
 * pointer. Reduced motion keeps the ring still and skips the auto cycle.
 */
export function ModuleOrbit() {
  const [active, setActive] = useState(0);
  const [holding, setHolding] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (holding || still()) return;
    const id = window.setInterval(() => setActive((i) => (i + 1) % MODULES.length), 2800);
    return () => window.clearInterval(id);
  }, [holding]);

  useEffect(() => {
    const host = stage.current?.closest("aside");
    const el = tilt.current;
    if (!host || !el || still()) return;
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `rotateX(${(-y * 10).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg)`;
    };
    const onLeave = () => {
      el.style.transform = "";
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const spin: CSSProperties = { animationPlayState: holding ? "paused" : "running" };
  const current = MODULES[active];

  return (
    <div ref={stage} className="flex w-full flex-col items-center [perspective:1200px]">
      <div
        ref={tilt}
        className="relative aspect-square w-[min(100%,27rem,52vh)] transition-transform duration-700 ease-out-quint [transform-style:preserve-3d]"
        // Only a mouse leaving releases the hold; a tapped tile stays lit until blur.
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHolding(false);
        }}
      >
        {/* Orbit paths */}
        <span aria-hidden className="absolute inset-[9%] rounded-full border border-white/[0.07]" />
        <span aria-hidden className="absolute inset-[27%] rounded-full border border-dashed border-white/[0.08]" />
        <span aria-hidden className="absolute inset-[38%] rounded-full bg-primary/25 blur-3xl" />

        {/* The ring: spokes and tiles turn together. */}
        <div className="absolute inset-0 motion-safe:animate-[vela-orbit_90s_linear_infinite]" style={spin}>
          {MODULES.map((item, i) => {
            const angle = (i / MODULES.length) * 360 - 90;
            const rad = (angle * Math.PI) / 180;
            const lit = i === active;
            const Glyph = MODULE_GLYPHS[i];
            return (
              <div key={item.label}>
                <span
                  aria-hidden
                  className="absolute left-1/2 top-1/2 h-px origin-left"
                  style={{ width: `${RADIUS}%`, transform: `rotate(${angle}deg)` }}
                >
                  <span className={cn("absolute inset-0 transition-colors duration-700", lit ? "bg-gradient-to-r from-[#64B6FF]/70 to-primary/40" : "bg-white/[0.08]")} />
                  {lit ? (
                    <span
                      key={active}
                      className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#64B6FF] shadow-[0_0_12px_2px_rgba(100,182,255,0.7)] motion-safe:animate-[vela-spoke_1.4s_var(--ease-out-quint)_infinite]"
                    />
                  ) : null}
                </span>
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${Math.round((50 + RADIUS * Math.cos(rad)) * 100) / 100}%`, top: `${Math.round((50 + RADIUS * Math.sin(rad)) * 100) / 100}%` }}
                >
                  <div className="motion-safe:animate-[vela-orbit_90s_linear_infinite_reverse]" style={spin}>
                    <button
                      type="button"
                      aria-label={`${item.label}: ${item.title}`}
                      aria-pressed={lit}
                      onPointerEnter={() => {
                        setActive(i);
                        setHolding(true);
                      }}
                      onFocus={() => {
                        setActive(i);
                        setHolding(true);
                      }}
                      onBlur={() => setHolding(false)}
                      className={cn(
                        "flex size-16 items-center justify-center rounded-[1.1rem] transition-[background-color,color,transform,box-shadow] duration-500 ease-out-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#64B6FF]",
                        lit
                          ? "scale-110 bg-white text-[var(--brand-ink)] shadow-[0_18px_50px_-12px_rgba(10,34,255,0.65)]"
                          : "bg-white/[0.04] text-white/55 ring-1 ring-inset ring-white/10 hover:text-white",
                      )}
                    >
                      <Glyph active={lit} className="size-8" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Centre: the one place it all lands. */}
        <div className="absolute left-1/2 top-1/2 flex size-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[1.6rem] bg-white shadow-[0_0_0_10px_rgba(255,255,255,0.04),0_30px_80px_-20px_rgba(10,34,255,0.8)]">
          <span key={active} aria-hidden className="absolute inset-0 rounded-[1.6rem] ring-2 ring-[#64B6FF]/60 motion-safe:animate-[vela-orbit-ping_1.4s_var(--ease-out-quint)_both]" />
          <Image src="/brand/vela-icon.svg" alt="" width={56} height={56} aria-hidden />
        </div>
      </div>

      {/* Visual readout only: it changes with the auto-cycle, so it must not
          announce over the form. Each tile's label carries the same text. */}
      <div aria-hidden className="mt-5 h-14 text-center">
        <p key={current.label} className="text-lg font-semibold tracking-tight motion-safe:animate-[vela-fade-up_0.45s_var(--ease-out-expo)_both]">
          {current.label}
        </p>
        <p key={`${current.label}-line`} className="mt-1 text-sm text-white/55 motion-safe:animate-[vela-fade-up_0.55s_var(--ease-out-expo)_both]">
          {current.title}
        </p>
      </div>
    </div>
  );
}
