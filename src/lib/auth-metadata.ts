import { prisma } from "@/lib/prisma";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function sanitizeOversizedAuthMetadataByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return;
  }

  await prisma.$executeRaw`
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_strip_nulls(
      jsonb_set(
        jsonb_set(
          COALESCE(raw_user_meta_data, '{}'::jsonb),
          '{business_logo_url}',
          'null'::jsonb,
          true
        ),
        '{onboarding_state,clinic,logoUrl}',
        '""'::jsonb,
        true
      )
    )
    WHERE lower(email) = ${normalizedEmail}
      AND (
        COALESCE(raw_user_meta_data ->> 'business_logo_url', '') LIKE 'data:%'
        OR COALESCE(raw_user_meta_data #>> '{onboarding_state,clinic,logoUrl}', '') LIKE 'data:%'
      )
  `;
}

