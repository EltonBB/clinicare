import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Check, LockKeyhole } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentBusiness } from "@/lib/business";
import {
  checkoutPlanOptionLabel,
  getPublicPlan,
  publicPlans,
  resolveCheckoutPlanState,
  type CheckoutPlanState,
  type PublicPlan,
} from "@/lib/public-plans";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Checkout | Vela",
  description: "Review your selected Vela plan and activation options.",
};

type CheckoutPageProps = {
  searchParams?: Promise<{
    plan?: string | string[];
  }>;
};

const STEPS = ["Account", "Workspace", "Activation"];

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  const selectedPlan = getPublicPlan(params?.plan);
  const user = await getCurrentUser();
  const business = user ? await getCurrentBusiness(user.id) : null;
  const planState = resolveCheckoutPlanState({
    selectedPlan,
    currentPlan: business?.plan,
    currentPlanStatus: business?.planStatus,
    workspaceName: business?.name,
    isAuthenticated: Boolean(user),
  });

  const status = planState.statusLabel.charAt(0).toUpperCase() + planState.statusLabel.slice(1);
  // Where this visitor stands on the path to an active plan.
  const stage = !user ? 1 : !business ? 2 : planState.intent === "current_plan" ? 4 : 3;

  return (
    <main className="grid min-h-dvh bg-white text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)]">
      <div className="flex flex-col px-5 py-6 sm:px-10 sm:py-8 lg:min-h-dvh lg:px-14">
        <header className="flex items-center justify-between">
          <BrandMark href="/" includeSubtitle={false} />
          <Link
            href="/pricing"
            className="group/back inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-[var(--brand-ink)]"
          >
            <ArrowLeft className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/back:-translate-x-0.5" />
            Back to pricing
          </Link>
        </header>

        <div className="flex flex-1 items-center py-12">
          <div className="w-full max-w-xl motion-safe:animate-[vela-fade-up_0.5s_var(--ease-out-expo)_both]">
            <p className="text-sm font-semibold text-primary">{planState.badge}</p>
            <h1 className="mt-3 text-balance text-[2.75rem] font-semibold leading-[1.02] tracking-[-0.035em] text-[var(--brand-ink)]">
              {planState.headline}
            </h1>

            <div className="mt-10 flex items-baseline justify-between">
              <p className="text-sm font-medium text-[var(--brand-ink)]">Choose a plan</p>
              <Link
                href="/pricing"
                className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-[var(--brand-ink)] hover:underline"
              >
                Compare plans
              </Link>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {publicPlans.map((plan) => (
                <PlanOption key={plan.key} plan={plan} selected={plan.key === selectedPlan.key} planState={planState} />
              ))}
            </div>

            <ol className="mt-10 grid grid-cols-3 gap-2" aria-label="Activation steps">
              {STEPS.map((label, i) => {
                const n = i + 1;
                const done = n < stage;
                const now = n === stage;
                return (
                  <li key={label} className="min-w-0" aria-current={now ? "step" : undefined}>
                    <span
                      className={cn(
                        "block h-1 rounded-full",
                        done ? "bg-primary" : now ? "bg-gradient-to-r from-primary to-[#64B6FF]" : "bg-border",
                      )}
                    />
                    <span
                      className={cn(
                        "mt-2.5 flex items-center gap-1.5 text-xs font-medium",
                        done || now ? "text-[var(--brand-ink)]" : "text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="size-3.5 shrink-0 text-primary" /> : <span className="tabular-nums text-muted-foreground">{n}</span>}
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
          Card payment opens soon. Until then, we switch your plan on with you.
          <Link href="/contact" className="font-medium text-[var(--brand-ink)] underline-offset-4 hover:underline">
            Talk to us
          </Link>
        </p>
      </div>

      {/* The summary prints as a receipt on the ink side. */}
      <aside className="relative flex bg-[var(--brand-ink)] px-5 py-16 sm:px-10 lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:py-6">
        {/* Decoration is clipped on its own layer, so a long receipt can still scroll. */}
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
          <div key={selectedPlan.key} className="motion-safe:animate-[vela-print_0.8s_var(--ease-out-expo)_both]">
            <div className="rounded-t-[1.25rem] bg-white px-7 pb-5 pt-7">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand-ink)]">
                  <Image src="/brand/vela-icon.svg" alt="" width={20} height={20} aria-hidden />
                  Vela
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                    planState.intent === "current_plan" ? "bg-primary text-white" : "bg-[var(--brand-wash)] text-primary",
                  )}
                >
                  {planState.intent === "current_plan" ? "Active now" : planState.summaryTitle}
                </span>
              </div>

              <p className="mt-6 text-sm text-muted-foreground">Vela {selectedPlan.name}</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[3.25rem] font-semibold leading-none tracking-[-0.04em] text-[var(--brand-ink)] tabular-nums">
                  {selectedPlan.price}
                </span>
                <span className="text-sm text-muted-foreground">{selectedPlan.cadence}</span>
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
              <dl className="grid gap-2 text-sm">
                <SummaryLine label="Workspace" value={planState.workspaceName ?? "Not connected yet"} />
                <SummaryLine label="Status" value={status} />
              </dl>

              <Link
                href={planState.secondaryActionHref}
                className="group/next mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-(--radius-mkt-field) bg-[var(--brand-ink)] px-5 text-sm font-semibold text-white transition-[transform,background-color] duration-(--duration-base) ease-out-quint hover:bg-[var(--brand-ink)]/90 active:scale-[0.98]"
              >
                {planState.secondaryActionLabel}
                <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/next:translate-x-0.5" />
              </Link>
              <button
                type="button"
                disabled
                title="Online card checkout is being prepared."
                className="mt-1 inline-flex h-10 w-full cursor-not-allowed items-center justify-center gap-2 text-xs font-medium text-muted-foreground/70"
              >
                <LockKeyhole className="size-3.5" />
                {planState.primaryActionLabel}
              </button>
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

function Perforation() {
  return <div aria-hidden className="-mx-7 my-5 border-t-2 border-dashed border-border/80" />;
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium text-[var(--brand-ink)]">{value}</dd>
    </div>
  );
}

function PlanOption({
  plan,
  selected,
  planState,
}: {
  plan: PublicPlan;
  selected: boolean;
  planState: CheckoutPlanState;
}) {
  const optionLabel = checkoutPlanOptionLabel(plan, planState);

  return (
    <Link
      href={`/checkout?plan=${plan.key}`}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group/plan relative flex flex-col rounded-(--radius-mkt-card) p-5 transition-[box-shadow,background-color,transform] duration-(--duration-base) ease-out-quint active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45",
        selected
          ? "bg-[var(--brand-wash)]/60 shadow-[inset_0_0_0_2px_var(--brand-ink)]"
          : "shadow-[inset_0_0_0_1px_var(--border)] hover:shadow-[inset_0_0_0_1px_rgba(20,21,47,0.35)]",
      )}
    >
      <span className="flex items-center justify-between">
        <span className="text-base font-semibold text-[var(--brand-ink)]">{plan.name}</span>
        <span
          aria-hidden
          className={cn(
            "flex size-5 items-center justify-center rounded-full transition-colors duration-(--duration-base)",
            selected ? "bg-[var(--brand-ink)] text-white" : "border border-border group-hover/plan:border-[var(--brand-ink)]/40",
          )}
        >
          {selected ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
      </span>
      <span className="mt-4 flex items-baseline gap-1.5">
        <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-[var(--brand-ink)] tabular-nums">{plan.price}</span>
        <span className="text-xs text-muted-foreground">{plan.cadence}</span>
      </span>
      <span className="mt-3 text-[13px] leading-5 text-muted-foreground">{plan.description}</span>
      <span className={cn("mt-4 text-xs font-semibold", selected ? "text-primary" : "text-muted-foreground")}>
        {selected ? "Selected" : optionLabel}
      </span>
    </Link>
  );
}
