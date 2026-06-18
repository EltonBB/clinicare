import { MarketingShell } from "../shell/marketing-shell";
import { CinematicHero } from "./cinematic-hero";
import { ClinicMarquee } from "./clinic-marquee";
import { ProductSlider } from "./product-slider";
import { Capabilities } from "./capabilities";
import { AiInsightBand } from "./ai-insight-band";
import { TrustSection } from "./trust-section";
import { PricingPreview } from "./pricing-preview";
import { FinalCta } from "./final-cta";

/**
 * Home composition. A server component that renders the client marketing shell
 * (smooth scroll, header, page transition, footer) around the home sections —
 * color-blocked dark → light → dark for Stripe-like cadence.
 */
export function HomePage() {
  return (
    <MarketingShell overlay>
      <CinematicHero />
      <ClinicMarquee />
      <ProductSlider />
      <Capabilities />
      <AiInsightBand />
      <TrustSection />
      <PricingPreview />
      <FinalCta />
    </MarketingShell>
  );
}
