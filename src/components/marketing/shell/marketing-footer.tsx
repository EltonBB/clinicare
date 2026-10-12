import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Magnetic } from "../motion/magnetic";
import { Reveal } from "../motion/reveal";
import { FooterWordmark } from "./footer-wordmark";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Overview", href: "/product" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms-and-conditions" },
      { label: "Privacy", href: "/privacy" },
      { label: "Refund", href: "/refund" },
    ],
  },
];

/**
 * The ink footer every marketing page ends on. Pages that close on a call to
 * action (`cta`, optionally with their own closing line) get it as the
 * footer's opening line, so the last screen is one
 * dark stage: the ask, the links, and a giant cursor-lit "Vela" cropped by the
 * bottom of the page.
 */
/** A page's own closing line for the footer CTA; `true` uses the default. */
export type FooterCta = boolean | { lead: string; rest: string; copy: string };

const DEFAULT_CTA = {
  lead: "Give the day back",
  rest: "to the people running it.",
  copy: "Appointments, patients, staff, and messages in one calm workspace, from your first day.",
};

export function MarketingFooter({ cta = false }: { cta?: FooterCta }) {
  const year = new Date().getFullYear();
  const ask = cta === true ? DEFAULT_CTA : cta || null;

  return (
    <footer data-tone="dark" className="relative overflow-hidden bg-[var(--brand-ink)] text-white">
      {ask ? (
        <div className="mx-auto max-w-7xl px-4 pb-20 pt-24 sm:px-6 sm:pb-24 sm:pt-32 lg:px-8">
          <Reveal>
            <h2 className="display-1 max-w-5xl text-balance">
              {ask.lead} <span className="text-white/45">{ask.rest}</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1} className="mt-12 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-md text-lg leading-8 text-white/60">{ask.copy}</p>
            <div className="flex flex-wrap gap-3">
              <Magnetic>
                <Link
                  href="/sign-up"
                  className="inline-flex h-12 min-w-32 items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-mkt-field) bg-white px-6 text-sm font-semibold text-[var(--brand-ink)] transition-transform duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/40"
                >
                  Start free
                  <ArrowRight className="size-4" />
                </Link>
              </Magnetic>
              <Link
                href="/contact"
                className="inline-flex h-12 min-w-32 items-center justify-center whitespace-nowrap rounded-(--radius-mkt-field) border border-white/20 px-6 text-sm font-semibold text-white transition-[border-color,transform] duration-(--duration-base) ease-out-quint hover:border-white/50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/40"
              >
                Talk to us
              </Link>
            </div>
          </Reveal>
        </div>
      ) : null}

      <div className={"mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 " + (cta ? "" : "pt-16 sm:pt-20")}>
        <div className={"grid grid-cols-2 gap-10 sm:grid-cols-[1.5fr_1fr_1fr_1fr] " + (cta ? "border-t border-white/10 pt-14" : "")}>
          <div className="col-span-2 max-w-xs sm:col-span-1">
            <BrandMark href="/" includeSubtitle={false} tone="light" />
            <p className="mt-4 text-sm leading-6 text-white/55">The calm operating system for clinics.</p>
          </div>

          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-xs font-semibold text-white/40">{col.title}</p>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/75 transition-colors duration-(--duration-base) hover:text-white focus-visible:text-white focus-visible:outline-none"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-2 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Vela</p>
          <p>Privacy-conscious by design.</p>
        </div>
      </div>

      <FooterWordmark className="-mb-[4.5vw] mt-8 sm:mt-12" />
    </footer>
  );
}
