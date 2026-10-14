import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Reveal } from "../motion/reveal";
import { PlanStrip } from "../shared/plan-strip";
import { SectionHeader } from "../shared/section-header";

/**
 * Home pricing: the shared plan strip under a two-tone header, with a link to
 * the full comparison on /pricing.
 */
export function PricingPreview() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          lead="Two plans, no surprises."
          rest="Add Pro when reporting starts to matter."
          aside={
            <Link
              href="/pricing"
              className="group/link inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-ink)] transition-colors duration-(--duration-base) hover:text-primary"
            >
              Compare every feature
              <ArrowUpRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5" />
            </Link>
          }
        />

        <Reveal delay={0.1} className="mt-12">
          <PlanStrip />
        </Reveal>
      </div>
    </section>
  );
}
