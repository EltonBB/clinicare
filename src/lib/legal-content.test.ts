import { describe, expect, it } from "vitest";

import { messages } from "@/i18n/messages";

import { LEGAL_ENTITY, policySections } from "./legal-content";

const text = (sections: { body: string[] }[]) => sections.flatMap((section) => section.body).join(" ");

// Paddle's domain review rejects a site whose policies miss these, and GDPR
// needs the provider's identity: the pages can't ship until they're right.
describe("legal pages", () => {
  it("name the legal entity and its registered address (no placeholder left)", () => {
    expect(LEGAL_ENTITY.name).not.toMatch(/^\[/);
    expect(LEGAL_ENTITY.address).not.toMatch(/^\[/);
    for (const locale of ["en", "sq"] as const) {
      for (const policy of ["terms", "privacy", "refund"] as const) {
        expect(text(policySections(messages[locale].legal, policy))).not.toMatch(/\{\w+\}/);
      }
      expect(text(policySections(messages[locale].legal, "terms"))).toContain(LEGAL_ENTITY.address);
    }
  });

  it("carry Paddle's Merchant of Record sentence verbatim in the terms and refund policy", () => {
    const notice =
      "Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders.";
    const en = messages.en.legal;
    expect(en.merchantNotice).toBe(notice);
    expect(text(policySections(en, "terms"))).toContain(notice);
    expect(text(policySections(en, "refund"))).toContain(notice);
    // The Albanian pages carry their own translation of it, naming the term in English.
    expect(text(policySections(messages.sq.legal, "refund"))).toContain("Merchant of Record");
  });

  it("give a 14-to-90-day refund window, through paddle.net, with no 'no refunds' wording", () => {
    const refund = text(policySections(messages.en.legal, "refund"));
    expect(refund).toContain("within 14 days");
    expect(refund).toContain("paddle.net");
    expect(refund).not.toMatch(/all sales are final|no refunds/i);
    expect(text(policySections(messages.sq.legal, "refund"))).toContain("paddle.net");
  });
});
