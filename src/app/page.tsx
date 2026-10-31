import type { Metadata } from "next";

import { HomePage } from "@/components/marketing/home/home-page";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";

export async function generateMetadata(): Promise<Metadata> {
  return (await getI18n()).m.marketing.meta.home;
}

export default function Page() {
  return (
    <WithMessages namespaces={["marketing", "modules"]}>
      <HomePage />
    </WithMessages>
  );
}
