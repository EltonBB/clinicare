import type { Prisma } from "@prisma/client";
import { format } from "date-fns";
import { z } from "zod";

import type { ClientPaymentEntry } from "@/lib/clients";
import { formatCurrency } from "@/lib/utils";

export const PAYMENT_PAGE_SIZE = 60;
export const paymentIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
export const paymentCursorSchema = z.object({
  id: paymentIdSchema,
  createdAt: z.iso.datetime(),
}).strict();
export type PaymentCursor = z.infer<typeof paymentCursorSchema>;

export const paymentSelect = {
  id: true, appointmentId: true, amountCents: true, status: true,
  description: true, invoiceNumber: true, receiptNumber: true,
  paymentMethod: true, billingNote: true, receiptUrl: true,
  paidAt: true, createdAt: true,
} satisfies Prisma.ClientPaymentSelect;

export type PaymentRow = Prisma.ClientPaymentGetPayload<{ select: typeof paymentSelect }>;
export const paymentOrder = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.ClientPaymentOrderByWithRelationInput[];

export const initialPaymentHistory = {
  select: paymentSelect,
  orderBy: paymentOrder,
  take: PAYMENT_PAGE_SIZE + 1,
};

export function paymentHistoryWhere(businessId: string, clientId: string, cursor?: PaymentCursor): Prisma.ClientPaymentWhereInput {
  return {
    businessId, clientId,
    // Explicit keyset bounds still work if the preceding row was deleted.
    ...(cursor ? { OR: [
      { createdAt: { lt: new Date(cursor.createdAt) } },
      { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
    ] } : {}),
  };
}

export function buildPaymentPage(rows: PaymentRow[]): { payments: ClientPaymentEntry[]; nextCursor: PaymentCursor | null } {
  const visible = rows.slice(0, PAYMENT_PAGE_SIZE);
  const last = visible.at(-1);
  return {
    payments: visible.map((payment) => ({
      id: payment.id,
      appointmentId: payment.appointmentId ?? "",
      amountCents: payment.amountCents,
      amountDisplay: formatCurrency(payment.amountCents),
      amountInput: (payment.amountCents / 100).toFixed(2),
      status: payment.status,
      description: payment.description ?? "",
      invoiceNumber: payment.invoiceNumber ?? "",
      receiptNumber: payment.receiptNumber ?? "",
      paymentMethod: payment.paymentMethod ?? "",
      billingNote: payment.billingNote ?? "",
      receiptUrl: payment.receiptUrl ?? "",
      paidAt: payment.paidAt ? format(payment.paidAt, "MMM d, yyyy") : "",
      paidAtInput: payment.paidAt ? format(payment.paidAt, "yyyy-MM-dd") : "",
      createdAt: format(payment.createdAt, "MMM d, yyyy"),
    })),
    nextCursor: rows.length > PAYMENT_PAGE_SIZE && last
      ? { id: last.id, createdAt: last.createdAt.toISOString() } : null,
  };
}

export function csvCell(value: string): string {
  // Spreadsheet apps may ignore leading whitespace/control characters before
  // interpreting a formula. Prefix the original cell, preserving its text.
  const safe = /^[\s\p{Cc}\p{Cf}]*[=+@-]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildPaymentStatement(rows: PaymentRow[]): string {
  return [
    ["Date", "Invoice", "Description", "Amount", "Status", "Payment method", "Receipt"],
    ...rows.map((payment) => [
      format(payment.paidAt ?? payment.createdAt, "MMM d, yyyy"),
      payment.invoiceNumber ?? "",
      payment.description || "Manual ledger entry",
      formatCurrency(payment.amountCents),
      payment.status,
      payment.paymentMethod || "Manual",
      payment.receiptNumber ?? "",
    ]),
  ].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
