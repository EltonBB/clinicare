"use client";

import { Sparkles, TrendingUp } from "lucide-react";

import { Reveal } from "../motion/reveal";
import { AppPane } from "../appframe/app-pane";
import { FloatingToast } from "../appframe/atoms";
import { InsightBody } from "../appframe/panes";

export function AiInsightBand() {
  return (
    <section className="relative overflow-hidden bg-[#0a1024] text-white">
      {/* rendered iridescent cobalt mesh (mirrored from the showcase band) so the insight pane
          sits in a composed scene, not on a flat field */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -scale-x-100 bg-[url(/marketing/mesh-dark.webp)] bg-cover bg-center"
      />
      {/* vignette so the dark window stays grounded on the vivid band */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(135%_115%_at_44%_46%,transparent_50%,rgba(3,6,18,0.56))]"
      />
      <Reveal className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-bold text-white/80 backdrop-blur">
              <Sparkles className="size-3.5 text-[#64B6FF]" />
              AI-assisted operational insights
            </span>
            <h2 className="mt-6 display-2 text-balance">Understand what changed, why it matters, and what to do next.</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-white/75">
              Vela reads the clinic&apos;s own activity — demand patterns, completion rate, payment context, staff coverage —
              and turns it into clear operational next steps. Never medical advice.
            </p>
          </div>
          <div className="lg:pl-6">
            <AppPane
              chrome="window"
              tone="night"
              stage
              glow
              nav="reports"
              bodyClassName="min-h-[14rem]"
              float={
                <FloatingToast className="-bottom-4 -left-3 sm:-left-6">
                  <span className="flex size-7 items-center justify-center rounded-(--radius-tile) bg-primary/10 text-primary">
                    <TrendingUp className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-[var(--brand-ink)]">Thursday PM block</p>
                    <p className="text-[10px] font-semibold text-muted-foreground">+3 high-demand slots</p>
                  </div>
                </FloatingToast>
              }
            >
              <InsightBody tone="night" />
            </AppPane>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
