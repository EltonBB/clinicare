"use client";

import { type PaddleClientConfig, useLocalizedPrices } from "@/components/billing/use-paddle";

/**
 * A price in the visitor's own currency (tax included), from Paddle. Shows the
 * list price until Paddle answers, or for good when billing is off.
 */
export function LocalizedPrice({
  paddle,
  priceId,
  fallback,
}: {
  paddle: PaddleClientConfig | null;
  priceId: string | null;
  fallback: string;
}) {
  const prices = useLocalizedPrices(paddle, priceId ? [priceId] : []);
  return <>{(priceId && prices[priceId]) || fallback}</>;
}
