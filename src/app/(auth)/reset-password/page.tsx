import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { createClient } from "@/utils/supabase/server";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only a session that arrived via the recovery verification (marker set in
  // /auth/confirm) may use this form — not a forgeable ?recovery=1 param.
  if (cookieStore.get("vela_pw_recovery")?.value !== "1" || !user) {
    redirect("/forgot-password?expired=1");
  }

  return (
    <>
      {/* Mobile brand (the desktop brand lives in the left panel) */}
      <BrandMark href="/" includeSubtitle={false} className="mb-10 lg:hidden" />

      <div className="space-y-2">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-[var(--brand-ink)]">
          Choose a new password
        </h1>
        <p className="text-[15px] leading-7 text-muted-foreground">
          Set a fresh password for {user.email}. Once saved, you&apos;ll be asked to log in again.
        </p>
      </div>

      <div className="mt-8">
        <ResetPasswordForm />
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Need a new recovery link?{" "}
        <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
          Request again
        </Link>
      </p>
    </>
  );
}
