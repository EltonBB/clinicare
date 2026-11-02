import type { Metadata } from "next";

import { CheckoutSuccess } from "@/components/billing/checkout-success";
import { BrandMark } from "@/components/brand-mark";
import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";
import { requireCurrentUser } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.billing.checkout.meta.successTitle };
}

export default async function CheckoutSuccessPage() {
  await requireCurrentUser("/checkout/success");

  return (
    <main className="flex min-h-dvh flex-col bg-white px-5 py-6 sm:px-10 sm:py-8">
      <header>
        <BrandMark href="/" />
      </header>
      <div className="flex flex-1 items-center justify-center">
        <WithMessages namespaces={["billing"]}>
          <CheckoutSuccess />
        </WithMessages>
      </div>
    </main>
  );
}
