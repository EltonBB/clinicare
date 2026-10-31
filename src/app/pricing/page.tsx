import type { Metadata } from "next";

import { PricingPageContent } from "@/components/marketing/pricing/pricing-page";
import { WithMessages } from "@/i18n/with-messages";

export const metadata: Metadata = {
  title: "Pricing | Vela",
  description:
    "Simple Vela pricing for clinics that need scheduling, patient records, reminders, payments, and AI reports.",
};

export default function Page() {
  return (
    <WithMessages namespaces={["marketing", "modules"]}>
      <PricingPageContent />
    </WithMessages>
  );
}
