import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

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

  return (
    <main className="app-shell-bg min-h-screen text-foreground">
      <header className="border-b border-border/70 bg-white/86 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandMark href="/" includeSubtitle={false} />
          <Link
            href="/pricing"
            className="inline-flex h-10 items-center gap-2 rounded-[0.85rem] border border-border/80 bg-white px-4 text-sm font-bold text-foreground shadow-[0_12px_28px_rgba(20,21,47,0.04)] transition hover:border-primary/40 hover:text-primary"
          >
            <ArrowLeft className="size-4" />
            Pricing
          </Link>
        </div>
      </header>

      <section className="px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,0.96fr)_minmax(360px,0.64fr)] lg:items-start">
          <div className="space-y-6">
            <div className="surface-card p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-primary">
                <span className="vela-icon-tile">
                  <CreditCard className="size-5" />
                </span>
                {planState.badge}
              </div>
              <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[0.98] text-[var(--brand-ink)] sm:text-6xl">
                {planState.headline}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground">
                {planState.description}
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <TrustCard icon={ShieldCheck} title="Plan review" copy="Confirm the plan that fits your clinic." />
                <TrustCard icon={CalendarDays} title="Monthly plan" copy="Start with predictable monthly pricing." />
                <TrustCard icon={MessageCircle} title="Setup support" copy="We can help activate the right workspace plan." />
              </div>
            </div>

            <section className="surface-card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--brand-ink)]">Choose a plan</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Switching plans updates the checkout summary before payment.
                  </p>
                </div>
                <Link
                  href="/pricing"
                  className="text-sm font-bold text-primary transition hover:text-primary/80"
                >
                  Compare features
                </Link>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {publicPlans.map((plan) => (
                  <PlanOption
                    key={plan.key}
                    plan={plan}
                    selected={plan.key === selectedPlan.key}
                    planState={planState}
                  />
                ))}
              </div>
            </section>
          </div>

          <aside className="lg:sticky lg:top-6">
            <div className="overflow-hidden rounded-[1.35rem] border border-border/80 bg-white shadow-[0_28px_90px_rgba(20,21,47,0.09)]">
              <div className="vela-gradient p-6 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">
                      {planState.summaryTitle}
                    </p>
                    <h2 className="mt-3 text-3xl font-semibold">{selectedPlan.name}</h2>
                  </div>
                  {planState.intent === "current_plan" ? (
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white">
                      Active now
                    </span>
                  ) : selectedPlan.highlighted ? (
                    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 text-sm leading-6 text-white/78">{selectedPlan.description}</p>
              </div>

              <div className="p-6">
                <div className="flex items-end justify-between border-b border-border/70 pb-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Due today
                    </p>
                    <div className="mt-2 flex items-end gap-2">
                      <span className="text-5xl font-semibold text-[var(--brand-ink)]">{selectedPlan.price}</span>
                      <span className="pb-2 text-sm font-bold text-muted-foreground">/{selectedPlan.cadence}</span>
                    </div>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    Monthly
                  </span>
                </div>

                <div className="mt-5 rounded-[1rem] border border-border/80 bg-[var(--brand-wash)]/55 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                    Account status
                  </p>
                  <div className="mt-3 grid gap-3 text-sm">
                    <SummaryLine
                      label="Workspace"
                      value={planState.workspaceName ?? "No workspace connected"}
                    />
                    <SummaryLine
                      label="Current plan"
                      value={
                        planState.currentPlanName
                          ? `Vela ${planState.currentPlanName}`
                          : "No current plan"
                      }
                    />
                    <SummaryLine label="Plan status" value={planState.statusLabel} />
                    <SummaryLine label="Checkout type" value={planState.badge} />
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  {selectedPlan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3 text-sm font-semibold text-foreground">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled
                  className="mt-7 inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-[0.85rem] bg-primary/65 px-5 text-sm font-bold text-white shadow-[0_18px_36px_rgba(10,34,255,0.18)]"
                  title="Online card checkout is being prepared."
                >
                  {planState.primaryActionLabel}
                  <LockKeyhole className="size-4" />
                </button>
                <p className="mt-3 text-center text-xs font-semibold text-muted-foreground">
                  Online card checkout is being prepared. Plan activation is currently handled during setup.
                </p>

                <div className="mt-6 rounded-[1rem] border border-border/80 bg-white p-4 shadow-[0_12px_30px_rgba(20,21,47,0.035)]">
                  <div className="flex gap-3">
                    <BadgeCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-bold text-[var(--brand-ink)]">What happens next</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Contact us and we will help activate this plan for your workspace. The selected plan and account context are already reflected in this review.
                      </p>
                    </div>
                  </div>
                </div>

                <Link
                  href={planState.secondaryActionHref}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[0.85rem] border border-border/80 bg-white px-5 text-sm font-bold text-foreground transition hover:border-primary/40 hover:text-primary"
                >
                  {planState.secondaryActionLabel}
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-bold text-[var(--brand-ink)]">{value}</span>
    </div>
  );
}

function TrustCard({
  icon: Icon,
  title,
  copy,
}: {
  icon: typeof ShieldCheck;
  title: string;
  copy: string;
}) {
  return (
    <div className="rounded-[1rem] border border-border/80 bg-[var(--brand-wash)]/55 p-4">
      <span className="vela-icon-tile">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-4 text-sm font-bold text-[var(--brand-ink)]">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy}</p>
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
      className={cn(
        "group rounded-[1.1rem] border bg-white p-5 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_20px_54px_rgba(10,34,255,0.12)]",
        selected
          ? "border-primary/70 shadow-[0_18px_54px_rgba(10,34,255,0.14)]"
          : "border-border/80 shadow-[0_14px_40px_rgba(20,21,47,0.045)]"
      )}
      aria-current={selected ? "page" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--brand-ink)]">{plan.name}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.audience}</p>
        </div>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-primary vela-gradient text-white" : "border-border text-transparent"
          )}
        >
          <CheckCircle2 className="size-4" />
        </span>
      </div>
      <div className="mt-5 flex items-end gap-2">
        <span className="text-3xl font-semibold text-[var(--brand-ink)]">{plan.price}</span>
        <span className="pb-1 text-sm font-bold text-muted-foreground">/{plan.cadence}</span>
      </div>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary">
        {selected ? "Selected" : optionLabel}
        <Sparkles className="size-4 transition group-hover:rotate-6" />
      </span>
    </Link>
  );
}
