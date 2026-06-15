"use client";

import { useEffect, useState } from "react";

// Rendered with key={value} so a changed value remounts with fresh initial state.
export function KpiValue({ value }: { value: string }) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const match = /^([^\d]*)([\d,]+)(.*)$/.exec(value);

    if (!match) {
      return;
    }

    const target = Number(match[2].replace(/,/g, ""));
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReduced || !Number.isFinite(target) || target === 0) {
      return;
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
      const current = Math.round(target * eased);
      setDisplay(`${match[1]}${current.toLocaleString("en-US")}${match[3]}`);

      if (progress < 1) {
        raf = requestAnimationFrame(frame);
      }
    };

    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span className="relative inline-block tabular-nums">
      <span className="invisible">{value}</span>
      <span className="absolute inset-0">{display}</span>
    </span>
  );
}
