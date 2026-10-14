import { MarketingShell } from "../shell/marketing-shell";
import { HomeHero } from "./home-hero";
import { ClinicDay } from "./clinic-day";
import { ModuleStrip } from "./module-strip";
import { TestimonialWall } from "../shared/testimonial-wall";
import { FeatureBento } from "./feature-bento";
import { TrustSection } from "./trust-section";
import { PricingPreview } from "./pricing-preview";

/** Home composition: hero, module strip, the clinic day, bento, reminder rules, pricing, testimonials; the footer carries the close. */
export function HomePage() {
  return (
    <MarketingShell footerCta>
      <HomeHero />
      <ModuleStrip />
      <ClinicDay />
      <FeatureBento />
      <TrustSection />
      <PricingPreview />
      <TestimonialWall />
    </MarketingShell>
  );
}
