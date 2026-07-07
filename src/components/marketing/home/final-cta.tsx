"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "../motion/reveal";
import { Magnetic } from "../motion/magnetic";
import { CountUp, GrowBars, StatusDot } from "../appframe/atoms";

// Compact "today" snapshot so the closing band earns its space with a real
// product artifact (Stripe's every-band-has-a-visual pattern) instead of a
// bare gradient slab — code-native, cobalt, no raster.
const TODAY: { t: string; n: string; s: string; tone: "done" | "now" | "next" }[] = [
  { t: "09:00", n: "A. Krasniqi", s: "Check-up", tone: "done" },
  { t: "10:30", n: "B. Gashi", s: "Cleaning", tone: "now" },
  { t: "14:30", n: "F. Rama", s: "Consultation", tone: "next" },
];

const PILL: Record<"done" | "now" | "next", { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-emerald-50 text-emerald-600" },
  now: { label: "Now", cls: "bg-primary/10 text-primary" },
  next: { label: "Next", cls: "bg-[var(--brand-wash)] text-muted-foreground" },
};

export function FinalCta() {
  return (
    <section className="px-4 pb-24 pt-8 sm:px-6 lg:px-8">
      <Reveal className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,#0a1cb0_0%,#0A22FF_28%,#2f6bff_54%,#23a6d6_78%,#6a5cf0_100%)] px-6 py-16 text-white shadow-[0_40px_120px_rgba(10,34,255,0.4)] sm:px-12 sm:py-20">
        <div aria-hidden className="vela-grid-texture pointer-events-none absolute inset-0 opacity-25" />
        {/* flowing cyan ribbon streak (Stripe-Connect style) */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-24 top-[36%] h-44 -rotate-6 bg-[linear-gradient(90deg,transparent,rgba(140,228,255,0.4),rgba(180,200,255,0.3),transparent)] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 size-[28rem] rounded-full bg-[radial-gradient(circle,rgba(120,96,240,0.45),transparent_65%)] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-16 size-[26rem] rounded-full bg-[radial-gradient(circle,rgba(100,182,255,0.4),transparent_65%)] blur-3xl"
        />
        <div className="relative grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_minmax(0,0.9fr)]">
          {/* copy */}
          <div className="text-center lg:text-left">
            <h2 className="display-2 text-white">Bring your whole clinic into one calm workspace.</h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-8 text-white/85 lg:mx-0">
              Start free with appointments, patients, staff, and reports — then grow into messaging, automation, and
              deeper operational insight.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Magnetic>
                <Link
                  href="/sign-up"
                  className="inline-flex h-12 min-w-32 items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-field) bg-white px-6 text-sm font-bold text-primary shadow-[0_18px_44px_rgba(0,0,0,0.25)] transition-transform duration-(--duration-base) ease-out-quint hover:-translate-y-0.5"
                >
                  Start free
                  <ArrowRight className="size-4" />
                </Link>
              </Magnetic>
              <Link
                href="/contact"
                className="inline-flex h-12 min-w-32 items-center justify-center whitespace-nowrap rounded-(--radius-field) border border-white/25 bg-white/5 px-6 text-sm font-bold text-white backdrop-blur transition-[transform,background-color] duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 hover:bg-white/10"
              >
                Talk to us
              </Link>
            </div>
          </div>

          {/* floating "today" snapshot — the closing product artifact */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="rounded-(--radius-hero) border border-white/60 bg-white/95 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_2px_4px_rgba(5,10,40,0.18),0_34px_70px_-22px_rgba(5,10,40,0.6)] backdrop-blur lg:rotate-[0.6deg]">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Today’s schedule</p>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                  <StatusDot color="#10b981" className="size-1.5" /> Live
                </span>
              </div>
              <div className="mt-2.5 flex items-end justify-between">
                <p className="flex items-baseline gap-1.5 text-[var(--brand-ink)]">
                  <span className="text-3xl font-semibold leading-none">
                    <CountUp value={24} />
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">appointments</span>
                </p>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">+6 this week</span>
              </div>
              <GrowBars values={[14, 18, 12, 20, 16, 22, 24]} className="mt-3 h-10" />
              <div className="mt-4 space-y-2">
                {TODAY.map((r) => (
                  <div
                    key={r.t}
                    className="flex items-center gap-3 rounded-(--radius-field) border border-black/[0.05] bg-[var(--brand-wash)]/40 px-3 py-2"
                  >
                    <span className="shrink-0 text-[12px] font-bold tabular-nums text-muted-foreground">{r.t}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold leading-tight text-[var(--brand-ink)]">{r.n}</p>
                      <p className="truncate text-[11px] font-semibold leading-tight text-muted-foreground">{r.s}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${PILL[r.tone].cls}`}>
                      {PILL[r.tone].label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
