"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Eases `target` from wherever it last settled — not always from 0 — so a
 * value that changes without the component remounting (e.g. a score that
 * updates across two custom date ranges) animates smoothly between the two
 * numbers instead of visibly dropping to 0 first. State starts already at
 * `target`, so SSR/no-JS/slow-hydration never show a wrong number the old
 * static render never showed either; the dip-then-rise only happens once
 * client JS actually runs the effect.
 */
export function useCountUp(target: number) {
  const [display, setDisplay] = useState(target);
  const previousTargetRef = useRef(target);

  useEffect(() => {
    const from = previousTargetRef.current;
    previousTargetRef.current = target;

    if (from === target || !Number.isFinite(target)) {
      return;
    }

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReduced) {
      // Deferred a frame so this stays inside an async callback rather than
      // the effect body itself (calling setState synchronously in an effect
      // is flagged by react-hooks/set-state-in-effect).
      const raf = requestAnimationFrame(() => setDisplay(target));
      return () => cancelAnimationFrame(raf);
    }

    const duration = 600;
    let start = 0;
    let raf = 0;

    const frame = (timestamp: number) => {
      if (!start) {
        start = timestamp;
      }

      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplay(from + (target - from) * eased);

      if (progress < 1) {
        raf = requestAnimationFrame(frame);
      }
    };

    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  }, [target]);

  return display;
}

export function KpiValue({
  value,
  truncate = false,
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
}) {
  // Decimal part (if any) is captured with the digits, not left in the
  // suffix — otherwise a value like "66.7%" would count the whole part up
  // while ".7%" sat there unchanged the whole time.
  const match = /^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/.exec(value);
  const raw = match ? match[2].replace(/,/g, "") : "";
  const parsedTarget = match ? Number(raw) : NaN;
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  const display = useCountUp(Number.isFinite(parsedTarget) ? parsedTarget : 0);

  if (!match || !Number.isFinite(parsedTarget)) {
    return <span className="tabular-nums">{value}</span>;
  }

  const formatted = `${match[1]}${display.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${match[3]}`;

  if (truncate) {
    return <span className="tabular-nums">{formatted}</span>;
  }

  return (
    <span className="relative inline-block tabular-nums">
      <span className="invisible">{value}</span>
      <span className="absolute inset-0">{formatted}</span>
    </span>
  );
}
