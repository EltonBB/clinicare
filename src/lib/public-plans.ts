export type PublicPlanKey = "basic" | "pro";

export type PublicPlan = {
  key: PublicPlanKey;
  name: string;
  price: string;
  cadence: string;
  description: string;
  audience: string;
  features: string[];
  highlighted?: boolean;
};

export const publicPlans: PublicPlan[] = [
  {
    key: "basic",
    name: "Basic",
    price: "$39",
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
      "Basic operational reports",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "$79",
    cadence: "per month",
    description:
      "For growing clinics that need deeper intelligence, team visibility, and stronger support.",
    audience: "Best for clinics that want reporting, staff visibility, and launch support.",
    features: [
      "Everything in Basic",
      "Advanced AI reports and diagnosis",
      "Staff activity and utilization",
      "More workflow automation",
      "Priority setup support",
      "Launch-ready clinic operations",
    ],
    highlighted: true,
  },
];

export function getPublicPlan(plan?: string | string[]) {
  const value = Array.isArray(plan) ? plan[0] : plan;
  return publicPlans.find((item) => item.key === value) ?? publicPlans[1];
}
