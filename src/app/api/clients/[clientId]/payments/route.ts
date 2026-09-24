import { getCurrentUser } from "@/lib/auth";
import { getCurrentBusiness } from "@/lib/business";
import {
  buildPaymentPage, buildPaymentStatement, initialPaymentHistory,
  paymentCursorSchema, paymentHistoryWhere, paymentIdSchema,
  paymentOrder, paymentSelect, type PaymentCursor,
} from "@/lib/client-payments";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const privateHeaders = { "Cache-Control": "private, no-store" };

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: privateHeaders });
}

export async function GET(request: Request, context: { params: Promise<{ clientId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return errorResponse("Log in again to view payments.", 401);
  const business = await getCurrentBusiness(user.id);
  if (!business) return errorResponse("Workspace not found.", 404);

  const { clientId } = await context.params;
  const query = new URL(request.url).searchParams;
  const format = query.get("format");
  const rawCursor = query.get("cursor");
  if (!paymentIdSchema.safeParse(clientId).success || (format !== null && format !== "csv")) {
    return errorResponse("Invalid payment request.", 400);
  }
  let cursor: PaymentCursor | undefined;
  if (rawCursor !== null) {
    try {
      if (rawCursor.length > 200 || format === "csv") throw new Error("Invalid cursor");
      cursor = paymentCursorSchema.parse(JSON.parse(rawCursor));
    } catch {
      return errorResponse("Invalid payment request.", 400);
    }
  }

  const rate = await checkRateLimit(`client-payments:${format === "csv" ? "export" : "page"}:${user.id}`, {
    limit: format === "csv" ? 3 : 60, windowMs: 60_000,
  });
  if (!rate.allowed) {
    return Response.json({ error: "Please wait a moment and try again." }, {
      status: 429, headers: { ...privateHeaders, "Retry-After": String(rate.retryAfterSeconds) },
    });
  }

  try {
    const client = await prisma.client.findFirst({
      where: { id: clientId, businessId: business.id }, select: { id: true },
    });
    if (!client) return errorResponse("Client not found.", 404);

    if (format === "csv") {
      // One SELECT gives a consistent row snapshot. Build the entire file before
      // sending success, so a query/encoding failure cannot produce a partial CSV.
      const rows = await prisma.clientPayment.findMany({
        where: paymentHistoryWhere(business.id, clientId),
        select: paymentSelect, orderBy: paymentOrder,
      });
      return new Response(buildPaymentStatement(rows), {
        headers: {
          ...privateHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="payment-statement.csv"',
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const rows = await prisma.clientPayment.findMany({
      ...initialPaymentHistory,
      where: paymentHistoryWhere(business.id, clientId, cursor),
    });
    return Response.json(buildPaymentPage(rows), { headers: privateHeaders });
  } catch {
    return errorResponse("We couldn't load the payments. Please try again.", 500);
  }
}
