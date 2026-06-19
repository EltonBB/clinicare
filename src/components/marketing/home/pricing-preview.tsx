"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal, RevealGroup, RevealItem } from "../motion/reveal";
import { Magnetic } from "../motion/magnetic";
import { PlanCard } from "../shared/plan-card";
import { publicPlans } from "@/lib/public-plans";

export function PricingPreview() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      <Reveal className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="eyebrow text-muted-foreground">Pricing</p>
          <h2 className="mt-3 display-2 text-[var(--brand-ink)]">Start simple. Grow into deeper insight.</h2>
          <p className="mt-5 text-base leading-8 text-muted-foreground">
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
      <RevealGroup className="mt-12 grid gap-5 md:grid-cols-2 md:items-stretch">
        {publicPlans.map((plan) => (
          <RevealItem key={plan.key} className="h-full">
            <PlanCard plan={plan} />
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}
