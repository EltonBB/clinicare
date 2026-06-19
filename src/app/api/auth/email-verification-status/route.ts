import { NextRequest, NextResponse } from "next/server";

import { getEmailVerificationReceiptStatus } from "@/lib/email-verification-receipts";

function isValidTicket(value: string | null | undefined) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

export async function GET(request: NextRequest) {
  const ticket = request.nextUrl.searchParams.get("ticket");

  if (!isValidTicket(ticket)) {
    return NextResponse.json(
      { verified: false },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const status = await getEmailVerificationReceiptStatus(ticket);
  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
