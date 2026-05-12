import type { Metadata } from "next";

import { ContactPage } from "@/components/marketing/marketing-site";

export const metadata: Metadata = {
  title: "Contact | Vela",
  description:
    "Contact Vela to request a clinic software demo, ask questions, or get help with setup.",
};

export default function Page() {
  return <ContactPage />;
}
