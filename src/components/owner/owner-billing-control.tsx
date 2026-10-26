"use client";

import { useState, useTransition } from "react";

import { offerProTrialAction, setClinicBillingAction } from "@/app/owner/actions";
import { Button } from "@/components/ui/button";
import { fieldSelectClass } from "@/components/workspace/workspace-layout";
import { cn } from "@/lib/utils";

type Choice = "FREE_BASIC" | "FREE_PRO" | "PAYING";

export function OwnerBillingControl({
  businessId,
  isFree,
  plan,
  canMakeFree,
  proTrial,
}: {
  businessId: string;
  isFree: boolean;
  plan: string;
  canMakeFree: boolean;
  proTrial: "offerable" | "offered" | "active" | null;
}) {
  const current: Choice = isFree ? (plan === "Pro" ? "FREE_PRO" : "FREE_BASIC") : "PAYING";
  const [choice, setChoice] = useState<Choice>(current);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    setError("");
    startTransition(async () => {
      const result = await setClinicBillingAction({ businessId, choice });
      if (!result.ok) setError(result.error);
    });
  }

  function offerProTrial() {
    setError("");
    startTransition(async () => {
      const result = await offerProTrialAction({ businessId });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <select
          aria-label="Billing"
          value={choice}
          onChange={(event) => setChoice(event.target.value as Choice)}
          className={cn(fieldSelectClass, "h-8 min-w-0 flex-1 text-sm")}
          disabled={pending}
        >
          <option value="FREE_BASIC" disabled={!canMakeFree}>
            Free · Basic
          </option>
          <option value="FREE_PRO" disabled={!canMakeFree}>
            Free · Pro
          </option>
          <option value="PAYING">Must pay</option>
        </select>
        <Button size="sm" variant="outline" onClick={save} disabled={pending || choice === current}>
          Save
        </Button>
      </div>
      {proTrial === "offerable" ? (
        <button
          type="button"
          onClick={offerProTrial}
          disabled={pending}
          className="w-fit text-xs font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-50"
        >
          Offer Pro trial
        </button>
      ) : proTrial ? (
        <p className="text-xs text-muted-foreground">{proTrial === "offered" ? "Pro trial offered" : "On a Pro trial"}</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
