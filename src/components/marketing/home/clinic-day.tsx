"use client";

import { useRef, useState, type CSSProperties } from "react";
import { m, useMotionValueEvent, useScroll, useTransform } from "framer-motion";

import { cn } from "@/lib/utils";
import { useMarketingScroll } from "../motion/scroll-context";
import { SCENES } from "./clinic-day-scenes";

type Moment = { time: string; tag: string; title: string; copy: string };

const MOMENTS: Moment[] = [
  { time: "08:00", tag: "Reminder", title: "Reminders go out.", copy: "Upcoming patients get a WhatsApp reminder with their name and time, and confirm with one reply. Nothing clinical." },
  { time: "09:30", tag: "Visit", title: "Maya's visit starts.", copy: "Her history, documents, and balance are already on her record." },
  { time: "11:00", tag: "Message", title: "A message lands.", copy: "Daniel asks to move his visit. It shows up next to his record, unread." },
  { time: "13:00", tag: "Calendar", title: "The schedule shifts.", copy: "His visit moves to Friday. The calendar and his record change together." },
  { time: "15:30", tag: "Payment", title: "A payment is recorded.", copy: "Maya's visit is paid, and the balance on her profile settles." },
  { time: "18:00", tag: "Report", title: "The day explains itself.", copy: "Reports sum up the day and suggest one next step." },
];

const START = 8 * 60;
const END = 18 * 60;
const SPAN = END - START;
const HOURS = [8, 10, 12, 14, 16, 18];

const toMinutes = (time: string) => {
  const [h, mm] = time.split(":").map(Number);
  return h * 60 + mm;
};
const AT = MOMENTS.map((moment) => toMinutes(moment.time));
// Each moment takes over 20 minutes early, so it lights up as the clock arrives.
const STARTS = AT.map((minute) => minute - 20);

// Scroll progress maps onto the clock with a little dwell at both ends.
const P0 = 0.04;
const P1 = 0.96;

function clock(minutes: number) {
  const snapped = Math.round(minutes / 5) * 5;
  return `${String(Math.floor(snapped / 60)).padStart(2, "0")}:${String(snapped % 60).padStart(2, "0")}`;
}

function StageCard({ moment, index, active, still }: { moment: Moment; index: number; active: boolean; still: boolean }) {
  const Scene = SCENES[index];
  return (
    <article className="overflow-hidden rounded-(--radius-mkt-card) border border-border/70 bg-white p-7 shadow-[0_30px_80px_-40px_rgba(20,21,47,0.35)]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-primary tabular-nums">{moment.time}</span>
        <span className="rounded-full border border-primary/20 bg-[var(--brand-wash)] px-2.5 py-0.5 text-xs font-semibold text-primary">{moment.tag}</span>
      </div>
      <h3 className="mt-5 text-2xl font-semibold tracking-tight text-[var(--brand-ink)]">{moment.title}</h3>
      <p className="mt-2 max-w-sm text-[15px] leading-7 text-muted-foreground">{moment.copy}</p>
      <Scene active={active} still={still} />
    </article>
  );
}

/**
 * "A day at the clinic": on wide screens the section pins while scroll runs a
 * clock from 08:00 to 18:00. The light follows the clock, so the section drifts
 * from morning white to an ink evening, and the stage card plays the scene for
 * the moment the day has reached. The dots on the day bar jump straight to a
 * moment. Narrow screens and reduced motion get every moment as a plain stack.
 */
export function ClinicDay() {
  const track = useRef<HTMLDivElement>(null);
  const { reduced, lenisRef } = useMarketingScroll();
  const { scrollYProgress } = useScroll({ target: track, offset: ["start start", "end end"] });
  const minutes = useTransform(scrollYProgress, [P0, P1], [START, END], { clamp: true });
  const time = useTransform(minutes, clock);
  const fill = useTransform(minutes, [START, END], [0, 1]);
  const [active, setActive] = useState(0);
  const [evening, setEvening] = useState(false);

  // Daylight: white morning, a faint cobalt afternoon, then dusk into ink.
  const dusk = [START, 15 * 60, 16.25 * 60, 17 * 60, END];
  const bg = useTransform(minutes, dusk, ["#ffffff", "#f5f6ff", "#c9cdf2", "#1c1f4a", "#14152f"]);
  const fg = useTransform(minutes, dusk, ["#14152f", "#14152f", "#14152f", "#ffffff", "#ffffff"]);
  const muted = useTransform(minutes, dusk, ["#5b6980", "#5b6980", "#3d4766", "#a9b0d6", "#a9b0d6"]);
  const accent = useTransform(minutes, dusk, ["#0A22FF", "#0A22FF", "#0A22FF", "#64B6FF", "#64B6FF"]);
  const line = useTransform(minutes, dusk, ["rgba(20,21,47,0.1)", "rgba(20,21,47,0.1)", "rgba(20,21,47,0.16)", "rgba(255,255,255,0.18)", "rgba(255,255,255,0.18)"]);

  useMotionValueEvent(minutes, "change", (value) => {
    setActive(Math.max(0, STARTS.filter((start) => value >= start).length - 1));
    setEvening(value >= 16.6 * 60);
  });

  const jumpTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    const progress = P0 + ((AT[i] - START) / SPAN) * (P1 - P0);
    const top = el.getBoundingClientRect().top + window.scrollY + progress * (el.offsetHeight - window.innerHeight);
    if (lenisRef.current) lenisRef.current.scrollTo(top, { duration: 1.2 });
    else window.scrollTo({ top, behavior: "smooth" });
  };

  const pinned = !reduced;

  return (
    <m.section
      id="clinic-day"
      data-tone={pinned && evening ? "dark" : undefined}
      className={cn("scroll-mt-16", pinned && "lg:bg-(--day-bg)")}
      style={{ "--day-bg": bg, "--day-fg": fg, "--day-muted": muted, "--day-accent": accent, "--day-line": line } as unknown as CSSProperties}
    >
      {/* Wide screens: pinned clock + stage. */}
      {/* The track always renders (useScroll needs a hydrated target); it is
          only tall, and only filled, when the section pins. */}
      <div ref={track} className={cn("hidden", pinned && "lg:block lg:h-[440vh]")}>
        {pinned ? (
          <div className="sticky top-16 flex h-[calc(100dvh-4rem)] items-center">
            <div className="mx-auto grid w-full max-w-7xl grid-cols-[1fr_minmax(0,32rem)] items-center gap-20 px-8">
              <div>
                <h2 className="display-3 max-w-md text-balance text-(--day-fg)">
                  A day at the clinic. <span className="text-(--day-muted)">Vela handles the in-between.</span>
                </h2>
                <m.p className="mt-12 text-[clamp(4.5rem,8vw,8rem)] font-semibold leading-none tracking-[-0.045em] text-(--day-accent) tabular-nums">
                  {time}
                </m.p>

                <div className="relative mt-10 max-w-md">
                  <div className="h-px w-full bg-(--day-line)" />
                  <m.div className="absolute inset-x-0 top-0 h-px origin-left bg-(--day-accent)" style={{ scaleX: fill }} />
                  {MOMENTS.map((moment, i) => (
                    <button
                      key={moment.time}
                      type="button"
                      onClick={() => jumpTo(i)}
                      aria-label={`Jump to ${moment.time}: ${moment.title}`}
                      className="group/dot absolute top-0 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--day-accent)"
                      style={{ left: `${((AT[i] - START) / SPAN) * 100}%` }}
                    >
                      <span
                        className={cn(
                          "block rounded-full transition-[width,height,background-color,box-shadow] duration-(--duration-slow) ease-out-quint",
                          i === active
                            ? "size-3 bg-(--day-accent) shadow-[0_0_0_5px_color-mix(in_srgb,var(--day-accent)_22%,transparent)]"
                            : i < active
                              ? "size-2 bg-(--day-accent)"
                              : "size-2 bg-(--day-line) group-hover/dot:bg-(--day-muted)",
                        )}
                      />
                    </button>
                  ))}
                  <div className="mt-5 flex justify-between text-xs font-medium text-(--day-muted) tabular-nums">
                    {HOURS.map((h) => (
                      <span key={h}>{String(h).padStart(2, "0")}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid">
                {MOMENTS.map((moment, i) => (
                  <div
                    key={moment.time}
                    aria-hidden={i !== active}
                    className={cn(
                      "col-start-1 row-start-1 self-center transition-[opacity,translate,filter] duration-500 ease-out-quint",
                      i === active ? "translate-y-0 opacity-100" : i < active ? "pointer-events-none -translate-y-6 opacity-0 blur-sm" : "pointer-events-none translate-y-6 opacity-0 blur-sm",
                    )}
                  >
                    <StageCard moment={moment} index={i} active={i === active} still={false} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Narrow screens and reduced motion: the whole day as a stack. */}
      <div className={cn("mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8", pinned && "lg:hidden")}>
        <h2 className="display-3 max-w-md text-balance text-[var(--brand-ink)]">
          A day at the clinic. <span className="text-muted-foreground">Vela handles the in-between.</span>
        </h2>
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MOMENTS.map((moment, i) => (
            <li key={moment.time}>
              <StageCard moment={moment} index={i} active still />
            </li>
          ))}
        </ol>
      </div>
    </m.section>
  );
}
