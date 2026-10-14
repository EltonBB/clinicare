import Link from "next/link";

import { MarketingShell } from "../shell/marketing-shell";
import { PlanStrip } from "../shared/plan-strip";
import { SectionHeader } from "../shared/section-header";
import { Reveal } from "../motion/reveal";
import { Highlight, WordReveal } from "../motion/word-reveal";
import { CompareTable } from "./compare-table";
import { FaqExplorer, type Faq } from "./faq-explorer";
import { PlanFinder } from "./plan-finder";

const faqs: Faq[] = [
  {
    q: "How do I get started?",
    a: "Create a free account and set up your workspace. You can explore Vela and organize your clinic before choosing a paid plan.",
  },
  {
    q: "What's the difference between Basic and Pro?",
    a: "Basic covers daily operations: scheduling, records, documents, payments, and inbox. Pro adds reports with AI-assisted insights, staff utilization, no-show tracking, and priority support.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. You can move between Basic and Pro as your clinic grows, and your workspace and data stay exactly as they are.",
  },
  {
    q: "How is billing handled?",
    a: "Online card checkout is being prepared. For now, we help activate the right plan for your workspace during setup, so nothing is charged automatically.",
  },
  {
    q: "Is my clinic data private?",
    a: "Records live in authenticated, access-controlled storage, with privacy and security built in from day one, not bolted on later.",
  },
  {
    q: "Do you offer refunds?",
    a: (
      <>
        See our{" "}
        <Link href="/refund" className="font-medium text-primary underline-offset-4 hover:underline">
          refund policy
        </Link>{" "}
        for the full details on plan changes and cancellations.
      </>
    ),
  },
];

/** Pricing gets straight to the point: a compact headline row and the plans
 *  above the fold, then a three-question plan finder, the grouped comparison,
 *  and a side-by-side FAQ. No closing CTA (the plans are the CTA). */
export function PricingPageContent() {
  return (
    <MarketingShell>
      <section className="pb-20 pt-24 sm:pb-24 sm:pt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <h1 className="display-2 max-w-3xl text-balance text-[var(--brand-ink)]">
              <WordReveal>
                Simple pricing for <Highlight>real clinic work.</Highlight>
              </WordReveal>
            </h1>
            <div className="hero-follow max-w-sm">
              <p className="text-base leading-7 text-muted-foreground">Start with the operating system. Upgrade when you want reports and insights.</p>
            </div>
          </div>
          <Reveal delay={0.15} className="mt-12">
            <PlanStrip />
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border/60 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader className="mb-12" lead="Not sure which one?" rest="Three questions settle it." />
          <Reveal>
            <PlanFinder />
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border/60 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader className="mb-12" lead="Everything in Basic," rest="and more in Pro." />
          <Reveal>
            <CompareTable />
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border/60 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader className="mb-12" lead="Pricing, answered." rest="Anything else? Just ask." />
          <Reveal>
            <FaqExplorer items={faqs} />
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
