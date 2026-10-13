"use client";

import { useMarketingScroll } from "../motion/scroll-context";
import { Highlight, WordReveal } from "../motion/word-reveal";
import { PrimaryCta, SecondaryCta } from "../shared/cta-links";
import { DayDial } from "./day-dial";
import { VelaSchool } from "./vela-school";

/**
 * Home hero: the promise on the nav grid's left edge, and on the right the
 * day dial, one sample clinic day around a clock face that visitors can read
 * by pointing at its appointments. A cue at the bottom hands them down into
 * the day story. Behind it all, a loose school of small Vela marks swims and
 * darts away from the pointer.
 */
export function HomeHero() {
  const { reduced } = useMarketingScroll();

  return (
    <section className="relative overflow-hidden">
      {/* Small Vela marks swimming behind everything; they scatter from the pointer. */}
      <div aria-hidden className="absolute inset-0 [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_82%,transparent)]">
        <VelaSchool still={reduced} />
      </div>
      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:px-8 lg:py-16">
        <div>
          <h1 className="display-1 max-w-3xl text-balance text-[var(--brand-ink)] lg:text-[clamp(3.5rem,5vw+0.6rem,5.75rem)]">
            <WordReveal>
              The clinic day, <Highlight>run calmly.</Highlight>
            </WordReveal>
          </h1>
          <div className="hero-follow">
            <p className="mt-6 max-w-md text-pretty text-lg leading-8 text-muted-foreground">
              Appointments, patients, staff, and messages in one quiet workspace.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <PrimaryCta href="/sign-up">Start free</PrimaryCta>
              <SecondaryCta href="/product">See the product</SecondaryCta>
            </div>
            <a
              href="#clinic-day"
              className="group/cue mt-14 hidden items-center gap-3 text-xs font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-[var(--brand-ink)] lg:inline-flex"
            >
              <span className="relative h-8 w-px overflow-hidden bg-border">
                <span className="hero-cue absolute inset-x-0 top-0 h-3 bg-primary" />
              </span>
              Scroll through a clinic day, 08:00 to 18:00
            </a>
          </div>
        </div>

        <div className="section-reveal">
          <DayDial still={reduced} />
        </div>
      </div>
    </section>
  );
}
