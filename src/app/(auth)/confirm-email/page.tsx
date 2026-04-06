import Link from "next/link";
import { Mail } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { ResendConfirmationForm } from "@/components/auth/resend-confirmation-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/utils/supabase/server";

type ConfirmEmailPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConfirmEmailPage({
  searchParams,
}: ConfirmEmailPageProps) {
  const params = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const emailFromSearch = typeof params.email === "string" ? params.email : "";
  const email = emailFromSearch || user?.email || "";
  const error = typeof params.error === "string" ? params.error : "";
  const pending = params.pending === "1";

  return (
    <div className="space-y-6">
      <Card className="surface-card overflow-hidden">
        <CardHeader className="space-y-6 px-8 pt-9 text-center sm:px-10 sm:pt-10">
          <BrandMark
            href="/sign-up"
            includeSubtitle={false}
            className="justify-center"
          />
          <div className="mx-auto flex size-[4.75rem] items-center justify-center rounded-full bg-secondary">
            <Mail className="size-7 text-primary" />
          </div>
          <div className="space-y-3">
            <CardTitle className="text-[2rem] font-semibold tracking-tight">
              Check your email.
            </CardTitle>
            <p className="mx-auto max-w-sm text-[15px] leading-7 text-muted-foreground">
              {email
                ? `We've sent a verification link to ${email}. Please open it to confirm your account before entering the app.`
                : "We've sent a verification link to your inbox. Open it to confirm your account before entering the app."}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 px-8 pb-9 sm:px-10 sm:pb-10">
          {pending ? (
            <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
              Your account exists, but the email still needs verification.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <ResendConfirmationForm email={email} />

          <div className="space-y-3 border-t border-border pt-5 text-center text-sm">
            <Link href="/sign-up" className="font-medium text-foreground">
              Back to sign up
            </Link>
            <div>
              <Link href="/forgot-password" className="font-medium text-primary">
                Need to reset your password?
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Can&apos;t find the email? Check your spam folder or contact{" "}
        <span className="font-medium text-primary">Support</span>.
      </p>
    </div>
  );
}
