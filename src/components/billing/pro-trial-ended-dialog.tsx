"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

function readAnswered(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * When the free Pro trial ran out (lib/pro-trial.ts `proTrialEndedAt`): upgrade
 * to Pro, or stay on Basic. Staying needs nothing doing (the clinic is back on
 * Basic already), so an answer is only remembered on this device, per trial.
 */
export function ProTrialEndedDialog({ businessId, endedAt }: { businessId: string; endedAt: string }) {
  const t = useI18n().m.settings.billing.trialEnded;
  const key = `vela:pro-trial-ended:${businessId}:${endedAt}`;
  // Closed on the server and until the browser says it hasn't been answered here.
  const answered = useSyncExternalStore(noSubscribe, () => readAnswered(key), () => true);
  const [closed, setClosed] = useState(false);

  function answer() {
    setClosed(true);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Private mode: it asks again next time, which is harmless.
    }
  }

  return (
    <Dialog open={!answered && !closed} onOpenChange={(open) => (open ? null : answer())}>
      <DialogContent className="gap-0 p-0 sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="gap-2 px-5 pb-5 pt-5">
          <DialogTitle className="text-lg">{t.title}</DialogTitle>
          <DialogDescription className="leading-6">{t.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={answer}>
            {t.stay}
          </Button>
          <Link href="/checkout?plan=pro" onClick={answer} className={cn(buttonVariants())}>
            {t.upgrade}
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
