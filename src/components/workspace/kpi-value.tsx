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
  // Whether the mount-triggered reset-to-0 has actually happened — set via
  // `commit()` below (inside the frame callback, or a non-cancellable early
  // exit), never synchronously at the top of the effect, so React 19
  // StrictMode's double-invoke (whose first run's rAF is cancelled before
  // the browser ever calls it) can't mark this done before the surviving
  // run reads it.
  const hasStartedMountAnimationRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const isFirstMountAnimation = animateOnMount && !hasStartedMountAnimationRef.current;
    const from = isFirstMountAnimation ? 0 : displayRef.current;

    // Every exit path below — the early bail, the reduced-motion settle,
    // and each frame of the eased tween — needs the same triplet: advance
    // the ref the *next* effect run reads `from` from, mark the mount
    // animation started, and (unless the state already matches) push the
    // new value to `display`. One place for it instead of three copies.
    const commit = (value: number, renderIt = true) => {
      displayRef.current = value;
      hasStartedMountAnimationRef.current = true;
      if (renderIt) setDisplay(value);
    };

    if (from === target || !Number.isFinite(target)) {
      // `display` already equals `target` here (that's what `from ===
      // target` means once past the first-mount case), so there's nothing
      // new to render — only the refs need to catch up.
      commit(target, false);
      return;
    }

    if (prefersReducedMotion) {
      // Deferred into an async callback rather than the effect body itself
      // (a direct synchronous setState call here is flagged by
      // react-hooks/set-state-in-effect). Needed for more than the initial
      // mount, where `display` already equals `target` and this is a
      // no-op: a live retarget on an already-mounted, reduced-motion
      // instance (e.g. the Dashboard's unread-count chip) reaches this
      // same branch with `display` still at the *old* value, so skipping
      // setDisplay left it stale (Codex).
      const raf = requestAnimationFrame(() => commit(target));
      return () => cancelAnimationFrame(raf);
    }

    const duration = 600;
    let start = 0;
    let raf = 0;

    const frame = (timestamp: number) => {
      // React 19's dev-mode double-invokes a mount effect once (run,
      // cleanup, run again); the first run's rAF is cancelled before the
      // browser ever calls it, so this callback — and the ref/state writes
      // inside `commit` — only ever run for the surviving second run.
      if (!start) start = timestamp;

      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      commit(from + (target - from) * eased);

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
  // Callers that truncate their container (e.g. a narrow stat tile) pass this to get
  // a single plain span instead, trading the anti-reflow trick for working
  // ellipsis truncation.
  truncate?: boolean;
  // Counts up from 0 on this instance's first mount only — a live retarget
  // on an already-mounted instance still eases smoothly (see useCountUp's
  // own doc comment), it just doesn't reset to 0 first. A call site that
  // wants every new value to count up from 0 again (e.g. Reports' KPI row
  // on a period switch) has to force a fresh mount itself — typically a
  // `key` on an ancestor tied to the value driving the change — this prop
  // alone does not do that; without it, `animateOnMount` only ever fires
  // once, for this instance's very first appearance.
  animateOnMount?: boolean;
}) {
  // Decimal part (if any) is captured with the digits, not left in the
  // suffix — otherwise a value like "66.7%" would count the whole part up
  // while ".7%" sat there unchanged the whole time. A leading "-" is
  // captured with the digits too, not the prefix — a `[^\d]*` prefix would
  // swallow it, leaving `parsedTarget` a positive magnitude and the sign as
  // static, un-animated text. That's dormant on first mount (a static "-"
  // in front of a 0→N count-up still reads fine), but breaks a live
  // retarget: -12 → 12 would parse as target 12 → 12, so useCountUp sees no
  // change and never animates while the prefix flips instantly, and
  // -20 → 5 would animate a magnitude delta of 15 instead of the true
  // swing of 25 (Codex).
  const match = /^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/.exec(value);
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
