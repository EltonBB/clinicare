"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { answerProTrialEndAction } from "@/app/(workspace)/settings/billing-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/client";

/**
 * When the free Pro trial ran out (lib/pro-trial.ts `proTrialEndedAt`): upgrade
 * to Pro, or stay on Basic. Either answer is recorded on the server, so the
 * popup asks once, on any device; staying needs nothing more (the clinic is
 * back on Basic already).
 */
export function ProTrialEndedDialog() {
  const t = useI18n().m.settings.billing.trialEnded;
  const router = useRouter();
  const [open, setOpen] = useState(true);

  function answer(upgrade: boolean) {
    setOpen(false);
    // Best effort, and never in the way: if it fails, the popup simply asks again next time.
    answerProTrialEndAction().catch(() => null);
    if (upgrade) router.push("/checkout?plan=pro");
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : answer(false))}>
      <DialogContent className="gap-0 p-0 sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="gap-2 px-5 pb-5 pt-5">
          <DialogTitle className="text-lg">{t.title}</DialogTitle>
          <DialogDescription className="leading-6">{t.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => answer(false)}>
            {t.stay}
          </Button>
          <Button type="button" onClick={() => answer(true)}>
            {t.upgrade}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
