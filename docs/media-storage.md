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
