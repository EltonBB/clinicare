import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Check, LockKeyhole } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { FirstChargeLine } from "@/components/billing/first-charge-line";
import { LocalizedPrice } from "@/components/billing/localized-price";
import { PaddleCheckoutButton } from "@/components/billing/paddle-checkout-button";
import type { PaddleClientConfig } from "@/components/billing/use-paddle";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentUser } from "@/lib/auth";
import { workspaceAccess } from "@/lib/billing-access";
import { getCurrentBusiness } from "@/lib/business";
import { checkoutPriceId, checkoutStage, TRIAL_DAYS, type CheckoutStage } from "@/lib/checkout-state";
import { paddleConfig, type PaidInterval, type PaidPlan } from "@/lib/paddle/paddle-config";
import { getPublicPlan, publicPlans, type PublicPlan } from "@/lib/public-plans";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Checkout | Vela",
  description: "Choose your Vela plan and start your free trial.",
};

type CheckoutPageProps = {
  searchParams?: Promise<{
    plan?: string | string[];
    interval?: string | string[];
  }>;
};

const STEPS = ["Account", "Workspace", "Plan"];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function paidPlan(plan: PublicPlan): PaidPlan {
  return plan.key === "pro" ? "PRO" : "BASIC";
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  const selectedPlan = getPublicPlan(params?.plan);
  const interval: PaidInterval = first(params?.interval) === "year" ? "YEAR" : "MONTH";
  const user = await getCurrentUser();
  const business = user ? await getCurrentBusiness(user.id) : null;
  const stage = checkoutStage({ signedIn: Boolean(user), business });
  const locked = business ? workspaceAccess(business).kind === "locked" : false;

  const config = paddleConfig();
  const paddle: PaddleClientConfig | null = config ? { env: config.env, clientToken: config.clientToken } : null;
  // Prices are shown from the no-trial price (same amount): a preview of a
  // trial price can read as free.
  const previewPriceId = (plan: PublicPlan) => config?.prices[paidPlan(plan)][interval].noTrial ?? null;
  const listPrice = (plan: PublicPlan) => (interval === "YEAR" ? plan.yearlyPrice : plan.price);
  const cadence = interval === "YEAR" ? "per year" : "per month";

  const copy = stageCopy(stage, locked, selectedPlan);
  const step = stage.kind === "sign_up" ? 1 : stage.kind === "onboarding" ? 2 : stage.kind === "subscribe" ? 3 : 4;
  const href = (plan: string, nextInterval: PaidInterval) =>
    `/checkout?plan=${plan}${nextInterval === "YEAR" ? "&interval=year" : ""}`;

  return (
    <main className="grid min-h-dvh bg-white text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]">
      <div className="flex flex-col px-5 py-6 sm:px-10 sm:py-8 lg:min-h-dvh lg:px-14">
        <header className="flex items-center justify-between">
          <BrandMark href="/" includeSubtitle={false} />
          {user ? (
            <LogoutButton />
          ) : (
            <Link
              href="/pricing"
              className="group/back inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-[var(--brand-ink)]"
            >
              <ArrowLeft className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/back:-translate-x-0.5" />
              Back to pricing
            </Link>
          )}
        </header>

        <div className="flex flex-1 items-center py-12">
          <div className="w-full max-w-xl motion-safe:animate-[vela-fade-up_0.5s_var(--ease-out-expo)_both]">
            <p className="text-sm font-semibold text-primary">{copy.badge}</p>
            <h1 className="mt-3 text-balance text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.035em] text-[var(--brand-ink)]">
              {copy.headline}
            </h1>

            <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2" role="group" aria-label="Billing period">
                {(["MONTH", "YEAR"] as const).map((option) => (
                  <Link
                    key={option}
                    href={href(selectedPlan.key, option)}
                    scroll={false}
                    aria-current={interval === option ? "true" : undefined}
                    className={cn(
                      "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium transition-colors duration-(--duration-base)",
                      interval === option
                        ? "bg-[var(--brand-ink)] text-white"
                        : "text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:text-[var(--brand-ink)]"
                    )}
                  >
                    {option === "MONTH" ? "Monthly" : "Yearly · 1 month free"}
                  </Link>
                ))}
              </div>
              <Link
                href="/pricing"
                className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-[var(--brand-ink)] hover:underline"
              >
                Compare plans
              </Link>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {publicPlans.map((plan) => (
                <Link
                  key={plan.key}
                  href={href(plan.key, interval)}
                  scroll={false}
                  aria-current={plan.key === selectedPlan.key ? "true" : undefined}
                  className={cn(
                    "group/plan relative flex flex-col rounded-(--radius-mkt-card) p-5 transition-[box-shadow,background-color,transform] duration-(--duration-base) ease-out-quint active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45",
                    plan.key === selectedPlan.key
                      ? "bg-[var(--brand-wash)]/60 shadow-[inset_0_0_0_2px_var(--brand-ink)]"
                      : "shadow-[inset_0_0_0_1px_var(--border)] hover:shadow-[inset_0_0_0_1px_rgba(20,21,47,0.35)]"
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-base font-semibold text-[var(--brand-ink)]">{plan.name}</span>
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full transition-colors duration-(--duration-base)",
                        plan.key === selectedPlan.key
                          ? "bg-[var(--brand-ink)] text-white"
                          : "border border-border group-hover/plan:border-[var(--brand-ink)]/40"
                      )}
                    >
                      {plan.key === selectedPlan.key ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                  </span>
                  <span className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-[var(--brand-ink)] tabular-nums">
                      <LocalizedPrice paddle={paddle} priceId={previewPriceId(plan)} fallback={listPrice(plan)} />
                    </span>
                    <span className="text-xs text-muted-foreground">{cadence}</span>
                  </span>
                  <span className="mt-3 text-[13px] leading-5 text-muted-foreground">{plan.description}</span>
                  <span className="mt-4 text-xs font-semibold text-muted-foreground">{TRIAL_DAYS}-day free trial</span>
                </Link>
              ))}
            </div>

            <ol className="mt-10 grid grid-cols-3 gap-2" aria-label="Steps">
              {STEPS.map((label, i) => {
                const n = i + 1;
                const done = n < step;
                const now = n === step;
                return (
                  <li key={label} className="min-w-0" aria-current={now ? "step" : undefined}>
                    <span className={cn("block h-1 rounded-full", done || now ? "bg-primary" : "bg-border")} />
                    <span
                      className={cn(
                        "mt-2.5 flex items-center gap-1.5 text-xs font-medium",
                        done || now ? "text-[var(--brand-ink)]" : "text-muted-foreground"
                      )}
                    >
                      {done ? (
                        <Check className="size-3.5 shrink-0 text-primary" />
                      ) : (
                        <span className="tabular-nums text-muted-foreground">{n}</span>
                      )}
                      <span className="truncate">{label}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <LockKeyhole className="size-3.5 shrink-0" />
          Prices include VAT. Payment is handled securely by Paddle, our reseller.
          <Link href="/refund" className="font-medium text-[var(--brand-ink)] underline-offset-4 hover:underline">
            Refunds
          </Link>
        </p>
      </div>

      {/* The summary prints as a receipt on the ink side. */}
      <aside className="relative flex bg-[var(--brand-ink)] px-5 py-16 sm:px-10 lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:py-6">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <Image
            src="/brand/vela-icon.svg"
            alt=""
            width={640}
            height={640}
            className="absolute -bottom-40 -right-48 size-[40rem] max-w-none opacity-[0.08]"
          />
          <span className="absolute left-1/2 top-1/3 size-80 -translate-x-1/2 rounded-full bg-primary/30 blur-[110px]" />
        </div>

        <div className="relative m-auto w-full max-w-sm drop-shadow-[0_40px_60px_rgba(0,0,0,0.45)]">
          <div key={`${selectedPlan.key}-${interval}`} className="motion-safe:animate-[vela-print_0.8s_var(--ease-out-expo)_both]">
            <div className="rounded-t-[1.25rem] bg-white px-7 pb-5 pt-7">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand-ink)]">
                  <Image src="/brand/vela-icon.svg" alt="" width={20} height={20} aria-hidden />
                  Vela
                </span>
                <span className="rounded-full bg-[var(--brand-wash)] px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  {copy.receiptTag}
                </span>
              </div>

              <p className="mt-6 text-sm text-muted-foreground">Vela {selectedPlan.name}</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[3.25rem] font-semibold leading-none tracking-[-0.04em] text-[var(--brand-ink)] tabular-nums">
                  <LocalizedPrice paddle={paddle} priceId={previewPriceId(selectedPlan)} fallback={listPrice(selectedPlan)} />
                </span>
                <span className="text-sm text-muted-foreground">{cadence}</span>
              </p>

              <Perforation />
              <ul className="grid gap-2 text-sm">
                {selectedPlan.features.map((feature, i) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-[var(--brand-ink)] motion-safe:animate-[vela-fade-up_0.5s_var(--ease-out-expo)_both]"
                    style={{ animationDelay: `${280 + i * 50}ms` }}
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Perforation />
              {business ? (
                <dl className="mb-5 grid gap-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">Workspace</dt>
                    <dd className="truncate text-right font-medium text-[var(--brand-ink)]">{business.name}</dd>
                  </div>
                </dl>
              ) : null}

              <StageAction
                stage={stage}
                paddle={paddle}
                priceId={
                  config && stage.kind === "subscribe"
                    ? checkoutPriceId(config.prices, paidPlan(selectedPlan), interval, stage.trialAvailable)
                    : null
                }
                previewPriceId={previewPriceId(selectedPlan)}
                fallbackPrice={listPrice(selectedPlan)}
                interval={interval}
                email={user?.email ?? ""}
                businessId={business?.id ?? ""}
                locked={locked}
              />
            </div>
            {/* Torn edge */}
            <div
              aria-hidden
              className="h-3 bg-[linear-gradient(135deg,#fff_50%,transparent_50%),linear-gradient(225deg,#fff_50%,transparent_50%)] bg-[length:12px_12px] bg-repeat-x"
            />
          </div>
        </div>
      </aside>
    </main>
  );
}

function stageCopy(stage: CheckoutStage, locked: boolean, plan: PublicPlan) {
  switch (stage.kind) {
    case "free_account":
      return { badge: "Free account", headline: "Your clinic has a free account", receiptTag: "Free account" };
    case "subscribed":
      return {
        badge: "Current plan",
        headline: `You're on Vela ${stage.plan === "PRO" ? "Pro" : "Basic"}`,
        receiptTag: "Your plan",
      };
    case "subscribe":
      if (stage.trialAvailable) {
        return { badge: `${TRIAL_DAYS} days free`, headline: "Start your free trial", receiptTag: "Free trial" };
      }
      return locked
        ? { badge: "Renew", headline: "Renew your Vela plan", receiptTag: `Vela ${plan.name}` }
        : { badge: "Choose a plan", headline: "Choose your Vela plan", receiptTag: `Vela ${plan.name}` };
    default:
      return { badge: `${TRIAL_DAYS} days free`, headline: "Start your free trial", receiptTag: "Free trial" };
  }
}

const inkLinkClass =
  "group/next inline-flex h-12 w-full items-center justify-center gap-2 rounded-(--radius-mkt-field) bg-[var(--brand-ink)] px-5 text-sm font-semibold text-white transition-[transform,background-color] duration-(--duration-base) ease-out-quint hover:bg-[var(--brand-ink)]/90 active:scale-[0.98]";

function InkLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={inkLinkClass}>
      {children}
      <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/next:translate-x-0.5" />
    </Link>
  );
}

function StageAction({
  stage,
  paddle,
  priceId,
  previewPriceId,
  fallbackPrice,
  interval,
  email,
  businessId,
  locked,
}: {
  stage: CheckoutStage;
  paddle: PaddleClientConfig | null;
  priceId: string | null;
  previewPriceId: string | null;
  fallbackPrice: string;
  interval: PaidInterval;
  email: string;
  businessId: string;
  locked: boolean;
}) {
  switch (stage.kind) {
    case "sign_up":
      return (
        <>
          <InkLink href="/sign-up">Create your account</InkLink>
          <Note>Your {TRIAL_DAYS}-day free trial starts once your clinic is set up.</Note>
        </>
      );
    case "onboarding":
      return (
        <>
          <InkLink href="/onboarding">Set up your clinic</InkLink>
          <Note>Your {TRIAL_DAYS}-day free trial starts once your clinic is set up.</Note>
        </>
      );
    case "free_account":
      return (
        <>
          <InkLink href="/dashboard">Go to your workspace</InkLink>
          <Note>There&apos;s nothing to pay.</Note>
        </>
      );
    case "subscribed":
      return (
        <>
          <InkLink href="/dashboard?settings=billing">Manage your plan</InkLink>
          <Note>Change plan, card or billing period in Settings › Billing.</Note>
        </>
      );
    case "subscribe":
      if (!paddle || !priceId) {
        return (
          <>
            <button
              type="button"
              disabled
              className="inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-(--radius-mkt-field) bg-muted text-sm font-semibold text-muted-foreground"
            >
              <LockKeyhole className="size-4" />
              Card payment opens soon
            </button>
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
          <PaddleCheckoutButton
            paddle={paddle}
            priceId={priceId}
            email={email}
            businessId={businessId}
            label={stage.trialAvailable ? `Start ${TRIAL_DAYS}-day free trial` : locked ? "Renew plan" : "Subscribe"}
          />
          <Note>
            <FirstChargeLine
              paddle={paddle}
              priceId={previewPriceId}
              fallbackPrice={fallbackPrice}
              interval={interval}
              trialAvailable={stage.trialAvailable}
            />
          </Note>
          {locked ? (
            <Link
              href="/dashboard"
              className="mt-1 inline-flex h-10 w-full items-center justify-center text-xs font-medium text-muted-foreground underline-offset-4 hover:text-[var(--brand-ink)] hover:underline"
            >
              View your records (read-only)
            </Link>
          ) : null}
        </>
      );
  }
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">{children}</p>;
}

function Perforation() {
  return <div aria-hidden className="-mx-7 my-5 border-t-2 border-dashed border-border/80" />;
}
