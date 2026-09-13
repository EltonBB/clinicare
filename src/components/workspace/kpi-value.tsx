"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Eases `target` from wherever it last settled — not always from 0 — so a
 * value that changes without the component remounting (e.g. a score that
 * updates across two custom date ranges) animates smoothly between the two
 * numbers instead of visibly dropping to 0 first. State always starts at
 * `target`, including for `animateOnMount` — SSR, no-JS, and a slow or
 * failed hydration all keep showing the correct value, since none of them
 * can run the effect below that resets to 0 to animate from. Only once
 * that effect actually confirms JS is running does an `animateOnMount`
 * instance reset itself to 0 and count back up — a one-time flash from the
 * correct value down to 0 and back, accepted as the cost of never showing
 * a silently wrong 0 to a client whose JS never loads (Codex).
 */
export function useCountUp(target: number, options?: { animateOnMount?: boolean }) {
  const animateOnMount = options?.animateOnMount ?? false;
  const [display, setDisplay] = useState(target);
  // Tracks the actually-rendered value, not the target — updated every
  // frame the animation runs, not just once when it starts. If an earlier
  // version bumped this to `target` as soon as the animation began, an
  // interruption mid-flight (prefers-reduced-motion flips, or target
  // changes again before the current run finishes) would make the next
  // effect run see `from === target` and bail out without ever calling
  // setDisplay, leaving the KPI frozen on that partial value — or, for a
  // fast retarget, animate from the old final target instead of from
  // wherever the number actually was on screen (Codex).
  const displayRef = useRef(target);
  // Whether the mount-triggered reset-to-0 has actually happened — set
  // inside the frame callback (or a non-cancellable early exit), not
  // synchronously at the top of the effect, so React 19 StrictMode's
  // double-invoke (whose first run's rAF is cancelled before the browser
  // ever calls it) can't mark this done before the surviving run reads it.
  const hasStartedMountAnimationRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const isFirstMountAnimation = animateOnMount && !hasStartedMountAnimationRef.current;
    const from = isFirstMountAnimation ? 0 : displayRef.current;

    if (from === target || !Number.isFinite(target)) {
      displayRef.current = target;
      hasStartedMountAnimationRef.current = true;
      return;
    }

    if (prefersReducedMotion) {
      // `display` is already `target` (its initial state, untouched so
      // far), so no setState is needed here — just record the state these
      // refs would otherwise reach.
      displayRef.current = target;
      hasStartedMountAnimationRef.current = true;
      return;
    }

    const duration = 600;
    let start = 0;
    let raf = 0;

    const frame = (timestamp: number) => {
      // React 19's dev-mode double-invokes a mount effect once (run,
      // cleanup, run again); the first run's rAF is cancelled before the
      // browser ever calls it, so this callback — and the ref/state writes
      // inside it — only ever runs for the surviving second run.
      if (!start) {
        start = timestamp;
        hasStartedMountAnimationRef.current = true;
      }

      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const next = from + (target - from) * eased;
      displayRef.current = next;
      setDisplay(next);

      if (progress < 1) {
        raf = requestAnimationFrame(frame);
      }
    };

    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  }, [target, prefersReducedMotion, animateOnMount]);

  return display;
}

export function KpiValue({
  value,
  truncate = false,
  animateOnMount = false,
}: {
  value: string;
  // The default layout reserves width for the final string via an invisible
  // sizing span + an absolutely-positioned visible one, so digit-count
  // changes during the count-up don't reflow surrounding layout — but that
  // overlay is opaque to a parent's `truncate` (text-overflow:ellipsis
  // can't see inside an atomic inline-block, so it hard-clips with no "…").
  // Callers that truncate their container (e.g. HeaderStat) pass this to get
  // a single plain span instead, trading the anti-reflow trick for working
  // ellipsis truncation.
  truncate?: boolean;
  // Counts up from 0 on this instance's first mount — for a call site with
  // no other retarget trigger (a Dashboard tile that only mounts once per
  // page load, never re-rendered with a new target in place).
  animateOnMount?: boolean;
}) {
  // Decimal part (if any) is captured with the digits, not left in the
  // suffix — otherwise a value like "66.7%" would count the whole part up
  // while ".7%" sat there unchanged the whole time.
  const match = /^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/.exec(value);
  const raw = match ? match[2].replace(/,/g, "") : "";
  const parsedTarget = match ? Number(raw) : NaN;
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  const display = useCountUp(Number.isFinite(parsedTarget) ? parsedTarget : 0, { animateOnMount });

  const formatted = match
    ? `${match[1]}${display.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${match[3]}`
    : value;

  if (truncate || !match || !Number.isFinite(parsedTarget)) {
    return <span className="tabular-nums">{formatted}</span>;
  }

  return (
    <span className="relative inline-block tabular-nums">
      <span className="invisible">{value}</span>
      <span className="absolute inset-0">{formatted}</span>
    </span>
  );
}
