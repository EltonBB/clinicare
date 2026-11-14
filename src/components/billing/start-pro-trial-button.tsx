"use client";

import { useState, useTransition } from "react";

import { startProTrialAction } from "@/app/(workspace)/settings/billing-actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { useServerText } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Starts the free Pro trial in place, beside an Upgrade button. */
export function StartProTrialButton({ label, className }: { label: string; className?: string }) {
  const serverText = useServerText();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function start() {
    setError("");
    startTransition(async () => {
      const result = await startProTrialAction();
      // On success the action revalidates, so this page re-renders on Pro.
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      <button type="button" onClick={start} disabled={pending} className={cn(buttonVariants({ variant: "outline" }), className)}>
        {label}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {serverText(error)}
        </p>
      ) : null}
    </>
  );
}
