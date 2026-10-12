"use client";

import { useEffect, useState } from "react";
import { animate, m, useMotionValue, useMotionValueEvent, useTransform } from "framer-motion";

/*
 * The home hero's "day dial": one clinic day, 08:00 to 18:00, drawn around a
 * clock face. Each ring is a member of staff and each arc an appointment, with
 * lunch blocked across all three. A hand sweeps through the day: visits behind
 * it read as done, the one under it lights up, and the centre says what is
 * happening now. Point at any arc to read that visit. Sample day, sample names.
 */

type Visit = { from: string; to: string; patient: string; service: string };
type Track = { staff: string; visits: Visit[] };

const TRACKS: Track[] = [
  {
    staff: "Dr. Collins",
    visits: [
      { from: "08:30", to: "09:15", patient: "Maya Novak", service: "Check-up" },
      { from: "09:30", to: "10:30", patient: "Daniel Kim", service: "Consultation" },
      { from: "11:00", to: "11:45", patient: "Hannah Wright", service: "Follow-up" },
      { from: "13:45", to: "14:45", patient: "Laura Bishop", service: "Treatment" },
      { from: "15:15", to: "16:00", patient: "Rachel Adams", service: "Check-up" },
      { from: "16:30", to: "17:30", patient: "James Whitfield", service: "Consultation" },
    ],
  },
  {
    staff: "Dr. Shaw",
    visits: [
      { from: "08:00", to: "09:00", patient: "Thomas Hayes", service: "Physio session" },
      { from: "09:30", to: "10:15", patient: "Grace Lee", service: "Assessment" },
      { from: "10:30", to: "12:00", patient: "Oliver Grant", service: "Treatment" },
      { from: "14:00", to: "15:00", patient: "Chloe Evans", service: "Follow-up" },
      { from: "15:30", to: "17:00", patient: "Henry Ward", service: "Treatment" },
    ],
  },
  {
    staff: "Nurse Carter",
    visits: [
      { from: "08:30", to: "09:00", patient: "Ava Brooks", service: "Blood test" },
      { from: "10:00", to: "10:30", patient: "Noah Price", service: "Vaccination" },
      { from: "11:00", to: "12:00", patient: "Isla Moore", service: "Check-up" },
      { from: "14:30", to: "15:00", patient: "Leo Turner", service: "Dressing change" },
      { from: "16:00", to: "17:00", patient: "Mia Hughes", service: "Check-up" },
    ],
  },
];

const LUNCH = { from: "12:30", to: "13:30" };
const START = 8 * 60;
const END = 18 * 60;
const SWEEP = 300; // degrees of the dial the day occupies; the gap sits at the bottom
const C = 300; // centre of the 600-unit viewBox
const RADII = [232, 202, 172];
const TICK_R = 262;
const LOOP_SECONDS = 70;

const toMin = (t: string) => {
  const [h, mm] = t.split(":").map(Number);
  return h * 60 + mm;
};
const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.floor(min % 60)).padStart(2, "0")}`;
const angle = (min: number) => -SWEEP / 2 + ((min - START) / (END - START)) * SWEEP;
const point = (deg: number, r: number) => {
  const rad = (deg * Math.PI) / 180;
  // Rounded so server and browser print identical path data (no hydration drift).
  const round = (n: number) => Math.round(n * 100) / 100;
  return [round(C + r * Math.sin(rad)), round(C - r * Math.cos(rad))] as const;
};
function arc(fromMin: number, toMinute: number, r: number) {
  const a0 = angle(fromMin);
  const a1 = angle(toMinute);
  const [x0, y0] = point(a0, r);
  const [x1, y1] = point(a1, r);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

type Placed = Visit & { staff: string; track: number; start: number; end: number; key: string };
const PLACED: Placed[] = TRACKS.flatMap((track, ti) =>
  track.visits.map((v) => ({ ...v, staff: track.staff, track: ti, start: toMin(v.from), end: toMin(v.to), key: `${ti}-${v.from}` })),
);
const HOURS = Array.from({ length: 11 }, (_, i) => START + i * 60);

export function DayDial({ still }: { still: boolean }) {
  const minutes = useMotionValue(9 * 60 + 40);
  const rotate = useTransform(minutes, (v) => angle(v));
  const [now, setNow] = useState(9 * 60 + 40);
  const [hovered, setHovered] = useState<Placed | null>(null);

  useEffect(() => {
    if (still || hovered) return;
    // Sweep from wherever the hand is to 18:00, then loop from 08:00.
    const remaining = ((END - minutes.get()) / (END - START)) * LOOP_SECONDS;
    let loop: ReturnType<typeof animate> | undefined;
    const first = animate(minutes, END, {
      duration: remaining,
      ease: "linear",
      onComplete: () => {
        minutes.set(START);
        loop = animate(minutes, END, { duration: LOOP_SECONDS, ease: "linear", repeat: Infinity, repeatDelay: 0.6 });
      },
    });
    return () => {
      first.stop();
      loop?.stop();
    };
  }, [still, hovered, minutes]);

  // Re-render the arcs in 5-minute steps; the hand itself moves every frame.
  useMotionValueEvent(minutes, "change", (v) => {
    const stepped = Math.floor(v / 5) * 5;
    setNow((prev) => (prev === stepped ? prev : stepped));
  });

  const current = PLACED.filter((p) => p.start <= now && now < p.end);
  const next = PLACED.filter((p) => p.start > now).sort((a, b) => a.start - b.start)[0];
  const lunch = now >= toMin(LUNCH.from) && now < toMin(LUNCH.to);
  const focus = hovered ?? current[0] ?? null;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[640px]" onPointerLeave={() => setHovered(null)}>
      <svg viewBox="0 0 600 600" className="h-full w-full overflow-visible" aria-hidden>
        <defs>
          <pattern id="dial-blocked" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="rgba(20,21,47,0.05)" />
            <rect width="2" height="6" fill="rgba(20,21,47,0.16)" />
          </pattern>
          <radialGradient id="dial-glow">
            <stop offset="0%" stopColor="#0A22FF" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#0A22FF" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={C} cy={C} r={290} fill="url(#dial-glow)" />

        {/* Hour ticks and labels */}
        {HOURS.map((h) => {
          const a = angle(h);
          const [x0, y0] = point(a, TICK_R);
          const [x1, y1] = point(a, TICK_R + 8);
          const [lx, ly] = point(a, TICK_R + 24);
          const passed = h <= now;
          return (
            <g key={h}>
              <line x1={x0} y1={y0} x2={x1} y2={y1} stroke={passed ? "#0A22FF" : "rgba(20,21,47,0.22)"} strokeWidth={1.5} />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className="fill-[var(--muted-foreground)] text-[13px] font-medium tabular-nums">
                {String(h / 60).padStart(2, "0")}
              </text>
            </g>
          );
        })}
        {HOURS.slice(0, -1).map((h) => {
          const [x0, y0] = point(angle(h + 30), TICK_R + 2);
          const [x1, y1] = point(angle(h + 30), TICK_R + 6);
          return <line key={`h${h}`} x1={x0} y1={y0} x2={x1} y2={y1} stroke="rgba(20,21,47,0.14)" strokeWidth={1} />;
        })}

        {/* Elapsed part of the day */}
        <path d={arc(START, Math.max(START + 0.5, now), TICK_R - 4)} stroke="#0A22FF" strokeWidth={2} fill="none" strokeLinecap="round" />

        {/* Staff tracks */}
        {RADII.map((r, ti) => (
          <g key={r}>
            <path d={arc(START, END, r)} stroke="rgba(20,21,47,0.045)" strokeWidth={20} fill="none" strokeLinecap="round" />
            <path d={arc(toMin(LUNCH.from), toMin(LUNCH.to), r)} stroke="url(#dial-blocked)" strokeWidth={20} fill="none" />
            {PLACED.filter((p) => p.track === ti).map((p) => {
              const state = p.end <= now ? "done" : p.start <= now ? "now" : "next";
              const isHover = hovered?.key === p.key;
              return (
                <path
                  key={p.key}
                  d={arc(p.start + 2, p.end - 2, r)}
                  fill="none"
                  strokeLinecap="round"
                  onPointerEnter={() => setHovered(p)}
                  className="cursor-pointer transition-[stroke,stroke-width,opacity] duration-300"
                  style={{ pointerEvents: "stroke" }}
                  stroke={state === "now" || isHover ? "#0A22FF" : state === "done" ? "rgba(10,34,255,0.38)" : "rgba(10,34,255,0.16)"}
                  strokeWidth={isHover ? 26 : state === "now" ? 22 : 18}
                  opacity={hovered && !isHover ? 0.55 : 1}
                />
              );
            })}
          </g>
        ))}

        {/* Each ring is named in the dial's open gap, right where the ring would continue. */}
        {TRACKS.map((t, i) => (
          <text key={t.staff} x={C} y={C + RADII[i]} textAnchor="middle" dominantBaseline="central" className="fill-[var(--muted-foreground)] text-[12px] font-semibold">
            {t.staff}
          </text>
        ))}
      </svg>

      {/* The hand: its own square layer, so rotating it turns around the dial's centre. */}
      <m.svg viewBox="0 0 600 600" className="pointer-events-none absolute inset-0 h-full w-full" style={{ rotate }} aria-hidden>
        <line x1={C} y1={C - 132} x2={C} y2={C - TICK_R + 2} stroke="#14152f" strokeWidth={1.5} strokeLinecap="round" />
        <circle cx={C} cy={C - TICK_R + 2} r={5} fill="#0A22FF" stroke="white" strokeWidth={2} />
      </m.svg>

      {/* Centre readout */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-[46%] text-center sm:w-[40%]">
          <p className="text-[clamp(2.25rem,4.4vw,3.5rem)] font-semibold leading-none tracking-[-0.04em] text-[var(--brand-ink)] tabular-nums">
            {hovered ? hovered.from : fmt(now)}
          </p>
          <div className="mt-3 min-h-[4.5rem]">
            {focus ? (
              <>
                <p className="text-xs font-semibold text-primary">{hovered ? focus.staff : `Now · ${focus.staff}`}</p>
                <p className="mt-1 truncate text-sm font-semibold text-[var(--brand-ink)]">{focus.patient}</p>
                <p className="text-xs leading-snug text-muted-foreground">
                  {focus.service}, {focus.from} to {focus.to}
                </p>
              </>
            ) : lunch ? (
              <>
                <p className="text-xs font-semibold text-muted-foreground">Lunch</p>
                <p className="mt-1 text-sm font-semibold text-[var(--brand-ink)]">Blocked for everyone</p>
              </>
            ) : next ? (
              <>
                <p className="text-xs font-semibold text-muted-foreground">Next · {next.staff}</p>
                <p className="mt-1 truncate text-sm font-semibold text-[var(--brand-ink)]">{next.patient}</p>
                <p className="truncate text-xs text-muted-foreground">{next.from}</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-[var(--brand-ink)]">Day complete</p>
            )}
          </div>
        </div>
      </div>

      <p className="sr-only">A sample clinic day: three staff members, {PLACED.length} appointments, and a blocked lunch hour.</p>
    </div>
  );
}
