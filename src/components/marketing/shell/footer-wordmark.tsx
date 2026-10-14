"use client";

import { useRef, type CSSProperties, type PointerEvent } from "react";

import { useMarketingScroll } from "../motion/scroll-context";

/**
 * The footer's giant "Vela", cropped by the page's bottom edge. The letters are
 * a window onto a cobalt light that follows the cursor across the footer, so
 * the wordmark glows where you point. Touch and reduced motion get a fixed glow.
 */
export function FooterWordmark({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { reduced, coarse } = useMarketingScroll();
  const still = reduced || coarse;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || still) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--wx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--wy", `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <div
      ref={ref}
      aria-hidden
      onPointerMove={onMove}
      className={className}
      style={{ "--wx": "30%", "--wy": "40%" } as CSSProperties}
    >
      <p
        className="select-none text-center text-[26vw] font-semibold leading-[0.78] tracking-[-0.06em] text-transparent [background-clip:text] [-webkit-background-clip:text]"
        style={{
          backgroundImage:
            "radial-gradient(28vw circle at var(--wx) var(--wy), #64B6FF 0%, #0A22FF 35%, rgba(255,255,255,0.07) 70%), linear-gradient(rgba(255,255,255,0.07), rgba(255,255,255,0.07))"
        }}
      >
        Vela
      </p>
    </div>
  );
}
