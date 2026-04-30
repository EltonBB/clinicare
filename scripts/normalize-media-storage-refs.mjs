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

function normalizeConnectionString(value) {
  const url = new URL(value);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslcert");
  url.searchParams.delete("sslrootcert");
  return url.toString();
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

function parseSupabaseStorageUrl(value) {
  try {
    const url = new URL(value.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    const objectIndex = parts.indexOf("object");

    if (objectIndex === -1) return null;

    const accessType = parts[objectIndex + 1];
    const bucket = parts[objectIndex + 2];
    const pathParts = parts.slice(objectIndex + 3);

    if (
      (accessType !== "public" && accessType !== "sign") ||
      !bucket ||
      pathParts.length === 0
    ) {
      return null;
    }

    return {
      bucket,
      path: pathParts.map((part) => decodeURIComponent(part)).join("/"),
    };
  } catch {
    return null;
  }
}

function normalizeStorageReference(value) {
  const existingReference = parseStorageReference(value);
  if (existingReference) {
    return createStorageReference(existingReference.bucket, existingReference.path);
  }

  const urlReference = parseSupabaseStorageUrl(value);
  if (urlReference) {
    return createStorageReference(urlReference.bucket, urlReference.path);
  }

  return value.trim();
}

async function normalizeRows(client, table, idColumn, valueColumn) {
  const result = await client.query(
    `select "${idColumn}" as id, "${valueColumn}" as value from "${table}" where "${valueColumn}" is not null and "${valueColumn}" <> ''`
  );
  let updated = 0;

  for (const row of result.rows) {
    const normalized = normalizeStorageReference(row.value);

    if (normalized !== row.value) {
      await client.query(
        `update "${table}" set "${valueColumn}" = $1 where "${idColumn}" = $2`,
        [normalized, row.id]
      );
      updated += 1;
    }
  }

  return updated;
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or DIRECT_URL is not configured.");
}

const client = new Client({
  connectionString: normalizeConnectionString(databaseUrl),
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  const [businessLogos, galleryItems] = await Promise.all([
    normalizeRows(client, "Business", "id", "logoUrl"),
    normalizeRows(client, "ClientGalleryItem", "id", "imageUrl"),
  ]);

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
