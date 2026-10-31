import type { Metadata } from "next";

import { CheckoutFlow, InkLink, Note } from "@/components/billing/checkout-flow";
import { CheckoutShell } from "@/components/billing/checkout-shell";
import { OrderSummary } from "@/components/billing/order-summary";
import type { PaddleClientConfig } from "@/components/billing/use-paddle";
import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";
import { getCurrentUser } from "@/lib/auth";
import { workspaceAccess } from "@/lib/billing-access";
import { getCurrentBusiness } from "@/lib/business";
import { checkoutStage, trialEndLabel } from "@/lib/checkout-state";
import { paddleConfig, type PaidInterval } from "@/lib/paddle/paddle-config";
import { getPublicPlan, localizedPlans, publicPlanKeyFromBusinessPlan } from "@/lib/public-plans";

export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = (await getI18n()).m.billing.checkout.meta;
  return { title, description };
}

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
  const { locale, m } = await getI18n();
  const t = m.billing.checkout;
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
    const plan = localizedPlans(m.common.plans).find((item) => item.key === planKey) ?? getPublicPlan(planKey);
    const interval: PaidInterval = business?.billingInterval ?? "MONTH";
    const free = stage.kind === "free_account";
    return (
      <WithMessages namespaces={["billing"]}>
      <CheckoutShell
        signedIn
        panelLead={free ? t.panel.freeLead : t.panel.setLead}
        panelTail={free ? t.panel.freeTail : t.panel.setTail}
        panel={
          <OrderSummary
            plan={plan}
            interval={interval}
            paddle={free ? null : paddle}
            previewPriceId={free ? null : (config?.prices[planKey === "pro" ? "PRO" : "BASIC"][interval].noTrial ?? null)}
            heading={free ? t.current.freeHeading : t.current.planHeading}
            trial={null}
          />
        }
      >
        <p className="mb-3 text-sm font-semibold text-primary">{free ? t.current.freeEyebrow : t.current.currentEyebrow}</p>
        <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
          {free ? (
            <>
              {t.current.freeLead} <span className="text-muted-foreground">{t.current.freeRest}</span>
            </>
          ) : (
            <>
              {fmt(t.current.onPlan, { plan: plan.name })}{" "}
              <span className="text-muted-foreground">{interval === "YEAR" ? t.current.billedYearly : t.current.billedMonthly}</span>
            </>
          )}
        </h1>
        <div className="mt-8">
          {free ? (
            <>
              <InkLink href="/dashboard">{t.current.goWorkspace}</InkLink>
              <Note>{t.current.nothingToPay}</Note>
            </>
          ) : (
            <>
              <InkLink href="/dashboard?settings=billing">{t.current.manage}</InkLink>
              <Note>{t.current.manageNote}</Note>
            </>
          )}
        </div>
      </CheckoutShell>
      </WithMessages>
    );
  }

  return (
    <WithMessages namespaces={["billing"]}>
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
      trialEndsOn={trialEndLabel(new Date(), undefined, locale)}
    />
    </WithMessages>
  );
}
