"use client";

import { useRef, useState } from "react";
import { m, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "framer-motion";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { useMarketingScroll } from "../motion/scroll-context";
import { SectionHeader } from "../shared/section-header";

// Where each fact about Maya lives before Vela (the scrap) and the row it
// becomes on her one record. Start positions are px from the stage centre;
// small rotations make the pile feel handled, not designed.
const FRAGMENTS = [
  { source: "Paper diary", text: "Thu 09:30 · Maya", row: ["Next visit", "Thu 09:30"], x: -170, y: -215, r: -6 },
  { source: "Spreadsheet", text: "Maya N. owes €40", row: ["Balance", "€40.00"], x: 190, y: -190, r: 5 },
  { source: "Phone", text: "3 unread from Maya", row: ["Messages", "3 unread"], x: -215, y: -20, r: 4 },
  { source: "Sticky note", text: "Maya prefers mornings", row: ["Preference", "Mornings"], x: 205, y: 20, r: -4 },
  { source: "Email", text: "consent-form-final.pdf", row: ["Documents", "Consent form"], x: -160, y: 210, r: -3 },
  { source: "Notebook", text: "Follow up in 6 wks", row: ["Follow-up", "In 6 weeks"], x: 175, y: 225, r: 7 },
];

const ROW_H = 48;
const HEADER_H = 76;
const CARD_W = 340;
const CARD_H = HEADER_H + FRAGMENTS.length * ROW_H;
// Each fragment flies in on its own slice of the scroll, slightly staggered.
const window_ = (i: number): [number, number] => [0.06 + i * 0.07, 0.06 + i * 0.07 + 0.38];

function Fragment({ f, i, progress, still }: { f: (typeof FRAGMENTS)[number]; i: number; progress: MotionValue<number>; still: boolean }) {
  const t = useTransform(progress, window_(i), [0, 1], { clamp: true });
  const targetY = -CARD_H / 2 + HEADER_H + i * ROW_H;
  const x = useTransform(t, [0, 1], [f.x - CARD_W / 2, -CARD_W / 2]);
  const y = useTransform(t, [0, 1], [f.y - ROW_H / 2, targetY]);
  const rotate = useTransform(t, [0, 1], [f.r, 0]);
  const scrap = useTransform(t, [0, 0.6], [1, 0]);
  const row = useTransform(t, [0.5, 1], [0, 1]);

  return (
    <m.div className="absolute left-1/2 top-1/2" style={still ? { x: -CARD_W / 2, y: targetY } : { x, y, rotate }}>
      <div className="relative" style={{ width: CARD_W, height: ROW_H }}>
        {/* Scattered: a scrap from wherever it used to live. */}
        <m.div
          style={{ opacity: still ? 0 : scrap }}
          className="absolute inset-y-0 left-8 right-8 flex flex-col justify-center rounded-(--radius-mkt-field) border border-dashed border-border bg-white px-4 shadow-[0_14px_30px_-18px_rgba(20,21,47,0.35)]"
        >
          <span className="text-[10px] font-semibold text-muted-foreground">{f.source}</span>
          <span className="truncate text-sm font-medium text-[var(--brand-ink)]">{f.text}</span>
        </m.div>
        {/* Settled: one row on Maya's record. */}
        <m.div style={{ opacity: still ? 1 : row }} className="absolute inset-0 flex items-center justify-between border-t border-border/60 px-6 text-sm">
          <span className="text-muted-foreground">{f.row[0]}</span>
          <span className="font-medium text-[var(--brand-ink)]">{f.row[1]}</span>
        </m.div>
      </div>
    </m.div>
  );
}

/**
 * The About page's belief, shown: six scraps of one patient's life, scattered
 * across a paper diary, a spreadsheet, a phone, a sticky note, an email, and a
 * notebook. As the visitor scrolls, each flies into place as a row on Maya's
 * single record, and the checklist on the left ticks that source off. Small
 * screens and reduced motion see the record already assembled.
 */
export function ToolsConverge() {
  const ref = useRef<HTMLDivElement>(null);
  const { reduced } = useMarketingScroll();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.6"] });
  const card = useTransform(scrollYProgress, [0.35, 0.7], [0, 1], { clamp: true });
  const cardScale = useTransform(card, [0, 1], [0.94, 1]);
  const [landed, setLanded] = useState(0);
  const done = reduced ? FRAGMENTS.length : landed;

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setLanded(FRAGMENTS.filter((_, i) => v >= window_(i)[1] - 0.04).length);
  });

  return (
    <div ref={ref} className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
      <div>
        <SectionHeader lead="Six places." rest="One record." />
        <p className="mt-5 max-w-sm text-base leading-7 text-muted-foreground">
          Everything a clinic knows about Maya, before and after Vela. Scroll and watch it come together.
        </p>
        <ul className="mt-8 max-w-sm divide-y divide-border/60 border-y border-border/60">
          {FRAGMENTS.map((f, i) => {
            const on = i < done;
            return (
              <li key={f.source} className="flex items-center gap-3 py-3 text-sm">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
                    on ? "border-primary bg-primary text-white" : "border-dashed border-border text-transparent",
                  )}
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <span className={cn("font-medium transition-colors duration-300", on ? "text-[var(--brand-ink)]" : "text-muted-foreground")}>{f.source}</span>
                <span className={cn("ml-auto text-xs transition-colors duration-300", on ? "font-semibold text-primary" : "text-muted-foreground/70")}>
                  {on ? "On the record" : "Scattered"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Wide screens: the scatter, assembled by scroll. */}
      <div className="relative hidden h-[30rem] md:block" aria-hidden>
        <m.div
          className="absolute left-1/2 top-1/2 rounded-(--radius-mkt-card) border border-border/70 bg-white shadow-[0_40px_90px_-50px_rgba(20,21,47,0.45)]"
          style={{ width: CARD_W, height: CARD_H, x: -CARD_W / 2, y: -CARD_H / 2, opacity: reduced ? 1 : card, scale: reduced ? 1 : cardScale }}
        >
          <div className="flex items-center gap-3 px-6" style={{ height: HEADER_H }}>
            <span className="flex size-10 items-center justify-center rounded-(--radius-mkt-tile) border border-border/70 text-xs font-bold text-primary">MN</span>
            <span className="flex-1">
              <span className="block text-sm font-semibold text-[var(--brand-ink)]">Maya Novak</span>
              <span className="block text-xs text-muted-foreground">One record in Vela</span>
            </span>
            <span className="rounded-full bg-[var(--brand-wash)] px-2.5 py-1 text-xs font-semibold text-primary tabular-nums">
              {done}/{FRAGMENTS.length}
            </span>
          </div>
        </m.div>
        {FRAGMENTS.map((f, i) => (
          <Fragment key={f.source} f={f} i={i} progress={scrollYProgress} still={reduced} />
        ))}
      </div>

      {/* Small screens: the finished record. */}
      <div className="overflow-hidden rounded-(--radius-mkt-card) border border-border/70 bg-white md:hidden" aria-hidden>
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="flex size-9 items-center justify-center rounded-(--radius-mkt-tile) border border-border/70 text-[11px] font-bold text-primary">MN</span>
          <span>
            <span className="block text-sm font-semibold text-[var(--brand-ink)]">Maya Novak</span>
            <span className="block text-xs text-muted-foreground">One record in Vela</span>
          </span>
        </div>
        {FRAGMENTS.map((f) => (
          <div key={f.source} className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-sm">
            <span className="text-muted-foreground">{f.row[0]}</span>
            <span className="font-medium text-[var(--brand-ink)]">{f.row[1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
