-- Enable Row Level Security on all public Prisma application tables.
-- This prevents access through Supabase's public anon/authenticated Data API
-- unless an explicit RLS policy is added later.
--
-- The Vela app reads and writes these tables through server-side Prisma using
-- the Postgres connection. Browser Supabase clients are only used for auth and
-- private storage, not direct table access.

alter table public."AnalyticsSnapshot" enable row level security;
alter table public."Appointment" enable row level security;
alter table public."AppointmentReminder" enable row level security;
alter table public."Business" enable row level security;
alter table public."BusinessHours" enable row level security;
alter table public."Client" enable row level security;
alter table public."ClientGalleryItem" enable row level security;
alter table public."Conversation" enable row level security;
alter table public."EmailVerificationReceipt" enable row level security;
alter table public."Message" enable row level security;
alter table public."ReminderSettings" enable row level security;
alter table public."StaffMember" enable row level security;
alter table public."StaffTimeEntry" enable row level security;
alter table public."WhatsAppConnection" enable row level security;
