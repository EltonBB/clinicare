import { describe, expect, it } from "vitest";

import { LEGAL_ENTITY, MERCHANT_OF_RECORD_NOTICE, refundSections, termsSections } from "./legal-content";

const text = (sections: { body: string[] }[]) => sections.flatMap((section) => section.body).join(" ");

// Paddle's domain review rejects a site whose policies miss these, and GDPR
// needs the provider's identity: the pages can't ship until they're right.
describe("legal pages", () => {
  it("name the legal entity and its registered address (no placeholder left)", () => {
    expect(LEGAL_ENTITY.name).not.toMatch(/^\[/);
    expect(LEGAL_ENTITY.address).not.toMatch(/^\[/);
  });

  it("carry Paddle's Merchant of Record sentence verbatim in the terms and refund policy", () => {
    const notice =
      "Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders.";
    expect(MERCHANT_OF_RECORD_NOTICE).toBe(notice);
    expect(text(termsSections)).toContain(notice);
    expect(text(refundSections)).toContain(notice);
  });

  it("give a 14-to-90-day refund window, through paddle.net, with no 'no refunds' wording", () => {
    const refund = text(refundSections);
    expect(refund).toContain("within 14 days");
    expect(refund).toContain("paddle.net");
    expect(refund).not.toMatch(/all sales are final|no refunds/i);
  });
});
