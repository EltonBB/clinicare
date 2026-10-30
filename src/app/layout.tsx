import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { connection } from "next/server";

import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vela",
  description: "Modern client and appointment management for service businesses.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Every page renders per request so its scripts carry the request's CSP nonce
  // (proxy.ts); a prerendered page would have none and all its scripts would be blocked.
  await connection();

  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full font-sans text-foreground"
      >
        {children}
      </body>
    </html>
  );
}
