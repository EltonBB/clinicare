import type { PaddleTransaction } from "@/lib/paddle/paddle-api";
import { formatZonedFullDate } from "@/lib/time-zone";

export type BillingHistoryRow = {
  id: string;
  date: string;
  amount: string;
  status: "Paid" | "Free trial" | "Payment failed";
};

export type BillingCard = { brand: string; last4: string; expires: string };

export type BillingHistory = { card: BillingCard | null; rows: BillingHistoryRow[] };

const CARD_BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  american_express: "Amex",
  discover: "Discover",
  jcb: "JCB",
  maestro: "Maestro",
  diners_club: "Diners Club",
  union_pay: "UnionPay",
};

/**
 * Settings › Billing's history: the clinic's charges newest first, and the card
 * on file (the card of the newest card payment, a card update included). A card
 * update itself is not a charge, so it isn't listed.
 */
export function buildBillingHistory(transactions: PaddleTransaction[], timeZone?: string): BillingHistory {
  let card: BillingCard | null = null;
  const rows: BillingHistoryRow[] = [];

  for (const transaction of transactions) {
    const paid = transaction.payments.find((payment) => payment.method_details?.card);
    const details = paid?.method_details?.card;
    if (!card && details) {
      card = {
        brand: CARD_BRANDS[details.type] ?? "Card",
        last4: details.last4,
        expires: `${String(details.expiry_month).padStart(2, "0")}/${String(details.expiry_year).slice(-2)}`,
      };
    }
    if (transaction.origin === "subscription_payment_method_change") continue;

    const minor = Number(transaction.details.totals.grand_total);
    rows.push({
      id: transaction.id,
      date: formatZonedFullDate(new Date(transaction.billed_at ?? transaction.created_at), timeZone),
      amount: formatMinorAmount(minor, transaction.currency_code),
      status: transaction.status === "past_due" ? "Payment failed" : minor === 0 ? "Free trial" : "Paid",
    });
  }

  return { card, rows };
}

/** 86900 + "EUR" → "€869.00", in the currency's own number of decimals. */
export function formatMinorAmount(minor: number, currency: string): string {
  const format = new Intl.NumberFormat("en", { style: "currency", currency });
  const decimals = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(minor / 10 ** decimals);
}
