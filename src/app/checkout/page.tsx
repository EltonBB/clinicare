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
import { getPublicPlan, publicPlans, type PublicPlan } from "@/lib/public-plans";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Checkout | Vela",
  description: "Review your selected Vela plan before secure payment.",
};

type CheckoutPageProps = {
  searchParams?: Promise<{
    plan?: string | string[];
  }>;
};

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  const selectedPlan = getPublicPlan(params?.plan);

  return (
    <main className="min-h-screen bg-[#f7faff] text-[#07162b]">
      <header className="border-b border-[#e2eaf6] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandMark href="/" includeSubtitle={false} />
          <Link
            href="/pricing"
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#d8e3f1] bg-white px-4 text-sm font-bold text-[#07162b] transition hover:border-[#a8bdd8]"
          >
            <ArrowLeft className="size-4" />
            Pricing
          </Link>
        </div>
      </header>

      <section className="px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,0.96fr)_minmax(360px,0.64fr)] lg:items-start">
          <div className="space-y-6">
            <div className="rounded-[26px] border border-[#dfe8f6] bg-white p-6 shadow-[0_28px_90px_rgba(20,32,51,0.07)] sm:p-8">
              <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-[#3b82f6]">
                <span className="inline-flex size-10 items-center justify-center rounded-[12px] bg-[#eef4ff]">
                  <CreditCard className="size-5" />
                </span>
                Plan checkout
              </div>
              <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[0.98] text-[#07162b] sm:text-6xl">
                Review your Vela {selectedPlan.name} plan.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-[#53667f]">
                Confirm the selected plan details now. The secure payment handoff will connect here when Paddle checkout is wired in.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <TrustCard icon={ShieldCheck} title="Secure billing" copy="Payment provider integration ready." />
                <TrustCard icon={CalendarDays} title="Monthly plan" copy="Start with predictable billing." />
                <TrustCard icon={MessageCircle} title="Clinic support" copy="Help available during setup." />
              </div>
            </div>

            <section className="rounded-[24px] border border-[#dfe8f6] bg-white p-5 shadow-[0_24px_80px_rgba(20,32,51,0.06)] sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-[#07162b]">Choose a plan</h2>
                  <p className="mt-2 text-sm leading-6 text-[#64748b]">
                    Switching plans updates the checkout summary before payment.
                  </p>
                </div>
                <Link
                  href="/pricing"
                  className="text-sm font-bold text-[#3b82f6] transition hover:text-[#2563eb]"
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
                  />
                ))}
              </div>
            </section>
          </div>

          <aside className="lg:sticky lg:top-6">
            <div className="overflow-hidden rounded-[26px] border border-[#dfe8f6] bg-white shadow-[0_28px_90px_rgba(20,32,51,0.09)]">
              <div className="bg-[#07162b] p-6 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#9fb8d8]">
                      Selected plan
                    </p>
                    <h2 className="mt-3 text-3xl font-semibold">{selectedPlan.name}</h2>
                  </div>
                  {selectedPlan.highlighted ? (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-[#cfe2ff]">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 text-sm leading-6 text-[#c8d7ec]">{selectedPlan.description}</p>
              </div>

              <div className="p-6">
                <div className="flex items-end justify-between border-b border-[#e5edf7] pb-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#63748c]">
                      Due today
                    </p>
                    <div className="mt-2 flex items-end gap-2">
                      <span className="text-5xl font-semibold text-[#07162b]">{selectedPlan.price}</span>
                      <span className="pb-2 text-sm font-bold text-[#64748b]">/{selectedPlan.cadence}</span>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-bold text-[#3b82f6]">
                    Monthly
                  </span>
                </div>

                <div className="mt-5 grid gap-3">
                  {selectedPlan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3 text-sm font-semibold text-[#304158]">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#3b82f6]" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled
                  className="mt-7 inline-flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-[10px] bg-[#3b82f6]/65 px-5 text-sm font-bold text-white shadow-[0_18px_36px_rgba(59,130,246,0.18)]"
                  title="Paddle checkout will be connected here next."
                >
                  Continue to secure payment
                  <LockKeyhole className="size-4" />
                </button>
                <p className="mt-3 text-center text-xs font-semibold text-[#64748b]">
                  Payment connection pending. This button is reserved for Paddle checkout.
                </p>

                <div className="mt-6 rounded-[16px] border border-[#dfe8f6] bg-[#f8fbff] p-4">
                  <div className="flex gap-3">
                    <BadgeCheck className="mt-0.5 size-5 shrink-0 text-[#3b82f6]" />
                    <div>
                      <p className="text-sm font-bold text-[#07162b]">What happens next</p>
                      <p className="mt-1 text-sm leading-6 text-[#64748b]">
                        When payment is connected, this page will create the Paddle checkout for the selected plan and return the clinic to onboarding or the workspace.
                      </p>
                    </div>
                  </div>
                </div>

                <Link
                  href="/sign-up"
                  className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#d8e3f1] bg-white px-5 text-sm font-bold text-[#07162b] transition hover:border-[#a8bdd8]"
                >
                  Create account first
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
    <div className="rounded-[16px] border border-[#dfe8f6] bg-[#f8fbff] p-4">
      <span className="flex size-10 items-center justify-center rounded-[12px] bg-white text-[#3b82f6] shadow-[0_12px_28px_rgba(20,32,51,0.05)]">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-4 text-sm font-bold text-[#07162b]">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-[#64748b]">{copy}</p>
    </div>
  );
}

function PlanOption({ plan, selected }: { plan: PublicPlan; selected: boolean }) {
  return (
    <Link
      href={`/checkout?plan=${plan.key}`}
      className={cn(
        "group rounded-[18px] border bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#3b82f6] hover:shadow-[0_20px_54px_rgba(59,130,246,0.12)]",
        selected
          ? "border-[#3b82f6] shadow-[0_18px_54px_rgba(59,130,246,0.14)]"
          : "border-[#dfe8f6] shadow-[0_14px_40px_rgba(20,32,51,0.045)]"
      )}
      aria-current={selected ? "page" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[#07162b]">{plan.name}</h3>
          <p className="mt-2 text-sm leading-6 text-[#64748b]">{plan.audience}</p>
        </div>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border",
            selected ? "border-[#3b82f6] bg-[#3b82f6] text-white" : "border-[#d8e3f1] text-transparent"
          )}
        >
          <CheckCircle2 className="size-4" />
        </span>
      </div>
      <div className="mt-5 flex items-end gap-2">
        <span className="text-3xl font-semibold text-[#07162b]">{plan.price}</span>
        <span className="pb-1 text-sm font-bold text-[#64748b]">/{plan.cadence}</span>
      </div>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#3b82f6]">
        {selected ? "Selected" : "Select plan"}
        <Sparkles className="size-4 transition group-hover:rotate-6" />
      </span>
    </Link>
  );
}
