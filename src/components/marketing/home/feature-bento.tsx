import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { RevealGroup, RevealItem } from "../motion/reveal";
import { Spotlight } from "../motion/spotlight";
import { SectionHeader } from "../shared/section-header";
import { RecordHub } from "./record-hub";

function RecordRows() {
  const rows = ["Visit", "Document", "Payment"];
  return (
    <div className="mt-6 -mx-10 -mb-10 border-t border-border/60">
      {rows.map((label) => (
        <div key={label} className="flex items-center justify-between border-b border-border/60 px-10 py-3 text-sm">
          <span className="font-medium text-foreground">{label}</span>
          <span className="size-1.5 rounded-full bg-border" aria-hidden />
        </div>
      ))}
      <div className="flex items-center justify-between bg-[var(--brand-wash)]/50 px-10 py-3.5">
        <span className="text-sm font-semibold text-primary">Patient record</span>
        <ArrowRight className="size-4 text-primary" />
      </div>
    </div>
  );
}

function MessageRows() {
  const rows = [
    { name: "Maria Lopez", preview: "Your appointment is confirmed for Thursday.", time: "2m", unread: true },
    { name: "Daniel Kim", preview: "Can I move my visit to Friday?", time: "14m", unread: false },
    { name: "Hannah Wright", preview: "Is there parking near the clinic?", time: "31m", unread: true },
  ];
  return (
    <div className="-mx-8 -mb-8 mt-auto border-t border-border/60">
      {rows.map((r, i) => (
        <div key={r.name} className={cn("flex items-center gap-3 px-8 py-3.5", i < rows.length - 1 && "border-b border-border/60")}>
          <span className={cn("size-2 shrink-0 rounded-full", r.unread ? "bg-primary" : "border border-border")} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
            <p className="truncate text-xs text-muted-foreground">{r.preview}</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{r.time}</span>
        </div>
      ))}
    </div>
  );
}

function TrendChart() {
  return (
    <div className="relative -mx-8 -mb-8 mt-auto h-44 overflow-hidden">
      <svg viewBox="0 0 300 100" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="bento-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,78 L38,66 L75,72 L113,42 L150,50 L188,20 L225,28 L263,8 L300,4 L300,100 L0,100 Z"
          fill="url(#bento-trend-fill)"
        />
        <polyline
          points="0,78 38,66 75,72 113,42 150,50 188,20 225,28 263,8 300,4"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** Unified-product statement as an editorial bento. Header text sits
 *  top-left with padding; each visual below it bleeds to the card's own
 *  edges (negative margins cancel the header's padding) instead of
 *  floating centered in whitespace — same weighting Ramp's cards use.
 *  Content is honest and abstract (row lists, a trend line), never a
 *  mocked-up screen. */
export function FeatureBento() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          className="mb-12"
          lead="Every part of the clinic day, actually connected."
          rest="Not six tools bolted together."
        />

        <RevealGroup className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
          <RevealItem>
            <Spotlight className="flex h-full flex-col justify-center rounded-(--radius-mkt-card) bg-[var(--brand-ink)] p-10 lg:p-12">
              <p className="text-3xl leading-snug font-semibold text-balance text-white sm:text-4xl">Built as one product, not stitched from six.</p>
              <p className="mt-4 max-w-md text-sm leading-6 text-white/60">
                Scheduling, records, staff, messages, documents, and reports share one login and one record, from day one.
              </p>
            </Spotlight>
          </RevealItem>
          <RevealItem className="flex flex-col overflow-hidden rounded-(--radius-mkt-card) border border-border/70 p-10">
            <p className="text-xl leading-snug font-semibold text-[var(--brand-ink)]">One record per patient.</p>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Visit history, documents, and payments stay together, so nothing about a patient lives in a separate app.
            </p>
            <RecordRows />
          </RevealItem>
        </RevealGroup>

        <RevealGroup className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <RevealItem className="flex flex-col overflow-hidden rounded-(--radius-mkt-card) border border-border/70 bg-[var(--brand-wash)]/30 p-8">
            <p className="text-xl leading-snug font-semibold text-[var(--brand-ink)]">WhatsApp, without the chaos.</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Every conversation lands next to the right patient, with a fast filter for what&apos;s still unread.
            </p>
            <MessageRows />
          </RevealItem>

          <RevealItem className="flex flex-col overflow-hidden rounded-(--radius-mkt-card) border border-border/70 p-8">
            <p className="text-xl leading-snug font-semibold text-[var(--brand-ink)]">Reports that explain themselves.</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Completion rate, visit trends, and one AI-assisted next step, in plain language, not a wall of numbers.
            </p>
            <TrendChart />
          </RevealItem>

          <RevealItem>
            <div className="flex h-full flex-col overflow-hidden rounded-(--radius-mkt-card) border border-border/70 p-8">
              <p className="text-xl leading-snug font-semibold text-[var(--brand-ink)]">Six modules, one record.</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Every module writes to the same patient. Point at one to see what it adds.</p>
              <div className="flex flex-1 items-center py-6">
                <RecordHub />
              </div>
              <Link
                href="/product"
                className="group/link inline-flex items-center gap-1.5 self-start text-sm font-semibold text-primary"
              >
                Explore the product
                <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/link:translate-x-1" />
              </Link>
            </div>
          </RevealItem>
        </RevealGroup>
      </div>
    </section>
  );
}
