import fs from "node:fs";
import pg from "pg";

const { Client } = pg;
const storageReferencePrefix = "supabase-storage://";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;

  const content = fs.readFileSync(path, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function createDatabaseClientConfig(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Storage normalization requires a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) {
    throw new Error("Storage normalization requires a PostgreSQL URL with an explicit host.");
  }

  // pg gives query parameters precedence over URL fields and Client options.
  // Prisma-only parameters are irrelevant here; strip them before pg parses the URL.
  const ignoredParameters = new Set(["sslmode", "schema", "pgbouncer", "connection_limit", "pool_timeout"]);
  for (const parameter of url.searchParams.keys()) {
    if (!ignoredParameters.has(parameter)) {
      throw new Error(`Unsupported database URL parameter for storage normalization: ${parameter}`);
    }
  }
  url.search = "";
  const isLoopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  const databaseCa = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");

  return {
    connectionString: url.toString(),
    ssl: isLoopback
      ? false
      : { rejectUnauthorized: true, ...(databaseCa ? { ca: databaseCa } : {}) },
  };
}

function createStorageReference(bucket, path) {
  return `${storageReferencePrefix}${bucket}/${path}`;
}

function parseStorageReference(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith(storageReferencePrefix)) return null;

  const withoutPrefix = trimmed.slice(storageReferencePrefix.length);
  const separatorIndex = withoutPrefix.indexOf("/");

  if (separatorIndex <= 0 || separatorIndex === withoutPrefix.length - 1) {
    return null;
  }

  return {
    bucket: withoutPrefix.slice(0, separatorIndex),
    path: withoutPrefix.slice(separatorIndex + 1),
  };
}

function parseSupabaseStorageUrl(value, storageObjectUrl, mediaBucket, expectedOwnerId, expectedFolder) {
  try {
    const url = new URL(value.trim());
    if (
      url.origin !== storageObjectUrl.origin ||
      !url.pathname.startsWith(storageObjectUrl.pathname) ||
      url.username ||
      url.password
    ) {
      return null;
    }

    const parts = url.pathname.slice(storageObjectUrl.pathname.length).split("/");
    const accessType = parts[0];
    const bucket = parts[1];
    const pathParts = parts.slice(2);

    if (
      (accessType !== "public" && accessType !== "sign") ||
      bucket !== mediaBucket ||
      pathParts.length !== 3 ||
      pathParts.some((part) => !part)
    ) {
      return null;
    }

    const path = pathParts.map((part) => decodeURIComponent(part)).join("/");
    const [ownerId, folder] = path.split("/");
    return path.split("/").length === 3 &&
      ownerId === expectedOwnerId &&
      folder === expectedFolder
      ? { bucket, path }
      : null;
  } catch {
    return null;
  }
}

function normalizeStorageReference(value, storageObjectUrl, mediaBucket, expectedOwnerId, expectedFolder) {
  const existingReference = parseStorageReference(value);
  if (existingReference) {
    const [ownerId, folder, fileName, ...extra] = existingReference.path.split("/");
    return existingReference.bucket === mediaBucket &&
      ownerId === expectedOwnerId &&
      folder === expectedFolder &&
      Boolean(fileName) &&
      extra.length === 0
      ? createStorageReference(existingReference.bucket, existingReference.path)
      : value;
  }

  const urlReference = parseSupabaseStorageUrl(
    value, storageObjectUrl, mediaBucket, expectedOwnerId, expectedFolder
  );
  if (urlReference) {
    return createStorageReference(urlReference.bucket, urlReference.path);
  }

  return value.trim();
}

async function normalizeRows(
  client, selectSql, updateSql, updateParameters, storageObjectUrl, mediaBucket, expectedFolder
) {
  const result = await client.query(selectSql);
  const candidates = result.rows.map((row) => ({
    row,
    normalized: normalizeStorageReference(
      row.value, storageObjectUrl, mediaBucket, row.ownerId, expectedFolder
    ),
  }));
  const referenceCounts = new Map();
  for (const { normalized } of candidates) {
    if (parseStorageReference(normalized)) {
      referenceCounts.set(normalized, (referenceCounts.get(normalized) || 0) + 1);
    }
  }
  let updated = 0;
  let changedDuringRun = 0;
  let duplicateTargets = 0;

  for (const { row, normalized } of candidates) {
    if (normalized !== row.value) {
      if ((referenceCounts.get(normalized) || 0) > 1) {
        duplicateTargets += 1;
        continue;
      }
      const result = await client.query(
        updateSql,
        updateParameters(row, normalized)
      );
      updated += result.rowCount;
      if (result.rowCount === 0) changedDuringRun += 1;
    }
  }

  return { updated, changedDuringRun, duplicateTargets };
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or DIRECT_URL is not configured.");
}

const configuredStorageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!configuredStorageUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is required to verify storage URL provenance.");
}
const storageUrl = new URL(configuredStorageUrl);
const isLoopbackStorage =
  process.env.NODE_ENV !== "production" &&
  storageUrl.protocol === "http:" &&
  ["localhost", "127.0.0.1", "[::1]"].includes(storageUrl.hostname);
if (storageUrl.protocol !== "https:" && !isLoopbackStorage) {
  throw new Error("Storage URL must use HTTPS outside local development.");
}
const mediaBucket = process.env.NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET?.trim() || "clinic-media";
if (!storageUrl.pathname.endsWith("/")) storageUrl.pathname += "/";
const storageObjectUrl = new URL("storage/v1/object/", storageUrl);

const client = new Client(createDatabaseClientConfig(databaseUrl));

await client.connect();

try {
  const businessLogos = await normalizeRows(
    client,
    'select id, "logoUrl" as value, "ownerId" as "ownerId", "ownerId" as binding from "Business" where "logoUrl" is not null and "logoUrl" <> \'\'',
    'update "Business" set "logoUrl" = $1 where id = $2 and "logoUrl" = $3 and "ownerId" = $4',
    (row, normalized) => [normalized, row.id, row.value, row.ownerId],
    storageObjectUrl,
    mediaBucket,
    "logos"
  );
  const galleryItems = await normalizeRows(
    client,
    'select g.id, g."imageUrl" as value, b."ownerId" as "ownerId", g."businessId" as binding from "ClientGalleryItem" g join "Business" b on b.id = g."businessId" where g."imageUrl" is not null and g."imageUrl" <> \'\'',
    'update "ClientGalleryItem" g set "imageUrl" = $1 where g.id = $2 and g."imageUrl" = $3 and g."businessId" = $4 and exists (select 1 from "Business" b where b.id = g."businessId" and b."ownerId" = $5)',
    (row, normalized) => [normalized, row.id, row.value, row.binding, row.ownerId],
    storageObjectUrl,
    mediaBucket,
    "client-gallery"
  );

  console.log(
    JSON.stringify(
      {
        businessLogosUpdated: businessLogos,
        clientGalleryItemsUpdated: galleryItems,
      },
      null,
      2
    )
  );
} finally {
  await client.end();
}
