import Link from "next/link";
import { Check } from "lucide-react";

import { StartProTrialButton } from "@/components/billing/start-pro-trial-button";
import { planPricing } from "@/components/marketing/shared/plan-strip";
import { LocalPlanPrice } from "@/components/marketing/shared/plan-strip-interactive";
import { ReportsSections } from "@/components/reports/reports-overview";
import { buttonVariants } from "@/components/ui/button-variants";
import { WorkspaceHeader, WorkspacePage } from "@/components/workspace/workspace-layout";
import { getI18n } from "@/i18n/server";
import { localizedPlans } from "@/lib/public-plans";
import type { ReportsViewModel } from "@/lib/reports";
import { cn } from "@/lib/utils";

/**
 * Reports on the Basic plan: one upgrade card (what Pro adds, its price, and
 * the way to checkout), then the real Reports page rendered over a sample
 * clinic so the owner sees exactly what they would get. The sample is labelled
 * as such and is inert: nothing in it can be clicked, focused or read out.
 * Once the free Pro trial is offered (lib/pro-trial.ts), it starts from here too.
 */
export async function ProFeatureLock({ sample, proTrialOffered }: { sample: ReportsViewModel; proTrialOffered: boolean }) {
  const { m } = await getI18n();
  const t = m.reports.locked;
  const proPlan = localizedPlans(m.common.plans).find((plan) => plan.key === "pro")!;
  // Pro's list opens with the "Everything in Basic" connector; the rest is what Pro adds.
  const proAddedFeatures = proPlan.features.slice(1);

  return (
    <WorkspacePage>
      <WorkspaceHeader title={m.reports.title} />

      <section className="surface-card flex flex-col gap-6 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">{t.title}</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{t.copy}</p>
          <ul className="mt-4 grid gap-x-6 gap-y-2 text-sm text-foreground sm:grid-cols-2">
            {proAddedFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col gap-3 lg:w-56 lg:items-stretch">
          <p className="text-sm text-muted-foreground">
            <span className="text-2xl font-semibold tracking-tight text-foreground">
              <LocalPlanPrice pricing={planPricing()} plan={proPlan} />
            </span>{" "}
            {proPlan.cadence}
          </p>
          <Link
            href="/checkout?plan=pro"
            className={cn(buttonVariants({ variant: "solid" }), "h-10 rounded-(--radius-card) px-4")}
          >
            {t.upgrade}
          </Link>
          {proTrialOffered ? <StartProTrialButton label={t.tryPro} className="h-10 rounded-(--radius-card) px-4" /> : null}
          <Link
            href="/pricing"
            className="text-sm font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-foreground lg:text-center"
          >
            {t.compare}
          </Link>
        </div>
      </section>

      <section aria-label={t.previewLabel}>
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">{t.sample}</span>
          {t.sampleCaption}
        </p>
        {/* inert: the sample is a picture of the page, not a second, fake one. */}
        <div inert aria-hidden className="pointer-events-none select-none">
          <ReportsSections period={sample.periods.weekly} />
        </div>
      </section>
    </WorkspacePage>
  );
}
