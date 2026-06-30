"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { Magnetic } from "../motion/magnetic";

/** Light-gradient accent for use inside a dark hero headline. */
export function Highlight({ children }: { children: ReactNode }) {
  return (
    <span className="bg-[linear-gradient(110deg,#9ec3ff,#ffffff_62%)] bg-clip-text text-transparent">{children}</span>
  );
}

/**
 * Cinematic dark hero band shared by the inner marketing pages. Sits under the
 * transparent (overlay) header, mirrors the home hero's brand mesh, and centers
 * an eyebrow + headline + copy + CTAs. Optional `children` render a visual below.
 */
export function InnerHero({
  eyebrow,
  title,
  copy,
  primaryHref = "/sign-up",
  primaryLabel = "Start free",
  secondaryHref,
  secondaryLabel,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  copy: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  children?: ReactNode;
}) {
  return (
    <section className="vela-night relative isolate overflow-hidden px-4 pb-20 pt-32 text-white sm:px-6 sm:pb-24 sm:pt-36 lg:px-8">
      <div aria-hidden className="vela-mesh absolute -inset-[20%] -z-20 opacity-55" />
      <div aria-hidden className="vela-grid-texture absolute inset-0 -z-10 opacity-40" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-[46rem] max-w-full -translate-x-1/2 bg-[radial-gradient(circle,rgba(100,182,255,0.22),transparent_65%)] blur-3xl"
      />

      {/* CSS-driven stagger (see globals.css) so the inner-page hero paints with
          the HTML instead of waiting on the marketing JS bundle. */}
      <div className="stagger-children mx-auto max-w-4xl text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-bold text-white/80 backdrop-blur">
          <span className="size-1.5 rounded-full bg-[#64B6FF]" />
          {eyebrow}
        </p>
        <h1 className="display-1 mt-6 text-white">{title}</h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-white/75 sm:text-lg">
          {copy}
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Magnetic>
            <Link
              href={primaryHref}
              className="vela-gradient inline-flex h-12 min-w-32 items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-field) px-6 text-sm font-bold text-white shadow-[0_18px_50px_rgba(10,34,255,0.45)] transition-transform duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/40"
            >
              {primaryLabel}
              <ArrowRight className="size-4" />
            </Link>
          </Magnetic>
          {secondaryHref && secondaryLabel ? (
            <Link
              href={secondaryHref}
              className="inline-flex h-12 min-w-32 items-center justify-center whitespace-nowrap rounded-(--radius-field) border border-white/20 bg-white/5 px-6 text-sm font-bold text-white backdrop-blur transition-[transform,background-color] duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/40"
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>

      {children ? <div className="relative mx-auto mt-14 max-w-6xl">{children}</div> : null}
    </section>
  );
}
