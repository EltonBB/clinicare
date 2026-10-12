"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

function Hours() {
  const rows: [string, string, boolean][] = [
    ["Mon to Fri", "08:00 to 18:00", true],
    ["Saturday", "09:00 to 13:00", true],
    ["Sunday", "Closed", false],
  ];
  return (
    <div className="divide-y divide-border/60">
      {rows.map(([day, time, open]) => (
        <div key={day} className="flex items-center gap-3 px-6 py-2.5 text-xs">
          <span className={cn("relative h-4 w-7 shrink-0 rounded-full transition-colors", open ? "bg-primary" : "bg-border")}>
            <span className={cn("absolute top-0.5 size-3 rounded-full bg-white shadow-sm", open ? "left-3.5" : "left-0.5")} />
          </span>
          <span className="font-medium text-[var(--brand-ink)]">{day}</span>
          <span className="ml-auto text-muted-foreground tabular-nums">{time}</span>
        </div>
      ))}
    </div>
  );
}

function Today() {
  const rows: [string, string, string][] = [
    ["09:30", "Maya Novak", "Checked in"],
    ["10:15", "Daniel Kim", "Next"],
    ["11:00", "Hannah Wright", "Booked"],
  ];
  return (
    <div className="divide-y divide-border/60">
      {rows.map(([time, who, status], i) => (
        <div key={who} className="flex items-center gap-3 px-6 py-2.5 text-xs">
          <span className="w-9 text-muted-foreground tabular-nums">{time}</span>
          <span className="font-medium text-[var(--brand-ink)]">{who}</span>
          <span className={cn("ml-auto font-semibold", i === 0 ? "text-primary" : "text-muted-foreground")}>{status}</span>
        </div>
      ))}
    </div>
  );
}

function Trend() {
  return (
    <div className="px-6 pb-4 pt-3">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">Completion</span>
        <span className="font-semibold text-[var(--brand-ink)] tabular-nums">84%</span>
      </div>
      <svg viewBox="0 0 200 60" preserveAspectRatio="none" className="mt-2 h-16 w-full" aria-hidden>
        <defs>
          <linearGradient id="loop-trend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0,46 C25,44 40,36 65,38 C90,40 105,26 130,26 C155,26 170,14 200,10 L200,60 L0,60 Z" fill="url(#loop-trend)" />
        <path d="M0,46 C25,44 40,36 65,38 C90,40 105,26 130,26 C155,26 170,14 200,10" fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function Slot() {
  return (
    <div className="divide-y divide-border/60">
      <div className="flex items-center gap-3 px-6 py-2.5 text-xs">
        <span className="w-9 text-muted-foreground tabular-nums">08:00</span>
        <span className="font-medium text-[var(--brand-ink)]">Thursday</span>
        <span className="ml-auto text-muted-foreground">Full</span>
      </div>
      <div className="flex items-center gap-3 bg-[var(--brand-wash)]/70 px-6 py-2.5 text-xs">
        <span className="w-9 font-semibold text-primary tabular-nums">07:30</span>
        <span className="font-semibold text-[var(--brand-ink)]">Thursday</span>
        <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">New slot</span>
      </div>
      <div className="flex items-center gap-3 px-6 py-2.5 text-xs">
        <span className="font-medium text-[var(--brand-ink)]">Reminder</span>
        <span className="ml-auto whitespace-nowrap text-muted-foreground">2 days before, was 1</span>
      </div>
    </div>
  );
}

const STEPS = [
  { title: "Configure", copy: "Set hours, staff, and branding once.", Visual: Hours },
  { title: "Operate", copy: "Run bookings, records, and messages.", Visual: Today },
  { title: "Understand", copy: "See trends and one suggested next step.", Visual: Trend },
  { title: "Improve", copy: "Adjust slots and reminders, then repeat.", Visual: Slot },
];

/**
 * How a clinic runs on Vela: four step cards across the width, each with a
 * small honest visual at its foot (working hours, today's list, a trend, a new
 * slot), joined by arrows, with a return line underneath that closes the
 * loop. Pointing at a card brings it forward and dims the others.
 */
export function LoopSteps() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div onPointerLeave={() => setHovered(null)}>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ title, copy, Visual }, i) => (
          <li
            key={title}
            onPointerEnter={() => setHovered(i)}
            className={cn(
              "relative flex flex-col overflow-hidden rounded-(--radius-mkt-card) border bg-white transition-[opacity,transform,border-color,box-shadow] duration-300 ease-out-quint",
              hovered === i ? "-translate-y-1 border-primary/25 shadow-[0_20px_44px_-24px_rgba(10,34,255,0.35)]" : "border-border/70",
              hovered !== null && hovered !== i && "opacity-55",
            )}
          >
            <div className="p-6">
              <div className="flex items-center justify-between">
                <span className="flex size-8 items-center justify-center rounded-full bg-[var(--brand-ink)] text-xs font-semibold text-white tabular-nums">{i + 1}</span>
                {i < STEPS.length - 1 ? <span className="hidden text-muted-foreground/50 lg:block">→</span> : <span className="hidden text-xs font-medium text-primary lg:block">Back to 1</span>}
              </div>
              <p className="mt-5 text-xl font-semibold text-[var(--brand-ink)]">{title}</p>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{copy}</p>
            </div>
            <div className="mt-auto flex h-[7.25rem] flex-col justify-center border-t border-border/60 bg-[var(--brand-wash)]/35">
              <Visual />
            </div>
          </li>
        ))}
      </ol>

      {/* The return line: from step 4 back under the row to step 1. */}
      <div aria-hidden className="relative mx-[12.5%] mt-3 hidden h-8 lg:block">
        <span className="absolute inset-x-0 bottom-0 h-px bg-border" />
        <span className="absolute bottom-0 left-0 h-full w-px bg-border" />
        <span className="absolute bottom-0 right-0 h-full w-px bg-border" />
        <span className="absolute -left-[3px] -top-1 size-0 border-x-[4px] border-b-[6px] border-x-transparent border-b-border" />
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 bg-white px-3 text-xs font-medium text-muted-foreground">then the loop starts again</span>
      </div>
    </div>
  );
}
