import type { BusinessPlan, BusinessPlanStatus } from "@prisma/client";

export type PublicPlanKey = "basic" | "pro";

export type PublicPlan = {
  key: PublicPlanKey;
  rank: number;
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
    rank: 1,
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
    rank: 2,
    name: "Pro",
    price: "$79",
    cadence: "per month",
    description:
      "For growing clinics that need deeper intelligence, team visibility, and stronger support.",
    audience: "Best for clinics that want reporting, staff visibility, and launch support.",
    features: [
      "Everything in Basic",
      "Advanced AI-assisted operational insights",
      "Staff activity and utilization",
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

export function getPublicPlanRank(planKey: PublicPlanKey) {
  return publicPlans.find((plan) => plan.key === planKey)?.rank ?? 0;
}

export function isBillablePlanStatus(status?: BusinessPlanStatus | null) {
  return status === "ACTIVE" || status === "TRIALING";
}

export type CheckoutPlanIntent =
  | "first_purchase"
  | "upgrade"
  | "downgrade"
  | "current_plan"
  | "reactivate";

export type CheckoutPlanState = {
  currentPlanKey: PublicPlanKey | null;
  currentPlanName: string | null;
  status: BusinessPlanStatus | null;
  statusLabel: string;
  workspaceName: string | null;
  intent: CheckoutPlanIntent;
  badge: string;
  headline: string;
  description: string;
  summaryTitle: string;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  secondaryActionHref: string;
};

export function resolveCheckoutPlanState({
  selectedPlan,
  currentPlan,
  currentPlanStatus,
  workspaceName,
  isAuthenticated,
}: {
  selectedPlan: PublicPlan;
  currentPlan?: BusinessPlan | null;
  currentPlanStatus?: BusinessPlanStatus | null;
  workspaceName?: string | null;
  isAuthenticated: boolean;
}): CheckoutPlanState {
  const currentPlanKey = currentPlan ? publicPlanKeyFromBusinessPlan(currentPlan) : null;
  const currentPlanName = currentPlan ? publicPlanDisplayFromBusinessPlan(currentPlan) : null;
  const hasBillableWorkspace = currentPlanKey && isBillablePlanStatus(currentPlanStatus);
  const selectedRank = getPublicPlanRank(selectedPlan.key);
  const currentRank = currentPlanKey ? getPublicPlanRank(currentPlanKey) : 0;
  const statusLabel = formatCheckoutPlanStatus(currentPlanStatus);

  if (!isAuthenticated || !currentPlanKey) {
    return {
      currentPlanKey,
      currentPlanName,
      status: currentPlanStatus ?? null,
      statusLabel,
      workspaceName: workspaceName ?? null,
      intent: "first_purchase",
      badge: "New subscription",
      headline: "Start your Vela subscription",
      description:
        "No active workspace plan is attached to this checkout yet. Create or sign in to an account before payment is collected.",
      summaryTitle: "First purchase",
      primaryActionLabel: "Create account before payment",
      secondaryActionLabel: isAuthenticated ? "Go to onboarding" : "Create account first",
      secondaryActionHref: isAuthenticated ? "/onboarding" : "/sign-up",
    };
  }

  if (!hasBillableWorkspace) {
    return {
      currentPlanKey,
      currentPlanName,
      status: currentPlanStatus ?? null,
      statusLabel,
      workspaceName: workspaceName ?? null,
      intent: "reactivate",
      badge: "Reactivate plan",
      headline: `Reactivate ${workspaceName ?? "this workspace"}`,
      description: `This workspace has a ${currentPlanName} plan marked ${statusLabel}. The selected ${selectedPlan.name} plan can be reactivated during setup.`,
      summaryTitle: "Reactivation",
      primaryActionLabel: `Reactivate on ${selectedPlan.name}`,
      secondaryActionLabel: "Back to settings",
      secondaryActionHref: "/settings?section=billing",
    };
  }

  if (selectedPlan.key === currentPlanKey) {
    return {
      currentPlanKey,
      currentPlanName,
      status: currentPlanStatus ?? null,
      statusLabel,
      workspaceName: workspaceName ?? null,
      intent: "current_plan",
      badge: "Current plan",
      headline: `You are already on Vela ${selectedPlan.name}`,
      description:
        "This checkout matches the workspace's current plan. Contact support if you need help reviewing or changing billing details.",
      summaryTitle: "Current subscription",
      primaryActionLabel: "Manage current plan",
      secondaryActionLabel: "Back to settings",
      secondaryActionHref: "/settings?section=billing",
    };
  }

  if (selectedRank > currentRank) {
    return {
      currentPlanKey,
      currentPlanName,
      status: currentPlanStatus ?? null,
      statusLabel,
      workspaceName: workspaceName ?? null,
      intent: "upgrade",
      badge: "Upgrade",
      headline: `Upgrade from ${currentPlanName} to ${selectedPlan.name}`,
      description:
        "The account is already subscribed to a lower plan. Plan activation is currently handled during setup so the workspace keeps the right context.",
      summaryTitle: "Plan upgrade",
      primaryActionLabel: `Upgrade to ${selectedPlan.name}`,
      secondaryActionLabel: "Back to settings",
      secondaryActionHref: "/settings?section=billing",
    };
  }

  return {
    currentPlanKey,
    currentPlanName,
    status: currentPlanStatus ?? null,
    statusLabel,
    workspaceName: workspaceName ?? null,
    intent: "downgrade",
    badge: "Downgrade",
    headline: `Downgrade from ${currentPlanName} to ${selectedPlan.name}`,
    description:
      "The account is already subscribed to a higher plan. Contact support to review the downgrade timing and keep the workspace configured correctly.",
    summaryTitle: "Plan downgrade",
    primaryActionLabel: `Downgrade to ${selectedPlan.name}`,
    secondaryActionLabel: "Back to settings",
    secondaryActionHref: "/settings?section=billing",
  };
}

export function checkoutPlanOptionLabel(plan: PublicPlan, state: CheckoutPlanState) {
  if (state.currentPlanKey === plan.key && isBillablePlanStatus(state.status)) {
    return "Current plan";
  }

  if (!state.currentPlanKey || !isBillablePlanStatus(state.status)) {
    return "Select plan";
  }

  return plan.rank > getPublicPlanRank(state.currentPlanKey) ? "Upgrade" : "Downgrade";
}

function formatCheckoutPlanStatus(status?: BusinessPlanStatus | null) {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "TRIALING":
      return "trialing";
    case "CANCELED":
      return "canceled";
    case "INACTIVE":
      return "inactive";
    default:
      return "not started";
  }
}
