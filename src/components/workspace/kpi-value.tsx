"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Eases `target` from wherever it last settled — not always from 0 — so a
 * value that changes without the component remounting (e.g. a score that
 * updates across two custom date ranges) animates smoothly between the two
 * numbers instead of visibly dropping to 0 first. State starts already at
 * `target` (so SSR/no-JS/slow-hydration never show a wrong number the old
 * static render never showed either) unless `animateOnMount` is set, which
 * starts from 0 instead — for a call site with no other retarget trigger
 * (e.g. a Dashboard tile that only ever mounts once per page load), that's
 * the only way the count-up effect ever gets to run at all. The initial
 * state never looks at `prefersReducedMotion` — the server can't know the
 * client's motion preference, so branching the initializer on it would
 * hydrate to a different value than SSR rendered. The reduced-motion
 * correction instead runs in the layout effect below, synchronously before
 * the browser's first paint, so it never shows the SSR value on screen
 * for a reduced-motion client without ever risking a hydration mismatch
 * (Codex).
 */
export function useCountUp(target: number, options?: { animateOnMount?: boolean }) {
  const animateOnMount = options?.animateOnMount ?? false;
  const [display, setDisplay] = useState(animateOnMount ? 0 : target);
  // Tracks the actually-rendered value, not the target — updated every
  // frame the animation runs, not just once when it starts. If an earlier
  // version bumped this to `target` as soon as the animation began, an
  // interruption mid-flight (prefers-reduced-motion flips, or target
  // changes again before the current run finishes) would make the next
  // effect run see `from === target` and bail out without ever calling
  // setDisplay, leaving the KPI frozen on that partial value — or, for a
  // fast retarget, animate from the old final target instead of from
  // wherever the number actually was on screen (Codex).
  const displayRef = useRef(animateOnMount ? 0 : target);
  const prefersReducedMotion = useReducedMotion();

  // Layout, not passive — runs synchronously right after commit, before the
  // browser paints, so the reduced-motion branch's correction below lands
  // in the same paint as the mount instead of flashing the SSR/animateOnMount
  // value first (Codex).
  useLayoutEffect(() => {
    const from = displayRef.current;

    if (from === target || !Number.isFinite(target)) {
      displayRef.current = target;
      return;
    }

    if (prefersReducedMotion) {
      // Deferred a frame so this stays inside an async callback rather than
      // the effect body itself (calling setState synchronously in an effect
      // is flagged by react-hooks/set-state-in-effect) — scheduled from a
      // layout effect, this rAF still fires before the browser's first
      // paint of the mount commit, so the SSR-matching initial value is
      // never actually shown on screen (Codex).
      const raf = requestAnimationFrame(() => {
        displayRef.current = target;
        setDisplay(target);
      });
      return () => cancelAnimationFrame(raf);
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
  }, [target, prefersReducedMotion]);

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

  // Two renders sharing one slot, switched by a CSS media query rather than
  // JS: the animated value for motion-safe clients, and the plain final
  // value (`value` itself, already correct) for motion-reduce ones. A JS
  // effect can't correct the animateOnMount-0 server HTML until hydration
  // has run, so a reduced-motion client watching a slow hydration — or one
  // with JS disabled entirely — would otherwise see 0. CSS resolves at
  // first paint regardless, and both spans are identical on server and
  // client, so this can't cause a hydration mismatch either (Codex).
  return (
    <span className="relative inline-block tabular-nums">
      <span className="invisible">{value}</span>
      <span className="absolute inset-0 motion-reduce:hidden">{formatted}</span>
      <span className="absolute inset-0 hidden motion-reduce:inline">{value}</span>
    </span>
  );
}
