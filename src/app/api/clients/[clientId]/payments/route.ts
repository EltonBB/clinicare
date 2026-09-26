import { createReadStream } from "node:fs";
import { mkdtemp, open, rmdir, unlink, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { getCurrentUser } from "@/lib/auth";
import { getCurrentBusiness } from "@/lib/business";
import {
  buildPaymentPage, buildPaymentStatement, initialPaymentHistory,
  paymentCursorSchema, paymentHistoryWhere, paymentIdSchema,
  paymentCsvSelect, paymentOrder, type PaymentCursor,
} from "@/lib/client-payments";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const privateHeaders = { "Cache-Control": "private, no-store" };
const exportPageSize = 500;

export const runtime = "nodejs";

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: privateHeaders });
}

async function completeStatementResponse(businessId: string, clientId: string) {
  const directory = await mkdtemp(join(tmpdir(), "vela-payment-"));
  const filePath = join(directory, "statement.csv");
  const cleanup = async () => {
    await unlink(filePath).catch(() => {});
    await rmdir(directory).catch(() => {});
  };
  let file: FileHandle | undefined;
  try {
    // Stage a private, complete CSV before returning success. Paging keeps memory
    // bounded; one transaction keeps every page in the same database snapshot.
    file = await open(filePath, "wx", 0o600);
    await prisma.$transaction(async (tx) => {
      let cursor: PaymentCursor | undefined;
      let includeHeader = true;
      for (;;) {
        const rows = await tx.clientPayment.findMany({
          where: paymentHistoryWhere(businessId, clientId, cursor),
          select: paymentCsvSelect, orderBy: paymentOrder, take: exportPageSize,
        });
        await file!.writeFile(buildPaymentStatement(rows, includeHeader), "utf8");
        includeHeader = false;
        if (rows.length < exportPageSize) break;
        const last = rows.at(-1)!;
        cursor = { id: last.id, createdAt: last.createdAt.toISOString() };
      }
    }, { isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 120_000 });
    await file.close();
    file = undefined;

    const stream = createReadStream(filePath);
    stream.once("close", () => { void cleanup(); });
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="payment-statement.csv"',
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    await file?.close().catch(() => {});
    await cleanup();
    throw error;
  }
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
      return await completeStatementResponse(business.id, clientId);
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
