import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";

export async function generateMetadata(): Promise<Metadata> {
  const copy = (await getI18n()).m.legal.refund;
  return { title: copy.metaTitle, description: copy.metaDescription };
}

export default function RefundPage() {
  return (
    <WithMessages namespaces={["marketing", "modules"]}>
      <LegalPage policy="refund" />
    </WithMessages>
  );
}
