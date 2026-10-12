"use client";

import { useEffect } from "react";
import { animate, m, useMotionValue, useTransform } from "framer-motion";
import { Check, CheckCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { EASE } from "../motion/ease";

/*
 * One small, honest scene per moment of the clinic day: what Vela actually
 * does at that point, drawn as content (a message, a few record rows, a ledger)
 * rather than a screenshot. Each scene plays when `active` turns on and rests
 * fully drawn when `still` (reduced motion, or the stacked mobile timeline).
 * Every scene bleeds to the card's edges (`-mx-7 -mb-7` cancels the card padding).
 */

type SceneProps = { active: boolean; still: boolean };

const enter = (active: boolean, still: boolean, delay = 0) => ({
  initial: false as const,
  animate: active || still ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 14, filter: "blur(4px)" },
  transition: { duration: 0.6, ease: EASE, delay: active && !still ? delay : 0 },
});

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("-mx-7 -mb-7 mt-7 border-t border-border/60 bg-[var(--brand-wash)]/45 px-7 py-6", className)}>{children}</div>;
}

function ReminderScene({ active, still }: SceneProps) {
  return (
    <Frame className="flex flex-col items-end gap-2">
      <m.div {...enter(active, still, 0.15)} className="max-w-[19rem] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-white shadow-[0_12px_30px_-14px_rgba(10,34,255,0.6)]">
        Hi Maya, this is a reminder for your appointment at 09:30 on Thursday. Reply 1 to confirm or 2 to cancel.
      </m.div>
      <m.p {...enter(active, still, 0.4)} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        08:00 <CheckCheck className="size-3.5 text-primary" /> Delivered
      </m.p>
      {/* Maya answers from the reminder itself; the visit confirms on its own. */}
      <m.div {...enter(active, still, 0.75)} className="self-start rounded-2xl rounded-bl-md bg-white px-4 py-2 text-sm font-semibold text-[var(--brand-ink)] ring-1 ring-border/70">
        1
      </m.div>
      <m.p {...enter(active, still, 1)} className="self-start text-xs font-medium text-primary">
        08:04 · Visit confirmed
      </m.p>
    </Frame>
  );
}

function VisitScene({ active, still }: SceneProps) {
  const rows = [
    ["Last visit", "12 Aug"],
    ["Documents", "3 files"],
    ["Balance", "€40.00"],
  ];
  return (
    <Frame className="px-0 py-0">
      <div className="flex items-center gap-3 border-b border-border/60 px-7 py-4">
        <span className="flex size-9 items-center justify-center rounded-(--radius-mkt-tile) border border-border/70 bg-white text-[11px] font-bold text-primary">MN</span>
        <p className="text-sm font-semibold text-[var(--brand-ink)]">Maya Novak</p>
        <m.span {...enter(active, still, 0.5)} className="ml-auto rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-white">
          Checked in
        </m.span>
      </div>
      {rows.map(([label, value], i) => (
        <m.div
          key={label}
          {...enter(active, still, 0.15 + i * 0.08)}
          className="flex items-center justify-between border-b border-border/60 px-7 py-3 text-sm last:border-b-0"
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium text-[var(--brand-ink)] tabular-nums">{value}</span>
        </m.div>
      ))}
    </Frame>
  );
}

function MessageScene({ active, still }: SceneProps) {
  return (
    <Frame className="flex flex-col items-start gap-2">
      <div className="grid">
        {/* Typing dots give way to the message itself. */}
        <m.div
          initial={false}
          animate={{ opacity: active && !still ? [0, 1, 1, 0] : 0 }}
          transition={{ duration: 1, times: [0, 0.15, 0.8, 1], ease: "easeOut" }}
          className="col-start-1 row-start-1 flex h-11 w-16 items-center justify-center gap-1 self-start rounded-2xl rounded-bl-md bg-white ring-1 ring-border/70"
        >
          {[0, 1, 2].map((d) => (
            <span key={d} className="size-1.5 animate-pulse rounded-full bg-muted-foreground/50" style={{ animationDelay: `${d * 150}ms` }} />
          ))}
        </m.div>
        <m.div
          {...enter(active, still, 0.9)}
          className="col-start-1 row-start-1 max-w-[17rem] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm leading-6 text-foreground ring-1 ring-border/70"
        >
          Hi, could I move my visit to Friday instead?
        </m.div>
      </div>
      <m.p {...enter(active, still, 1.1)} className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="size-1.5 rounded-full bg-primary" /> Daniel Kim · 11:00 · Unread
      </m.p>
    </Frame>
  );
}

function CalendarScene({ active, still }: SceneProps) {
  const moved = active || still;
  const delay = active && !still ? 0.45 : 0;
  // Two days, 09:00 to 12:00. Daniel's 10:00 visit leaves Wednesday (a dashed
  // outline stays behind) and lands on Friday's free 10:00 slot.
  const others: [number, number, number, string][] = [
    [0, 0, 1, "Maya Novak"],
    [0, 2, 1, "Grace Lee"],
    [1, 0, 1, "Oliver Grant"],
    [1, 2, 1, "Isla Moore"],
  ];
  const row = (hour: number) => `${(hour / 3) * 100}%`;

  return (
    <Frame>
      <div className="grid grid-cols-[2rem_1fr_1fr] gap-2 text-xs font-semibold text-muted-foreground">
        <span />
        <span>Wed 14</span>
        <span>Fri 16</span>
      </div>
      <div className="relative mt-2 grid h-36 grid-cols-[2rem_1fr_1fr] gap-2">
        {[0, 1, 2].map((h) => (
          <span key={h} className="pointer-events-none absolute left-0 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums" style={{ top: row(h) }}>
            {String(9 + h).padStart(2, "0")}:00
          </span>
        ))}
        <span />
        {[0, 1].map((day) => (
          <div key={day} className="relative overflow-hidden rounded-(--radius-mkt-field) bg-white/70 ring-1 ring-border/60">
            {[1, 2].map((h) => (
              <span key={h} className="absolute inset-x-0 h-px bg-border/50" style={{ top: row(h) }} />
            ))}
            {others
              .filter(([d]) => d === day)
              .map(([, h, len, who]) => (
                <div
                  key={who}
                  className="absolute inset-x-1 truncate rounded-[0.3rem] border-l-2 border-primary/40 bg-white px-2 py-1 text-[11px] font-medium text-muted-foreground"
                  style={{ top: `calc(${row(h)} + 2px)`, height: `calc(${(len / 3) * 100}% - 4px)` }}
                >
                  {who}
                </div>
              ))}
            {day === 0 ? (
              <div
                className={cn(
                  "absolute inset-x-1 rounded-[0.3rem] px-2 py-1 text-[11px] transition-[background-color,border-color,color] duration-500",
                  moved ? "border border-dashed border-border bg-transparent text-muted-foreground" : "border-l-2 border-primary bg-white font-semibold text-[var(--brand-ink)]",
                )}
                style={{ top: `calc(${row(1)} + 2px)`, height: `calc(${100 / 3}% - 4px)`, transitionDelay: `${delay}s` }}
              >
                {moved ? "Moved to Fri" : "Daniel Kim"}
              </div>
            ) : (
              <m.div
                initial={false}
                animate={moved ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.92, y: -6 }}
                transition={{ duration: still ? 0 : 0.6, ease: EASE, delay: delay + 0.15 }}
                className="absolute inset-x-1 rounded-[0.3rem] bg-primary px-2 py-1 shadow-[0_8px_18px_-8px_rgba(10,34,255,0.6)]"
                style={{ top: `calc(${row(1)} + 2px)`, height: `calc(${100 / 3}% - 4px)` }}
              >
                <p className="truncate text-[11px] font-semibold leading-4 text-white">Daniel Kim</p>
                <p className="truncate text-[10px] leading-4 text-white/75">Consultation, 10:00</p>
              </m.div>
            )}
          </div>
        ))}
      </div>
      <m.p {...enter(active, still, 1.1)} className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Check className="size-3.5 text-primary" /> Calendar and record updated together
      </m.p>
    </Frame>
  );
}

function PaymentScene({ active, still }: SceneProps) {
  const balance = useMotionValue(40);
  const label = useTransform(balance, (v) => `€${v.toFixed(2)}`);

  useEffect(() => {
    if (still) {
      balance.set(0);
      return;
    }
    if (!active) {
      balance.set(40);
      return;
    }
    const controls = animate(balance, 0, { duration: 1.1, ease: EASE, delay: 0.45 });
    return () => controls.stop();
  }, [active, still, balance]);

  return (
    <Frame className="px-0 py-0">
      <div className="flex items-center justify-between border-b border-border/60 px-7 py-3 text-sm">
        <span className="text-muted-foreground">Consultation</span>
        <span className="font-medium text-[var(--brand-ink)] tabular-nums">€40.00</span>
      </div>
      <m.div {...enter(active, still, 0.25)} className="flex items-center justify-between border-b border-border/60 px-7 py-3 text-sm">
        <span className="text-muted-foreground">Paid by card</span>
        <span className="font-medium text-primary tabular-nums">−€40.00</span>
      </m.div>
      <div className="flex items-center justify-between bg-white px-7 py-4">
        <span className="text-sm font-semibold text-[var(--brand-ink)]">Balance</span>
        <m.span className="text-2xl font-semibold tracking-tight text-[var(--brand-ink)] tabular-nums">{label}</m.span>
      </div>
    </Frame>
  );
}

function ReportScene({ active, still }: SceneProps) {
  const drawn = active || still;
  return (
    <Frame className="px-0 pb-0 pt-5">
      <m.p {...enter(active, still, 0.1)} className="px-7 text-sm leading-6 text-foreground">
        Thursday mornings fill first. <span className="font-semibold text-primary">Open one more early slot.</span>
      </m.p>
      <svg viewBox="0 0 300 90" preserveAspectRatio="none" className="mt-4 h-24 w-full" aria-hidden>
        <defs>
          <linearGradient id="day-report-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <m.path
          d="M0,70 C30,66 45,52 75,56 C105,60 120,34 150,38 C180,42 200,22 230,24 C260,26 280,12 300,8 L300,90 L0,90 Z"
          fill="url(#day-report-fill)"
          initial={false}
          animate={{ opacity: drawn ? 1 : 0 }}
          transition={{ duration: 0.8, delay: drawn && !still ? 0.7 : 0 }}
        />
        <m.path
          d="M0,70 C30,66 45,52 75,56 C105,60 120,34 150,38 C180,42 200,22 230,24 C260,26 280,12 300,8"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          initial={false}
          animate={{ pathLength: drawn ? 1 : 0 }}
          transition={{ duration: still ? 0 : 1.2, ease: EASE, delay: drawn && !still ? 0.2 : 0 }}
        />
      </svg>
    </Frame>
  );
}

export const SCENES = [ReminderScene, VisitScene, MessageScene, CalendarScene, PaymentScene, ReportScene];
