"use client";

import { Check } from "lucide-react";

import {
  type PaddleCheckoutData,
  type PaddleClientConfig,
  useLocalizedPrices,
} from "@/components/billing/use-paddle";
import type { PaidInterval } from "@/lib/paddle/paddle-config";
import type { PublicPlan } from "@/lib/public-plans";

/**
 * The order, printed on checkout's ink panel. Before Paddle answers it shows
 * the plan's price; once the embedded checkout reports its totals (the
 * visitor's currency, tax and the trial worked out by Paddle) those replace it,
 * so what the panel says is what the card is charged.
 */
export function OrderSummary({
  plan,
  interval,
  paddle,
  previewPriceId,
  heading,
  trial,
  trialEndsOn,
  checkout,
}: {
  plan: PublicPlan;
  interval: PaidInterval;
  paddle: PaddleClientConfig | null;
  previewPriceId: string | null;
  /** "Your order", "Your plan"… */
  heading: string;
  /** Whether this order starts with the free trial; null for a plan already running. */
  trial: boolean | null;
  /** "November 10, 2026": when a trial started today ends (worked out on the server). */
  trialEndsOn?: string;
  checkout?: PaddleCheckoutData | null;
}) {
  const prices = useLocalizedPrices(paddle, previewPriceId ? [previewPriceId] : []);
  const listPrice = (previewPriceId && prices[previewPriceId]) || (interval === "YEAR" ? plan.yearlyPrice : plan.price);
  const per = interval === "YEAR" ? "year" : "month";
  const money = moneyFormatter(checkout?.currency_code);
  const recurring = checkout?.recurring_totals ?? null;
  const dueToday = money && checkout?.totals?.total !== undefined ? money(checkout.totals.total) : null;
  // The price per period: Paddle's live amount (the currency it will charge, tax
  // worked out) once checkout reports it, the preview until then.
  const price = money && recurring?.total !== undefined ? money(recurring.total) : listPrice;
  const tax = money ? (trial ? recurring?.tax : checkout?.totals?.tax) : undefined;

  return (
    <div>
      <p className="text-sm text-white/55">{heading}</p>
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <p className="text-xl font-semibold">Vela {plan.name}</p>
        <p className="text-sm text-white/55">{interval === "YEAR" ? "Billed yearly" : "Billed monthly"}</p>
      </div>
      <p className="mt-5 flex items-baseline gap-2">
        <span className="text-[3.25rem] font-semibold leading-none tracking-[-0.04em] tabular-nums">{price}</span>
        <span className="text-sm text-white/55">per {per}</span>
      </p>

      {trial !== null ? (
        <dl className="mt-8 divide-y divide-white/10 border-y border-white/10 text-sm">
          <Row label="Due today" value={dueToday ?? (trial ? "Nothing" : listPrice)} />
          {trial && trialEndsOn ? <Row label={`From ${trialEndsOn}`} value={`${price} a ${per}`} /> : null}
          {tax !== undefined && money ? <Row label="VAT included" value={money(tax)} /> : null}
        </dl>
      ) : null}

      <ul className="mt-8 grid gap-2.5 text-sm">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-white/80">
            <Check className="mt-0.5 size-4 shrink-0 text-white/40" aria-hidden />
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3.5">
      <dt className="text-white/55">{label}</dt>
      <dd className="font-medium tabular-nums text-white">{value}</dd>
    </div>
  );
}

function moneyFormatter(currency: string | undefined) {
  if (!currency) return null;
  try {
    const format = new Intl.NumberFormat("en", { style: "currency", currency });
    return (amount: number) => format.format(amount);
  } catch {
    return null;
  }
}
