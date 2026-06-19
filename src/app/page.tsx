import type { Metadata } from "next";

import { HomePage } from "@/components/marketing/home/home-page";

export const metadata: Metadata = {
  title: "Vela | Clinic management workspace",
  description:
    "Run appointments, patients, staff, WhatsApp messages, payments, documents, reports, and AI-assisted operational insights from one calm clinic workspace.",
};

export default function Page() {
  return <HomePage />;
}
