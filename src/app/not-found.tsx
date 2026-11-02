import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { MarketingShell } from "@/components/marketing/shell/marketing-shell";
import { Highlight, WordReveal } from "@/components/marketing/motion/word-reveal";
import { buttonVariants } from "@/components/ui/button-variants";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";
import { getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.marketing.notFound.title };
}

/**
 * An unknown URL. Public visitors get it inside the marketing shell (header and
 * footer), so a mistyped link still lands on the site rather than a bare card.
 *
 * A signed-in miss under a workspace path (e.g. /clients/id/extra) also lands
 * here, not on (workspace)/not-found, because no workspace route matched. Those
 * visitors get a plain page back to the dashboard instead of the marketing
 * header's Log in / Start free. Without a session cookie getCurrentUser makes
 * no network call, so anonymous misses cost nothing extra.
 */
export default async function RootNotFound() {
  const { m } = await getI18n();
  const t = m.marketing.notFound;
  const nextStops = [
    { href: "/product", label: m.marketing.header.nav.product },
    { href: "/pricing", label: m.marketing.header.nav.pricing },
    { href: "/contact", label: m.marketing.header.nav.contact },
    { href: "/login", label: m.marketing.header.logIn },
  ];

  if (await getCurrentUser()) {
    return (
      <div className="flex min-h-dvh flex-col bg-white px-5 py-6 sm:px-10 sm:py-8">
        <BrandMark href="/dashboard" />
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-sm text-center">
            <h1 className="text-lg font-semibold text-foreground">{t.signedInTitle}</h1>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t.signedInCopy}
            </p>
            <Link href="/dashboard" className={cn(buttonVariants({ size: "sm" }), "mt-5 rounded-(--radius-tile)")}>
              {t.backToDashboard}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <WithMessages namespaces={["marketing", "modules"]}>
    <MarketingShell>
      <section className="pb-24 pt-24 sm:pb-32 sm:pt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold text-primary">404</p>
          <h1 className="display-2 mt-3 max-w-3xl text-balance text-[var(--brand-ink)]">
            <WordReveal>
              {t.lead} <Highlight>{t.highlight}</Highlight>
            </WordReveal>
          </h1>
          <div className="hero-follow">
            <p className="mt-6 max-w-md text-lg leading-8 text-muted-foreground">
              {t.copy}
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Link
                href="/"
                className="group/home inline-flex h-12 items-center gap-2 rounded-(--radius-field) bg-[var(--brand-ink)] px-6 text-[15px] font-semibold text-white transition-[background-color,transform] duration-(--duration-base) ease-out-quint hover:bg-[var(--brand-ink)]/90 active:scale-[0.97]"
              >
                {t.backHome}
                <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/home:translate-x-0.5" />
              </Link>
              <nav aria-label={t.otherPages} className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
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
    </WithMessages>
  );
}
