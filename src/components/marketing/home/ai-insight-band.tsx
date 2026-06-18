"use client";

import { Sparkles } from "lucide-react";
import { Reveal } from "../motion/reveal";

const metrics = [
  ["Demand lift", "+18%"],
  ["Completion", "84%"],
  ["Confidence", "82%"],
];

export function AiInsightBand() {
  return (
    <section className="vela-night relative overflow-hidden text-white">
      <div className="vela-grid-texture pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-[32rem] rounded-full bg-[radial-gradient(circle,rgba(100,182,255,0.2),transparent_65%)] blur-3xl"
      />
      <Reveal className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-bold text-white/80 backdrop-blur">
              <Sparkles className="size-3.5 text-[#64B6FF]" />
              AI-assisted operational insights
            </span>
            <h2 className="mt-6 display-2">Understand what changed, why it matters, and what to do next.</h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-white/65">
              Vela reads the clinic&apos;s own activity — demand patterns, completion rate, payment context, staff
              coverage — and turns it into clear operational next steps. Never medical advice.
            </p>
          </div>
          <div className="rounded-(--radius-hero) border border-white/12 bg-white/[0.06] p-6 backdrop-blur sm:p-7">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Sparkles className="size-4 text-[#64B6FF]" />
              Insight summary
            </div>
            <p className="mt-4 text-xl font-semibold leading-8">
              Bookings are strongest on Tuesday and Thursday afternoons. Move one more staff block into those windows
              before adding capacity.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {metrics.map(([label, value]) => (
                <div key={label} className="rounded-(--radius-field) border border-white/10 bg-white/[0.05] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">{label}</p>
                  <p className="mt-1.5 text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
