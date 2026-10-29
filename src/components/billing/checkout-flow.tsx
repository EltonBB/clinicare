"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";

import { CheckoutShell } from "@/components/billing/checkout-shell";
import { OrderSummary } from "@/components/billing/order-summary";
import {
  onPaddleEvent,
  type PaddleCheckoutData,
  type PaddleClientConfig,
  useLocalizedPrices,
  usePaddle,
} from "@/components/billing/use-paddle";
import { checkoutPriceId, TRIAL_DAYS } from "@/lib/checkout-state";
import type { PaidInterval, PaidPlan, PriceTable } from "@/lib/paddle/paddle-config";
import { publicPlans, type PublicPlan } from "@/lib/public-plans";
import { cn } from "@/lib/utils";

type FlowStage = { kind: "sign_up" } | { kind: "onboarding" } | { kind: "subscribe"; trialAvailable: boolean };

const STEPS = ["Account", "Clinic", "Plan"] as const;
const FRAME_CLASS = "paddle-checkout-frame";

function paidPlan(plan: PublicPlan): PaidPlan {
  return plan.key === "pro" ? "PRO" : "BASIC";
}

/**
 * Choosing a plan and paying for it, on one page. The plan picker drives the
 * order on the ink panel; once the clinic exists, Paddle's card form is
 * embedded right under the picker (Paddle's inline checkout), so paying never
 * leaves Vela's page. The clinic's id rides along as custom data for the
 * webhook, and nothing in the app changes until that signed webhook arrives
 * (see /checkout/success).
 */
export function CheckoutFlow({
  stage,
  locked,
  paddle,
  prices,
  initialPlan,
  initialInterval,
  email,
  businessId,
  clinicName,
  trialEndsOn,
}: {
  stage: FlowStage;
  locked: boolean;
  paddle: PaddleClientConfig | null;
  prices: PriceTable | null;
  initialPlan: PublicPlan["key"];
  initialInterval: PaidInterval;
  email: string;
  businessId: string;
  clinicName: string;
  trialEndsOn: string;
}) {
  const [planKey, setPlanKey] = useState(initialPlan);
  const [interval, setBillingInterval] = useState(initialInterval);
  const [checkout, setCheckout] = useState<PaddleCheckoutData | null>(null);
  const plan = publicPlans.find((item) => item.key === planKey) ?? publicPlans[1];
  const trial = stage.kind === "subscribe" ? stage.trialAvailable : true;
  const previewIds = prices
    ? publicPlans.map((item) => prices[paidPlan(item)][interval].noTrial)
    : [];
  const localized = useLocalizedPrices(paddle, previewIds);
  const priceId = prices && stage.kind === "subscribe" ? checkoutPriceId(prices, paidPlan(plan), interval, trial) : null;

  function choose(nextPlan: PublicPlan["key"], nextInterval: PaidInterval) {
    setPlanKey(nextPlan);
    setBillingInterval(nextInterval);
    // Keeps a refresh or a shared link on the same choice without a server round trip.
    window.history.replaceState(null, "", `/checkout?plan=${nextPlan}&interval=${nextInterval === "YEAR" ? "year" : "month"}`);
  }

  const step = stage.kind === "sign_up" ? 0 : stage.kind === "onboarding" ? 1 : 2;
  const showSteps = trial && !locked;
  const lines = locked
    ? (["Your records are waiting.", "Pick up where you left off."] as const)
    : trial
      ? (["Try it for 14 days.", "Pay nothing until then."] as const)
      : (["One plan for the whole clinic.", "Change it any time."] as const);

  return (
    <CheckoutShell
      signedIn={stage.kind !== "sign_up"}
      panelLead={lines[0]}
      panelTail={lines[1]}
      panel={
        <OrderSummary
          plan={plan}
          interval={interval}
          paddle={paddle}
          previewPriceId={prices ? prices[paidPlan(plan)][interval].noTrial : null}
          heading="Your order"
          trial={trial}
          trialEndsOn={trialEndsOn}
          checkout={stage.kind === "subscribe" ? checkout : null}
        />
      }
    >
      {showSteps ? (
        <div className="mb-8">
          <div className="flex gap-1.5" aria-hidden>
            {STEPS.map((label, index) => (
              <span
                key={label}
                className={cn("h-1 flex-1 rounded-full", index <= step ? "bg-[var(--brand-ink)]" : "bg-border")}
              />
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>
        </div>
      ) : (
        <p className="mb-3 text-sm font-semibold text-primary">{locked ? "Renew" : "Choose a plan"}</p>
      )}

      <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
        {headline(stage, locked, clinicName)}
      </h1>

      <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label="Billing period">
        {(["MONTH", "YEAR"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={interval === option}
            onClick={() => choose(planKey, option)}
            className={cn(
              "h-9 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color] duration-(--duration-base) focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 active:scale-[0.97]",
              interval === option
                ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white"
                : "border-border bg-white text-muted-foreground hover:border-[var(--brand-ink)]/30 hover:text-foreground"
            )}
          >
            {option === "MONTH" ? "Monthly" : "Yearly · 1 month free"}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-2.5" role="radiogroup" aria-label="Plan">
        {publicPlans.map((item) => {
          const selected = item.key === planKey;
          const id = prices ? prices[paidPlan(item)][interval].noTrial : null;
          const price = (id && localized[id]) || (interval === "YEAR" ? item.yearlyPrice : item.price);
          return (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(item.key, interval)}
              className={cn(
                "flex items-start gap-3.5 rounded-(--radius-mkt-card) p-4 text-left transition-[box-shadow,background-color] duration-(--duration-base) ease-out-quint focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 active:scale-[0.99]",
                selected
                  ? "bg-[var(--brand-wash)]/60 shadow-[inset_0_0_0_2px_var(--brand-ink)]"
                  : "shadow-[inset_0_0_0_1px_var(--border)] hover:shadow-[inset_0_0_0_1px_rgba(20,21,47,0.35)]"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-(--duration-base)",
                  selected ? "bg-[var(--brand-ink)] text-white" : "border border-border"
                )}
              >
                {selected ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-base font-semibold text-[var(--brand-ink)]">{item.name}</span>
                  <span className="text-sm text-muted-foreground">
                    <span className="text-base font-semibold text-[var(--brand-ink)] tabular-nums">{price}</span> /
                    {interval === "YEAR" ? " year" : " month"}
                  </span>
                </span>
                <span className="mt-1 block text-[13px] leading-5 text-muted-foreground">{item.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        <Action
          stage={stage}
          locked={locked}
          paddle={paddle}
          priceId={priceId}
          email={email}
          businessId={businessId}
          onCheckout={setCheckout}
        />
      </div>
    </CheckoutShell>
  );
}

function headline(stage: FlowStage, locked: boolean, clinicName: string) {
  if (stage.kind === "sign_up") {
    return (
      <>
        Pick a plan, <span className="text-muted-foreground">then create your account.</span>
      </>
    );
  }
  if (stage.kind === "onboarding") {
    return (
      <>
        Pick a plan, <span className="text-muted-foreground">then set up your clinic.</span>
      </>
    );
  }
  if (locked) {
    return (
      <>
        Renew your plan, <span className="text-muted-foreground">keep every record.</span>
      </>
    );
  }
  return (
    <>
      {stage.trialAvailable ? "Start your free trial" : "Choose your plan"}
      <span className="text-muted-foreground">{clinicName ? ` for ${clinicName}.` : "."}</span>
    </>
  );
}

function Action({
  stage,
  locked,
  paddle,
  priceId,
  email,
  businessId,
  onCheckout,
}: {
  stage: FlowStage;
  locked: boolean;
  paddle: PaddleClientConfig | null;
  priceId: string | null;
  email: string;
  businessId: string;
  onCheckout: (data: PaddleCheckoutData) => void;
}) {
  if (stage.kind === "sign_up") {
    return (
      <>
        <InkLink href="/sign-up">Create your account</InkLink>
        <Note>Your {TRIAL_DAYS}-day free trial starts once your clinic is set up.</Note>
      </>
    );
  }
  if (stage.kind === "onboarding") {
    return (
      <>
        <InkLink href="/onboarding">Set up your clinic</InkLink>
        <Note>Your {TRIAL_DAYS}-day free trial starts once your clinic is set up.</Note>
      </>
    );
  }
  if (!paddle || !priceId) {
    return (
      <>
        <p className="flex h-12 items-center justify-center gap-2 rounded-(--radius-mkt-field) bg-muted text-sm font-semibold text-muted-foreground">
          <LockKeyhole className="size-4" aria-hidden />
          Card payment opens soon
        </p>
        <Note>
          Until then we switch your plan on with you.{" "}
          <Link href="/contact" className="font-medium text-[var(--brand-ink)] underline-offset-4 hover:underline">
            Talk to us
          </Link>
        </Note>
      </>
    );
  }
  return (
    <>
      <p className="text-sm font-semibold text-foreground">Payment details</p>
      <InlineCheckout paddle={paddle} priceId={priceId} email={email} businessId={businessId} onCheckout={onCheckout} />
      {locked ? (
        <Link
          href="/dashboard"
          className="mt-2 inline-flex h-10 w-full items-center justify-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-[var(--brand-ink)] hover:underline"
        >
          View your records (read-only)
        </Link>
      ) : null}
    </>
  );
}

/**
 * Paddle's card form, embedded in the page. Opened once Paddle.js is ready;
 * a plan or period change swaps the item in place instead of reopening.
 */
function InlineCheckout({
  paddle: paddleConfig,
  priceId,
  email,
  businessId,
  onCheckout,
}: {
  paddle: PaddleClientConfig;
  priceId: string;
  email: string;
  businessId: string;
  onCheckout: (data: PaddleCheckoutData) => void;
}) {
  const router = useRouter();
  const { paddle, failed } = usePaddle(paddleConfig);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const openedWith = useRef<string | null>(null);

  const handle = useCallback(
    (event: { name?: string; data?: PaddleCheckoutData }) => {
      if (event.name === "checkout.completed") {
        router.push("/checkout/success");
        return;
      }
      if (event.name === "checkout.loaded") setLoaded(true);
      if (event.name === "checkout.error" && !loaded) setBroken(true);
      // Loaded, updated, items.updated, customer…: every checkout event with totals carries the current order.
      if (event.name?.startsWith("checkout.") && event.data?.totals) onCheckout(event.data);
    },
    [router, onCheckout, loaded]
  );
  useEffect(() => onPaddleEvent(handle), [handle]);

  useEffect(() => {
    if (!paddle) return;
    if (openedWith.current === null) {
      paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        ...(email ? { customer: { email } } : {}),
        customData: { businessId },
        settings: {
          displayMode: "inline",
          frameTarget: FRAME_CLASS,
          frameInitialHeight: 450,
          frameStyle: "width: 100%; min-width: 312px; background-color: transparent; border: none;",
          variant: "one-page",
          allowLogout: false,
          showAddDiscounts: false,
          theme: "light",
          locale: "en",
        },
      });
    } else if (openedWith.current !== priceId) {
      paddle.Checkout.updateItems([{ priceId, quantity: 1 }]);
    }
    openedWith.current = priceId;
  }, [paddle, priceId, email, businessId]);

  useEffect(
    () => () => {
      openedWith.current = null;
      window.Paddle?.Checkout.close();
    },
    []
  );

  if (failed || broken) {
    return (
      <p role="alert" className="mt-3 rounded-(--radius-mkt-field) bg-muted px-4 py-3 text-sm text-muted-foreground">
        {broken
          ? "The payment form couldn't open. Refresh the page, or write to us if it keeps happening."
          : "The payment form didn't load. Turn off any content blocker for this page, then refresh."}
      </p>
    );
  }

  return (
    <div className="relative mt-3 min-h-[450px]">
      {loaded ? null : (
        <div aria-hidden className="absolute inset-0 space-y-3 motion-safe:animate-pulse">
          <div className="h-12 rounded-(--radius-mkt-field) bg-muted" />
          <div className="h-12 rounded-(--radius-mkt-field) bg-muted" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-12 rounded-(--radius-mkt-field) bg-muted" />
            <div className="h-12 rounded-(--radius-mkt-field) bg-muted" />
          </div>
          <div className="h-12 rounded-(--radius-mkt-field) bg-muted/70" />
        </div>
      )}
      <div className={cn(FRAME_CLASS, "relative")} />
    </div>
  );
}

const inkLinkClass =
  "group/next inline-flex h-12 w-full items-center justify-center gap-2 rounded-(--radius-mkt-field) bg-[var(--brand-ink)] px-5 text-sm font-semibold text-white transition-[transform,background-color] duration-(--duration-base) ease-out-quint hover:bg-[var(--brand-ink)]/90 active:scale-[0.98]";

export function InkLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={inkLinkClass}>
      {children}
      <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/next:translate-x-0.5" />
    </Link>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">{children}</p>;
}
