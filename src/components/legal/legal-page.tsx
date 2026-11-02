import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { legalLastUpdatedOn, policySections, type Policy } from "@/lib/legal-content";
import { SUPPORT_EMAIL } from "@/lib/public-contact";
import { formatZonedFullDate } from "@/lib/time-zone";
import { cn } from "@/lib/utils";
import { MarketingShell } from "@/components/marketing/shell/marketing-shell";
import { WordReveal } from "@/components/marketing/motion/word-reveal";
import { LegalToc } from "./legal-toc";

export type LegalSection = {
  title: string;
  body: string[];
};

const POLICIES = [
  { key: "terms", href: "/terms-and-conditions" },
  { key: "privacy", href: "/privacy" },
  { key: "refund", href: "/refund" },
] as const;

/**
 * A policy as a readable document inside the marketing shell: a switcher
 * between the three policies, a scroll-tracking table of contents, and plain
 * typography instead of a card around every section.
 */
export async function LegalPage({ policy: current }: { policy: Policy }) {
  const { locale, m } = await getI18n();
  const copy = m.legal;
  const { title, description } = copy[current];
  const sections = policySections(copy, current);
  const lastUpdated = formatZonedFullDate(legalLastUpdatedOn, undefined, locale);
  const items = sections.map((section) => ({ id: slugify(section.title), title: section.title }));

  return (
    <MarketingShell>
      <section className="pb-16 pt-24 sm:pb-20 sm:pt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav aria-label={copy.chrome.policiesNav} className="section-reveal inline-flex rounded-full border border-border/70 bg-white p-1">
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
                {copy.chrome.policies[policy.key]}
              </Link>
            ))}
          </nav>
          <h1 className="display-1 mt-8 max-w-4xl text-balance text-[var(--brand-ink)]">
            <WordReveal>{title}</WordReveal>
          </h1>
          <div className="hero-follow">
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">{description}</p>
            <p className="mt-6 text-sm font-medium text-[var(--brand-ink)]">{fmt(copy.chrome.lastUpdated, { date: lastUpdated })}</p>
            {locale === "en" ? null : <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.chrome.translationNote}</p>}
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 py-16 sm:py-24">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-20 lg:px-8">
          <div className="hidden lg:block">
            <LegalToc items={items} labels={{ onThisPage: copy.chrome.onThisPage, minRead: copy.chrome.minRead }} />
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
              <p className="text-lg font-semibold text-[var(--brand-ink)]">{copy.chrome.questions}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {copy.chrome.questionsCopy}
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
    // Albanian letters keep their base letter in the anchor ("ë" → "e", "ç" → "c").
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
