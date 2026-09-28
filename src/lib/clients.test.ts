import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    clientPayment: { groupBy: vi.fn() },
  },
  resolveMediaDisplayUrls: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/media-storage-server", () => ({ resolveMediaDisplayUrls: mocks.resolveMediaDisplayUrls }));

import { buildClientRecord } from "@/lib/clients";

const PAID_AT = new Date("2026-09-10T09:00:00.000Z");

function clientFixture(): Parameters<typeof buildClientRecord>[0] {
  return {
    id: "client_1",
    businessId: "biz_1",
    name: "Mira Krasniqi",
    email: null,
    phone: "+38344123456",
    gender: null,
    dateOfBirth: null,
    address: null,
    notes: null,
    patientType: null,
    clinicType: null,
    preferredChannel: null,
    assignedStaffName: null,
    status: "ACTIVE",
    isArchived: false,
    lastVisitAt: null,
    medicalHistory: null,
    allergies: null,
    importantHealthNotes: null,
    previousTreatments: null,
    treatmentPlan: null,
    createdAt: PAID_AT,
    updatedAt: PAID_AT,
    appointments: [],
    messages: [],
    galleryItems: [],
    medications: [],
    documents: [],
    payments: [
      {
        id: "pay_1",
        appointmentId: null,
        amountCents: 12500,
        status: "Paid",
        description: "Cleaning",
        invoiceNumber: null,
        receiptNumber: null,
        paymentMethod: null,
        billingNote: null,
        receiptUrl: null,
        paidAt: PAID_AT,
        createdAt: PAID_AT,
      },
      {
        id: "pay_2",
        appointmentId: null,
        amountCents: 4050,
        status: "Unpaid",
        description: null,
        invoiceNumber: null,
        receiptNumber: null,
        paymentMethod: null,
        billingNote: null,
        receiptUrl: null,
        paidAt: null,
        createdAt: PAID_AT,
      },
    ],
    healthItems: [],
    careNotes: [],
    treatmentPlanItems: [],
    followUpReminders: [],
  } as unknown as Parameters<typeof buildClientRecord>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.clientPayment.groupBy.mockResolvedValue([
    { status: "Paid", _sum: { amountCents: 12500 } },
    { status: "Unpaid", _sum: { amountCents: 4050 } },
  ]);
  mocks.resolveMediaDisplayUrls.mockResolvedValue(new Map());
});

describe("buildClientRecord — money in the clinic's currency", () => {
  it("formats every amount on the record in the currency it is given", async () => {
    const record = await buildClientRecord(clientFixture(), "EUR");

    expect(record.payments.map((payment) => payment.amountDisplay)).toEqual(["€125.00", "€40.50"]);
    expect(record.paymentStats).toMatchObject({
      totalPaidDisplay: "€125.00",
      unpaidBalanceDisplay: "€40.50",
      totalBilledDisplay: "€165.50",
    });
    expect(record.timeline.find((entry) => entry.id === "payment-pay_1")?.title).toBe("€125.00 paid");
  });

  it("shows dollars only for a clinic that chose dollars", async () => {
    const record = await buildClientRecord(clientFixture(), "USD");

    expect(record.paymentStats.totalBilledDisplay).toBe("$165.50");
    expect(record.payments[0]?.amountDisplay).toBe("$125.00");
  });

  it("keeps the raw cents and the editable amount independent of the currency", async () => {
    const eur = await buildClientRecord(clientFixture(), "EUR");
    const gbp = await buildClientRecord(clientFixture(), "GBP");

    expect(eur.payments[0]).toMatchObject({ amountCents: 12500, amountInput: "125.00" });
    expect(gbp.payments[0]).toMatchObject({ amountCents: 12500, amountInput: "125.00" });
    expect(gbp.payments[0]?.amountDisplay).toBe("£125.00");
  });

  it("reads an unsupported stored currency as the default rather than failing", async () => {
    const record = await buildClientRecord(clientFixture(), "not-a-currency");

    expect(record.paymentStats.totalPaidDisplay).toBe("€125.00");
  });

  // CodeRabbit #131: `client.payments` is the capped take:60 display list, so a
  // client with more history than that must not have billed computed from it —
  // billed has to come from the same unbounded groupBy as paid/unpaid, or
  // billed can read lower than paid + unpaid on the very same stats row.
  it("computes billed from the full payment history, not the capped display list", async () => {
    mocks.prisma.clientPayment.groupBy.mockResolvedValue([
      { status: "Paid", _sum: { amountCents: 500_000 } },
      { status: "Unpaid", _sum: { amountCents: 50_000 } },
    ]);

    const record = await buildClientRecord(clientFixture(), "EUR");

    // The display list (clientFixture's two payments) only totals €165.50 —
    // far less than the full-history sums above.
    expect(record.paymentStats.totalBilledDisplay).toBe("€5,500.00");
    expect(record.paymentStats.totalPaidDisplay).toBe("€5,000.00");
    expect(record.paymentStats.unpaidBalanceDisplay).toBe("€500.00");
  });
});
