import { Prisma } from "@prisma/client";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";

import { mapWithConcurrency } from "@/lib/concurrency";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { mediaBucket, parseStorageReference } from "@/lib/media-storage";
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
 *
 * `client` defaults to the cookie-backed SSR client (the existing behavior
 * for every request-path caller). The storage-cleanup sweep is the one
 * caller that passes its own service-role client — a cron invocation has no
 * user session for the default client to authenticate with.
 */
async function removeStorageObjects(
  values: Array<string | null | undefined>,
  client?: SupabaseClient
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

  const supabase = client ?? (await createClient());
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
 * again from `sweepPendingStorageCleanup`'s retry sweep for anything still
 * pending. Clears the row on success; records the failure and reschedules on
 * failure. Never throws.
 *
 * Calls removeStorageObjects directly rather than deleteStorageReferences:
 * the latter always logs each failure at error level, which would page
 * Sentry on every retry regardless of phase and defeat the tiering below
 * (Codex P2). This function owns all of the logging for its own retries.
 *
 * Uses the cookie-backed SSR client (removeStorageObjects' default) because
 * this is always called from within an authenticated request. The sweep
 * below is the cron counterpart — no user session, so it needs (and has) its
 * own authenticated path plus its own ownership re-validation; see that
 * function's docstring for why both are required.
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

  await recordCleanupAttemptFailure(pending.id, pending.attempts, { kind: "storage", failures });
}

/**
 * What went wrong on one attempt, in exactly the two shapes that currently
 * reach recordCleanupAttemptFailure. A tagged union rather than widening
 * StorageRemovalFailure to allow a null bucket/count (or synthesizing a fake
 * bucket name for the generic case): either would leak a non-bucket concept
 * through a bucket-shaped type, and a fabricated bucket name is exactly the
 * kind of thing that could misread as real months later in a log search.
 */
type CleanupAttemptFailure =
  | { kind: "storage"; failures: StorageRemovalFailure[] }
  | { kind: "unexpected"; error: unknown };

/**
 * `narrowedValues`, when passed, replaces the row's stored `values` in the
 * same write — used only by the sweep (below) when it has just permanently
 * dropped one or more ownership-mismatched entries, so the next retry
 * re-examines just the still-legitimate subset instead of re-detecting (and
 * re-logging) the same permanent mismatch every cycle. Omitted by callers
 * that never narrow anything.
 *
 * `previousAttempts` also gates the write itself now (`where: { id, attempts:
 * previousAttempts }`), not just `id`: this function has multiple callers
 * that can now genuinely race on the same row — attemptStorageCleanup's
 * post-commit attempt (a row's nextAttemptAt defaults to now(), so it's
 * immediately due) and the sweep below, if an hourly tick lands while that
 * attempt is still in flight. Both would otherwise compute their own
 * `attempts`/backoff/alert decision from the same stale read, risking the
 * one deliberate alert below firing twice for one row. The compare-and-set
 * makes exactly one concurrent caller's write land — whichever matches the
 * row's current `attempts` first — and the loser's `count` comes back 0
 * (same "no-op, not an error" shape every guarded write in this file uses).
 *
 * Takes a `CleanupAttemptFailure`, not just a Storage failure list: every
 * attempt that didn't succeed — a Storage removal failure OR an unexpected
 * exception from processPendingStorageCleanupRow's catch (a DB pool timeout
 * under contention, or anything else) — goes through the same backoff/
 * one-alert-ever tiering below. Routing an unexpected exception around this
 * function instead (a bare, untiered log) was the actual bug this shape
 * closes: with attempts/nextAttemptAt untouched, a row that persistently
 * throws would page Sentry on every single sweep tick, forever — the same
 * "unconditional logger.error defeats the tiering" bug this file already
 * closed twice elsewhere (deleteStorageReferences's per-bucket log, then
 * this function's own hourly-phase branch).
 */
async function recordCleanupAttemptFailure(
  id: string,
  previousAttempts: number,
  failure: CleanupAttemptFailure,
  narrowedValues?: string[]
) {
  const attempts = previousAttempts + 1;
  const isHourlyPhase = attempts < CLEANUP_HOURLY_RETRY_LIMIT;
  const nextAttemptAt = new Date(Date.now() + (isHourlyPhase ? ONE_HOUR_MS : ONE_DAY_MS));

  // Bucket name + count only for a Storage failure, same as every other log
  // in this file — never the paths, which can carry a patient name or
  // filename. An unexpected exception has no path/bucket to withhold in the
  // first place.
  const lastError =
    failure.kind === "storage"
      ? failure.failures
          .map(({ bucket, count, error }) => `${bucket} (${count}): ${describeStorageError(error)}`)
          .join("; ")
      : describeStorageError(failure.error);
  // The raw Error object for Sentry's stack trace, not the stringified
  // lastError built above from the same value.
  const primaryError = failure.kind === "storage" ? failure.failures[0]?.error : failure.error;
  const buckets =
    failure.kind === "storage"
      ? failure.failures.map(({ bucket, count }) => `${bucket} (${count})`).join(", ")
      : "n/a (unexpected exception, not a Storage removal failure)";

  const { count: matched } = await prisma.pendingStorageCleanup.updateMany({
    where: { id, attempts: previousAttempts },
    data: {
      attempts: { increment: 1 },
      lastError,
      nextAttemptAt,
      ...(narrowedValues ? { values: narrowedValues } : {}),
    },
  });

  if (matched === 0) {
    // Someone else already moved this row past the attempts count this call
    // read — a concurrent recordCleanupAttemptFailure call that won the
    // race, or the row was cleared entirely by a successful removal. Either
    // way that other write already recorded (or made moot) this exact
    // transition; logging here too would double the very alert this tiering
    // exists to keep singular.
    return;
  }

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
      { pendingStorageCleanupId: id, attempts, buckets, kind: failure.kind }
    );
    return;
  }

  logger.warn(
    isHourlyPhase
      ? "Storage cleanup attempt failed; will retry within the hour."
      : "Storage cleanup attempt failed; will retry tomorrow.",
    { pendingStorageCleanupId: id, attempts, lastError, kind: failure.kind }
  );
}

function describeStorageError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// A Supabase auth id (what a legitimate ownerId prefix always is) is a v4
// UUID. Used only to decide whether a mismatched entry's prefix is safe to
// log — see processPendingStorageCleanupRow — never for the actual
// ownership check itself, which always compares the raw value.
const OWNER_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Keeps one cron tick from firing 50 concurrent Storage calls + DB writes at
// once against DATABASE_POOL_MAX (default 3 — see prisma.ts) — normally
// irrelevant (this table is usually near-empty), but the one time it isn't
// (a real Storage outage backing up rows) is exactly when the DB shouldn't
// also be contending with live user requests on the same instance.
const CLEANUP_SWEEP_BATCH_LIMIT = 50;
const CLEANUP_SWEEP_CONCURRENCY = 5;

// select, not include: only the columns processPendingStorageCleanupRow
// actually reads. lastError especially is unbounded (a growing joined string
// of past failures) and not worth carrying over the wire for up to 50 rows on
// every sweep tick, most of which never touch it.
type DueCleanupRow = Prisma.PendingStorageCleanupGetPayload<{
  select: {
    id: true;
    businessId: true;
    values: true;
    attempts: true;
    business: { select: { ownerId: true } };
  };
}>;

export type StorageCleanupSweepResult = {
  /** False when SUPABASE_SERVICE_ROLE_KEY isn't set — every other field is 0. */
  serviceRoleConfigured: boolean;
  due: number;
  cleaned: number;
  /**
   * A row dropped with nothing left to retry — either a genuine ownership
   * mismatch (already logged loudly, see processPendingStorageCleanupRow) or
   * a row whose values were all non-storage references to begin with (never
   * logged, nothing anomalous). This counter doesn't distinguish the two; the
   * error log is the precise signal for a real cross-tenant hit, not this
   * count.
   */
  invalidRowsDropped: number;
  retryScheduled: number;
  errored: number;
};

// The Baileys HTTP bridge already needed this exact lesson (CLAUDE.md): an
// un-timed-out call to an external service, hung rather than erroring, stalls
// silently instead of failing loudly. Scoped to just this client — the
// cookie-backed one (createClient, used everywhere else in this file) is
// always called from within a live user request, which already has its own
// platform-level timeout; this one backs a cron invocation with no such
// backstop, so a hang here would otherwise run out maxDuration in complete
// silence (a kill, not a return, skips this route's own try/catch/finally).
const STORAGE_CALL_TIMEOUT_MS = 20_000;

/**
 * A narrow service-role client for the storage-cleanup sweep only. The sweep
 * runs from a cron invocation with no signed-in session, and the bucket's
 * delete policy is scoped to `auth.uid()`, so the cookie-backed client
 * (createClient, used everywhere else in this file) can never authenticate
 * there. `persistSession`/`autoRefreshToken` are off — this client is built
 * fresh per sweep, not held across requests, and has no session to persist.
 *
 * Returns null when the key isn't configured, so the sweep can degrade to
 * "leave rows pending" instead of throwing — nothing time-sensitive depends
 * on this running promptly. This key bypasses RLS entirely; the only caller
 * (sweepPendingStorageCleanup) re-validates ownership itself before ever
 * calling .remove() with it — see that function.
 */
function getStorageCleanupServiceClient(): SupabaseClient | null {
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!serviceRoleKey) {
    return null;
  }

  return createSupabaseJsClient(getSupabaseUrl(), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(STORAGE_CALL_TIMEOUT_MS) }),
    },
  });
}

/**
 * The retry-sweep half of the storage-cleanup outbox — call from a cron
 * route. Drains rows whose `nextAttemptAt` is due, using a service-role
 * client since a cron invocation has no user session (see
 * getStorageCleanupServiceClient). Never throws; a per-row problem — an
 * ownership mismatch, a Storage failure, or an unexpected exception — is
 * recorded on (or logged against) that row and does not stop the batch, the
 * same per-row isolation the analytics cron already uses for its own
 * per-business fan-out.
 *
 * Because a service-role client bypasses RLS entirely, this is also the
 * enforcement point for a requirement `attemptStorageCleanup` cannot make on
 * its own: nothing today validates that a queued value actually belongs to
 * the business that queued it (addClientDocumentAction/
 * addClientGalleryItemAction/saveSettingsAction accept any syntactically
 * valid storage reference as user input — normalizeStorageReference only
 * parses the bucket+path shape, it checks no ownership). Under the request
 * path that's harmless because Storage RLS still gates the actual delete; a
 * service-role sweep removes that safety net, so every row is re-validated
 * here before anything is deleted. The check: media-storage-client.ts builds
 * every upload path as `${userId}/${folder}/${uuid}.${ext}` where `userId`
 * is the uploader's Supabase auth id — Business.ownerId, NOT Business.id —
 * so a value only counts as valid when its bucket matches the configured
 * media bucket, its path has exactly that three-segment shape, AND its first
 * segment matches the row's business's `ownerId` (the segment-count check
 * closes a gap a prefix-only compare would leave: a path extended with extra
 * segments past a genuine owner prefix). Anything else is dropped (never
 * deleted) and logged once, loudly — but the found bucket/prefix are only
 * ever logged when independently verified safe (the real configured bucket;
 * a value with the shape a real ownerId actually has), never raw. A value
 * that reaches this branch didn't come from the legitimate upload path, so
 * there's no guarantee it's the opaque auth uid it would normally be — both
 * `normalizeStorageReference`'s and `normalizePublicUrl`'s own fast paths
 * (Codex + peer-verified) accept a `supabase-storage://`-shaped value with
 * an unvalidated bucket and path, so a crafted value's bucket or path
 * segment could be arbitrary text, including a patient name, by the time it
 * gets here. Logging only what's independently known-safe still lets a
 * human tell a real cross-tenant hit (the found prefix is a real, different
 * business's ownerId) apart from a data/logic bug or a malicious value,
 * without ever risking PHI in the log line itself. Dropped permanently, not
 * requeued: there is no ownership-transfer feature
 * and no code path that writes to `Business.ownerId` after creation, so a
 * mismatched prefix can never newly become valid on a later sweep — but this
 * whole check assumes the uploader is always the business owner, which holds
 * only because every current caller of the three add-actions above resolves
 * through `getCurrentBusiness`'s strict `ownerId`-keyed lookup. If a future
 * feature ever lets someone other than the owner (e.g. a staff member, under
 * their own distinct auth id) upload through this same flow, this check
 * needs revisiting before that feature ships, not after — it would otherwise
 * either wrongly drop that uploader's legitimate files as "mismatched," or,
 * if loosened carelessly, reopen the cross-tenant hole this check exists to
 * close.
 */
export async function sweepPendingStorageCleanup(): Promise<StorageCleanupSweepResult> {
  const serviceClient = getStorageCleanupServiceClient();

  if (!serviceClient) {
    return {
      serviceRoleConfigured: false,
      due: 0,
      cleaned: 0,
      invalidRowsDropped: 0,
      retryScheduled: 0,
      errored: 0,
    };
  }

  const rows = await prisma.pendingStorageCleanup.findMany({
    where: { nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: CLEANUP_SWEEP_BATCH_LIMIT,
    select: {
      id: true,
      businessId: true,
      values: true,
      attempts: true,
      business: { select: { ownerId: true } },
    },
  });

  const result: StorageCleanupSweepResult = {
    serviceRoleConfigured: true,
    due: rows.length,
    cleaned: 0,
    invalidRowsDropped: 0,
    retryScheduled: 0,
    errored: 0,
  };

  const outcomes = await mapWithConcurrency(rows, CLEANUP_SWEEP_CONCURRENCY, (row) =>
    processPendingStorageCleanupRow(row, serviceClient)
  );

  for (const outcome of outcomes) {
    if (outcome === "cleaned") result.cleaned += 1;
    else if (outcome === "invalid-dropped") result.invalidRowsDropped += 1;
    else if (outcome === "retry-scheduled") result.retryScheduled += 1;
    else result.errored += 1;
  }

  return result;
}

async function processPendingStorageCleanupRow(
  row: DueCleanupRow,
  serviceClient: SupabaseClient
): Promise<"cleaned" | "invalid-dropped" | "retry-scheduled" | "errored"> {
  try {
    const valid: string[] = [];
    const mismatched: string[] = [];

    for (const value of row.values) {
      const reference = parseStorageReference(value);

      if (!reference) {
        // Not a recognized storage object at all (e.g. a legacy external URL)
        // — nothing to delete and nothing anomalous to flag, same as every
        // other function in this file that filters these silently.
        continue;
      }

      // Non-empty by construction — parseStorageReference rejects a
      // reference whose path would be empty — so this always has a first
      // segment.
      const segments = reference.path.split("/");
      const foundPrefix = segments[0];

      // Bucket + first segment + exact shape: every real upload path is
      // precisely `${ownerId}/${folder}/${uuid}.${ext}` (media-storage-client.ts)
      // — three segments, never more. Requiring that shape, not just a
      // prefix match, means a path extended past a genuine owner prefix
      // with unexpected extra segments can't slip through as valid.
      if (
        reference.bucket === mediaBucket &&
        segments.length === 3 &&
        foundPrefix === row.business.ownerId
      ) {
        valid.push(value);
      } else {
        // Neither reference.bucket nor foundPrefix is safe to log raw here
        // (Codex P2 + peer-verified): normalizeStorageReference's fast path
        // (lib/media-storage.ts) reconstructs a submitted bucket+path
        // verbatim with no validation, and normalizePublicUrl's own
        // isValidStorageReference check (lib/safe-url.ts) runs BEFORE its
        // HTTPS-only gate — so a value shaped like
        // `supabase-storage://<anything>/<anything>` skips that gate
        // entirely and can reach a document/gallery/logo field un-normalized
        // beyond this shape. A crafted value's bucket or path segment could
        // be arbitrary text, including a patient name, by the time it
        // reaches this branch — the "opaque auth uid" safety argument only
        // ever held for the LEGITIMATE upload path, not for values that hit
        // this exact else because they didn't come from it. Redact anything
        // that isn't independently known-safe before it touches a log line:
        // the bucket only when it's the one real configured bucket, the
        // prefix only when it has the shape every real ownerId actually
        // has. The equality/shape checks above already used the raw values;
        // only the logged representation changes here.
        const safeBucket = reference.bucket === mediaBucket ? reference.bucket : "<unexpected-bucket>";
        const safePrefix = OWNER_ID_SHAPE.test(foundPrefix) ? foundPrefix : "<non-uuid>";
        mismatched.push(`${safeBucket}:${safePrefix}`);
      }
    }

    if (mismatched.length > 0) {
      logger.error(
        "Storage cleanup sweep found queued value(s) that don't belong to the business that queued them — dropped without deleting.",
        undefined,
        {
          pendingStorageCleanupId: row.id,
          businessId: row.businessId,
          expectedOwnerId: row.business.ownerId,
          found: mismatched.join(", "),
        }
      );
    }

    let failedCount = 0;
    let failures: StorageRemovalFailure[] = [];

    if (valid.length > 0) {
      ({ failedCount, failures } = await removeStorageObjects(valid, serviceClient));

      if (failedCount > 0) {
        // Pass `valid` as the narrowed set whenever it differs from what was
        // originally stored, so a dropped mismatch is never re-examined (and
        // re-logged) on the next retry. Doesn't persist if this write loses
        // the compare-and-set race in recordCleanupAttemptFailure (a rare
        // window — see that function's docstring) — a next tick would then
        // re-detect and re-log the same mismatch once more. Not a security
        // issue (nothing gets deleted incorrectly, and it's already rare),
        // just occasional duplicate log noise; not worth a second write to
        // close given how narrow the window already is.
        const narrowedValues = valid.length === row.values.length ? undefined : valid;
        await recordCleanupAttemptFailure(
          row.id,
          row.attempts,
          { kind: "storage", failures },
          narrowedValues
        );
        return "retry-scheduled";
      }
    }

    // Reached with either a clean removal or nothing valid to remove in the
    // first place (every value was non-storage and/or a mismatch just logged
    // above) — either way there's nothing left this row could ever retry.
    await prisma.pendingStorageCleanup.deleteMany({ where: { id: row.id } });
    return valid.length === 0 ? "invalid-dropped" : "cleaned";
  } catch (error) {
    // Isolate per-row failures so one bad row (a DB pool timeout under
    // exactly the contention CLEANUP_SWEEP_CONCURRENCY exists to bound, a
    // Storage call outliving its own timeout, anything unexpected) can't
    // abort the rest of the sweep — same pattern as the analytics cron's
    // per-business isolation.
    //
    // Routed through recordCleanupAttemptFailure, not a bare log: this row's
    // attempts/nextAttemptAt need the same backoff bookkeeping a Storage
    // failure gets, or a row that persistently throws the same exception
    // would page Sentry on every single sweep tick, forever, since nothing
    // would ever advance it toward the daily cadence. "errored" (the outcome
    // returned below) is purely this sweep's own tally label for "not a
    // routine Storage failure" — the backoff/one-alert mechanics underneath
    // are identical either way.
    //
    // Nested try/catch, not a bare await: recordCleanupAttemptFailure now
    // makes its own DB write, which is exactly the kind of call that can
    // throw under the same pool contention that likely caused the original
    // error — plausibly the same outage hitting twice in a row. Before this
    // fix the catch body was a pure log call that could never itself throw;
    // now that it awaits a write, this row's own outer isolation boundary
    // has to hold even if that write fails too, or a double failure would
    // re-escape into mapWithConcurrency and abort the rest of the sweep —
    // the exact thing this whole try/catch exists to prevent.
    try {
      await recordCleanupAttemptFailure(row.id, row.attempts, { kind: "unexpected", error });
    } catch (recordError) {
      logger.error(
        "Storage cleanup sweep failed unexpectedly for one row, and recording that failure also failed.",
        recordError,
        { pendingStorageCleanupId: row.id, businessId: row.businessId }
      );
    }
    return "errored";
  }
}
