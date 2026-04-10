import type { BusinessPlan, BusinessPlanStatus } from "@prisma/client";

export type ActiveBusinessPlan = "BASIC" | "PRO";

export function normalizeBusinessPlan(plan: BusinessPlan): ActiveBusinessPlan {
  if (plan === "PRO" || plan === "ADVANCED") {
    return "PRO";
  }

  return "BASIC";
}

export function isProBusinessPlan(plan: BusinessPlan) {
  return normalizeBusinessPlan(plan) === "PRO";
}

export function planDisplayName(plan: BusinessPlan) {
  return normalizeBusinessPlan(plan) === "PRO" ? "Pro" : "Basic";
}

export function planStatusLabel(status: BusinessPlanStatus) {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "CANCELED":
      return "canceled";
    case "INACTIVE":
      return "inactive";
    case "TRIALING":
      return "active";
    default:
      return "active";
  }
}
