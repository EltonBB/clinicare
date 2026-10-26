import type { Metadata } from "next";

import { CheckoutSuccess } from "@/components/billing/checkout-success";
import { BrandMark } from "@/components/brand-mark";
import { requireCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Setting up your plan | Vela" };

export default async function CheckoutSuccessPage() {
  await requireCurrentUser("/checkout/success");

  return (
    <main className="flex min-h-dvh flex-col bg-white px-5 py-6 sm:px-10 sm:py-8">
      <header>
        <BrandMark href="/" includeSubtitle={false} />
      </header>
      <div className="flex flex-1 items-center justify-center">
        <CheckoutSuccess />
      </div>
    </main>
  );
}
