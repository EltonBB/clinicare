"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { upgradeToProAction } from "@/app/(workspace)/settings/billing-actions";
import { Note } from "@/components/billing/checkout-flow";
import { CheckoutShell } from "@/components/billing/checkout-shell";
import { OrderSummary } from "@/components/billing/order-summary";
import type { PaddleClientConfig } from "@/components/billing/use-paddle";
import { useI18n, useServerText } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { UpgradeQuote } from "@/lib/billing-upgrade";
import type { PaidInterval } from "@/lib/paddle/paddle-config";
import { localizedPlans } from "@/lib/public-plans";
import { cn } from "@/lib/utils";

/**
 * Upgrade → checkout → Pay (owner decision, 2026-11-09) for a clinic already
 * on Basic: Pro, what is due today (Paddle's own quote, worked out on the
 * server), and one button that charges the card on file. No card form: Paddle
 * already holds the card. With no quote there is nothing to pay yet.
 */
export function UpgradeFlow({
  clinicName,
  interval,
  endsTrial,
  quote,
  paddle,
  previewPriceId,
}: {
  clinicName: string;
  interval: PaidInterval;
  /** Still on Basic's free trial: paying ends it. */
  endsTrial: boolean;
  quote: UpgradeQuote | null;
  paddle: PaddleClientConfig | null;
  previewPriceId: string | null;
}) {
  const { m } = useI18n();
  const t = m.billing.upgrade;
  const c = m.billing.checkout;
  const o = m.billing.order;
  const pro = localizedPlans(m.common.plans).find((plan) => plan.key === "pro")!;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  const serverText = useServerText();

  // On success the action revalidates, so this page re-renders as "You're on Vela Pro".
  function pay() {
    if (!quote) return;
    setError("");
    startTransition(async () => {
      // The amounts on screen: the server charges only while Paddle still says exactly these.
      const result = await upgradeToProAction({ interval, approved: quote.approved });
      if (result.ok) return;
      setError(result.error);
      // Re-ask Paddle: the amount may differ on a retry.
      router.refresh();
    });
  }

  return (
    <CheckoutShell
      signedIn
      panelLead={t.panelLead}
      panelTail={t.panelTail}
      panel={
        <OrderSummary
          plan={pro}
          interval={interval}
          paddle={paddle}
          previewPriceId={previewPriceId}
          heading={t.heading}
          trial={null}
          lines={
            quote
              ? [
                  { label: o.dueToday, value: quote.dueToday },
                  {
                    label: fmt(o.from, { date: quote.nextOn }),
                    value: fmt(o.aPeriod, { price: quote.recurring, period: interval === "YEAR" ? o.year : o.month }),
                  },
                ]
              : undefined
          }
        />
      }
    >
      <p className="mb-3 text-sm font-semibold text-primary">{t.eyebrow}</p>
      <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
        {fmt(t.lead, { clinic: clinicName || "Vela" })} <span className="text-muted-foreground">{t.rest}</span>
      </h1>

      <div className="mt-8">
        {/* Monthly or yearly re-asks Paddle on the server for that period's quote. */}
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={c.billingPeriod}>
          {(["MONTH", "YEAR"] as const).map((option) => (
            <Link
              key={option}
              href={`/checkout?plan=pro&interval=${option === "YEAR" ? "year" : "month"}`}
              replace
              scroll={false}
              aria-current={interval === option ? "true" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color] duration-(--duration-base) active:scale-[0.97]",
                interval === option
                  ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white"
                  : "border-border bg-white text-muted-foreground hover:border-[var(--brand-ink)]/30 hover:text-foreground",
                pending && "pointer-events-none opacity-60"
              )}
            >
              {option === "MONTH" ? c.monthly : c.yearly}
            </Link>
          ))}
        </div>

        {quote ? (
          <button
            type="button"
            onClick={pay}
            disabled={pending}
            className="inline-flex h-12 w-full items-center justify-center rounded-(--radius-mkt-field) bg-[var(--brand-ink)] px-5 text-sm font-semibold text-white transition-[transform,background-color] duration-(--duration-base) ease-out-quint hover:bg-[var(--brand-ink)]/90 active:scale-[0.98] disabled:opacity-60"
          >
            {pending ? t.paying : quote.nothingDue ? t.upgradeNow : fmt(t.pay, { amount: quote.dueToday })}
          </button>
        ) : (
          <p role="alert" className="rounded-(--radius-mkt-field) bg-muted px-4 py-3 text-sm text-muted-foreground">
            {t.noQuote}
          </p>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {serverText(error)}
          </p>
        ) : null}
        <Note>{endsTrial ? t.noteTrial : t.noteChange}</Note>
        <Link
          href="/dashboard?settings=billing"
          className="mt-1 inline-flex h-10 w-full items-center justify-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-[var(--brand-ink)] hover:underline"
        >
          {t.back}
        </Link>
      </div>
    </CheckoutShell>
  );
}
