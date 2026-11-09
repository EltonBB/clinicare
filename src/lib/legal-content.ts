import type { LegalSection } from "@/components/legal/legal-page";
import { fmt } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { SUPPORT_EMAIL } from "./public-contact";

/** The day the policies last changed (their words live in the `legal` dictionaries). */
export const legalLastUpdatedOn = new Date("2026-11-09T12:00:00Z");

/**
 * Who provides Vela: Paddle's domain review and GDPR both require the legal
 * entity's name and registered address on these pages. Vela is the product;
 * Birdz LLC is the company that provides it.
 */
export const LEGAL_ENTITY = {
  name: "Birdz LLC",
  address: "Office 171, 254 Chapman Rd, Suite 101-B, Newark, DE 19702, USA",
};

export type Policy = "terms" | "privacy" | "refund";

/** A policy's sections in one language, with the entity, support address and Paddle's notice filled in. */
export function policySections(copy: Messages["legal"], policy: Policy): LegalSection[] {
  const values = {
    entity: LEGAL_ENTITY.name,
    address: LEGAL_ENTITY.address,
    email: SUPPORT_EMAIL,
    mor: copy.merchantNotice,
  };
  return copy[policy].sections.map((section) => ({
    title: section.title,
    body: section.body.map((paragraph) => fmt(paragraph, values)),
  }));
}
