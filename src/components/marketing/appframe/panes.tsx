"use client";

import { useEffect, useState } from "react";
import { m, type Variants } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Phone, Search, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { CountUp, GrowBars, StatusDot, SweepDonut, TypingThenMessage } from "./atoms";
import { EASE } from "./ease";
import { usePaneActive, usePaneVisible } from "./pane-context";

/**
 * The live "app panes" — code-native product surfaces with seeded sample data
 * that animate as they scroll in. Each is the *content* of an <AppFrame> (the
 * chrome + depth come from the frame). Rendered at a READABLE scale (Stripe shows
 * one focused, legible surface — not a cramped miniature). They read the pane
 * signal so count-ups, chart draws, and loops stay synchronized and pause
 * offscreen. Decorative only (aria-hidden) — meaning lives in the DOM beside them.
 */

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } };
const itemUp: Variants = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } };
const itemDrop: Variants = {
  hidden: { opacity: 0, y: -10 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 26 } },
};

// On-brand square identity tiles with a small cobalt-family tint set, so a list
// reads alive (Stripe's colored avatars) without leaving the brand palette.
const TILE: Record<string, string> = {
  cobalt: "bg-primary/10 text-primary",
  sky: "bg-[#e6f1ff] text-[#2563d6]",
  indigo: "bg-[#ecebff] text-[#5b54d6]",
  teal: "bg-[#e2f5f1] text-[#0f9b86]",
  amber: "bg-[#fdf0dd] text-[#c07d12]",
};
function Tile({ initials, tone = "cobalt", className }: { initials: string; tone?: keyof typeof TILE; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-[0.6rem] text-[13px] font-bold ring-1 ring-inset ring-black/[0.04]",
        TILE[tone],
        className,
      )}
    >
      {initials}
    </span>
  );
}

/** A tiny static sparkline for KPI tiles — the "measured data" micro-detail. */
function MiniSpark({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(14 - ((v - min) / span) * 12).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 16" preserveAspectRatio="none" className={cn("w-full", className)} aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke="#0A22FF"
        strokeOpacity="0.4"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* --------------------------------------------------------------- Dashboard */

export function DashboardBody() {
  const active = usePaneActive();
  const kpis: { label: string; value: number; suffix?: string; prefix?: string; delta: string; up?: boolean; spark: number[] }[] = [
    { label: "Appointments", value: 8, delta: "today", spark: [5, 7, 6, 8, 6, 9, 8] },
    { label: "Completion", value: 85, suffix: "%", delta: "+4%", up: true, spark: [78, 80, 82, 79, 84, 83, 85] },
    { label: "Active", value: 20, delta: "clients", spark: [16, 17, 18, 19, 19, 20, 20] },
    { label: "Revenue", value: 3710, prefix: "€", delta: "+12%", up: true, spark: [2900, 3100, 3000, 3400, 3300, 3600, 3710] },
    { label: "Unread", value: 6, delta: "messages", spark: [3, 5, 4, 7, 5, 8, 6] },
  ];
  const schedule: [string, string, string, keyof typeof TILE][] = [
    ["09:00", "A. Krasniqi", "AK", "cobalt"],
    ["10:30", "B. Gashi", "BG", "sky"],
    ["13:00", "D. Shala", "DS", "teal"],
  ];
  return (
    <div aria-hidden className="text-[var(--brand-ink)]">
      <div className="flex items-center justify-between">
        <p className="text-base font-bold">Good morning, Arben</p>
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Tuesday · June 24</p>
      </div>
      <m.div
        className="mt-3.5 grid grid-cols-5 divide-x divide-black/[0.05] overflow-hidden rounded-[0.9rem] border border-black/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_1px_2px_rgba(10,34,255,0.04)]"
        variants={container}
        initial="hidden"
        animate={active ? "show" : "hidden"}
      >
        {kpis.map((k) => (
          <m.div
            key={k.label}
            variants={itemUp}
            className="min-w-0 overflow-hidden bg-gradient-to-b from-white to-[var(--brand-wash)]/35 p-2.5"
          >
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.03em] text-muted-foreground">{k.label}</p>
            <p className="mt-1 truncate text-lg font-semibold leading-none">
              <CountUp value={k.value} prefix={k.prefix} suffix={k.suffix} />
            </p>
            <MiniSpark values={k.spark} className="mt-1.5 h-4" />
            <p
              className={cn(
                "mt-1 flex items-center gap-0.5 text-[9px] font-bold",
                k.up ? "text-emerald-600" : "text-muted-foreground",
              )}
            >
              {k.up ? <ArrowUpRight className="size-2.5 shrink-0" /> : null}
              <span className="truncate">{k.delta}</span>
            </p>
          </m.div>
        ))}
      </m.div>
      <div className="mt-3.5 grid grid-cols-[1.1fr_1fr] gap-3.5">
        <div className="rounded-[0.9rem] border border-black/[0.05] bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-bold">Visits</p>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600">+9%</span>
          </div>
          <GrowBars values={[34, 52, 41, 63, 45, 71, 58, 83, 49, 77, 92, 64, 73, 81]} className="mt-3 h-24" />
          <div className="mt-1.5 flex justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">
            <span>Mon</span>
            <span>Wed</span>
            <span>Fri</span>
            <span>Sun</span>
          </div>
        </div>
        <div className="rounded-[0.9rem] border border-black/[0.05] bg-white p-4">
          <p className="text-[14px] font-bold">Today’s schedule</p>
          <div className="mt-2.5 flex items-center gap-2 rounded-[0.6rem] bg-primary/5 px-3 py-2">
            <StatusDot className="size-2" />
            <span className="text-[13px] font-bold text-primary">Next up · 14:30</span>
            <span className="ml-auto text-[12px] font-semibold text-muted-foreground">Dr. Carter</span>
          </div>
          {schedule.map(([t, n, i, tone]) => (
            <div key={t} className="mt-2.5 flex items-center gap-2.5">
              <span className="w-10 text-[12px] font-bold tabular-nums text-muted-foreground">{t}</span>
              <Tile initials={i} tone={tone} className="size-7 text-[11px]" />
              <span className="text-[13px] font-semibold">{n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Calendar */

export function CalendarBody() {
  const active = usePaneActive();
  const visible = usePaneVisible();
  const cols = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const hours = ["08", "10", "12", "14", "16"];
  const [hi, setHi] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setHi((h) => (h + 1) % CAL_EVENTS.length), 2200);
    return () => clearInterval(id);
  }, [visible]);

  return (
    <div aria-hidden className="text-[var(--brand-ink)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <p className="text-lg font-bold">June 2026</p>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[12px] font-bold text-primary">Week 26</span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-[var(--brand-wash)] p-1 text-[12px] font-bold">
          <span className="rounded-full px-2.5 py-1 text-muted-foreground">Day</span>
          <span className="rounded-full bg-white px-2.5 py-1 text-primary shadow-sm">Week</span>
          <span className="rounded-full px-2.5 py-1 text-muted-foreground">Month</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[2rem_repeat(5,1fr)] gap-2 text-center">
        <span />
        {cols.map((c, i) => (
          <span key={c} className={cn("text-[12px] font-bold", i === 1 ? "text-primary" : "text-muted-foreground")}>
            {c}
            <span className="ml-1 text-muted-foreground/60">{22 + i}</span>
          </span>
        ))}
      </div>
      <div className="relative mt-1.5 grid grid-cols-[2rem_repeat(5,1fr)] gap-2">
        {/* time gutter */}
        <div className="flex h-64 flex-col justify-between py-1 text-right text-[10px] font-bold text-muted-foreground/70">
          {hours.map((h) => (
            <span key={h}>{h}:00</span>
          ))}
        </div>
        {/* day columns */}
        <div className="relative col-span-5 grid h-64 grid-cols-5 gap-2">
          {cols.map((c) => (
            <div key={c} className="rounded-[0.55rem] border border-black/[0.04] bg-[var(--brand-wash)]/40" />
          ))}
          {/* now line */}
          <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: "34%" }}>
            <span className="-ml-1 size-2 rounded-full bg-[#e05261]" />
            <m.span
              className="h-px flex-1 origin-left bg-[#e05261]/50"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: active ? 1 : 0 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.5 }}
            />
          </div>
          <m.div className="contents" variants={container} initial="hidden" animate={active ? "show" : "hidden"}>
            {CAL_EVENTS.map((e, i) => (
              <m.span
                key={i}
                variants={itemDrop}
                className={cn(
                  "absolute z-20 overflow-hidden rounded-[0.5rem] border-l-[3px] px-2 py-1.5 text-[12px] font-bold leading-tight shadow-[0_2px_8px_rgba(10,34,255,0.09)] transition-shadow",
                  e.tone,
                  hi === i && "ring-2 ring-primary/45",
                )}
                style={{ left: `calc(${e.col} * 20% + 4px)`, width: "calc(20% - 8px)", top: `${e.top}%`, height: `${e.h}%` }}
              >
                <span className="block opacity-80">{e.time}</span>
                <span className="block truncate">{e.label}</span>
                <span className="block truncate text-[11px] font-semibold opacity-65">{e.svc}</span>
              </m.span>
            ))}
          </m.div>
        </div>
      </div>
    </div>
  );
}

const CAL_EVENTS = [
  { col: 0, top: 3, h: 21, time: "09:00", label: "A. Krasniqi", svc: "Check-up", tone: "border-primary bg-primary/10 text-primary" },
  { col: 1, top: 27, h: 21, time: "10:30", label: "B. Gashi", svc: "Cleaning", tone: "border-[#5b6bd6] bg-[#eef0ff] text-[#5b6bd6]" },
  { col: 2, top: 45, h: 21, time: "13:00", label: "D. Shala", svc: "Filling", tone: "border-emerald-500 bg-emerald-50 text-emerald-600" },
  { col: 3, top: 56, h: 22, time: "14:30", label: "F. Rama", svc: "Consult", tone: "border-amber-500 bg-amber-50 text-amber-600" },
  { col: 0, top: 72, h: 21, time: "16:00", label: "L. Berisha", svc: "Crown", tone: "border-primary bg-primary/10 text-primary" },
  { col: 4, top: 33, h: 21, time: "11:30", label: "E. Hoxha", svc: "Whitening", tone: "border-[#5b6bd6] bg-[#eef0ff] text-[#5b6bd6]" },
  { col: 1, top: 51, h: 21, time: "14:00", label: "G. Marku", svc: "Check-up", tone: "border-primary bg-primary/10 text-primary" },
  { col: 2, top: 4, h: 21, time: "09:30", label: "N. Prifti", svc: "Cleaning", tone: "border-[#5b6bd6] bg-[#eef0ff] text-[#5b6bd6]" },
  { col: 3, top: 4, h: 21, time: "09:00", label: "V. Doci", svc: "Filling", tone: "border-emerald-500 bg-emerald-50 text-emerald-600" },
];

/* ----------------------------------------------------------------- Finance */

export function FinanceBody() {
  const active = usePaneActive();
  const tiles: { label: string; value: number; prefix?: string; note: string; tone: string }[] = [
    { label: "Revenue", value: 8240, prefix: "€", note: "+14%", tone: "up" },
    { label: "Collected", value: 7600, prefix: "€", note: "92%", tone: "" },
    { label: "Outstanding", value: 640, prefix: "€", note: "4 patients", tone: "warn" },
  ];
  const legend = [
    { label: "Completed", value: 96, color: "#0A22FF" },
    { label: "Upcoming", value: 28, color: "#64B6FF" },
    { label: "Cancelled", value: 12, color: "#f59e0b" },
    { label: "No-show", value: 6, color: "#e05261" },
  ];
  return (
    <div aria-hidden className="text-[var(--brand-ink)]">
      <div className="flex items-center justify-between">
        <p className="text-base font-bold">June overview</p>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-600">Healthy</span>
      </div>
      <m.div className="mt-3.5 grid grid-cols-3 gap-2.5" variants={container} initial="hidden" animate={active ? "show" : "hidden"}>
        {tiles.map((t) => (
          <m.div key={t.label} variants={itemUp} className="rounded-[0.8rem] border border-black/[0.05] bg-white p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-xl font-semibold leading-none">
              <CountUp value={t.value} prefix={t.prefix} />
            </p>
            <p
              className={cn(
                "mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-bold",
                t.tone === "up" ? "text-emerald-600" : t.tone === "warn" ? "text-amber-600" : "text-muted-foreground",
              )}
            >
              {t.tone === "up" ? <ArrowUpRight className="size-3" /> : t.tone === "warn" ? <ArrowDownRight className="size-3" /> : null}
              {t.note}
            </p>
          </m.div>
        ))}
      </m.div>
      <div className="mt-3.5 grid grid-cols-[1.25fr_1fr] gap-3.5">
        <div className="rounded-[0.9rem] border border-black/[0.05] bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-bold">Revenue trend</p>
            <span className="text-[11px] font-bold text-muted-foreground">6 weeks</span>
          </div>
          <GrowBars values={[44, 69, 51, 83, 97, 78]} className="mt-3 h-24" />
          <div className="mt-1.5 flex justify-between text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">
            <span>May 12</span>
            <span>Jun 16</span>
          </div>
        </div>
        <div className="rounded-[0.9rem] border border-black/[0.05] bg-white p-4">
          <p className="text-[14px] font-bold">Appointments</p>
          <div className="mt-2.5 flex items-center gap-3">
            <SweepDonut className="size-[5rem] shrink-0" total={142} label="visits" segments={legend} />
            <div className="min-w-0 flex-1 space-y-1">
              {legend.map((l) => (
                <div key={l.label} className="flex items-center gap-1.5 text-[11px] font-bold">
                  <span className="size-2 rounded-full" style={{ background: l.color }} />
                  <span className="truncate text-muted-foreground">{l.label}</span>
                  <span className="ml-auto tabular-nums text-[var(--brand-ink)]">{l.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Record */

export function RecordBody() {
  const active = usePaneActive();
  const rows: { d: string; t: string; prov: string; tone: keyof typeof TILE; amt: string; paid: boolean }[] = [
    { d: "12 Jun", t: "Filling · tooth 16", prov: "JC", tone: "cobalt", amt: "€80", paid: true },
    { d: "28 May", t: "Routine check-up", prov: "ER", tone: "teal", amt: "€30", paid: true },
    { d: "10 May", t: "Crown · tooth 26", prov: "SM", tone: "indigo", amt: "€250", paid: false },
    { d: "15 Apr", t: "Extraction · 38", prov: "JC", tone: "cobalt", amt: "€60", paid: true },
  ];
  const stats: [number, string, string][] = [
    [12, "Visits", ""],
    [11, "Done", ""],
    [1, "Pending", ""],
    [60, "Balance", "€"],
  ];
  return (
    <div aria-hidden className="text-[var(--brand-ink)]">
      <div className="flex items-center gap-3">
        <span className="vela-gradient flex size-12 items-center justify-center rounded-(--radius-tile) text-[15px] font-bold text-white">
          VK
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-bold">Valdete Krasniqi</p>
          <p className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground">
            <Phone className="size-3" /> +383 44 218 904 · 34 y
          </p>
        </div>
        <span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-600">Active</span>
        <span className="vela-gradient hidden rounded-full px-3.5 py-1.5 text-[12px] font-bold text-white sm:inline">Book</span>
      </div>
      <div className="mt-3.5 flex gap-4 border-b border-black/[0.06] pb-2 text-[13px] font-bold">
        <span className="text-muted-foreground">Overview</span>
        <span className="relative text-primary">
          History
          <span className="absolute -bottom-2 inset-x-0 h-0.5 rounded-full bg-primary" />
        </span>
        <span className="text-muted-foreground">Medical</span>
        <span className="text-muted-foreground">Docs</span>
        <span className="text-muted-foreground">Payments</span>
      </div>
      <m.div className="mt-2 space-y-0.5" variants={container} initial="hidden" animate={active ? "show" : "hidden"}>
        {rows.map((r) => (
          <m.div
            key={r.d}
            variants={itemUp}
            className="grid grid-cols-[4rem_1fr_auto_auto] items-center gap-2.5 rounded-[0.55rem] px-2 py-2 text-[13px] odd:bg-[var(--brand-wash)]/50"
          >
            <span className="font-bold text-muted-foreground">{r.d}</span>
            <span className="flex items-center gap-2 truncate">
              <Tile initials={r.prov} tone={r.tone} className="size-6 text-[10px]" />
              <span className="truncate font-semibold">{r.t}</span>
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-bold",
                r.paid ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600",
              )}
            >
              {r.paid ? "Paid" : "Due"}
            </span>
            <span className="w-12 text-right font-bold tabular-nums">{r.amt}</span>
          </m.div>
        ))}
      </m.div>
      <div className="mt-3 grid grid-cols-4 divide-x divide-black/[0.06] overflow-hidden rounded-[0.8rem] border border-black/[0.06] bg-[var(--brand-wash)]/40">
        {stats.map(([v, l, p]) => (
          <div key={l} className="px-2 py-2.5 text-center">
            <p className="text-base font-semibold leading-none">
              <CountUp value={v} prefix={p} />
            </p>
            <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Clients */

export function ClientsBody() {
  const active = usePaneActive();
  const rows: { name: string; sub: string; initials: string; tone: keyof typeof TILE; status: string; sTone: string; last: string; prov: string; bal: string; owing: boolean }[] = [
    { name: "Maya Novak", sub: "ID 1042 · 34 y", initials: "MN", tone: "cobalt", status: "Active", sTone: "emerald", last: "12 Jun", prov: "Dr. Carter", bal: "Paid", owing: false },
    { name: "Arben Krasniqi", sub: "ID 1038 · 41 y", initials: "AK", tone: "sky", status: "Active", sTone: "emerald", last: "9 Jun", prov: "E. Roberts", bal: "€118.50", owing: true },
    { name: "Drita Shala", sub: "ID 1029 · 52 y", initials: "DS", tone: "amber", status: "Attention", sTone: "amber", last: "2 Jun", prov: "Dr. Mitchell", bal: "€42.00", owing: true },
    { name: "Liam Becker", sub: "ID 1021 · 29 y", initials: "LB", tone: "indigo", status: "Active", sTone: "emerald", last: "28 May", prov: "Dr. Carter", bal: "Paid", owing: false },
    { name: "Elira Hoxha", sub: "ID 1014 · 37 y", initials: "EH", tone: "teal", status: "Active", sTone: "emerald", last: "24 May", prov: "E. Roberts", bal: "Paid", owing: false },
    { name: "Marco Rossi", sub: "ID 0998 · 60 y", initials: "MR", tone: "cobalt", status: "Inactive", sTone: "muted", last: "12 Apr", prov: "Dr. Mitchell", bal: "€262.40", owing: true },
  ];
  const chips: [string, string, boolean][] = [
    ["All", "248", true],
    ["Active", "212", false],
    ["Attention", "9", false],
  ];
  return (
    <div aria-hidden className="text-[var(--brand-ink)]">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 flex-1 items-center gap-2 rounded-full bg-[var(--brand-wash)] px-3.5 text-muted-foreground">
          <Search className="size-3.5" />
          <span className="text-[12px] font-semibold">Search patients…</span>
        </div>
        {chips.map(([l, c, on]) => (
          <span
            key={l}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-bold",
              on ? "bg-primary/10 text-primary" : "text-muted-foreground",
            )}
          >
            {l}
            <span className={cn("rounded-full px-1.5 text-[10px]", on ? "bg-primary/15" : "bg-black/[0.05]")}>{c}</span>
          </span>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-[1.7fr_4.5rem_3rem_4.75rem_3.75rem] gap-2 border-b border-black/[0.06] px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.05em] text-muted-foreground/70">
        <span>Patient</span>
        <span>Status</span>
        <span>Last</span>
        <span>Provider</span>
        <span className="text-right">Balance</span>
      </div>
      <m.div variants={container} initial="hidden" animate={active ? "show" : "hidden"}>
        {rows.map((r) => (
          <m.div
            key={r.name}
            variants={itemUp}
            className="grid grid-cols-[1fr_5rem_3.5rem_5.5rem_4.25rem] items-center gap-2.5 rounded-[0.55rem] px-2 py-2.5 text-[13px] hover:bg-[var(--brand-wash)]/50"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <Tile initials={r.initials} tone={r.tone} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold leading-tight">{r.name}</span>
                <span className="block truncate text-[11px] font-semibold leading-tight text-muted-foreground">{r.sub}</span>
              </span>
            </span>
            <span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold",
                  r.sTone === "emerald"
                    ? "bg-emerald-50 text-emerald-600"
                    : r.sTone === "amber"
                      ? "bg-amber-50 text-amber-600"
                      : "bg-black/[0.05] text-muted-foreground",
                )}
              >
                {r.status}
              </span>
            </span>
            <span className="font-semibold text-muted-foreground tabular-nums">{r.last}</span>
            <span className="truncate font-semibold text-muted-foreground">{r.prov}</span>
            <span className={cn("text-right font-bold tabular-nums", r.owing ? "text-amber-600" : "text-emerald-600")}>{r.bal}</span>
          </m.div>
        ))}
      </m.div>
      <div className="mt-2 flex items-center justify-between px-2 text-[11px] font-bold text-muted-foreground/70">
        <span>1–6 of 248</span>
        <span className="flex gap-2.5">
          <span>‹ Prev</span>
          <span className="text-primary">Next ›</span>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Inbox */

export function InboxBody() {
  const convos: { name: string; initials: string; tone: keyof typeof TILE; snip: string; time: string; unread?: number; on?: boolean }[] = [
    { name: "Maya Novak", initials: "MN", tone: "cobalt", snip: "Can I move my appointment…", time: "2m", unread: 2, on: true },
    { name: "Arben Krasniqi", initials: "AK", tone: "sky", snip: "Perfect, thank you!", time: "1h" },
    { name: "Drita Shala", initials: "DS", tone: "teal", snip: "See you Thursday.", time: "3h" },
  ];
  return (
    <div aria-hidden className="grid grid-cols-[1fr_1.45fr] gap-3.5 text-[var(--brand-ink)]">
      {/* conversation list */}
      <div className="space-y-1 border-r border-black/[0.06] pr-3">
        <div className="flex items-center justify-between px-1 pb-1.5">
          <p className="text-[14px] font-bold">Inbox</p>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">3 new</span>
        </div>
        {convos.map((c) => (
          <div
            key={c.name}
            className={cn(
              "flex items-center gap-2.5 rounded-[0.65rem] px-2.5 py-2.5",
              c.on ? "bg-primary/[0.07] ring-1 ring-inset ring-primary/15" : "",
            )}
          >
            <Tile initials={c.initials} tone={c.tone} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="truncate text-[14px] font-bold">{c.name}</p>
                <span className="ml-auto text-[11px] font-semibold text-muted-foreground">{c.time}</span>
              </div>
              <p className="truncate text-[12px] font-semibold text-muted-foreground">{c.snip}</p>
            </div>
            {c.unread ? (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                {c.unread}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {/* active thread */}
      <div className="flex flex-col">
        <div className="flex items-center gap-2.5 pb-2.5">
          <Tile initials="MN" tone="cobalt" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold">Maya Novak</p>
            <p className="flex items-center gap-1 text-[12px] font-semibold text-emerald-600">
              <StatusDot className="size-1.5" /> +383 44 901 233
            </p>
          </div>
          <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">Profile</span>
        </div>
        <TypingThenMessage question="Can I move my appointment to 11:00?" answer="Done — confirmed for 11:00 with Dr. Kim." />
        <div className="mt-auto flex items-center gap-2 rounded-[0.7rem] border border-[#64B6FF]/25 bg-[#eff7ff] px-3 py-2.5 text-[12px] font-bold text-[#0A22FF]">
          <span className="size-2 rounded-full bg-[#0A22FF]" /> Linked to appointment + patient record
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Staff */

export function StaffBody() {
  const active = usePaneActive();
  const staff: { initials: string; tone: keyof typeof TILE; name: string; role: string; on: boolean; shift: string; rate: number }[] = [
    { initials: "JC", tone: "cobalt", name: "Dr. James Carter", role: "Dentist", on: true, shift: "08:00–16:00", rate: 86 },
    { initials: "SM", tone: "indigo", name: "Dr. Sarah Mitchell", role: "Dentist", on: true, shift: "09:00–17:00", rate: 78 },
    { initials: "ER", tone: "teal", name: "Emily Roberts", role: "Hygienist", on: true, shift: "08:30–14:30", rate: 74 },
    { initials: "MB", tone: "sky", name: "Michael Bennett", role: "Front desk", on: false, shift: "Off today", rate: 0 },
  ];
  return (
    <div aria-hidden className="text-[var(--brand-ink)]">
      <div className="flex items-center justify-between">
        <p className="text-base font-bold">Team · Today</p>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-600">3 on shift</span>
      </div>
      <m.div className="mt-3.5 space-y-2.5" variants={container} initial="hidden" animate={active ? "show" : "hidden"}>
        {staff.map((s) => (
          <m.div
            key={s.initials}
            variants={itemUp}
            className="flex items-center gap-3 rounded-[0.8rem] border border-black/[0.05] bg-white px-3.5 py-3"
          >
            <Tile initials={s.initials} tone={s.tone} className="size-10 text-[14px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold">{s.name}</p>
              <p className="text-[12px] font-semibold text-muted-foreground">
                {s.role} · {s.shift}
              </p>
            </div>
            {s.on ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-emerald-600">
                <StatusDot className="size-2" /> On shift
              </span>
            ) : (
              <span className="text-[12px] font-bold text-muted-foreground">Off</span>
            )}
            {s.rate > 0 ? (
              <div className="hidden w-16 sm:block">
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--brand-wash)]">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-primary to-[#64B6FF]"
                    style={{ width: `${s.rate}%` }}
                  />
                </div>
              </div>
            ) : null}
          </m.div>
        ))}
      </m.div>
    </div>
  );
}

/* ---------------------------------------------------------------- AiInsight */

export function InsightBody({ tone = "night" }: { tone?: "light" | "night" }) {
  const active = usePaneActive();
  const night = tone === "night";
  const words =
    "Bookings are strongest on Tuesday and Thursday afternoons — shift one staff block into those windows before adding capacity.".split(
      " ",
    );
  const panel = night ? "border-white/10 bg-white/[0.05]" : "border-black/[0.06] bg-[var(--brand-wash)]/50";
  const ink = night ? "text-white" : "text-[var(--brand-ink)]";
  const muted = night ? "text-white/55" : "text-muted-foreground";
  return (
    <div aria-hidden>
      <div className="flex items-center justify-between">
        <div className={cn("flex items-center gap-2 text-[14px] font-bold", ink)}>
          <Sparkles className="size-4 text-[#64B6FF]" /> Insight summary
        </div>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[12px] font-bold text-emerald-400">Healthy</span>
      </div>
      <m.p
        className={cn("mt-4 text-base font-semibold leading-7", ink)}
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.025 } } }}
        initial="hidden"
        animate={active ? "show" : "hidden"}
      >
        {words.map((w, i) => (
          <m.span
            key={i}
            variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } }}
            className="inline-block"
          >
            {w}&nbsp;
          </m.span>
        ))}
      </m.p>
      <div className={cn("mt-4 rounded-[0.8rem] border p-3.5", panel)}>
        <div className="flex items-center justify-between">
          <span className={cn("text-[11px] font-bold uppercase tracking-[0.1em]", muted)}>Demand pattern · 14 days</span>
          <span className="text-[13px] font-bold text-emerald-400">+18%</span>
        </div>
        <GrowBars values={[36, 54, 43, 61, 49, 70, 57, 45, 66, 52, 81, 63, 91, 74]} className="mt-3 h-14" />
      </div>
      <div className={cn("mt-3 flex items-center gap-2.5 rounded-[0.8rem] border px-3.5 py-3", panel)}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-(--radius-tile) bg-primary/15 text-[13px] font-bold text-[#9ec3ff]">
          →
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[13px] font-bold leading-tight", ink)}>Next move · add a Thursday PM block</p>
          <p className={cn("text-[12px] font-semibold leading-tight", muted)}>Frees ~3 high-demand slots next week</p>
        </div>
        <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-400">High</span>
      </div>
      <div className={cn("mt-3 flex items-center gap-2.5 rounded-full border px-3.5 py-2.5", panel)}>
        <StatusDot color="#34d399" className="size-2" />
        <span className={cn("text-[13px] font-bold", ink)}>Operational health score</span>
        <span className={cn("ml-auto text-[15px] font-bold", night ? "text-[#9ec3ff]" : "text-primary")}>
          <CountUp value={92} suffix="/100" />
        </span>
      </div>
    </div>
  );
}
