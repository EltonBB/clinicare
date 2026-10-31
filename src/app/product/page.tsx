import type { Metadata } from "next";

import { ProductPage } from "@/components/marketing/product/product-page";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";

export async function generateMetadata(): Promise<Metadata> {
  return (await getI18n()).m.marketing.meta.product;
}

export default function Page() {
  return (
    <WithMessages namespaces={["marketing", "modules"]}>
      <ProductPage />
    </WithMessages>
  );
}
