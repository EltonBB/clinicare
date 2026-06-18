import type { Metadata } from "next";

import { PricingPageContent } from "@/components/marketing/pricing/pricing-page";

export const metadata: Metadata = {
  title: "Pricing | Vela",
  description:
    "Simple Vela pricing for clinics that need scheduling, patient records, reminders, payments, and AI reports.",
};

export default function Page() {
  return <PricingPageContent />;
}
