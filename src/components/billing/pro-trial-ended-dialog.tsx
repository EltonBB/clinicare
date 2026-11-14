"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { stayOnBasicAfterTrialAction } from "@/app/(workspace)/settings/billing-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/client";

/**
 * When the free Pro trial ran out (lib/pro-trial.ts `proTrialEndedAt`): upgrade
 * to Pro, or stay on Basic. Staying (or closing the popup) is saved, so it asks
 * no more on any device. Upgrading goes to checkout and saves nothing: paid, the
 * clinic is on Pro and the popup is gone; not paid, it asks again.
 */
export function ProTrialEndedDialog() {
  const t = useI18n().m.settings.billing.trialEnded;
  const router = useRouter();
  const [open, setOpen] = useState(true);

  function stay() {
    setOpen(false);
    // Best effort: if saving fails, the popup simply asks again next time.
    stayOnBasicAfterTrialAction().catch(() => null);
  }

  function upgrade() {
    setOpen(false);
    router.push("/checkout?plan=pro");
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : stay())}>
      <DialogContent className="gap-0 p-0 sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="gap-2 px-5 pb-5 pt-5">
          <DialogTitle className="text-lg">{t.title}</DialogTitle>
          <DialogDescription className="leading-6">{t.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={stay}>
            {t.stay}
          </Button>
          <Button type="button" onClick={upgrade}>
            {t.upgrade}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
