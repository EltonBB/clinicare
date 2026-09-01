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
alter table public."ClientCareNote" enable row level security;
alter table public."ClientDocument" enable row level security;
alter table public."ClientFollowUpReminder" enable row level security;
alter table public."ClientHealthItem" enable row level security;
alter table public."ClientMedication" enable row level security;
alter table public."ClientPayment" enable row level security;
alter table public."ClientTreatmentPlanItem" enable row level security;
alter table public."Conversation" enable row level security;
alter table public."EmailVerificationReceipt" enable row level security;
alter table public."Message" enable row level security;
alter table public."PendingStorageCleanup" enable row level security;
alter table public."ReminderSettings" enable row level security;
alter table public."StaffMember" enable row level security;
alter table public."StaffShift" enable row level security;
alter table public."StaffTimeEntry" enable row level security;
alter table public."ScheduleBlock" enable row level security;
alter table public."WhatsAppConnection" enable row level security;

-- Mobile staff app tables (see prisma/mobile-staff-migration.sql). These hold
-- access-code / device-token hashes and internal staff↔admin messages, so RLS
-- here is a hard security requirement.
alter table public."StaffAccessCode" enable row level security;
alter table public."StaffDevice" enable row level security;
alter table public."StaffThread" enable row level security;
alter table public."StaffThreadMessage" enable row level security;
alter table public."StaffNotification" enable row level security;
