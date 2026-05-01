import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";
import { legalLastUpdated, termsSections } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Terms of Service | Vela",
  description:
    "Terms of Service for Vela / Clinicare clinic operations software.",
};

export default function TermsAndConditionsPage() {
  return (
    <LegalPage
      eyebrow="Terms and policies"
      title="Terms of Service"
      description="These terms explain how clinics may use Vela, what the product provides, and the responsibilities that come with managing client records, appointments, messages, media, reports, and AI-assisted operational insights."
      lastUpdated={legalLastUpdated}
      sections={termsSections}
    />
  );
}
