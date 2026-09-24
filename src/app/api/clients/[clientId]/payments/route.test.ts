import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentRow } from "@/lib/client-payments";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), business: vi.fn(), client: vi.fn(), payments: vi.fn(), rate: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/business", () => ({ getCurrentBusiness: mocks.business }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  client: { findFirst: mocks.client }, clientPayment: { findMany: mocks.payments },
} }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }));
import { GET } from "./route";

const rows: PaymentRow[] = Array.from({ length: 125 }, (_, index) => ({
  id: `payment-${String(125 - index).padStart(3, "0")}`, appointmentId: null,
  createdAt: new Date("2026-09-01T12:00:00.000Z"), paidAt: null,
  amountCents: 1000, status: "Paid", description: `Synthetic entry ${index}`,
  invoiceNumber: null, receiptNumber: null, paymentMethod: null, billingNote: null, receiptUrl: null,
}));

function request(query = "", clientId = "client-1") {
  return GET(new Request(`http://localhost/api/clients/${clientId}/payments${query}`), {
    params: Promise.resolve({ clientId }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "user-1" });
  mocks.business.mockResolvedValue({ id: "business-1" });
  mocks.client.mockResolvedValue({ id: "client-1" });
  mocks.payments.mockResolvedValue([]);
  mocks.rate.mockResolvedValue({ allowed: true });
});

describe("authenticated payment history", () => {
  it("rejects anonymous requests before reading any tenant data", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(mocks.business).not.toHaveBeenCalled();
    expect(mocks.payments).not.toHaveBeenCalled();
  });

  it.each(["", "?format=csv"])("hides foreign or missing clients for %s", async (query) => {
    mocks.client.mockResolvedValue(null);
    const response = await request(query, "foreign-client");
    expect(response.status).toBe(404);
    expect(mocks.client).toHaveBeenCalledWith({ where: { id: "foreign-client", businessId: "business-1" }, select: { id: true } });
    expect(mocks.payments).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each(["?cursor=not-json", "?cursor=null", '?cursor=%7B%7D', '?cursor=' + encodeURIComponent(JSON.stringify({ id: "p-1", createdAt: "not-a-date" })), "?format=html", "?format=csv&cursor={}"])("rejects malformed query %s", async (query) => {
    expect((await request(query)).status).toBe(400);
    expect(mocks.payments).not.toHaveBeenCalled();
  });

  it("rejects malformed client identifiers", async () => {
    expect((await request("", "bad client")).status).toBe(400);
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("covers equal timestamps across all pages with no skips or duplicates", async () => {
    mocks.payments.mockResolvedValueOnce(rows.slice(0, 61)).mockResolvedValueOnce(rows.slice(60, 121)).mockResolvedValueOnce(rows.slice(120));
    const first = await (await request()).json();
    const second = await (await request(`?cursor=${encodeURIComponent(JSON.stringify(first.nextCursor))}`)).json();
    const third = await (await request(`?cursor=${encodeURIComponent(JSON.stringify(second.nextCursor))}`)).json();
    expect([...first.payments, ...second.payments, ...third.payments].map((row: { id: string }) => row.id)).toEqual(rows.map((row) => row.id));
    expect(third.nextCursor).toBeNull();
    expect(mocks.payments).toHaveBeenNthCalledWith(1, expect.objectContaining({
      take: 61, where: { businessId: "business-1", clientId: "client-1" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }));
    for (const [call, cursor] of [[2, first.nextCursor], [3, second.nextCursor]] as const) {
      expect(mocks.payments).toHaveBeenNthCalledWith(call, expect.objectContaining({
        take: 61, where: { businessId: "business-1", clientId: "client-1", OR: [
          { createdAt: { lt: rows[0].createdAt } },
          { createdAt: rows[0].createdAt, id: { lt: cursor.id } },
        ] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }));
    }
  });

  it("exports the complete scoped result, not a page, with safe attachment headers", async () => {
    mocks.payments.mockResolvedValue(rows);
    const response = await request("?format=csv");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="payment-statement.csv"');
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const csv = await response.text();
    expect(csv.split("\r\n")).toHaveLength(127);
    expect(csv).toContain('"Synthetic entry 124"');
    expect(mocks.payments).toHaveBeenCalledExactlyOnceWith({
      where: { businessId: "business-1", clientId: "client-1" },
      select: expect.any(Object), orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  });

  it("returns an error rather than a partial successful CSV on database failure", async () => {
    mocks.payments.mockRejectedValue(new Error("sensitive database details"));
    const response = await request("?format=csv");
    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(await response.text()).not.toContain("sensitive");
  });

  it("throttles complete exports before querying payment data", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    const response = await request("?format=csv");
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(mocks.payments).not.toHaveBeenCalled();
  });
});
