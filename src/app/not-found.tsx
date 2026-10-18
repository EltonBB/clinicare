import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { MarketingShell } from "@/components/marketing/shell/marketing-shell";
import { Highlight, WordReveal } from "@/components/marketing/motion/word-reveal";

export const metadata: Metadata = { title: "Page not found | Vela" };

const nextStops = [
  { href: "/product", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
  { href: "/login", label: "Log in" },
];

/**
 * An unknown public URL. It renders inside the marketing shell (header and
 * footer), so a mistyped link still lands on the site rather than a bare card.
 * Workspace routes have their own not-found page inside the app shell.
 */
export default function RootNotFound() {
  return (
    <MarketingShell>
      <section className="pb-24 pt-24 sm:pb-32 sm:pt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold text-primary">404</p>
          <h1 className="display-2 mt-3 max-w-3xl text-balance text-[var(--brand-ink)]">
            <WordReveal>
              This page <Highlight>isn&apos;t here.</Highlight>
            </WordReveal>
          </h1>
          <div className="hero-follow">
            <p className="mt-6 max-w-md text-lg leading-8 text-muted-foreground">
              It may have moved, or the link is out of date.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Link
                href="/"
                className="group/home inline-flex h-12 items-center gap-2 rounded-(--radius-field) bg-[var(--brand-ink)] px-6 text-[15px] font-semibold text-white transition-[background-color,transform] duration-(--duration-base) ease-out-quint hover:bg-[var(--brand-ink)]/90 active:scale-[0.97]"
              >
                Back to home
                <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/home:translate-x-0.5" />
              </Link>
              <nav aria-label="Other pages" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
                {nextStops.map((stop) => (
                  <Link
                    key={stop.href}
                    href={stop.href}
                    className="text-muted-foreground transition-colors duration-(--duration-base) hover:text-[var(--brand-ink)]"
                  >
                    {stop.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
