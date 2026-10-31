import { getI18n } from "@/i18n/server";

import { MarketingShell } from "../shell/marketing-shell";
import { SectionHeader } from "../shared/section-header";
import { Reveal } from "../motion/reveal";
import { Highlight, WordReveal } from "../motion/word-reveal";
import { ScrollStatement } from "./about-motion";
import { LoopSteps } from "./loop-steps";
import { ToolsConverge } from "./tools-converge";

export async function AboutPage() {
  const t = (await getI18n()).m.marketing.about;
  return (
    <MarketingShell footerCta={t.footerCta}>
      {/* manifesto hero: the one centered opening on the site, no actions until the end */}
      <section className="pb-16 pt-24 sm:pb-20 sm:pt-32">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <p className="section-reveal text-sm font-semibold text-muted-foreground">{t.eyebrow}</p>
          <h1 className="display-1 mx-auto mt-6 max-w-5xl text-balance text-[var(--brand-ink)]">
            <WordReveal>
              {t.titleLead} <Highlight>{t.highlight}</Highlight>
            </WordReveal>
          </h1>
          <div className="hero-follow">
            <p className="mx-auto mt-8 max-w-lg text-lg leading-8 text-muted-foreground">
              {t.lede}
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ToolsConverge />
        </div>
      </section>

      <section className="border-t border-border/60 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ScrollStatement text={t.statement} />
        </div>
      </section>

      <section className="border-t border-border/60 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader className="mb-10" lead={t.loopLead} rest={t.loopRest} />
          <Reveal>
            <LoopSteps />
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border/60 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader className="mb-10" lead={t.trueLead} rest={t.trueRest} />
          <Reveal className="grid grid-cols-1 overflow-hidden rounded-(--radius-mkt-card) border border-border/70 divide-y divide-border/60 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {t.principles.map((p) => (
              <div key={p.title} className="flex flex-col">
                <div className="p-8">
                  <p className="text-xl font-semibold text-[var(--brand-ink)]">{p.title}</p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{p.copy}</p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-4 border-t border-border/60 bg-[var(--brand-wash)]/40 px-8 py-4 text-sm">
                  <span className="text-muted-foreground">{p.row}</span>
                  <span className="shrink-0 font-semibold text-primary">{p.status}</span>
                </div>
              </div>
            ))}
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
