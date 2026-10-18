import Link from "next/link";
import { Check } from "lucide-react";

import { ReportsSections } from "@/components/reports/reports-overview";
import { buttonVariants } from "@/components/ui/button-variants";
import { WorkspaceHeader, WorkspacePage } from "@/components/workspace/workspace-layout";
import { proAddedFeatures, publicPlans } from "@/lib/public-plans";
import type { ReportsViewModel } from "@/lib/reports";
import { cn } from "@/lib/utils";

const proPlan = publicPlans.find((plan) => plan.key === "pro")!;

/**
 * Reports on the Basic plan: one upgrade card (what Pro adds, its price, and
 * the way to checkout), then the real Reports page rendered over a sample
 * clinic so the owner sees exactly what they would get. The sample is labelled
 * as such and is inert: nothing in it can be clicked, focused or read out.
 */
export function ProFeatureLock({ sample }: { sample: ReportsViewModel }) {
  return (
    <WorkspacePage>
      <WorkspaceHeader title="Reports" />

      <section className="surface-card flex flex-col gap-6 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Reports are part of Pro</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
            Trends, staff load and a weekly read on what to fix next, built from your own visits.
          </p>
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
            <span className="text-2xl font-semibold tracking-tight text-foreground">{proPlan.price}</span> {proPlan.cadence}
          </p>
          <Link
            href="/checkout?plan=pro"
            className={cn(buttonVariants({ variant: "solid" }), "h-10 rounded-(--radius-card) px-4")}
          >
            Upgrade to Pro
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-foreground lg:text-center"
          >
            Compare plans
          </Link>
        </div>
      </section>

      <section aria-label="Reports preview with sample data">
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">Sample data</span>
          What Reports shows, from a made-up clinic
        </p>
        {/* inert: the sample is a picture of the page, not a second, fake one. */}
        <div inert aria-hidden className="pointer-events-none select-none">
          <ReportsSections period={sample.periods.weekly} />
        </div>
      </section>
    </WorkspacePage>
  );
}
