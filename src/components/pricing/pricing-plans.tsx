"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, CircleDollarSign } from "lucide-react";

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
  {
    name: "Advanced",
    monthlyPrice: 119,
    annualMonthlyPrice: 99,
    yearlySavings: "Save $240/year",
    description:
      "For operations that need the intelligence layer: revenue protection, retention signals, and multi-location scale.",
    featureIntro:
      "Everything in Pro, plus the tools that usually live in enterprise platforms:",
    features: [
      "No-show intelligence that flags high-risk bookings and recommends extra follow-up.",
      "Retention alerts with one-tap re-engagement messaging for clients who have not returned.",
      "Advanced analytics across revenue, lifetime value, staff performance, and messaging channels.",
      "Multi-location support with shared records, shared conversations, and unlimited seats.",
    ],
    benchmark:
      "These capabilities usually live in systems costing $300–500/month. Vela delivers them at a fraction of that.",
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
          <section className="mx-auto w-full max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <CircleDollarSign className="size-3.5 text-primary" />
              Pricing
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Clear pricing for every stage of growth
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              Start with the core operating system, add team structure when you
              need it, and unlock the intelligence layer when the business is
              ready to scale.
            </p>

            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-border bg-card p-1">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  billingCycle === "monthly"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                )}
              >
                Billed monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("annual")}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  billingCycle === "annual"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                )}
              >
                Billed annually
              </button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{pricingLabel}</p>
          </section>

          <section className="mt-12 grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={cn(
                  "flex h-full flex-col rounded-[1rem] border border-border bg-card px-5 py-5 transition-transform duration-150",
                  plan.highlighted && "border-primary/35"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-foreground">
                      {plan.name}
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">
                      {plan.description}
                    </p>
                  </div>
                  {plan.highlighted ? (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      Most popular
                    </span>
                  ) : null}
                </div>

                <div className="mt-8 border-t border-border pt-6">
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-semibold tracking-tight text-foreground">
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
                </div>

                <Link
                  href="/dashboard"
                  className={cn(
                    buttonVariants({
                      variant: plan.highlighted ? "default" : "outline",
                      size: "lg",
                    }),
                    "mt-6 h-11 w-full justify-center rounded-[0.75rem]"
                  )}
                >
                  Select plan
                </Link>

                <div className="mt-6 flex-1 border-t border-border pt-6">
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

                <div className="mt-6 border-t border-border pt-5">
                  <p className="text-sm leading-7 text-muted-foreground">
                    {plan.benchmark}
                  </p>
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
