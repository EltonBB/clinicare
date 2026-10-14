"use client";

import { m } from "framer-motion";

import { cn } from "@/lib/utils";
import { EASE } from "../motion/ease";

/*
 * One content visual per module for the explorer panel: sample data drawn as
 * the thing itself (a day of appointments, a record, shift bars), never a window
 * or screenshot. They mount fresh each time their module opens, so the
 * entrance stagger replays. Sample names and numbers only.
 */

const rise = (i: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: EASE, delay: 0.12 + i * 0.06 },
});

function DayCalendar() {
  const START = 9 * 60;
  const SPAN = 3 * 60; // 09:00 to 12:00
  const NOW = 10 * 60 + 40;
  const staff = ["Dr. Collins", "Dr. Shaw", "Nurse Carter"];
  // [staff column, from, to, patient or label, service, kind]
  const visits: [number, string, string, string, string, "visit" | "focus" | "blocked"][] = [
    [0, "09:00", "10:00", "Maya Novak", "Check-up", "visit"],
    [0, "10:15", "11:15", "Daniel Kim", "Consultation", "focus"],
    [0, "11:30", "12:00", "Hannah Wright", "Follow-up", "visit"],
    [1, "09:30", "11:00", "Oliver Grant", "Treatment", "visit"],
    [1, "11:00", "12:00", "Team meeting", "Blocked", "blocked"],
    [2, "09:00", "09:30", "Ava Brooks", "Blood test", "visit"],
    [2, "09:45", "10:15", "Noah Price", "Vaccination", "visit"],
    [2, "10:30", "11:30", "Isla Moore", "Check-up", "visit"],
  ];
  const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const pct = (m: number) => ((m - START) / SPAN) * 100;
  const GUTTER = "2.5rem";

  return (
    <div className="flex h-full flex-col px-8 pb-5 pt-5 sm:px-10">
      {/* One slim header row: day, then staff columns, then the view switch. */}
      <div className="grid items-end gap-x-2 text-[11px]" style={{ gridTemplateColumns: `${GUTTER} repeat(3, minmax(0, 1fr))` }}>
        <span className="font-semibold text-[var(--brand-ink)]">Thu</span>
        {staff.map((s) => (
          <span key={s} className="truncate font-semibold text-muted-foreground">
            {s}
          </span>
        ))}
      </div>

      <div className="relative mt-2 flex-1">
        {/* Hour lines */}
        {[0, 1, 2, 3].map((h) => (
          <div key={h} className="absolute inset-x-0 flex -translate-y-1/2 items-center" style={{ top: `${(h / 3) * 100}%` }}>
            <span className="text-[10px] text-muted-foreground tabular-nums" style={{ width: GUTTER }}>
              {String(9 + h).padStart(2, "0")}:00
            </span>
            <span className="h-px flex-1 bg-border/60" />
          </div>
        ))}
        {/* Half-hour ticks */}
        {[0.5, 1.5, 2.5].map((h) => (
          <span key={h} className="absolute right-0 h-px bg-border/30" style={{ top: `${(h / 3) * 100}%`, left: GUTTER }} />
        ))}

        <div className="absolute inset-y-0 right-0 z-10 grid gap-x-2" style={{ left: GUTTER, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          {staff.map((s, col) => (
            <div key={s} className="relative">
              {visits
                .filter(([c]) => c === col)
                .map(([, from, to, who, what, kind], i) => (
                  <m.div
                    key={from}
                    {...rise(col + i)}
                    className={cn(
                      "absolute inset-x-0 flex flex-col justify-center overflow-hidden rounded-[0.4rem] px-2.5",
                      kind === "visit" && "bg-white ring-1 ring-border/70",
                      kind === "focus" && "bg-primary",
                      kind === "blocked" && "bg-[repeating-linear-gradient(135deg,rgba(20,21,47,0.05)_0_4px,transparent_4px_8px)] ring-1 ring-inset ring-border/60",
                    )}
                    style={{ top: `calc(${pct(min(from))}% + 2px)`, height: `calc(${pct(min(to)) - pct(min(from))}% - 4px)` }}
                  >
                    {kind === "visit" ? <span className="absolute inset-y-1.5 left-1 w-0.5 rounded-full bg-primary/60" /> : null}
                    <p className={cn("truncate text-[11px] font-semibold leading-4", kind === "focus" ? "text-white" : "text-[var(--brand-ink)]")}>{who}</p>
                    <p className={cn("truncate text-[10px] leading-3.5 tabular-nums", kind === "focus" ? "text-white/75" : "text-muted-foreground")}>
                      {from} · {what}
                    </p>
                  </m.div>
                ))}
            </div>
          ))}
        </div>

        {/* Now */}
        <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: `${pct(NOW)}%` }}>
          <span className="-translate-y-1/2 rounded-full bg-[var(--brand-ink)] px-1.5 py-0.5 text-[9px] font-semibold text-white tabular-nums">10:40</span>
        </div>
        <span className="pointer-events-none absolute right-0 z-0 h-px bg-[var(--brand-ink)]/50" style={{ top: `${pct(NOW)}%`, left: GUTTER }} />
      </div>
    </div>
  );
}

function Tile({ initials, tone = "light" }: { initials: string; tone?: "light" | "ink" }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-(--radius-mkt-tile) text-[10px] font-bold",
        tone === "ink" ? "bg-[var(--brand-ink)] text-white" : "border border-border/70 bg-white text-primary",
      )}
    >
      {initials}
    </span>
  );
}

function PatientRecord() {
  const stats = [
    ["Visits", "6"],
    ["Documents", "3"],
    ["Next visit", "Thu 09:30"],
  ];
  const events = [
    ["14 Oct", "Visit completed", "Check-up · Dr. Collins"],
    ["14 Oct", "Payment recorded", "€40.00 · Paid"],
    ["02 Oct", "Document added", "Consent form"],
  ];
  return (
    <div className="flex h-full flex-col px-8 py-6 sm:px-10">
      <m.div {...rise(0)} className="flex flex-1 flex-col overflow-hidden rounded-(--radius-mkt-field) bg-white ring-1 ring-border/60">
        <div className="flex items-center gap-3 px-5 py-3.5">
          <Tile initials="MN" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[var(--brand-ink)]">Maya Novak</span>
            <span className="block text-xs text-muted-foreground">Patient record</span>
          </span>
          <span className="rounded-full bg-[var(--brand-wash)] px-2.5 py-1 text-xs font-semibold text-primary">Balance €0.00</span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border/60 border-y border-border/60">
          {stats.map(([label, value]) => (
            <div key={label} className="px-5 py-2.5">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="text-sm font-semibold text-[var(--brand-ink)] tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <ol className="flex flex-1 flex-col justify-around px-5 py-2">
          {events.map(([date, what, detail], i) => (
            <m.li key={what} {...rise(i + 1)} className="flex items-center gap-3 text-sm">
              <span className={cn("size-1.5 shrink-0 rounded-full", i === 0 ? "bg-primary" : "bg-border")} />
              <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">{date}</span>
              <span className="font-medium text-[var(--brand-ink)]">{what}</span>
              <span className="ml-auto truncate text-xs text-muted-foreground">{detail}</span>
            </m.li>
          ))}
        </ol>
      </m.div>
    </div>
  );
}

function Shifts() {
  // [initials, name, role, from, to (hours on an 08 to 18 day), checked in at]
  const staff: [string, string, string, number, number, string | null][] = [
    ["DC", "Dr. Collins", "Dentist", 8, 14, "07:56"],
    ["EC", "Emily Carter", "Front desk", 8.5, 17, "08:24"],
    ["DS", "Dr. Shaw", "Physiotherapist", 12, 18, null],
  ];
  const NOW = 11 + 20 / 60;
  const pct = (h: number) => ((h - 8) / 10) * 100;
  const fmt = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;
  const LEFT = "10.5rem";

  return (
    <div className="flex h-full flex-col px-8 py-5 sm:px-10">
      <div className="flex items-center justify-between text-xs">
        <p className="font-semibold text-[var(--brand-ink)]">Today</p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-[var(--brand-ink)]">2 of 3</span> checked in
        </p>
      </div>

      <div className="relative mt-3 flex-1">
        {/* Hour grid behind the shift tracks, labelled along the top. */}
        <div className="absolute inset-y-0 right-0" style={{ left: LEFT }}>
          {[8, 10, 12, 14, 16, 18].map((h) => (
            <span key={h} className="absolute inset-y-0 w-px bg-border/50" style={{ left: `${pct(h)}%` }}>
              <span className="absolute -top-0.5 left-1 text-[10px] text-muted-foreground tabular-nums">{String(h).padStart(2, "0")}</span>
            </span>
          ))}
        </div>

        <div className="relative flex h-full flex-col justify-around pt-4">
          {staff.map(([initials, name, role, from, to, inAt], i) => (
            <m.div key={name} {...rise(i)} className="flex items-center">
              <span className="flex shrink-0 items-center gap-3" style={{ width: LEFT }}>
                <Tile initials={initials} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--brand-ink)]">{name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{role}</span>
                </span>
              </span>
              <span className="relative h-8 flex-1">
                <m.span
                  className={cn(
                    "absolute inset-y-0 flex items-center justify-between gap-2 overflow-hidden rounded-full px-3 text-[11px] font-semibold tabular-nums",
                    inAt ? "bg-primary text-white" : "bg-white text-muted-foreground ring-1 ring-inset ring-border",
                  )}
                  style={{ left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%`, transformOrigin: "left" }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.7, ease: EASE, delay: 0.2 + i * 0.08 }}
                >
                  <span className="truncate">
                    {fmt(from)} to {fmt(to)}
                  </span>
                  <span className={cn("hidden shrink-0 font-medium sm:inline", inAt ? "text-white/70" : "")}>{inAt ? `In ${inAt}` : "Later"}</span>
                </m.span>
              </span>
            </m.div>
          ))}
        </div>

        {/* Now */}
        <div className="pointer-events-none absolute inset-y-0 right-0" style={{ left: LEFT }}>
          <span className="absolute inset-y-0 w-px bg-[var(--brand-ink)]" style={{ left: `${pct(NOW)}%` }}>
            <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-[var(--brand-ink)] px-1.5 py-0.5 text-[9px] font-semibold text-white tabular-nums">
              11:20
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Threads() {
  const rows = [
    { initials: "DK", name: "Daniel Kim", text: "Could I move my visit to Friday?", time: "11:02", unread: 2, active: true },
    { initials: "HW", name: "Hannah Wright", text: "Is there parking near the clinic?", time: "09:15", unread: 1, active: false },
    { initials: "ML", name: "Maria Lopez", text: "Thank you, see you Thursday.", time: "Yesterday", unread: 0, active: false },
  ];
  return (
    <div className="flex h-full flex-col px-8 py-6 sm:px-10">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span className="rounded-full bg-[var(--brand-ink)] px-3 py-1 text-white">Unread 2</span>
        <span className="rounded-full bg-white px-3 py-1 text-muted-foreground ring-1 ring-border/70">All 12</span>
        <span className="ml-auto text-muted-foreground">WhatsApp</span>
      </div>
      <div className="mt-4 flex flex-1 flex-col divide-y divide-border/60 overflow-hidden rounded-(--radius-mkt-field) bg-white ring-1 ring-border/60">
        {rows.map((r, i) => (
          <m.div key={r.name} {...rise(i)} className={cn("relative flex flex-1 items-center gap-3 px-4", r.active && "bg-[var(--brand-wash)]/60")}>
            {r.active ? <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" /> : null}
            <Tile initials={r.initials} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--brand-ink)]">{r.name}</span>
                {r.active ? <span className="rounded-full bg-white px-1.5 py-px text-[10px] font-semibold text-primary ring-1 ring-primary/20">On record</span> : null}
              </span>
              <span className={cn("block truncate text-xs", r.unread ? "text-[var(--brand-ink)]" : "text-muted-foreground")}>{r.text}</span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <span className="text-[11px] text-muted-foreground tabular-nums">{r.time}</span>
              {r.unread ? (
                <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">{r.unread}</span>
              ) : (
                <span className="size-4" />
              )}
            </span>
          </m.div>
        ))}
      </div>
    </div>
  );
}

function Ledger() {
  const lines: [string, string, string, "Paid" | "Due"][] = [
    ["14 Oct", "Consultation", "€40.00", "Paid"],
    ["02 Oct", "X-ray review", "€30.00", "Paid"],
    ["21 Oct", "Follow-up visit", "€25.00", "Due"],
  ];
  const files: [string, string, string][] = [
    ["PDF", "Consent form", "212 KB"],
    ["IMG", "X-ray, 2 Oct", "1.4 MB"],
    ["PDF", "Statement, Oct", "88 KB"],
  ];
  return (
    <div className="grid h-full grid-cols-[1.35fr_1fr] gap-4 px-8 py-6 sm:px-10">
      <m.div {...rise(0)} className="flex flex-col overflow-hidden rounded-(--radius-mkt-field) bg-white ring-1 ring-border/60">
        <p className="flex items-center justify-between px-4 py-3 text-xs">
          <span className="font-semibold text-[var(--brand-ink)]">Payments</span>
          <span className="text-muted-foreground">Maya Novak</span>
        </p>
        <div className="flex flex-1 flex-col justify-around border-y border-border/60 px-4">
          {lines.map(([date, what, amount, status]) => (
            <div key={what} className="flex items-center gap-2 text-sm">
              <span className="w-11 shrink-0 text-[11px] text-muted-foreground tabular-nums">{date}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-[var(--brand-ink)]">{what}</span>
              <span className="text-muted-foreground tabular-nums">{amount}</span>
              <span className={cn("w-9 text-right text-[11px] font-semibold", status === "Paid" ? "text-primary" : "text-[var(--brand-ink)]")}>{status}</span>
            </div>
          ))}
        </div>
        <p className="flex items-center justify-between bg-[var(--brand-wash)]/50 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Balance due</span>
          <span className="font-semibold text-[var(--brand-ink)] tabular-nums">€25.00</span>
        </p>
      </m.div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-[var(--brand-ink)]">Files</p>
        {files.map(([type, name, size], i) => (
          <m.div key={name} {...rise(i + 1)} className="flex flex-1 items-center gap-3 rounded-(--radius-mkt-field) bg-white px-3 ring-1 ring-border/60">
            <span className="flex h-8 w-7 shrink-0 items-center justify-center rounded-[0.25rem] bg-[var(--brand-wash)] text-[9px] font-bold text-primary">{type}</span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-[var(--brand-ink)]">{name}</span>
              <span className="block text-[11px] text-muted-foreground">{size}</span>
            </span>
          </m.div>
        ))}
      </div>
    </div>
  );
}

function Bars() {
  const weeks = [71, 74, 72, 78, 76, 81, 79, 84];
  const max = 100;
  return (
    <div className="flex h-full flex-col px-8 py-6 sm:px-10">
      <m.div {...rise(0)} className="flex items-start gap-3 rounded-(--radius-mkt-field) bg-white px-4 py-3 ring-1 ring-border/60">
        <span className="mt-0.5 shrink-0 rounded-full bg-[var(--brand-wash)] px-2 py-0.5 text-[10px] font-semibold text-primary">AI-assisted</span>
        <p className="text-sm leading-6 text-foreground">
          Completion is up four points this month. <span className="font-semibold text-primary">Thursday mornings fill first, so open one more early slot.</span>
        </p>
      </m.div>
      <div className="mt-4 flex items-baseline justify-between text-xs">
        <span className="font-semibold text-[var(--brand-ink)]">Completion rate, last 8 weeks</span>
        <span className="text-muted-foreground tabular-nums">84% this week</span>
      </div>
      <div className="mt-3 flex flex-1 items-end gap-2">
        {weeks.map((v, i) => {
          const last = i === weeks.length - 1;
          return (
            <div key={i} className="flex h-full flex-1 flex-col items-center gap-1.5">
              <div className="relative w-full flex-1 overflow-hidden rounded-[0.35rem] bg-white ring-1 ring-border/50">
                <m.span
                  className={cn("absolute inset-x-0 bottom-0 origin-bottom rounded-[0.3rem]", last ? "bg-primary" : "bg-primary/20")}
                  style={{ height: `${(v / max) * 100}%` }}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.6, ease: EASE, delay: 0.15 + i * 0.05 }}
                />
              </div>
              <span className={cn("text-[10px] tabular-nums", last ? "font-semibold text-primary" : "text-muted-foreground")}>W{i + 1}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const MODULE_VISUALS = [DayCalendar, PatientRecord, Shifts, Threads, Ledger, Bars];
