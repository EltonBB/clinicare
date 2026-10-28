import type { Metadata } from "next";

import { CheckoutFlow, InkLink, Note } from "@/components/billing/checkout-flow";
import { CheckoutShell } from "@/components/billing/checkout-shell";
import { OrderSummary } from "@/components/billing/order-summary";
import type { PaddleClientConfig } from "@/components/billing/use-paddle";
import { getCurrentUser } from "@/lib/auth";
import { workspaceAccess } from "@/lib/billing-access";
import { getCurrentBusiness } from "@/lib/business";
import { checkoutStage, trialEndLabel } from "@/lib/checkout-state";
import { paddleConfig, type PaidInterval } from "@/lib/paddle/paddle-config";
import { getPublicPlan, publicPlanKeyFromBusinessPlan } from "@/lib/public-plans";

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

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const business = user ? await getCurrentBusiness(user.id) : null;
  const stage = checkoutStage({ signedIn: Boolean(user), business });
  const locked = business ? workspaceAccess(business).kind === "locked" : false;

  const config = paddleConfig();
  const paddle: PaddleClientConfig | null = config ? { env: config.env, clientToken: config.clientToken } : null;
  const intervalParam = first(params?.interval);
  const requested: PaidInterval | null = intervalParam === "year" ? "YEAR" : intervalParam === "month" ? "MONTH" : null;

  // A clinic with a plan running sees that plan; choosing another happens in Settings › Billing.
  if (stage.kind === "subscribed" || stage.kind === "free_account") {
    const planKey = publicPlanKeyFromBusinessPlan(stage.kind === "subscribed" ? stage.plan : (business?.plan ?? "BASIC"));
    const plan = getPublicPlan(planKey);
    const interval: PaidInterval = business?.billingInterval ?? "MONTH";
    const free = stage.kind === "free_account";
    return (
      <CheckoutShell
        signedIn
        panelLead={free ? "Your clinic is on us." : "Your plan is set."}
        panelTail={free ? "Nothing to pay." : "Change it any time."}
        panel={
          <OrderSummary
            plan={plan}
            interval={interval}
            paddle={free ? null : paddle}
            previewPriceId={free ? null : (config?.prices[planKey === "pro" ? "PRO" : "BASIC"][interval].noTrial ?? null)}
            heading={free ? "Free account" : "Your plan"}
            trial={null}
          />
        }
      >
        <p className="mb-3 text-sm font-semibold text-primary">{free ? "Free account" : "Current plan"}</p>
        <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
          {free ? (
            <>
              Your clinic has <span className="text-muted-foreground">a free account.</span>
            </>
          ) : (
            <>
              You&apos;re on Vela {plan.name},{" "}
              <span className="text-muted-foreground">billed {interval === "YEAR" ? "yearly" : "monthly"}.</span>
            </>
          )}
        </h1>
        <div className="mt-8">
          {free ? (
            <>
              <InkLink href="/dashboard">Go to your workspace</InkLink>
              <Note>There&apos;s nothing to pay.</Note>
            </>
          ) : (
            <>
              <InkLink href="/dashboard?settings=billing">Manage your plan</InkLink>
              <Note>Change plan, card or billing period in Settings › Billing.</Note>
            </>
          )}
        </div>
      </CheckoutShell>
    );
  }

  return (
    <CheckoutFlow
      stage={stage}
      locked={locked}
      paddle={paddle}
      prices={config?.prices ?? null}
      initialPlan={getPublicPlan(params?.plan).key}
      initialInterval={requested ?? "MONTH"}
      email={user?.email ?? ""}
      businessId={business?.id ?? ""}
      clinicName={business?.name ?? ""}
      trialEndsOn={trialEndLabel()}
    />
  );
}
