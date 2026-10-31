import type { Metadata } from "next";

import { ProductPage } from "@/components/marketing/product/product-page";
import { WithMessages } from "@/i18n/with-messages";

export const metadata: Metadata = {
  title: "Product | Vela",
  description:
    "Explore how Vela manages bookings, patient records, communication, payments, files, and AI clinic reports.",
};

export default function Page() {
  return (
    <WithMessages namespaces={["marketing", "modules"]}>
      <ProductPage />
    </WithMessages>
  );
}
