import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { connection } from "next/server";

import { getI18n } from "@/i18n/server";
import { WithMessages } from "@/i18n/with-messages";

import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: "Vela", description: m.common.meta.description };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Every page renders per request so its scripts carry the request's CSP nonce
  // (proxy.ts); a prerendered page would have none and all its scripts would be blocked.
  await connection();
  const { locale } = await getI18n();

  return (
    <html
      lang={locale}
      className={`${plusJakarta.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full font-sans text-foreground"
      >
        <WithMessages namespaces={["common"]}>{children}</WithMessages>
      </body>
    </html>
  );
}
