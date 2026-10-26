"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowUpRight } from "lucide-react";

import { changeBillingPlanAction, openBillingPortalAction } from "@/app/(workspace)/settings/billing-actions";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { fieldSelectClass } from "@/components/workspace/workspace-layout";
import type { BillingSummary } from "@/lib/billing-summary";
import { cn } from "@/lib/utils";

/**
 * Settings › Billing actions. Card, invoices and cancelling live in the billing
 * portal; switching plan or billing period happens here, after a confirm that
 * says what it costs. A clinic without a live plan is sent to choose one.
 */
export function BillingControls({ billing }: { billing: BillingSummary }) {
  const router = useRouter();
  const [choice, setChoice] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "done"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const option = billing.changeOptions[choice] ?? null;

  function openPortal() {
    setMessage(null);
    startTransition(async () => {
      const result = await openBillingPortalAction();
      if (result.ok) window.location.assign(result.url);
      else setMessage({ tone: "error", text: result.error });
    });
  }

  function switchPlan() {
    if (!option) return;
    setMessage(null);
    startTransition(async () => {
      const result = await changeBillingPlanAction({ plan: option.plan, interval: option.interval });
      setConfirming(false);
      if (result.ok) {
        setMessage({ tone: "done", text: `You're now on ${option.label}.` });
        router.refresh();
      } else {
        setMessage({ tone: "error", text: result.error });
      }
    });
  }

  if (billing.kind === "free") return null;

  return (
    <div className="space-y-3 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        {billing.kind === "needs_plan" || billing.kind === "locked" ? (
          <Link href="/checkout" className={cn(buttonVariants({ size: "sm" }), "h-9 rounded-(--radius-card)")}>
            {billing.kind === "locked" ? "Renew plan" : "Choose a plan"}
          </Link>
        ) : null}
        {billing.canManage ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openPortal}
            disabled={pending}
            className="h-9 rounded-(--radius-card) bg-white"
          >
            {billing.kind === "locked" ? "Invoices" : "Manage billing"}
            <ArrowUpRight className="size-3.5" />
          </Button>
        ) : null}
      </div>
      {billing.canManage && billing.kind === "subscribed" ? (
        <p className="text-xs text-muted-foreground">Card, invoices and cancelling are in Manage billing.</p>
      ) : null}

      {billing.changeOptions.length > 0 ? (
        <div className="space-y-2 rounded-(--radius-card) bg-[#fafbfd] p-3.5">
          <label htmlFor="billing-change-plan" className="text-sm font-medium text-foreground">
            Change plan
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              id="billing-change-plan"
              value={choice}
              onChange={(event) => {
                setChoice(Number(event.target.value));
                setConfirming(false);
              }}
              disabled={pending}
              className={cn(fieldSelectClass, "h-9 min-w-0 flex-1 text-sm")}
            >
              {billing.changeOptions.map((item, index) => (
                <option key={item.label} value={index}>
                  {item.label}
                </option>
              ))}
            </select>
            {confirming ? (
              <>
                <Button type="button" size="sm" onClick={switchPlan} disabled={pending} className="h-9 rounded-(--radius-card)">
                  Confirm switch
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className="h-9 rounded-(--radius-card)"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirming(true)}
                disabled={pending || !option}
                className="h-9 rounded-(--radius-card) bg-white"
              >
                Switch
              </Button>
            )}
          </div>
          {confirming && option ? <p className="text-sm text-muted-foreground">{option.effect}</p> : null}
        </div>
      ) : null}

      {message ? (
        <p role="status" className={cn("text-sm", message.tone === "error" ? "text-destructive" : "text-emerald-700")}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
