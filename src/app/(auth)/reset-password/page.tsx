import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/utils/supabase/server";

type ResetPasswordPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
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
    <Card className="surface-card overflow-hidden border-white/75 bg-white/90 shadow-[0_30px_90px_rgba(20,21,47,0.12)]">
      <div className="h-1.5 bg-[linear-gradient(90deg,var(--brand-start),var(--brand-end))]" />
      <CardHeader className="space-y-6 px-8 pt-9 text-center sm:px-10 sm:pt-10">
        <BrandMark href="/login" includeSubtitle={false} className="justify-center" />
        <div className="space-y-3">
          <CardTitle className="text-[2rem] font-semibold tracking-tight text-[var(--brand-ink)]">
            Choose a new password.
          </CardTitle>
          <p className="mx-auto max-w-sm text-[15px] leading-7 text-muted-foreground">
            Set a fresh password for {user.email}. Once saved, you&apos;ll be
            asked to log in again.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-9 px-8 pb-0 sm:px-10">
        <ResetPasswordForm />
        <div className="-mx-8 border-t border-border/70 bg-[linear-gradient(135deg,rgba(150,118,247,0.06),rgba(109,195,213,0.06))] px-8 py-6 text-center text-sm text-muted-foreground sm:-mx-10 sm:px-10">
          Need a new recovery link?{" "}
          <Link href="/forgot-password" className="font-semibold text-primary">
            Request again
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
