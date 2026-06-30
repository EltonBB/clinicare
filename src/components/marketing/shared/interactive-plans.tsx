"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { PublicPlan } from "@/lib/public-plans";
import { PlanCard } from "./plan-card";

/**
 * The two plan cards as one simple chooser: the highlighted plan starts selected
 * and comes forward; clicking the other moves the spotlight to it. Used by both
 * the pricing page and the home pricing preview so the interaction stays identical.
 */
export function InteractivePlans({ plans, className }: { plans: PublicPlan[]; className?: string }) {
  const [selected, setSelected] = useState<string>(
    () => plans.find((p) => p.highlighted)?.key ?? plans[0]?.key ?? "",
  );

  return (
    <div className={cn("grid gap-5 md:grid-cols-2 md:items-stretch", className)}>
      {plans.map((plan) => (
        <PlanCard
          key={plan.key}
          plan={plan}
          selected={selected === plan.key}
          onSelect={() => setSelected(plan.key)}
        />
      ))}
    </div>
  );
}
