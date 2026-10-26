"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";

import { checkoutReadyAction } from "@/app/checkout/actions";

const POLL_MS = 2_000;
const PATIENCE_MS = 60_000;

/**
 * After Paddle's checkout: waits for the subscription webhook to switch the
 * workspace on, then opens it. Usually a few seconds; after a minute it says so
 * and offers a refresh instead of spinning forever.
 */
export function CheckoutSuccess() {
  const router = useRouter();
  const [state, setState] = useState<"waiting" | "ready" | "slow">("waiting");

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function check() {
      const { ready } = await checkoutReadyAction().catch(() => ({ ready: false }));
      if (cancelled) return;
      if (ready) {
        setState("ready");
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      if (Date.now() - startedAt > PATIENCE_MS) setState("slow");
      timer = setTimeout(check, POLL_MS);
    }
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="max-w-md text-center" role="status" aria-live="polite">
      {state === "ready" ? (
        <Check className="mx-auto size-6 text-primary" aria-hidden />
      ) : (
        <LoaderCircle className="mx-auto size-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
      )}
      <h1 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-[var(--brand-ink)]">
        {state === "ready" ? "You're all set" : "Setting up your plan"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {state === "slow"
          ? "This is taking longer than usual. Your payment details are safe; refresh in a minute, or write to us if it doesn't clear."
          : "This takes a few seconds. We'll open your workspace as soon as it's ready."}
      </p>
      {state === "slow" ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 text-sm font-semibold text-[var(--brand-ink)] underline-offset-4 hover:underline"
        >
          Refresh
        </button>
      ) : null}
    </div>
  );
}
