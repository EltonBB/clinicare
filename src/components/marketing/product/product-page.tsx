import { MarketingShell } from "../shell/marketing-shell";
import { ModuleShowcase } from "./module-showcase";
import { ProductHero } from "./product-hero";
import { RecordStory } from "./record-story";

/** Product: rolling-word hero with the module rail, the module explorer, the record story; the footer closes. */
export function ProductPage() {
  return (
    <MarketingShell footerCta>
      <ProductHero />
      <ModuleShowcase />
      <RecordStory />
    </MarketingShell>
  );
}
