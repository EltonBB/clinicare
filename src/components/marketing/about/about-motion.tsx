"use client";

import { useRef } from "react";
import { m, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";

function Word({ children, progress, range, still }: { children: string; progress: MotionValue<number>; range: [number, number]; still: boolean }) {
  const opacity = useTransform(progress, range, [0.16, 1]);
  return <m.span style={{ opacity: still ? 1 : opacity }}>{children}</m.span>;
}

/** A paragraph whose words darken from faint to ink as it scrolls through
 *  the viewport, pacing the read. Fully inked under reduced motion. */
export function ScrollStatement({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const words = text.split(" ");

  return (
    <p ref={ref} className="display-2 max-w-6xl text-balance text-[var(--brand-ink)]">
      {words.map((word, i) => (
        <span key={i}>
          <Word progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} still={Boolean(reduce)}>
            {word}
          </Word>{" "}
        </span>
      ))}
    </p>
  );
}
