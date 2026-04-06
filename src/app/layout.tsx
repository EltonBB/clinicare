import type { Metadata } from "next";

import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Vela",
  description: "Modern client and appointment management for service businesses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        suppressHydrationWarning
        className="min-h-full font-sans text-foreground"
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
