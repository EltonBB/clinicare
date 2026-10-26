"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";

import { type PaddleClientConfig, usePaddle } from "@/components/billing/use-paddle";
import { cn } from "@/lib/utils";

/**
 * Opens Paddle's checkout over the page for one price. The clinic's id rides
 * along as custom data, so the subscription webhook knows which workspace it
 * belongs to; the signed-in owner's email is prefilled. Nothing changes in the
 * app until Paddle's signed webhook arrives (see /checkout/success).
 */
export function PaddleCheckoutButton({
  paddle: paddleConfig,
  priceId,
  email,
  businessId,
  label,
  className,
}: {
  paddle: PaddleClientConfig;
  priceId: string;
  email: string;
  businessId: string;
  label: string;
  className?: string;
}) {
  const paddle = usePaddle(paddleConfig);

  function open() {
    paddle?.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: { email },
      customData: { businessId },
      settings: {
        displayMode: "overlay",
        theme: "light",
        locale: "en",
        successUrl: `${window.location.origin}/checkout/success`,
      },
    });
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={!paddle}
      aria-busy={!paddle}
      className={cn(
        "group/next inline-flex h-12 w-full items-center justify-center gap-2 rounded-(--radius-mkt-field) bg-[var(--brand-ink)] px-5 text-sm font-semibold text-white transition-[transform,background-color,opacity] duration-(--duration-base) ease-out-quint hover:bg-[var(--brand-ink)]/90 active:scale-[0.98] disabled:opacity-60",
        className
      )}
    >
      {paddle ? null : <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
      {label}
      {paddle ? (
        <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/next:translate-x-0.5" />
      ) : null}
    </button>
  );
}
