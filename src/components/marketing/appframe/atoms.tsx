"use client";

import {
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, m, useInView, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { EASE, EASE_CSS } from "./ease";
import { PaneSignalContext } from "./pane-context";

const BRAND = "#0A22FF";

/**
 * Shared reveal trigger for every animated atom. Inside an <AppPane> it reads the
 * pane's synchronized signal; standalone (bento tiles, pillars) it falls back to
 * the atom's own scroll-in observer. `loop` selects the live-visibility signal so
 * infinite loops pause when the atom scrolls offscreen.
 */
function useReveal<T extends Element>(ref: RefObject<T | null>, loop = false): boolean {
  const inView = useInView(ref as RefObject<Element | null>, loop ? { amount: 0.25 } : { once: true, amount: 0.4 });
  const ctx = useContext(PaneSignalContext);
  if (ctx) return loop ? ctx.visible : ctx.active;
  return inView;
}

/** Catmull-Rom → cubic-bezier smoothing for a soft, no-overshoot line. */
function smoothPath(points: readonly (readonly [number, number])[]): string {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    const [x0, y0] = points[i - 1];
    const [px, py] = points[i - 2] ?? points[i - 1];
    const [nx, ny] = points[i + 1] ?? points[i];
    const c1x = x0 + (x - px) / 6;
    const c1y = y0 + (y - py) / 6;
    const c2x = x - (nx - x0) / 6;
    const c2y = y - (ny - y0) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return d;
}

/* ------------------------------------------------------------------ CountUp */

export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  durationMs = 1100,
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const active = useReveal(ref);
  // Rest at the real value — count up from 0 only when a reveal is actually
  // animating. Starting at 0 unconditionally let a static frame (offscreen
  // pane, reduced motion, or the first frame of a reveal) freeze on a
  // broken-looking "0". The displayed value never drops below the target at rest.
  const [n, setN] = useState(active && !reduce ? 0 : value);

  useEffect(() => {
    if (reduce || !active) return;
    let raf = 0;
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min((t - start) / durationMs, 1);
      setN(value * (1 - Math.pow(1 - p, 5)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, reduce, value, durationMs]);

  const text = (reduce ? value : n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

/* ----------------------------------------------------------------- DrawArea */

/** Smooth area sparkline whose line draws itself on scroll-in, with a crisp end dot. */
export function DrawArea({
  values,
  height = 48,
  stroke = BRAND,
  className,
}: {
  values: number[];
  height?: number;
  stroke?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const active = useReveal(wrapRef);
  const gid = useId().replace(/:/g, "");
  const W = 100;
  const pad = 4;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map(
    (v, i) =>
      [pad + (i / (values.length - 1)) * (W - pad * 2), height - pad - ((v - min) / span) * (height - pad * 2)] as const,
  );
  const line = smoothPath(pts);
  const last = pts[pts.length - 1];
  const area = `${line} L${last[0].toFixed(2)},${height - pad} L${pad},${height - pad} Z`;

  useEffect(() => {
    const p = lineRef.current;
    if (!p) return;
    const len = p.getTotalLength();
    p.style.strokeDasharray = String(len);
    if (reduce) {
      p.style.strokeDashoffset = "0";
      return;
    }
    if (!active) {
      p.style.transition = "none";
      p.style.strokeDashoffset = String(len);
      return;
    }
    p.style.strokeDashoffset = String(len);
    const raf = requestAnimationFrame(() => {
      p.style.transition = `stroke-dashoffset 1000ms ${EASE_CSS}`;
      p.style.strokeDashoffset = "0";
    });
    return () => cancelAnimationFrame(raf);
  }, [active, reduce, line]);

  const shown = active || reduce;
  return (
    <div ref={wrapRef} className={cn("relative", className)} aria-hidden>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* analytics gridlines (0 / 50 / 100) + baseline */}
        {[pad, height / 2, height - pad].map((y, i) => (
          <line
            key={i}
            x1={pad}
            x2={W - pad}
            y1={y}
            y2={y}
            stroke="var(--brand-ink)"
            strokeOpacity={i === 2 ? 0.12 : 0.05}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path
          d={area}
          fill={`url(#area-${gid})`}
          style={{ opacity: shown ? 1 : 0, transition: "opacity 600ms ease-out 200ms" }}
        />
        <path
          ref={lineRef}
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-primary"
        style={{
          left: `${(last[0] / W) * 100}%`,
          top: `${(last[1] / height) * 100}%`,
          opacity: shown ? 1 : 0,
          transition: "opacity 300ms ease-out 850ms",
        }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------- GrowBars */

/** Analytics bars: solid 2-tone fills (muted past, full-cobalt current) on a
 *  faint gridded plot — grows from the baseline on scroll-in. Flat fills (no
 *  vertical fade) read as a real chart, not a decorative gradient. */
export function GrowBars({
  values,
  active: activeIndex,
  className,
}: {
  values: number[];
  active?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const active = useReveal(ref);
  const max = Math.max(...values, 1);
  // Highlight the true peak by default so the emphasis reads as real telemetry.
  const hi = activeIndex ?? values.indexOf(Math.max(...values));
  const shown = active || reduce;
  return (
    <div ref={ref} className={cn("relative flex items-end gap-1", className)} aria-hidden>
      {/* y gridlines for the analytics plot */}
      {[0, 33, 66].map((t) => (
        <span
          key={t}
          className="pointer-events-none absolute inset-x-0 h-px bg-[var(--brand-ink)]/[0.045]"
          style={{ top: `${t}%` }}
        />
      ))}
      {values.map((v, i) => (
        <div key={i} className="relative flex h-full flex-1 items-end">
          <span className="absolute inset-x-0 bottom-0 top-0 rounded-[2px] bg-[var(--brand-ink)]/[0.035]" />
          <span
            className={cn(
              "relative w-full origin-bottom rounded-[2px] bg-gradient-to-t",
              i === hi
                ? "from-primary to-[#3a55ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_0_0_1px_rgba(10,34,255,0.14)]"
                : "from-[#94a7ff] to-[#b6c2ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]",
            )}
            style={{
              height: `${Math.max((v / max) * 100, 8)}%`,
              transform: shown ? "scaleY(1)" : "scaleY(0)",
              transition: reduce ? "none" : `transform 560ms ${EASE_CSS} ${i * 0.045}s`,
            }}
          />
        </div>
      ))}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[var(--brand-ink)]/[0.12]" />
    </div>
  );
}

/* ---------------------------------------------------------------- SweepDonut */

/** Segmented status donut whose arcs sweep in, total counts up in the center. */
export function SweepDonut({
  segments,
  total,
  label,
  className,
}: {
  segments: { value: number; color: string }[];
  total: number;
  label: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const active = useReveal(ref);
  const r = 42;
  const circ = 2 * Math.PI * r;
  const sum = segments.reduce((acc, s) => acc + s.value, 0) || 1;
  const gap = 2.2;
  const arcs = segments.map((seg, i) => {
    const len = Math.max((seg.value / sum) * circ - gap, 0);
    const start = segments.slice(0, i).reduce((acc, prev) => acc + (prev.value / sum) * circ, 0);
    return { color: seg.color, len, offset: -start };
  });
  const shown = active || reduce;
  return (
    <div ref={ref} className={cn("relative", className)} aria-hidden>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--brand-wash)" strokeWidth="11" />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth="13"
            strokeLinecap="round"
            strokeDasharray={shown ? `${arc.len} ${circ - arc.len}` : `0 ${circ}`}
            strokeDashoffset={arc.offset}
            style={{ transition: reduce ? "none" : `stroke-dasharray 700ms ${EASE_CSS} ${i * 0.12}s` }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold leading-none text-[var(--brand-ink)]">
          <CountUp value={total} />
        </span>
        <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- StatusDot */

export function StatusDot({
  color = "#10b981",
  pulse = true,
  className,
}: {
  color?: string;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)} aria-hidden>
      {pulse ? (
        <span className="now-ping absolute inset-0 rounded-full" style={{ background: color, opacity: 0.55 }} />
      ) : null}
      <span className="relative inline-flex h-full w-full rounded-full" style={{ background: color }} />
    </span>
  );
}

/* --------------------------------------------------------- TypingThenMessage */

/** A loop: the patient bubble shows, a typing indicator appears, then the reply
 *  slides in with a delivered dot — re-running every few seconds while in view. */
export function TypingThenMessage({
  question,
  answer,
  className,
}: {
  question: string;
  answer: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const visible = useReveal(ref, true);
  const [phase, setPhase] = useState<"typing" | "answer">(reduce ? "answer" : "typing");

  useEffect(() => {
    if (reduce || !visible) return;
    let toAnswer = 0;
    let toRestart = 0;
    const cycle = () => {
      setPhase("typing");
      toAnswer = window.setTimeout(() => setPhase("answer"), 1500);
      toRestart = window.setTimeout(cycle, 6000);
    };
    cycle();
    return () => {
      clearTimeout(toAnswer);
      clearTimeout(toRestart);
    };
  }, [visible, reduce]);

  return (
    <div ref={ref} className={cn("flex flex-col gap-2.5", className)} aria-hidden>
      <p className="mr-10 rounded-[0.85rem] rounded-tl-sm bg-[var(--brand-wash)] px-3.5 py-2.5 text-[13px] font-semibold text-muted-foreground">
        {question}
      </p>
      <div className="ml-10 flex min-h-[2.6rem] items-center">
        <AnimatePresence mode="wait" initial={false}>
          {phase === "typing" ? (
            <m.span
              key="typing"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="inline-flex items-center gap-1.5 rounded-[0.85rem] rounded-tr-sm bg-primary/10 px-3.5 py-3"
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-2 rounded-full bg-primary/60"
                  style={{ animation: `vela-typing 1.1s ${i * 0.16}s infinite ease-in-out` }}
                />
              ))}
            </m.span>
          ) : (
            <m.span
              key="answer"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="inline-flex items-center gap-2 rounded-[0.85rem] rounded-tr-sm bg-primary px-3.5 py-2.5 text-[13px] font-semibold text-white"
            >
              {answer}
              <StatusDot color="#9ec3ff" pulse={false} className="size-2" />
            </m.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- FloatingToast */

/** A parallax sub-card for tilt panes (sits at translateZ above the frame) that
 *  drifts gently while in view. */
export function FloatingToast({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const visible = useReveal(ref, true);
  return (
    <m.div
      ref={ref}
      className={cn("pointer-events-none absolute z-20", className)}
      initial={{ z: 40, opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.7 }}
    >
      <m.div
        className="flex items-center gap-2 rounded-(--radius-field) border border-black/[0.06] bg-white px-3 py-2 shadow-[0_22px_50px_-14px_rgba(10,34,255,0.45)]"
        animate={reduce || !visible ? {} : { y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        {children}
      </m.div>
    </m.div>
  );
}
