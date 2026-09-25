# Media Storage Setup

Vela stores uploaded clinic logos, client gallery images, and private client
documents in Supabase Storage.
The app writes private storage references to Prisma and auth metadata; it should
not store base64 `data:` image payloads or long-lived public image URLs.

## Bucket

Create a private Supabase Storage bucket named by:

```env
NEXT_PUBLIC_SUPABASE_MEDIA_BUCKET=clinic-media
```

The default bucket name in the app is `clinic-media` when the variable is not
set. Do not mark this bucket public for production.

## Storage Policies

Uploaded files are stored under the signed-in user's id:

```text
{auth.uid()}/logos/{file-id}.{ext}
{auth.uid()}/client-gallery/{file-id}.{ext}
{auth.uid()}/client-documents/{file-id}.{ext}
```

Use policies like these for the `clinic-media` bucket:

```sql
create policy "Users can read their workspace media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'clinic-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can upload workspace media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'clinic-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update their workspace media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'clinic-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'clinic-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their workspace media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'clinic-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

Client document uploads accept PDFs and common image formats up to the app
configured upload limit. The database stores file metadata, category,
file-size, MIME type, and the private storage reference; previews/downloads
should use short-lived signed URLs.

When the app needs to show an image or document, it converts stored values like
`supabase-storage://clinic-media/{user-id}/logos/{file-id}.jpg` into short-lived
signed URLs. A copied file URL should expire instead of remaining public.

## Historical reference normalization

`npm run media:normalize-storage-refs` is a manual, database-writing maintenance
command for older logo and gallery values. It converts only URLs from the
configured `NEXT_PUBLIC_SUPABASE_URL`, in the configured media bucket and upload
path shape, with the row's clinic owner and matching `logos` or `client-gallery`
folder. Other HTTPS links remain available for review; do not infer that they
belong to this clinic's Storage objects from their host or bucket alone.
New application writes reject unverified URLs from the configured project's
Storage object and transformed-image routes, including ambiguous encoded paths.
The maintenance command leaves historical mismatches
unchanged so they can be reviewed rather than silently rewritten.

Use a reviewed database backup and a staging run before applying it to a live
database. The command verifies remote PostgreSQL certificates; set
`DATABASE_SSL_CA` for a private CA. It ignores Prisma-only connection options
and refuses other URL query options that could redirect or weaken the connection.
It reports rows changed during the run but
skips rows whose original value changed concurrently. It also reports and skips
URLs that would create duplicate gallery references to one object; review these
manually before rerunning. Quiesce gallery writes during a live run because
new rows can otherwise appear after the duplicate scan. This command does not
delete Storage objects.
