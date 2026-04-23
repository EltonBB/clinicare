import { prisma } from "@/lib/prisma";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.startsWith("data:") ? "" : value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeMetadataValue);
  }

  if (value && typeof value === "object") {
    return sanitizeAuthMetadataForSession(value as Record<string, unknown>);
  }

  return value;
}

export function sanitizeAuthMetadataForSession(
  metadata: Record<string, unknown> | null | undefined
) {
  const source = metadata ?? {};
  const entries = Object.entries(source).filter(([key]) => {
    return (
      key !== "business_logo_url" &&
      key !== "onboarding_state" &&
      key !== "onboarding_current_step"
    );
  });

  return Object.fromEntries(
    entries.map(([key, value]) => [key, sanitizeMetadataValue(value)])
  );
}

export async function sanitizeOversizedAuthMetadataByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return;
  }

  await prisma.$executeRaw`
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_strip_nulls(
      (COALESCE(raw_user_meta_data, '{}'::jsonb) - 'business_logo_url' - 'onboarding_state' - 'onboarding_current_step')
    )
    WHERE lower(email) = ${normalizedEmail}
      AND (
        COALESCE(raw_user_meta_data, '{}'::jsonb) ? 'business_logo_url'
        OR COALESCE(raw_user_meta_data, '{}'::jsonb) ? 'onboarding_state'
        OR COALESCE(raw_user_meta_data, '{}'::jsonb) ? 'onboarding_current_step'
      )
  `;
}
