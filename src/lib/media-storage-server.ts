import { Prisma } from "@prisma/client";

import { logger } from "@/lib/logger";
import { parseStorageReference } from "@/lib/media-storage";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

const signedUrlTtlSeconds = 60 * 60;

export async function resolveMediaDisplayUrl(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const reference = parseStorageReference(value);

  if (!reference) {
    return value;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(reference.bucket)
    .createSignedUrl(reference.path, signedUrlTtlSeconds);

  if (error) {
    logger.error("Failed to create signed media URL.", error, {
      bucket: reference.bucket,
    });
    return "";
  }

  return data.signedUrl;
}

/**
 * Resolve many media values to display URLs in bulk. Non-storage values map to
 * themselves; storage references are signed with ONE request per bucket (via
 * `createSignedUrls`) using a single Supabase client — instead of constructing a
 * client and issuing a network round-trip per item, which is an N+1 against
 * Storage on media-heavy records. Returns a map keyed by the original value.
 */
export async function resolveMediaDisplayUrls(
  values: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const storageValues: Array<{ value: string; bucket: string; path: string }> = [];

  for (const value of values) {
    if (!value || result.has(value)) {
      continue;
    }

    const reference = parseStorageReference(value);

    if (!reference) {
      result.set(value, value);
      continue;
    }

    // Default to empty until signing resolves (matches single-value behavior).
    result.set(value, "");
    storageValues.push({ value, bucket: reference.bucket, path: reference.path });
  }

  if (storageValues.length === 0) {
    return result;
  }

  const pathsByBucket = new Map<string, Set<string>>();
  for (const item of storageValues) {
    const paths = pathsByBucket.get(item.bucket) ?? new Set<string>();
    paths.add(item.path);
    pathsByBucket.set(item.bucket, paths);
  }

  const supabase = await createClient();
  const signedByBucketPath = new Map<string, string>();

  await Promise.all(
    Array.from(pathsByBucket.entries()).map(async ([bucket, pathSet]) => {
      const paths = Array.from(pathSet);
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(paths, signedUrlTtlSeconds);

      if (error || !data) {
        logger.error("Failed to create signed media URLs.", error ?? undefined, {
          bucket,
          count: paths.length,
        });
        return;
      }

      for (const item of data) {
        if (item.signedUrl && !item.error && item.path) {
          signedByBucketPath.set(`${bucket} ${item.path}`, item.signedUrl);
        }
      }
    })
  );

  for (const item of storageValues) {
    result.set(item.value, signedByBucketPath.get(`${item.bucket} ${item.path}`) ?? "");
  }

  return result;
}

type StorageRemovalFailure = { bucket: string; count: number; error: unknown };

/**
 * The actual Supabase Storage removal, grouped by bucket — no logging, so
 * every caller controls its own severity/Sentry behavior instead of
 * inheriting a fixed one. `deleteStorageReferences` below is the
 * log-and-throw wrapper most callers want; the retry-tiered outbox path
 * further down calls this directly because it needs to choose its own log
 * level per attempt (see the P2 Codex flagged: reusing
 * deleteStorageReferences there logged an unsuppressable Sentry error on
 * every attempt regardless of retry phase, defeating the tiering entirely).
 */
async function removeStorageObjects(
  values: Array<string | null | undefined>
): Promise<{ failedCount: number; failures: StorageRemovalFailure[] }> {
  const referencesByBucket = values.reduce<Map<string, Set<string>>>((result, value) => {
    if (!value) {
      return result;
    }

    const reference = parseStorageReference(value);

    if (!reference) {
      return result;
    }

    const paths = result.get(reference.bucket) ?? new Set<string>();
    paths.add(reference.path);
    result.set(reference.bucket, paths);
    return result;
  }, new Map<string, Set<string>>());

  if (referencesByBucket.size === 0) {
    return { failedCount: 0, failures: [] };
  }

  const supabase = await createClient();
  let failedCount = 0;
  const failures: StorageRemovalFailure[] = [];

  await Promise.all(
    Array.from(referencesByBucket.entries()).map(async ([bucket, paths]) => {
      const { error } = await supabase.storage.from(bucket).remove(Array.from(paths));

      if (error) {
        failedCount += paths.size;
        failures.push({ bucket, count: paths.size, error });
      }
    })
  );

  return { failedCount, failures };
}

/**
 * Throws if any bucket's removal fails, instead of swallowing the error —
 * callers need to know a delete didn't fully happen (e.g. to log it
 * somewhere findable), since there's no return value that could carry
 * partial-failure detail without leaking storage paths to call sites that
 * don't need them. Each caller decides its own fallback (log-and-continue
 * for a cleanup that has nothing left to roll back to, or something more
 * visible for a user-initiated action) — this function's job is only to
 * make the failure observable, not to decide what a caller does with it.
 */
export async function deleteStorageReferences(values: Array<string | null | undefined>) {
  const { failedCount, failures } = await removeStorageObjects(values);

  for (const { bucket, count, error } of failures) {
    // Bucket name + count only — never the paths themselves here, so this
    // stays safe to send to Sentry regardless of what a caller passed in
    // (some callers accept arbitrary external URLs).
    logger.error("Failed to delete media objects.", error, { bucket, count });
  }

  if (failedCount > 0) {
    throw new Error(`Failed to delete ${failedCount} media object(s) from storage.`);
  }
}

// Retries hourly while an outbox row is young, then slows to daily forever
// rather than either alerting once and abandoning the row or paging on every
// cycle of an already-known failure.
const CLEANUP_HOURLY_RETRY_LIMIT = 5;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export type PendingStorageCleanupHandle = { id: string; attempts: number; values: string[] };

/**
 * Writes the outbox row inside the caller's own transaction — pass the same
 * `tx` used for the guarded delete that orphaned these files, so the row
 * exists if and only if that delete actually happened. Returns null (writes
 * nothing) when there's nothing to clean up.
 *
 * This couples the two writes: if this insert itself fails, the caller's
 * whole transaction (including the delete) rolls back. That's intentional —
 * this table lives in the same Postgres database as everything else the
 * transaction touches, so a failure here isn't a separate point of failure,
 * and silently letting the delete through without recording cleanup would
 * reopen the exact reliability gap this function exists to close.
 */
export async function recordPendingStorageCleanup(
  tx: Prisma.TransactionClient,
  businessId: string,
  values: Array<string | null | undefined>
): Promise<PendingStorageCleanupHandle | null> {
  const filtered = values.filter((value): value is string => Boolean(value));

  if (filtered.length === 0) {
    return null;
  }

  const row = await tx.pendingStorageCleanup.create({
    data: { businessId, values: filtered },
    select: { id: true, attempts: true },
  });

  return { ...row, values: filtered };
}

/**
 * Attempts the actual cleanup for one outbox entry — call once right after
 * the transaction that created it commits (never from inside that
 * transaction: this makes a Storage API round-trip, and holding a DB
 * connection open for it risks exhausting the small serverless pool), and
 * again from a retry sweep for anything still pending (not built yet — until
 * it exists, a row that fails here just waits in the table with its
 * `nextAttemptAt`/`attempts` already tracked, ready for that sweep to use
 * once it's written). Clears the row on success; records the failure and
 * reschedules on failure. Never throws.
 *
 * Calls removeStorageObjects directly rather than deleteStorageReferences:
 * the latter always logs each failure at error level, which would page
 * Sentry on every retry regardless of phase and defeat the tiering below
 * (Codex P2). This function owns all of the logging for its own retries.
 *
 * IMPORTANT for whoever builds the retry sweep (Codex P2, verified against
 * docs/media-storage.md): removeStorageObjects resolves its Supabase client
 * via createClient() (the cookie-backed SSR client), which needs a signed-in
 * user's session — fine here, since this is always called from within an
 * authenticated request. A cron invocation has no such session, and the
 * bucket's delete policy is scoped to `auth.uid()`, so an unauthenticated
 * cron call would fail every single row, forever, with nothing surfacing the
 * failure as anything other than an ordinary retry. The sweep needs its own
 * authenticated path to Storage (a service-role client scoped to exactly
 * this operation, or another explicit worker credential) before it can
 * actually drain this table — not a hand-me-down of this function as-is.
 */
export async function attemptStorageCleanup(
  pending: PendingStorageCleanupHandle | null
): Promise<void> {
  if (!pending) {
    return;
  }

  const { failedCount, failures } = await removeStorageObjects(pending.values);

  if (failedCount === 0) {
    // Guarded, like every other delete in this codebase: if a concurrent
    // sweep already cleared this same row, this is just a harmless no-op
    // instead of a P2025 throw.
    await prisma.pendingStorageCleanup.deleteMany({ where: { id: pending.id } });
    return;
  }

  await recordCleanupAttemptFailure(pending.id, pending.attempts, failures);
}

async function recordCleanupAttemptFailure(
  id: string,
  previousAttempts: number,
  failures: StorageRemovalFailure[]
) {
  const attempts = previousAttempts + 1;
  const isHourlyPhase = attempts < CLEANUP_HOURLY_RETRY_LIMIT;
  const nextAttemptAt = new Date(Date.now() + (isHourlyPhase ? ONE_HOUR_MS : ONE_DAY_MS));
  // Bucket name + count only, same as every other log in this file — never
  // the paths, which can carry a patient name or filename.
  const lastError = failures
    .map(({ bucket, count, error }) => `${bucket} (${count}): ${describeStorageError(error)}`)
    .join("; ");
  const primaryError = failures[0]?.error;
  const buckets = failures.map(({ bucket, count }) => `${bucket} (${count})`).join(", ");

  // updateMany (unlike .update()) never throws for zero matches — if a
  // concurrent attempt already cleared this row, this is just a no-op count
  // of 0, not an error to swallow. The counter itself is a DB-level atomic
  // increment (not writing the locally-computed `attempts`), so the
  // persisted total is correct even if this ever races another writer on the
  // same row; the phase/backoff decision below still uses this call's own
  // view of `attempts`, which is fine with today's single caller per row and
  // becomes a real design question only once a concurrent retry sweep exists.
  await prisma.pendingStorageCleanup.updateMany({
    where: { id },
    data: { attempts: { increment: 1 }, lastError, nextAttemptAt },
  });

  if (attempts === CLEANUP_HOURLY_RETRY_LIMIT) {
    // The one deliberate alert, ever, for this row: hourly retries are
    // exhausted and it's moving to a daily cadence indefinitely — worth a
    // human looking at it now that it's confirmed non-transient. Every other
    // attempt (both before and after this one) logs at warn instead, which
    // (unlike error) never forwards to Sentry — an early hourly failure might
    // still be transient, and a day-6 failure is already known, so neither
    // needs its own page; this is the one moment that's actually new
    // information.
    logger.error(
      "Storage cleanup has failed repeatedly and is moving to a daily retry cadence — investigate.",
      primaryError,
      { pendingStorageCleanupId: id, attempts, buckets }
    );
    return;
  }

  logger.warn(
    isHourlyPhase
      ? "Storage cleanup attempt failed; will retry within the hour."
      : "Storage cleanup attempt failed; will retry tomorrow.",
    { pendingStorageCleanupId: id, attempts, lastError }
  );
}

function describeStorageError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
