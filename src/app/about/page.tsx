import type { Metadata } from "next";

import { AboutPage } from "@/components/marketing/about/about-page";

export const metadata: Metadata = {
  title: "About | Vela",
  description:
    "Learn why Vela is building a calmer operating system for clinics, with clear privacy, terms, and refund policies.",
};

export default function Page() {
  return <AboutPage />;
}
