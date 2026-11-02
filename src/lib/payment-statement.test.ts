import { describe, expect, it } from "vitest";

import { clients as en } from "@/i18n/messages/en/clients";
import { clients as sq } from "@/i18n/messages/sq/clients";
import { buildPaymentStatementCsv as build } from "@/lib/payment-statement";

const buildPaymentStatementCsv = (payments: Parameters<typeof build>[0]) => build(payments, en);

const payment = (overrides: Partial<Parameters<typeof build>[0][number]> = {}) => ({
  paidAt: "Sep 20, 2026",
  createdAt: "Sep 18, 2026",
  invoiceNumber: "INV-1",
  description: "Whitening",
  amountDisplay: "€125.00",
  status: "Paid",
  paymentMethod: "Card",
  receiptNumber: "R-1",
  ...overrides,
});

describe("buildPaymentStatementCsv", () => {
  it("writes a header and one quoted row per payment, in the documented column order", () => {
    expect(buildPaymentStatementCsv([payment()])).toBe(
      [
        '"Date","Invoice","Description","Amount","Status","Payment method","Receipt"',
        '"Sep 20, 2026","INV-1","Whitening","€125.00","Paid","Card","R-1"',
      ].join("\n")
    );
  });

  it("falls back to the created date, a ledger description and a manual method when they are blank", () => {
    const csv = buildPaymentStatementCsv([payment({ paidAt: "", description: "", paymentMethod: "", invoiceNumber: "", receiptNumber: "" })]);

    expect(csv.split("\n")[1]).toBe('"Sep 18, 2026","","Manual ledger entry","€125.00","Paid","Manual",""');
  });

  it("neutralises every column a person types into, so a statement can't run a formula", () => {
    const evil = '=HYPERLINK("http://evil.example","open")';
    const csv = buildPaymentStatementCsv([
      payment({ invoiceNumber: "=1+1", description: evil, paymentMethod: "+cmd", receiptNumber: "@SUM(A1)", status: "-1" }),
    ]);
    const row = csv.split("\n")[1];

    expect(row).toContain(`"'=1+1"`);
    expect(row).toContain(`"'=HYPERLINK(""http://evil.example"",""open"")"`);
    expect(row).toContain(`"'+cmd"`);
    expect(row).toContain(`"'@SUM(A1)"`);
    expect(row).toContain(`"'-1"`);
    // No cell of the row may start with an unguarded formula character.
    expect(row.match(/"(?:[^"]|"")*"/g)?.every((cell) => !/^"[=+\-@\t\r]/.test(cell))).toBe(true);
  });

  it("keeps generated values exactly as shown: a negative amount keeps its minus", () => {
    const row = buildPaymentStatementCsv([payment({ amountDisplay: "-€12.50" })]).split("\n")[1];

    expect(row).toContain('"-€12.50"');
    expect(row).not.toContain("'-€12.50");
  });

  it("gives an empty statement just the header", () => {
    expect(buildPaymentStatementCsv([])).toBe('"Date","Invoice","Description","Amount","Status","Payment method","Receipt"');
  });

  it("writes the statement in the reader's language", () => {
    expect(build([payment({ status: "Unpaid", paymentMethod: "" })], sq)).toBe(
      [
        '"Data","Fatura","Përshkrimi","Shuma","Statusi","Mënyra e pagesës","Dëftesa"',
        '"Sep 20, 2026","INV-1","Whitening","€125.00","Pa paguar","Manuale","R-1"',
      ].join("\n")
    );
  });
});
