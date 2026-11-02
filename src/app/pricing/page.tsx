import type { Metadata } from "next";

import { PricingPageContent } from "@/components/marketing/pricing/pricing-page";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";

export async function generateMetadata(): Promise<Metadata> {
  return (await getI18n()).m.marketing.meta.pricing;
}

export default function Page() {
  return (
    <WithMessages namespaces={["marketing", "modules"]}>
      <PricingPageContent />
    </WithMessages>
  );
}
