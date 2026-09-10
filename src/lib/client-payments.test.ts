import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPaymentPage, buildPaymentStatement, csvCell, type PaymentRow } from "./client-payments";

const mocks = vi.hoisted(() => ({
  paymentGroupBy: vi.fn(), paymentCount: vi.fn(),
  appointmentGroupBy: vi.fn(), appointmentCount: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  clientPayment: { groupBy: mocks.paymentGroupBy, count: mocks.paymentCount },
  appointment: { groupBy: mocks.appointmentGroupBy, count: mocks.appointmentCount },
} }));
vi.mock("@/lib/media-storage-server", () => ({ resolveMediaDisplayUrls: async () => new Map() }));

import { buildClientRecord } from "./clients";

const row: PaymentRow = {
  id: "payment-001", appointmentId: null, amountCents: 1234,
  status: "Paid", description: null, invoiceNumber: null, receiptNumber: null,
  paymentMethod: null, billingNote: null, receiptUrl: null, paidAt: null,
  createdAt: new Date("2026-09-01T12:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appointmentGroupBy.mockResolvedValue([]);
  mocks.appointmentCount.mockResolvedValue(0);
  mocks.paymentGroupBy.mockResolvedValue([]);
  mocks.paymentCount.mockResolvedValue(0);
});

describe("payment statements", () => {
  it.each(["=1+2", "+1", "-1", "@SUM(A1)", " \t\r\n=1", "\u0000\u001f+1", "\uFEFF\u200B@SUM(A1)"])("neutralizes formula prefix %j", (text) => {
    expect(csvCell(text)).toBe(`"'${text}"`);
  });

  it("quotes commas, embedded quotes and line breaks without losing text", () => {
    expect(csvCell('Invoice, "one"\r\nsecond line')).toBe('"Invoice, ""one""\r\nsecond line"');
    expect(csvCell(" ordinary text")).toBe('" ordinary text"');
  });

  it("exports every supplied row and protects each untrusted column", () => {
    const rows = Array.from({ length: 125 }, (_, index) => ({ ...row, id: `p-${index}`, invoiceNumber: `Invoice-${index}` }));
    rows[124] = { ...rows[124], invoiceNumber: " =1", description: '+"x,y"\nnext', status: "@status", paymentMethod: "\t-command", receiptNumber: "\r=receipt" };
    const csv = buildPaymentStatement(rows);
    expect(csv).toContain('"Invoice-0"');
    expect(csv).toContain('"Invoice-123"');
    expect(csv).toContain('"\' =1","\'+""x,y""\nnext"');
    expect(csv).toContain('"\'@status","\'\t-command","\'\r=receipt"');
    expect((csv.match(/Sep 1, 2026/g) ?? [])).toHaveLength(125);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("uses the extra row only to signal another page, including exact end-of-history", () => {
    const rows = Array.from({ length: 61 }, (_, index) => ({ ...row, id: `p-${index}` }));
    expect(buildPaymentPage(rows).payments).toHaveLength(60);
    expect(buildPaymentPage(rows).nextCursor).toEqual({ id: "p-59", createdAt: row.createdAt.toISOString() });
    expect(buildPaymentPage(rows.slice(0, 60)).nextCursor).toBeNull();
    expect(buildPaymentPage([])).toEqual({ payments: [], nextCursor: null });
  });
});

describe("full-history payment totals", () => {
  it("reconciles more than 60 entries without changing status or currency meanings", async () => {
    // 80 ledger entries, but only the first 61 arrive with the client query.
    mocks.paymentGroupBy.mockResolvedValue([
      { status: "Paid", _sum: { amountCents: 70_000 }, _count: 70 },
      { status: "Unpaid", _sum: { amountCents: 5_000 }, _count: 5 },
      { status: "Partially Paid", _sum: { amountCents: 3_000 }, _count: 3 },
      { status: "Refunded", _sum: { amountCents: -1_000 }, _count: 1 },
      { status: "paid", _sum: { amountCents: 1_000 }, _count: 1 },
    ]);
    mocks.paymentCount.mockResolvedValue(73);
    const input = {
      id: "client-1", businessId: "business-1", name: "Synthetic client", phone: "15550000001",
      createdAt: row.createdAt, tags: [], appointments: [], messages: [], galleryItems: [],
      medications: [], documents: [], healthItems: [], careNotes: [], treatmentPlanItems: [], followUpReminders: [],
      payments: Array.from({ length: 61 }, (_, index) => ({ ...row, id: `p-${index}` })),
    } as unknown as Parameters<typeof buildClientRecord>[0];
    const record = await buildClientRecord(input);
    expect(record.payments).toHaveLength(60);
    expect(record.paymentNextCursor?.id).toBe("p-59");
    expect(record.paymentStats).toMatchObject({
      totalBilledCents: 78_000, totalPaidCents: 70_000, unpaidBalanceCents: 8_000,
      ledgerEntries: 80, paidEntries: 71, receiptsLinked: 73, paymentStatus: "Partially Paid",
    });
    expect(record.paymentStats.totalBilledDisplay).toBe("$780.00");
    expect(mocks.paymentGroupBy).toHaveBeenCalledWith({
      by: ["status"], where: { businessId: "business-1", clientId: "client-1" },
      _sum: { amountCents: true }, _count: true,
    });
    expect(mocks.paymentCount).toHaveBeenCalledWith({ where: {
      businessId: "business-1", clientId: "client-1", receiptUrl: { not: null }, NOT: { receiptUrl: "" },
    } });
  });
});
