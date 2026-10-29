import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";
import { legalLastUpdated, privacySections } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Privacy Policy | Vela",
  description:
    "Privacy Policy for Vela clinic operations software.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      current="privacy"
      title="Privacy Policy"
      description="This policy explains what information Vela processes, how clinic and client data is used to run the workspace, and how account owners can request support with privacy, export, correction, or deletion."
      lastUpdated={legalLastUpdated}
      sections={privacySections}
    />
  );
}
