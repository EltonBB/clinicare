"use client";

import { useEffect, useRef, useState } from "react";
import { m, transform, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "framer-motion";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { EASE } from "../motion/ease";
import { useMarketingScroll } from "../motion/scroll-context";
import { SectionHeader } from "../shared/section-header";

type Step = { title: string; copy: string; entries: [string, string][] };

const STEPS: Step[] = [
  { title: "Create the patient profile", copy: "Contact details and notes, entered once and never again.", entries: [["Profile created", "New patient"]] },
  { title: "Book the visit and the provider", copy: "Pick a time that is actually free, with the right person attached.", entries: [["Visit booked", "Thu 09:30 · Dr. Collins"]] },
  {
    title: "Record what happened",
    copy: "Service, payment, notes, and files from the visit all land on the record.",
    entries: [
      ["Visit completed", "Consultation"],
      ["Payment recorded", "€40.00 · Paid"],
      ["Document added", "Consent form.pdf"],
    ],
  },
  { title: "Follow up with context", copy: "Reminders and messages already know the history.", entries: [["Follow-up reminder", "In 6 weeks"]] },
  { title: "Review what needs attention", copy: "The visit counts toward this month's reports, without anyone retyping it.", entries: [["Included in reports", "October"]] },
];

const ROWS = STEPS.flatMap((step, si) => step.entries.map((entry, ei) => ({ key: `${si}-${ei}`, step: si, entry })));
const LAST = STEPS.length - 1;

/**
 * Scroll-linked value computed on the JS side. framer-motion would otherwise
 * hand plain `useTransform` ranges to the browser's native scroll timeline,
 * which can map a target's offsets differently from `useScroll`.
 */
function useRange(progress: MotionValue<number>, input: number[], output: number[]) {
  return useTransform(progress, (p) => transform(p, input, output));
}

/**
 * "From booking to follow-up": the steps start hidden and arrive one by one
 * as they scroll up (rising out of a blur, their top rule drawing across, the
 * entries they write popping in), and each entry then slides into Maya's
 * record on the right, so the record visibly carries the visit. Pointing at a
 * step lights its rows in the record, and pointing at a row lights its step.
 * The last step is as tall as the record, so on the last step the two stop
 * with their tops level and leave together. Then an ink recap rises and opens out to full width: all
 * five steps on one line, ticked off in order. Reduced motion shows every
 * step, the full record, and a still recap.
 */
export function RecordStory() {
  const { reduced } = useMarketingScroll();
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  const list = useRef<HTMLOListElement>(null);
  const record = useRef<HTMLDivElement>(null);
  const recap = useRef<HTMLDivElement>(null);
  // `seen`: steps that have scrolled into view. `reached`: steps whose
  // entries have landed on the record (a little later, near the middle).
  const [seen, setSeen] = useState(-1);
  const [reached, setReached] = useState(-1);
  const [complete, setComplete] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const visible = reduced ? LAST : seen;
  const shown = reduced ? LAST : reached;

  const { scrollYProgress } = useScroll({ target: recap, offset: ["start end", "start 0.45"] });
  useMotionValueEvent(scrollYProgress, "change", (p) => setComplete(p > 0.5));

  // The last step is kept exactly as tall as the record, so the sticky record
  // lets go with its top level with that step's top and the two leave together.
  useEffect(() => {
    const card = record.current;
    const ol = list.current;
    if (!card || !ol) return;
    const ro = new ResizeObserver(() => ol.style.setProperty("--record-h", `${card.offsetHeight}px`));
    ro.observe(card);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const els = stepRefs.current.filter(Boolean) as HTMLLIElement[];
    let frame = 0;
    // Counted from every step on each scroll, so a fast jump past several
    // steps still lands on the right one.
    const measure = () => {
      frame = 0;
      const tops = els.map((el) => el.getBoundingClientRect().top);
      const h = window.innerHeight;
      setSeen(tops.filter((top) => top < h * 0.82).length - 1);
      setReached(tops.filter((top) => top < h * 0.55).length - 1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section className="border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader lead="From booking to follow-up." rest="One record carries the visit from start to finish." />

        <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-[1fr_minmax(0,30rem)] lg:gap-20">
          <ol ref={list} onPointerLeave={() => setHovered(null)}>
            {STEPS.map((step, i) => (
              <StepItem
                key={step.title}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                step={step}
                index={i}
                visible={i <= visible}
                landed={i <= shown}
                lit={hovered === i}
                onHover={() => setHovered(i)}
              />
            ))}
          </ol>

          <div ref={record} className="lg:sticky lg:top-28 lg:self-start">
            <RecordCard shown={shown} done={reduced || complete} hovered={hovered} onHover={setHovered} />
          </div>
        </div>

        <div ref={recap} className="mt-16 sm:mt-20">
          <Recap progress={scrollYProgress} still={reduced} />
        </div>
      </div>
    </section>
  );
}

/** One step: hidden until it scrolls into view, then it builds itself in. */
function StepItem({
  ref,
  step,
  index,
  visible,
  landed,
  lit,
  onHover,
}: {
  ref: (el: HTMLLIElement | null) => void;
  step: Step;
  index: number;
  visible: boolean;
  landed: boolean;
  lit: boolean;
  onHover: () => void;
}) {
  const show = (delay: number) => ({
    initial: false as const,
    animate: visible ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 28, filter: "blur(8px)" },
    transition: { duration: 0.7, ease: EASE, delay: visible ? delay : 0 },
  });

  return (
    <li ref={ref} className="relative grid grid-cols-[3rem_1fr] py-8 lg:min-h-[34vh] lg:last:min-h-(--record-h)" onPointerEnter={visible ? onHover : undefined}>
      {/* The top rule draws across as the step arrives. */}
      <m.span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px origin-left bg-border/80"
        initial={false}
        animate={{ scaleX: visible ? 1 : 0 }}
        transition={{ duration: 0.9, ease: EASE }}
      />
      <m.span
        aria-hidden
        className="absolute left-0 top-0 h-px origin-left bg-primary"
        initial={false}
        animate={{ width: lit ? "100%" : "0%" }}
        transition={{ duration: 0.5, ease: EASE }}
      />

      <m.span {...show(0.05)} className="pt-1">
        <span
          className={cn(
            "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums transition-colors duration-500",
            lit ? "bg-primary text-white" : landed ? "text-primary" : "text-muted-foreground",
          )}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
      </m.span>
      <div>
        <m.h3 {...show(0.12)} className="text-2xl font-semibold tracking-tight text-[var(--brand-ink)] sm:text-[1.75rem]">
          {step.title}
        </m.h3>
        <m.p {...show(0.2)} className="mt-3 max-w-md text-base leading-7 text-muted-foreground">
          {step.copy}
        </m.p>
        <div className="mt-5 flex flex-wrap gap-2">
          {step.entries.map(([what], ei) => (
            <m.span
              key={what}
              initial={false}
              animate={visible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.45, ease: EASE, delay: visible ? 0.32 + ei * 0.08 : 0 }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-300",
                lit ? "bg-primary text-white" : "bg-[var(--brand-wash)] text-[var(--brand-ink)]",
              )}
            >
              <span className={cn("size-1.5 rounded-full", lit ? "bg-white" : "bg-primary")} />
              {what}
            </m.span>
          ))}
        </div>
      </div>
    </li>
  );
}

const SHORT = ["Profile", "Booking", "Visit", "Follow-up", "Reports"];

/**
 * The end of the section, kept quiet: one light panel with the takeaway on
 * the left and the five steps ticked off along a single line on the right.
 */
function Recap({ progress, still }: { progress: MotionValue<number>; still: boolean }) {
  const opacity = useRange(progress, [0, 0.35], [0, 1]);
  const y = useRange(progress, [0, 0.5], [40, 0]);
  const line = useRange(progress, [0.35, 0.95], [0, 1]);

  return (
    <m.div
      className="grid gap-10 rounded-(--radius-mkt-card) bg-[var(--brand-wash)]/60 px-6 py-10 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-center lg:gap-16 lg:px-12"
      style={still ? undefined : { opacity, y }}
    >
      <p className="text-balance text-[clamp(1.6rem,2.4vw,2rem)] font-semibold leading-[1.15] tracking-[-0.03em] text-[var(--brand-ink)]">
        Five steps, one record. <span className="text-muted-foreground">Nothing typed twice.</span>
      </p>

      <ol className="relative grid grid-cols-5">
        <span aria-hidden className="absolute inset-x-[10%] top-3 h-px bg-border">
          <m.span className="absolute inset-0 origin-left bg-primary" style={still ? undefined : { scaleX: line }} />
        </span>
        {SHORT.map((label, i) => (
          <RecapStep key={label} label={label} index={i} progress={progress} still={still} />
        ))}
      </ol>
    </m.div>
  );
}

function RecapStep({ label, index, progress, still }: { label: string; index: number; progress: MotionValue<number>; still: boolean }) {
  const at = 0.35 + index * 0.13;
  const tick = useRange(progress, [at, at + 0.08], [0, 1]);
  const text = useRange(progress, [at, at + 0.1], [0.35, 1]);

  return (
    <li className="relative flex flex-col items-center text-center">
      <span className="relative flex size-6 items-center justify-center rounded-full bg-white ring-1 ring-border">
        <m.span className="absolute inset-0 flex items-center justify-center rounded-full bg-primary text-white" style={still ? undefined : { scale: tick }}>
          <Check className="size-3.5" strokeWidth={3} />
        </m.span>
      </span>
      <m.span className="mt-3 text-sm font-medium text-[var(--brand-ink)]" style={still ? undefined : { opacity: text }}>
        {label}
      </m.span>
    </li>
  );
}

/** Maya's record: starts empty; each entry slides in when its step lands. */
function RecordCard({
  shown,
  done,
  hovered,
  onHover,
  className,
}: {
  shown: number;
  done: boolean;
  hovered: number | null;
  onHover: (step: number | null) => void;
  className?: string;
}) {
  const filled = ROWS.filter((row) => row.step <= shown).length;

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-(--radius-mkt-card) border bg-white transition-[border-color,box-shadow] duration-700",
        className,
        done
          ? "border-primary/30 shadow-[0_0_0_6px_rgba(10,34,255,0.06),0_40px_90px_-48px_rgba(10,34,255,0.55)]"
          : "border-border/70 shadow-[0_30px_80px_-48px_rgba(20,21,47,0.4)]",
      )}
      onPointerLeave={() => onHover(null)}
    >
      <div className="relative flex items-center gap-3 px-6 py-5">
        <span className="flex size-10 items-center justify-center rounded-(--radius-mkt-tile) border border-border/70 bg-white text-xs font-bold text-primary">MN</span>
        <div>
          <p className="text-sm font-semibold text-[var(--brand-ink)]">Maya Novak</p>
          <p className="text-xs text-muted-foreground">Patient record</p>
        </div>
        <span
          className={cn(
            "ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums transition-colors duration-500",
            done ? "bg-primary text-white" : "bg-[var(--brand-wash)] text-[var(--brand-ink)]",
          )}
        >
          {done ? "Complete" : `${filled} of ${ROWS.length}`}
        </span>
        <span className="absolute inset-x-0 bottom-0 h-px bg-border/60">
          <span
            className="block h-full origin-left bg-gradient-to-r from-primary to-[#64B6FF] transition-transform duration-700 ease-out-quint"
            style={{ transform: `scaleX(${filled / ROWS.length})` }}
          />
        </span>
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-500 ease-out-quint",
          filled ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        )}
      >
        <p className="overflow-hidden px-6 text-sm text-muted-foreground">
          <span className="block py-4">Nothing on the record yet. Scroll to start the visit.</span>
        </p>
      </div>

      <ul>
        {ROWS.map(({ key, step, entry: [what, detail] }, ri) => {
          const landed = step <= shown;
          const fresh = landed && step === shown && !done;
          const lit = hovered === step;
          const dim = hovered !== null && !lit;
          const order = ri - ROWS.findIndex((row) => row.step === step);
          return (
            <li
              key={key}
              className="grid transition-[grid-template-rows] duration-600 ease-out-quint"
              style={{ gridTemplateRows: landed ? "1fr" : "0fr", transitionDelay: landed ? `${order * 160}ms` : "0ms" }}
            >
              <div className={cn("min-h-0 overflow-hidden transition-opacity duration-300", dim && "opacity-40")}>
                <m.div
                  className="relative flex cursor-default items-center gap-3 border-t border-border/60 px-6 py-3 text-sm"
                  initial={false}
                  animate={{ x: landed ? 0 : -24, opacity: landed ? 1 : 0 }}
                  transition={{ duration: 0.55, ease: EASE, delay: landed ? 0.1 + order * 0.16 : 0 }}
                  onPointerEnter={() => onHover(step)}
                >
                  {/* A wash sweeps across the row the moment it lands, and stays while it is pointed at. */}
                  <m.span
                    aria-hidden
                    className="absolute inset-0 origin-left bg-[var(--brand-wash)]"
                    initial={false}
                    animate={{ scaleX: fresh || lit ? 1 : 0, opacity: fresh || lit ? 1 : 0 }}
                    transition={{ duration: 0.6, ease: EASE, delay: fresh && !lit ? 0.1 + order * 0.16 : 0 }}
                  />
                  <span
                    className={cn(
                      "relative size-1.5 shrink-0 rounded-full transition-colors duration-500",
                      fresh || lit ? "bg-primary" : "bg-[var(--brand-ink)]/30",
                    )}
                  />
                  <span className="relative font-medium text-[var(--brand-ink)]">{what}</span>
                  <span className="relative ml-auto text-right text-muted-foreground">{detail}</span>
                </m.div>
              </div>
            </li>
          );
        })}
      </ul>

    </div>
  );
}
