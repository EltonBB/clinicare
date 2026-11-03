import type { BusinessPlan } from "@prisma/client";

import type { Messages } from "@/i18n/messages";

export type PublicPlanKey = "basic" | "pro";

export type PublicPlan = {
  key: PublicPlanKey;
  rank: number;
  name: string;
  price: string;
  /** The yearly price: twelve months for the price of eleven. */
  yearlyPrice: string;
  cadence: string;
  description: string;
  audience: string;
  features: string[];
  highlighted?: boolean;
};

export const publicPlans: PublicPlan[] = [
  {
    key: "basic",
    rank: 1,
    name: "Basic",
    price: "€35",
    yearlyPrice: "€400",
    cadence: "per month",
    description:
      "For solo practitioners and small clinics that need one clean daily workspace.",
    audience: "Best for a clinic starting with scheduling, records, and daily operations.",
    features: [
      "Calendar and appointment pages",
      "Client records and notes",
      "Documents, images, and scans",
      "Payments and invoice tracking",
      "WhatsApp-ready inbox context",
      "A reminder before each visit and a thank-you after, sent automatically",
      "A daily dashboard of visits, revenue, and today's schedule",
    ],
  },
  {
    key: "pro",
    rank: 2,
    name: "Pro",
    price: "€80",
    yearlyPrice: "€850",
    cadence: "per month",
    description:
      "For growing clinics that need deeper intelligence, team visibility, and stronger support.",
    audience: "Best for clinics that want reporting, staff visibility, and launch support.",
    features: [
      "Everything in Basic",
      "Reports with AI-assisted operational insights",
      "Staff activity and utilization",
      "No-show tracking, reporting, risk alerts, automatic slot-offer drafts from your waiting list, and rebooking nudges",
      "More workflow automation",
      "Priority setup support",
      "Launch-ready clinic operations",
    ],
    highlighted: true,
  },
];

/**
 * Pro's feature list minus the "Everything in Basic" connector line — the
 * actual net-new capabilities Pro adds. Single source of truth for any
 * customer-facing copy that lists what upgrading unlocks (the Settings
 * billing card, the Reports lock screen), so they can't drift from /pricing
 * or from each other.
 */
export const proAddedFeatures = publicPlans
  .find((plan) => plan.key === "pro")!
  .features.filter((feature) => feature !== "Everything in Basic");

export const basicFeatures = publicPlans.find((plan) => plan.key === "basic")!.features;

/**
 * The plans with their words in the visitor's language (`common.plans`);
 * names, prices and keys stay as defined above.
 */
export function localizedPlans(copy: Messages["common"]["plans"]): PublicPlan[] {
  return publicPlans.map((plan) => ({
    ...plan,
    cadence: copy.perMonth,
    description: copy[plan.key].description,
    audience: copy[plan.key].audience,
    features: copy[plan.key].features,
  }));
}

export function getPublicPlan(plan?: string | string[]) {
  const value = Array.isArray(plan) ? plan[0] : plan;
  return publicPlans.find((item) => item.key === value) ?? publicPlans[1];
}

export function publicPlanKeyFromBusinessPlan(plan: BusinessPlan): PublicPlanKey {
  return plan === "PRO" || plan === "ADVANCED" ? "pro" : "basic";
}

export function publicPlanDisplayFromBusinessPlan(plan: BusinessPlan) {
  return publicPlanKeyFromBusinessPlan(plan) === "pro" ? "Pro" : "Basic";
}
