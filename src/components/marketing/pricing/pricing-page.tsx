import Link from "next/link";

import { MarketingShell } from "../shell/marketing-shell";
import { PlanStrip, planPricing } from "../shared/plan-strip";
import { SectionHeader } from "../shared/section-header";
import { Reveal } from "../motion/reveal";
import { Highlight, WordReveal } from "../motion/word-reveal";
import { CompareTable } from "./compare-table";
import { FaqExplorer, type Faq } from "./faq-explorer";
import { PlanFinder } from "./plan-finder";

const faqs: Faq[] = [
  {
    q: "How does the free trial work?",
    a: "Every plan starts with 14 days free. You add a card when you start, and nothing is charged during the trial. If you don't cancel before it ends, your plan begins and you're billed. We email you before that happens.",
  },
  {
    q: "What's the difference between Basic and Pro?",
    a: "Basic covers daily operations: scheduling, records, documents, payments, and inbox. Pro adds reports with AI-assisted insights, staff utilization, no-show tracking, and priority support.",
  },
  {
    q: "Can I switch plans or pay yearly?",
    a: "Yes. Switch between Basic and Pro, or monthly and yearly, any time in Settings. Yearly gives you twelve months for the price of eleven. A move up is charged for the rest of the period; a move down is credited to your next bill. Switching between monthly and yearly starts a new period that day, less the unused part of the old one.",
  },
  {
    q: "Which currency will I pay in?",
    a: "Prices show in your own currency, based on where you are, and already include VAT. What you see is what you pay.",
  },
  {
    q: "What happens if I stop paying?",
    a: "Your workspace becomes read-only: you can still see every record, but you can't add or change anything, and no messages go to your patients. We keep your records for 90 days, and renewing unlocks everything at once.",
  },
  {
    q: "Is my clinic data private?",
    a: "Records live in authenticated, access-controlled storage, with privacy and security built in from day one, not bolted on later.",
  },
  {
    q: "Do you offer refunds?",
    a: (
      <>
        Yes, within 14 days of your first payment. See our{" "}
        <Link href="/refund" className="font-medium text-primary underline-offset-4 hover:underline">
          refund policy
        </Link>{" "}
        for the details.
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
            <PlanFinder pricing={planPricing()} />
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border/60 py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader className="mb-12" lead="Everything in Basic," rest="and more in Pro." />
          <Reveal>
            <CompareTable pricing={planPricing()} />
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
