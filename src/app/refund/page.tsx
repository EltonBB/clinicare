import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";
import { legalLastUpdated, refundSections } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Refund Policy | Vela",
  description:
    "Refund Policy for Vela / Clinicare subscriptions and billing.",
};

export default function RefundPage() {
  return (
    <LegalPage
      eyebrow="Terms and policies"
      title="Refund Policy"
      description="This policy explains cancellations, renewals, first-period refund requests, annual plans, provider costs, duplicate charges, and how clinics can contact support about billing issues."
      lastUpdated={legalLastUpdated}
      sections={refundSections}
    />
  );
}
