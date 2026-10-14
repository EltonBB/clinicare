import { NextResponse } from "next/server";

// Enough for a 4,000-character message even when every character is JSON-escaped.
export const MOBILE_JSON_MAX_BYTES = 32 * 1024;
const BODY_READ_TIMEOUT_MS = 10_000;

type BodyResult = { data: unknown } | { response: NextResponse };

function rejected(status: number, error: string): BodyResult {
  return { response: NextResponse.json({ error }, { status }) };
}

/** Bound bytes before JSON.parse; Content-Length alone does not cover chunked uploads. */
export async function readMobileJson(request: Request, allowEmpty = false): Promise<BodyResult> {
  const length = request.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > MOBILE_JSON_MAX_BYTES) {
    return rejected(413, "Request is too large.");
  }
  if (!request.body) return allowEmpty ? { data: undefined } : rejected(400, "Invalid request.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Body read timed out.")), BODY_READ_TIMEOUT_MS);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > MOBILE_JSON_MAX_BYTES) {
        // Next proxy can tee the body. Awaiting cancel can wait on the other branch.
        void reader.cancel().catch(() => {});
        return rejected(413, "Request is too large.");
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks, size);
    if (allowEmpty && size === 0) return { data: undefined };
    return { data: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    void reader.cancel().catch(() => {});
    return rejected(400, "Invalid request.");
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
