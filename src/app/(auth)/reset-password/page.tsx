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
    <Card className="surface-card overflow-hidden">
      <CardHeader className="space-y-6 px-8 pt-9 text-center sm:px-10 sm:pt-10">
        <BrandMark href="/login" includeSubtitle={false} className="justify-center" />
        <div className="space-y-3">
          <CardTitle className="text-[2rem] font-semibold tracking-tight">
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
        <div className="-mx-8 border-t border-border bg-card px-8 py-6 text-center text-sm text-muted-foreground sm:-mx-10 sm:px-10">
          Need a new recovery link?{" "}
          <Link href="/forgot-password" className="font-medium text-primary">
            Request again
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
