import type { Metadata } from "next";

import { ContactPage } from "@/components/marketing/contact/contact-page";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";

export async function generateMetadata(): Promise<Metadata> {
  return (await getI18n()).m.marketing.meta.contact;
}

export default function Page() {
  return (
    <WithMessages namespaces={["marketing", "modules"]}>
      <ContactPage />
    </WithMessages>
  );
}
