import { CheckCircle2, CreditCard, LockKeyhole, MessageCircle, ShieldCheck } from "lucide-react";
import type { ElementType } from "react";

import { MarketingShell } from "../shell/marketing-shell";
import { InnerHero, Highlight } from "../shared/inner-hero";
import { CtaBand } from "../shared/cta-band";
import { InteractivePlans } from "../shared/interactive-plans";
import { Reveal, RevealGroup, RevealItem } from "../motion/reveal";
import { publicPlans } from "@/lib/public-plans";

const includes: { icon: ElementType<{ className?: string }>; label: string }[] = [
  { icon: ShieldCheck, label: "No credit card to start" },
  { icon: CreditCard, label: "Simple monthly pricing" },
  { icon: LockKeyhole, label: "Privacy-conscious storage" },
  { icon: MessageCircle, label: "Setup support included" },
];

const comparison: [string, string, string][] = [
  ["Appointments and calendar", "Included", "Included"],
  ["Patient record timeline", "Included", "Included"],
  ["Documents, scans, and images", "Included", "Included"],
  ["WhatsApp-ready inbox", "Included", "Included"],
  ["Operational reports", "Basic", "Advanced"],
  ["AI-assisted insights", "Limited", "Full"],
  ["Staff activity & utilization", "—", "Included"],
  ["Setup support", "Standard", "Priority"],
];

const faqs: { q: string; a: string }[] = [
  {
    q: "How do I get started?",
    a: "Create a free account and set up your workspace. You can explore Vela and organize your clinic before choosing a paid plan.",
  },
  {
    q: "What's the difference between Basic and Pro?",
    a: "Basic covers daily operations — scheduling, records, documents, payments, and inbox. Pro adds advanced reports, AI-assisted insights, staff utilization, and priority support.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. You can move between Basic and Pro as your clinic grows — your workspace and data stay exactly as they are.",
  },
  {
    q: "How is billing handled?",
    a: "Online card checkout is being prepared. For now, we help activate the right plan for your workspace during setup, so nothing is charged automatically.",
  },
  {
    q: "Is my clinic data private?",
    a: "Records live in authenticated, access-controlled storage, built with GDPR's data-protection principles in mind from day one.",
  },
  {
    q: "Do you offer refunds?",
    a: "See our refund policy for the full details on plan changes and cancellations.",
  },
];

export function PricingPageContent() {
  return (
    <MarketingShell overlay>
      <InnerHero
        eyebrow="Pricing"
        title={
          <>
            Simple pricing for <Highlight>real clinic work</Highlight>.
          </>
        }
        copy="Start with the operating system. Upgrade when deeper reporting, AI insights, and operational analytics become part of weekly management."
        primaryHref="/sign-up"
        primaryLabel="Start free"
        secondaryHref="/contact"
        secondaryLabel="Talk to us"
      />

      {/* plans */}
      <section className="relative mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/4 -z-10 mx-auto h-72 max-w-3xl rounded-full bg-[radial-gradient(circle,rgba(10,34,255,0.1),transparent_68%)] blur-3xl"
        />
        <Reveal>
          <InteractivePlans plans={publicPlans} />
        </Reveal>

        <Reveal className="mt-6 grid grid-cols-2 gap-3 rounded-(--radius-hero) border border-border/80 bg-[var(--brand-wash)]/40 p-4 sm:grid-cols-4">
          {includes.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2.5 rounded-(--radius-field) bg-white p-3.5 shadow-[0_10px_26px_rgba(20,21,47,0.04)]">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-tile) bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <p className="text-xs font-bold leading-4 text-[var(--brand-ink)]">{label}</p>
            </div>
          ))}
        </Reveal>
      </section>

      {/* comparison */}
      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6 lg:px-8">
        <Reveal className="mx-auto mb-8 max-w-2xl text-center">
          <p className="eyebrow text-primary">Compare plans</p>
          <h2 className="mt-3 display-3 text-[var(--brand-ink)]">Everything in Basic, and more in Pro.</h2>
        </Reveal>
        <Reveal className="overflow-hidden rounded-(--radius-hero) border border-border/80 bg-white shadow-[0_24px_80px_rgba(20,21,47,0.06)]">
          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.7fr)_minmax(0,0.7fr)] border-b border-border/70 bg-[var(--brand-wash)]/55 px-3 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground sm:px-5 sm:text-[11px] sm:tracking-[0.14em]">
            <span className="truncate">Feature</span>
            <span className="truncate text-center">Basic</span>
            <span className="truncate text-center text-primary">Pro</span>
          </div>
          {comparison.map(([feature, basic, pro]) => (
            <div
              key={feature}
              className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.7fr)_minmax(0,0.7fr)] items-center border-b border-border/70 px-3 py-3.5 text-[13px] font-semibold text-foreground transition-colors duration-(--duration-base) last:border-b-0 hover:bg-[var(--brand-wash)]/45 sm:px-5 sm:text-sm"
            >
              <span className="truncate pr-2">{feature}</span>
              <span className="truncate text-center text-muted-foreground">{cell(basic)}</span>
              <span className="truncate text-center">{cell(pro, true)}</span>
            </div>
          ))}
        </Reveal>
      </section>

      {/* faq */}
      <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6 lg:px-8">
        <Reveal className="mx-auto mb-10 max-w-2xl text-center">
          <p className="eyebrow text-primary">Questions</p>
          <h2 className="mt-3 display-3 text-[var(--brand-ink)]">Pricing, answered.</h2>
        </Reveal>
        <RevealGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {faqs.map((faq) => (
            <RevealItem key={faq.q} className="rounded-(--radius-hero) border border-border/80 bg-white p-6 shadow-[0_16px_44px_rgba(20,21,47,0.045)]">
              <h3 className="text-base font-bold text-[var(--brand-ink)]">{faq.q}</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{faq.a}</p>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      <CtaBand
        title="Pick a plan when you're ready."
        copy="Start free today. Plans activate when you choose to grow into deeper reporting and operational insight."
      />
    </MarketingShell>
  );
}

function cell(value: string, pro = false) {
  if (value === "Included") {
    return <CheckCircle2 className={"mx-auto size-4 " + (pro ? "text-primary" : "text-emerald-500")} />;
  }
  if (value === "—") {
    return <span className="text-muted-foreground/50">—</span>;
  }
  return <span className={pro ? "font-bold text-primary" : ""}>{value}</span>;
}
