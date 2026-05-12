import type { Metadata } from "next";

import { HomePage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Vela | Clinic operating system",
  description:
    "Run appointments, patients, staff, payments, reminders, documents, and AI reports from one fast clinic workspace.",
};

export default function Page() {
  return <HomePage />;
}
