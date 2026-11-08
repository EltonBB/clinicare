"use client";

import { useRef } from "react";
import { m, useScroll, useTransform, type MotionValue } from "framer-motion";

// Fully inked under reduced motion through CSS: switching the style in JS
// rendered a different opacity in the browser than on the server.
function Word({ children, progress, range }: { children: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.16, 1]);
  return <m.span className="motion-reduce:opacity-100!" style={{ opacity }}>{children}</m.span>;
}

/** A paragraph whose words darken from faint to ink as it scrolls through
 *  the viewport, pacing the read. Fully inked under reduced motion. */
export function ScrollStatement({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const words = text.split(" ");

  return (
    <p ref={ref} className="display-2 max-w-6xl text-balance text-[var(--brand-ink)]">
      {words.map((word, i) => (
        <span key={i}>
          <Word progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]}>
            {word}
          </Word>{" "}
        </span>
      ))}
    </p>
  );
}
