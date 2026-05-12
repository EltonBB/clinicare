import type { Metadata } from "next";

import { PricingPageContent } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Pricing | Vela",
  description:
    "Simple Vela pricing for clinics that need scheduling, patient records, reminders, payments, and AI reports.",
};

export default function Page() {
  return <PricingPageContent />;
}
