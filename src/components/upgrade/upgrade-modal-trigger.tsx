"use client";

import Link from "next/link";
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
          "max-w-md overflow-hidden rounded-[1.15rem] border border-border bg-card p-0 shadow-[0_24px_80px_rgba(15,23,42,0.12)]",
          className
        )}
      >
        <div className="space-y-7 bg-[linear-gradient(180deg,rgba(92,143,212,0.05),transparent_38%)] px-6 py-6">
          <DialogHeader className="items-center text-center">
            <div className="relative flex size-16 items-center justify-center rounded-[1.35rem] bg-primary/12 text-primary">
              <div className="absolute inset-0 rounded-[1.35rem] bg-primary/8 blur-[18px] motion-safe:animate-pulse" />
              <Lock className="relative z-10 size-6" />
            </div>
            <DialogTitle className="mt-4 text-2xl font-semibold text-foreground">
              {title}
            </DialogTitle>
            <DialogDescription className="max-w-sm text-sm leading-7">
              {description}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-[1rem] border border-border/80 bg-white/82 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Pro access</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Payments are not connected yet, but the upgrade path is ready. Use
                  this flow to review what Pro unlocks and prepare the account for
                  live billing later.
                </p>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="border-t border-border bg-muted/15 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <DialogClose
            className={cn(
              buttonVariants({ variant: "outline", size: "default" }),
              "h-11 min-w-[132px] rounded-[0.85rem] bg-white/84 px-5"
            )}
          >
            Maybe later
          </DialogClose>
          <Link
            href="/pricing"
            className={cn(
              buttonVariants({ variant: "default", size: "default" }),
              "h-11 min-w-[160px] rounded-[0.85rem] px-5 transition-transform duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:hover:brightness-[1.02] motion-safe:active:translate-y-0 motion-safe:active:scale-[0.98]"
            )}
          >
            Upgrade now
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
