import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { SUPPORT_EMAIL } from "@/lib/public-contact";
import { cn } from "@/lib/utils";
import { MarketingShell } from "@/components/marketing/shell/marketing-shell";
import { WordReveal } from "@/components/marketing/motion/word-reveal";
import { LegalToc } from "./legal-toc";

export type LegalSection = {
  title: string;
  body: string[];
};

const POLICIES = [
  { key: "terms", label: "Terms", href: "/terms-and-conditions" },
  { key: "privacy", label: "Privacy", href: "/privacy" },
  { key: "refund", label: "Refunds", href: "/refund" },
] as const;

type LegalPageProps = {
  current: (typeof POLICIES)[number]["key"];
  title: string;
  description: string;
  lastUpdated: string;
  sections: LegalSection[];
};

/**
 * A policy as a readable document inside the marketing shell: a switcher
 * between the three policies, a scroll-tracking table of contents, and plain
 * typography instead of a card around every section.
 */
export function LegalPage({ current, title, description, lastUpdated, sections }: LegalPageProps) {
  const items = sections.map((section) => ({ id: slugify(section.title), title: section.title }));

  return (
    <MarketingShell>
      <section className="pb-16 pt-24 sm:pb-20 sm:pt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav aria-label="Policies" className="section-reveal inline-flex rounded-full border border-border/70 bg-white p-1">
            {POLICIES.map((policy) => (
              <Link
                key={policy.key}
                href={policy.href}
                aria-current={policy.key === current ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-(--duration-base) ease-out-quint",
                  policy.key === current ? "bg-[var(--brand-ink)] text-white" : "text-muted-foreground hover:text-[var(--brand-ink)]",
                )}
              >
                {policy.label}
              </Link>
            ))}
          </nav>
          <h1 className="display-1 mt-8 max-w-4xl text-balance text-[var(--brand-ink)]">
            <WordReveal>{title}</WordReveal>
          </h1>
          <div className="hero-follow">
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">{description}</p>
            <p className="mt-6 text-sm font-medium text-[var(--brand-ink)]">Last updated {lastUpdated}</p>
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-20 lg:px-8">
          <div className="hidden lg:block">
            <LegalToc items={items} />
          </div>

          <article className="max-w-3xl">
            {sections.map((section, i) => (
              <section
                key={section.title}
                id={items[i].id}
                className="scroll-mt-28 border-b border-border/60 py-10 first:pt-0 last:border-b-0"
              >
                <h2 className="text-2xl font-semibold tracking-tight text-[var(--brand-ink)]">{section.title}</h2>
                <div className="mt-4 space-y-4">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="text-base leading-8 text-muted-foreground">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}

            <div className="mt-6 rounded-(--radius-mkt-card) border border-border/70 bg-[var(--brand-wash)]/40 p-8">
              <p className="text-lg font-semibold text-[var(--brand-ink)]">Questions about this policy?</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                For account, privacy, billing, or data requests, write to us directly.
              </p>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="group/mail mt-5 inline-flex items-center gap-2 text-base font-semibold text-[var(--brand-ink)]"
              >
                <span className="relative">
                  {SUPPORT_EMAIL}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-primary transition-transform duration-(--duration-slow) ease-out-quint group-hover/mail:scale-x-100"
                  />
                </span>
                <ArrowUpRight className="size-4 text-primary transition-transform duration-(--duration-base) ease-out-quint group-hover/mail:-translate-y-0.5 group-hover/mail:translate-x-0.5" />
              </a>
            </div>
          </article>
        </div>
      </section>
    </MarketingShell>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
