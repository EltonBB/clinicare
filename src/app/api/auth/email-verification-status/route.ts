import { NextRequest, NextResponse } from "next/server";

import {
  getEmailVerificationReceiptStatus,
  markEmailVerificationReceiptVerified,
} from "@/lib/email-verification-receipts";

export async function GET(request: NextRequest) {
  const ticket = request.nextUrl.searchParams.get("ticket");
  const status = await getEmailVerificationReceiptStatus(ticket);
  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { ticket?: string }
    | null;

  await markEmailVerificationReceiptVerified(body?.ticket);

  return NextResponse.json({ ok: true });
}
