"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, CircleDollarSign, Lock, Sparkles } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

type BillingCycle = "monthly" | "annual";

type Plan = {
  name: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  yearlySavings: string;
  description: string;
  featureIntro: string;
  features: string[];
  benchmark: string;
  highlighted?: boolean;
};

const plans: Plan[] = [
  {
    name: "Basic",
    monthlyPrice: 39,
    annualMonthlyPrice: 32,
    yearlySavings: "Save $84/year",
    description:
      "The core platform for a solo practitioner or small operation. No setup, no integrations, and no technical overhead.",
    featureIntro:
      "Everything needed to run daily operations with clarity and speed:",
    features: [
      "Appointment scheduling with recurring bookings, buffer times, and custom staff hours.",
      "Client profiles with contact details, appointment history, notes, and custom fields.",
      "Unified messaging inbox for WhatsApp and Viber conversations linked to each client.",
      "Automated reminders with confirm, cancel, and reschedule flows from the client phone.",
    ],
    benchmark:
      "Cliniko charges $45/month for a single practitioner with no messaging layer. Vela includes WhatsApp and Viber at $39.",
  },
  {
    name: "Pro",
    monthlyPrice: 79,
    annualMonthlyPrice: 65,
    yearlySavings: "Save $168/year",
    description:
      "For growing teams that need more structure, automation, and visibility without moving into enterprise software.",
    featureIntro: "Everything in Basic, plus the tools to run a real team:",
    features: [
      "Staff management and roles with individual schedules, availability, and access levels for up to 10 seats.",
      "Waitlist engine that automatically fills open slots through WhatsApp or Viber notifications.",
      "Digital intake forms sent before appointments and stored directly on the client record.",
      "Basic reporting for appointment volume, no-show rates, and staff utilisation.",
    ],
    benchmark:
      "SimplePractice's group plan starts at $158/month. Jane App charges per practitioner on top of a base fee. Vela Pro is $79 flat.",
    highlighted: true,
  },
];

function priceFor(plan: Plan, cycle: BillingCycle) {
  return cycle === "monthly" ? plan.monthlyPrice : plan.annualMonthlyPrice;
}

function cadenceLabel(cycle: BillingCycle) {
  return cycle === "monthly" ? "Billed monthly" : "Billed annually";
}

export function PricingPlans() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");

  const pricingLabel = useMemo(
    () =>
      billingCycle === "monthly"
        ? "Flexible monthly billing"
        : "Annual billing with lower monthly cost",
    [billingCycle]
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <BrandMark href="/dashboard" />
          <Link href="/dashboard" className="text-sm text-muted-foreground">
            Back to app
          </Link>
        </div>

        <div className="flex flex-1 flex-col py-10 sm:py-14">
          <section className="section-reveal mx-auto w-full max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-white/76 px-3 py-1 text-xs font-medium text-muted-foreground shadow-[0_14px_28px_rgba(20,32,51,0.04)] backdrop-blur-sm">
              <CircleDollarSign className="size-3.5 text-primary" />
              Pricing
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Clear pricing for every stage of growth
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              Start with the core operating system, then move into Pro when the
              clinic needs reporting, premium workflow controls, and stronger team
              structure.
            </p>

            <div className="mt-8 inline-flex items-center gap-2 rounded-[0.9rem] border border-border/80 bg-white/76 p-1 shadow-[0_16px_32px_rgba(20,32,51,0.05)] backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={cn(
                  "rounded-[0.75rem] px-4 py-2 text-sm font-medium transition-colors",
                  billingCycle === "monthly"
                    ? "bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(20,32,51,0.08)]"
                    : "text-muted-foreground"
                )}
              >
                Billed monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("annual")}
                className={cn(
                  "rounded-[0.75rem] px-4 py-2 text-sm font-medium transition-colors",
                  billingCycle === "annual"
                    ? "bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(20,32,51,0.08)]"
                    : "text-muted-foreground"
                )}
              >
                Billed annually
              </button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{pricingLabel}</p>
          </section>

          <section className="section-reveal-delayed mt-12 grid gap-5 lg:grid-cols-2">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={cn(
                  "relative flex h-full flex-col overflow-hidden rounded-[1.2rem] border border-border/80 bg-[#f7f9fc] px-6 py-6 shadow-[0_16px_38px_rgba(20,32,51,0.04)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:shadow-[0_24px_54px_rgba(20,32,51,0.07)]",
                  plan.highlighted &&
                    "border-primary/35 bg-[linear-gradient(180deg,rgba(38,137,135,0.05),rgba(247,249,252,0.98)_34%)] ring-1 ring-primary/15"
                )}
              >
                {plan.highlighted ? (
                  <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(38,137,135,0.55),transparent)]" />
                ) : null}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {plan.highlighted ? "Growth plan" : "Core plan"}
                    </p>
                    <h2 className="text-2xl font-semibold text-foreground">
                      {plan.name}
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">
                      {plan.description}
                    </p>
                  </div>
                  {plan.highlighted ? (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                      Most popular
                    </span>
                  ) : null}
                </div>

                  <div className="mt-8 rounded-[1rem] border border-border/70 bg-white px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                  <div className="flex items-end gap-2">
                    <span className="text-[2.6rem] font-semibold tracking-tight text-foreground">
                      ${priceFor(plan, billingCycle)}
                    </span>
                    <span className="pb-1 text-sm text-muted-foreground">
                      /month
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {cadenceLabel(billingCycle)}
                  </p>
                  <p className="mt-1 text-sm font-medium text-primary">
                    {plan.yearlySavings}
                  </p>
                  <Link
                    href={plan.highlighted ? "/settings" : "/dashboard"}
                    className={cn(
                      buttonVariants({
                        variant: plan.highlighted ? "default" : "outline",
                        size: "lg",
                      }),
                      "mt-5 h-11 w-full justify-center rounded-[0.95rem]"
                    )}
                  >
                    {plan.highlighted ? "Prepare Pro upgrade" : "Current core plan"}
                  </Link>
                </div>

                <div className="mt-6 flex-1 border-t border-border/75 pt-6">
                  <p className="text-sm font-medium text-foreground">
                    {plan.featureIntro}
                  </p>
                  <div className="mt-4 space-y-4">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-3">
                        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Check className="size-3" />
                        </div>
                        <p className="text-sm leading-7 text-muted-foreground">
                          {feature}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 rounded-[1rem] border border-border/70 bg-white px-4 py-4">
                  <p className="text-sm leading-7 text-muted-foreground">
                    {plan.benchmark}
                  </p>
                </div>
              </article>
            ))}
          </section>

          <section className="section-reveal mt-10 overflow-hidden rounded-[1.2rem] border border-border/80 bg-white shadow-[0_20px_46px_rgba(20,32,51,0.05)]">
            <div className="grid grid-cols-[minmax(0,1.2fr)_180px_180px] border-b border-border/75 bg-[#f8fafc] px-6 py-4 text-sm font-semibold text-foreground">
              <p>Features</p>
              <p className="text-center">Basic</p>
              <p className="text-center">Pro</p>
            </div>
            <div className="divide-y divide-border/70">
              {[
                ["Appointment scheduling", "Included", "Included"],
                ["Unified client profiles", "Included", "Included"],
                ["Messaging inbox", "Included", "Included"],
                ["Automated reminders", "Included", "Included"],
                ["Staff management", "Limited", "Expanded"],
                ["Reporting", "Locked", "Included"],
                ["Premium workflow surfaces", "Locked", "Included"],
              ].map(([feature, basic, pro]) => (
                <div
                  key={feature}
                  className="grid grid-cols-[minmax(0,1.2fr)_180px_180px] items-center px-6 py-4 text-sm"
                >
                  <p className="font-medium text-foreground">{feature}</p>
                  <p className="text-center text-muted-foreground">{basic}</p>
                  <p className="text-center text-muted-foreground">{pro}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="section-reveal mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="rounded-[1.15rem] border border-border/80 bg-white/80 px-6 py-6 shadow-[0_24px_52px_rgba(20,32,51,0.05)] backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-5" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold text-foreground">
                    Billing rollout status
                  </h2>
                  <p className="text-sm leading-7 text-muted-foreground">
                    The billing structure is in place across Vela. Plans, locked
                    features, and upgrade flows are ready, while live payment
                    collection will be connected later.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.15rem] border border-border/80 bg-muted/30 px-6 py-6 shadow-[0_18px_40px_rgba(20,32,51,0.04)]">
              <div className="flex items-center gap-2 text-foreground">
                <Lock className="size-4 text-primary" />
                <h2 className="text-base font-semibold">What happens next</h2>
              </div>
              <div className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">
                <p>Pick the plan that matches the clinic.</p>
                <p>Keep using Basic or prepare Pro access in settings.</p>
                <p>Connect live checkout later without rebuilding the billing UI.</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
