"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowUpRight } from "lucide-react";

import {
  changeBillingPlanAction,
  endProTrialAction,
  keepProAction,
  openBillingPortalAction,
  startProTrialAction,
  type BillingActionResult,
} from "@/app/(workspace)/settings/billing-actions";
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
export function BillingControls({
  billing,
  onChanged,
}: {
  billing: BillingSummary;
  /** Reloads the popup's own copy of the plan, which router.refresh() doesn't reach. */
  onChanged: () => Promise<void>;
}) {
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

  function runProTrial(action: () => Promise<BillingActionResult>, done: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setMessage({ tone: "done", text: done });
        router.refresh();
      } else {
        setMessage({ tone: "error", text: result.error });
      }
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
        setChoice(0);
        router.refresh();
        await onChanged();
      } else {
        setMessage({ tone: "error", text: result.error });
      }
    });
  }

  if (billing.kind === "free") return null;

  return (
    <div className="space-y-3 pt-1">
      {billing.proTrial ? (
        <div className="space-y-2 rounded-(--radius-card) bg-primary/6 p-3.5">
          {billing.proTrial.state === "offered" ? (
            <>
              <p className="text-sm font-semibold text-foreground">Try Pro free for 14 days</p>
              <p className="text-sm text-muted-foreground">
                Reports, no-show tracking and every automation, on us. Your Basic plan and billing stay the same.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => runProTrial(startProTrialAction, "Your Pro trial has started.")}
                disabled={pending}
                className="h-9 rounded-(--radius-card)"
              >
                Start Pro trial
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">Pro trial until {billing.proTrial.endsOn}</p>
              <p className="text-sm text-muted-foreground">
                After that you go back to Basic, unless you keep Pro. Keeping it charges the difference for the rest
                of this period now.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => runProTrial(keepProAction, "You're on Pro now.")}
                  disabled={pending || !billing.canManage}
                  className="h-9 rounded-(--radius-card)"
                >
                  Keep Pro
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => runProTrial(endProTrialAction, "You're back on Basic.")}
                  disabled={pending}
                  className="h-9 rounded-(--radius-card)"
                >
                  Back to Basic
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
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
