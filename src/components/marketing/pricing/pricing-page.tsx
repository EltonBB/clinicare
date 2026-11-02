import Link from "next/link";

import { getI18n } from "@/i18n/server";

import { MarketingShell } from "../shell/marketing-shell";
import { PlanStrip, planPricing } from "../shared/plan-strip";
import { SectionHeader } from "../shared/section-header";
import { Reveal } from "../motion/reveal";
import { Highlight, WordReveal } from "../motion/word-reveal";
import { CompareTable } from "./compare-table";
import { FaqExplorer, type Faq } from "./faq-explorer";
import { PlanFinder } from "./plan-finder";


/** Pricing gets straight to the point: a compact headline row and the plans
 *  above the fold, then a three-question plan finder, the grouped comparison,
 *  and a side-by-side FAQ. No closing CTA (the plans are the CTA). */
export async function PricingPageContent() {
  const t = (await getI18n()).m.marketing.pricing;
  const faqs: Faq[] = [
    ...t.faqs,
    {
      q: t.refundQ,
      a: (
        <>
          {t.refundBefore}{" "}
          <Link href="/refund" className="font-medium text-primary underline-offset-4 hover:underline">
            {t.refundLink}
          </Link>{" "}
          {t.refundAfter}
        </>
      ),
    },
  ];

  return (
    <MarketingShell>
      <section className="pb-20 pt-24 sm:pb-24 sm:pt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <h1 className="display-2 max-w-3xl text-balance text-[var(--brand-ink)]">
              <WordReveal>
                {t.titleLead} <Highlight>{t.highlight}</Highlight>
              </WordReveal>
            </h1>
            <div className="hero-follow max-w-sm">
              <p className="text-base leading-7 text-muted-foreground">{t.lede}</p>
            </div>
          </div>
          <Reveal delay={0.15} className="mt-12">
            <PlanStrip />
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border/60 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader className="mb-12" lead={t.finderLead} rest={t.finderRest} />
          <Reveal>
            <PlanFinder pricing={planPricing()} />
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border/60 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader className="mb-12" lead={t.compareLead} rest={t.compareRest} />
          <Reveal>
            <CompareTable pricing={planPricing()} />
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border/60 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader className="mb-12" lead={t.faqLead} rest={t.faqRest} />
          <Reveal>
            <FaqExplorer items={faqs} />
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
