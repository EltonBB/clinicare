"use client";

import { type PaddleClientConfig, useLocalizedPrices } from "@/components/billing/use-paddle";
import { firstChargeLine } from "@/lib/checkout-state";
import type { PaidInterval } from "@/lib/paddle/paddle-config";

/** "Free until …, then €39 a month." in the visitor's currency, under the pay button. */
export function FirstChargeLine({
  paddle,
  priceId,
  fallbackPrice,
  interval,
  trialAvailable,
}: {
  paddle: PaddleClientConfig | null;
  priceId: string | null;
  fallbackPrice: string;
  interval: PaidInterval;
  trialAvailable: boolean;
}) {
  const prices = useLocalizedPrices(paddle, priceId ? [priceId] : []);
  const price = (priceId && prices[priceId]) || fallbackPrice;
  return <>{firstChargeLine({ trialAvailable, price, interval })}</>;
}
