import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";

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

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="vela-night relative overflow-hidden text-white">
      <div className="vela-grid-texture pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[42rem] max-w-full -translate-x-1/2 bg-[radial-gradient(circle,rgba(100,182,255,0.22),transparent_65%)] blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <BrandMark href="/" includeSubtitle={false} tone="light" />
            <p className="mt-5 text-sm leading-7 text-white/55">
              The calm operating system for clinics — appointments, patients, staff, conversations, and
              performance in one workspace.
            </p>
            <Link
              href="/sign-up"
              className="mt-7 inline-flex h-11 items-center gap-2 rounded-(--radius-field) bg-white px-5 text-sm font-bold text-[var(--brand-ink)] shadow-[0_14px_34px_rgba(0,0,0,0.25)] transition-transform duration-(--duration-base) ease-out-quint hover:-translate-y-0.5"
            >
              Start free
              <ArrowRight className="size-4" />
            </Link>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <p className="eyebrow text-white/45">{col.title}</p>
              <ul className="mt-5 space-y-3.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm font-semibold text-white/65 transition-colors duration-(--duration-base) hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-white/45">
            © {year} Vela. The clinic operating system.
          </p>
          <p className="text-xs font-semibold text-white/45">
            Privacy-conscious by design · HIPAA-ready before the first US clinic.
          </p>
        </div>
      </div>
    </footer>
  );
}
