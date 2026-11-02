import type { Metadata } from "next";

import { AboutPage } from "@/components/marketing/about/about-page";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";

export async function generateMetadata(): Promise<Metadata> {
  return (await getI18n()).m.marketing.meta.about;
}

export default function Page() {
  return (
    <WithMessages namespaces={["marketing", "modules"]}>
      <AboutPage />
    </WithMessages>
  );
}
