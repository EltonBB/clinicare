"use client";

import Link from "next/link";
import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

type UpgradeModalTriggerProps = {
  label?: string;
  className?: string;
  triggerClassName?: string;
  title?: string;
  description?: string;
};

export function UpgradeModalTrigger({
  label = "Upgrade now",
  className,
  triggerClassName,
  title = "Unlock Pro features",
  description = "Upgrade to Vela Pro to access reports, premium workflow tools, and the next layer of operational visibility.",
}: UpgradeModalTriggerProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const priceLabel = billingCycle === "monthly" ? "$79" : "$65";
  const cadenceLabel =
    billingCycle === "monthly" ? "/mo billed monthly" : "/mo billed annually";

  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          "inline-flex text-sm font-medium text-primary",
          triggerClassName
        )}
      >
        {label}
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-w-lg overflow-hidden rounded-[1.15rem] border border-border bg-card p-0 shadow-[0_24px_80px_rgba(15,23,42,0.12)]",
          className
        )}
      >
        <div className="space-y-7 bg-[linear-gradient(180deg,rgba(242,246,252,0.98),rgba(255,255,255,0.96)_38%)] px-6 py-6">
          <DialogHeader className="items-center text-center">
            <div className="relative flex size-16 items-center justify-center rounded-[1.35rem] bg-primary/10 text-primary">
              <div className="absolute -left-8 top-2 size-8 rounded-full bg-primary/10 blur-[2px]" />
              <div className="absolute -right-10 -top-2 size-7 rounded-full bg-chart-2/10 blur-[2px]" />
              <div className="absolute -bottom-4 right-6 size-6 rounded-full bg-primary/8 blur-[2px]" />
              <Lock className="relative z-10 size-6" />
            </div>
            <DialogTitle className="mt-4 text-2xl font-semibold text-foreground">
              {title}
            </DialogTitle>
            <DialogDescription className="max-w-sm text-sm leading-7">
              {description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Select your plan</p>
              <div className="grid grid-cols-2 gap-2 rounded-[1rem] border border-border/80 bg-white/86 p-1.5">
                <button
                  type="button"
                  onClick={() => setBillingCycle("monthly")}
                  className={cn(
                    "rounded-[0.8rem] px-4 py-3 text-left transition-[background-color,border-color,color,transform] duration-200",
                    billingCycle === "monthly"
                      ? "bg-white text-foreground shadow-[0_12px_24px_rgba(20,32,51,0.08)] ring-1 ring-primary/18"
                      : "text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Monthly</span>
                    {billingCycle === "monthly" ? (
                      <span className="size-3 rounded-full border-[3px] border-primary" />
                    ) : (
                      <span className="size-3 rounded-full border border-border/90" />
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle("annual")}
                  className={cn(
                    "rounded-[0.8rem] px-4 py-3 text-left transition-[background-color,border-color,color,transform] duration-200",
                    billingCycle === "annual"
                      ? "bg-white text-foreground shadow-[0_12px_24px_rgba(20,32,51,0.08)] ring-1 ring-primary/18"
                      : "text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Annual</span>
                    <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                      Best value
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <div className="rounded-[1rem] border border-border/80 bg-white/82 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">What you get</p>
                  <ul className="space-y-2.5 pt-1 text-sm leading-6 text-muted-foreground">
                    <li className="flex items-start gap-2.5">
                      <span className="mt-1 size-2 rounded-full bg-primary" />
                      Reports and visibility tools for appointments, performance, and growth.
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="mt-1 size-2 rounded-full bg-primary" />
                      Premium workflow surfaces and cleaner operational controls.
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="mt-1 size-2 rounded-full bg-primary" />
                      Billing structure ready now, with live checkout connected later.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="border-t border-border bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-left">
            <p className="text-[2rem] font-semibold tracking-tight text-foreground">
              {priceLabel}
              <span className="ml-1 text-base font-medium text-muted-foreground">
                {cadenceLabel}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              Switch plans later when live payments go online.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px]">
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "default", size: "default" }),
                "h-11 rounded-[0.85rem] px-5 transition-transform duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:hover:brightness-[1.02] motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98]"
              )}
            >
              Upgrade to Pro
            </Link>
            <DialogClose
              className={cn(
                buttonVariants({ variant: "ghost", size: "default" }),
                "h-10 rounded-[0.85rem] text-muted-foreground"
              )}
            >
              Maybe later
            </DialogClose>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
