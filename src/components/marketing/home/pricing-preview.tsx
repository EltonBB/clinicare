"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal } from "../motion/reveal";
import { Magnetic } from "../motion/magnetic";
import { InteractivePlans } from "../shared/interactive-plans";
import { publicPlans } from "@/lib/public-plans";

export function PricingPreview() {
  return (
    <section className="relative overflow-hidden bg-[var(--brand-wash)]/40 py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-0 size-[34rem] rounded-full bg-[radial-gradient(circle,rgba(10,34,255,0.07),transparent_62%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 bottom-10 size-[32rem] rounded-full bg-[radial-gradient(circle,rgba(100,182,255,0.1),transparent_62%)] blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow text-primary">Pricing</p>
            <h2 className="mt-3 display-2 text-balance text-[var(--brand-ink)]">Start simple. Grow into deeper insight.</h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Begin with the calm daily workspace. Move to Pro when reporting, AI insights, and operational analytics
              become part of weekly management.
            </p>
          </div>
          <Magnetic className="self-start">
            <Link
              href="/pricing"
              className="inline-flex h-11 min-w-36 items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-field) border border-border/80 bg-white px-5 text-sm font-bold text-primary shadow-[0_14px_34px_rgba(20,21,47,0.05)] transition-[transform,border-color] duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 hover:border-primary/40"
            >
              View full pricing
              <ArrowRight className="size-4" />
            </Link>
          </Magnetic>
        </Reveal>
        <Reveal className="mt-12">
          <InteractivePlans plans={publicPlans} />
        </Reveal>
      </div>
    </section>
  );
}
