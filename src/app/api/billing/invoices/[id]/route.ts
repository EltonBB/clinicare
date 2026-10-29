import { NextResponse } from "next/server";

import { getInvoiceLinkAction } from "@/app/(workspace)/settings/billing-actions";

export const runtime = "nodejs";

/**
 * Settings › Billing's invoice download: a plain link (no pop-up to be blocked)
 * that checks the invoice is the signed-in clinic's own, then hands over to
 * Paddle's short-lived PDF link.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getInvoiceLinkAction(id);
  if (!result.ok) {
    return new NextResponse(result.error, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.redirect(result.url, { status: 303, headers: { "Cache-Control": "no-store" } });
}
