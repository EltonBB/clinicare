import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { createClient } from "@/utils/supabase/server";

type ResetPasswordPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = searchParams ? await searchParams : {};
  const recovery = params.recovery === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!recovery || !user) {
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
