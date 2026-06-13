import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ForgotPasswordPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = searchParams ? await searchParams : {};
  const expired = params.expired === "1";

  return (
    <Card className="surface-card overflow-hidden border-white/75 bg-white/90 shadow-[0_30px_90px_rgba(20,21,47,0.12)]">
      <div className="h-1.5 bg-[linear-gradient(90deg,var(--brand-start),var(--brand-end))]" />
      <CardHeader className="space-y-6 px-8 pt-9 text-center sm:px-10 sm:pt-10">
        <BrandMark href="/login" includeSubtitle={false} className="justify-center" />
        <div className="space-y-3">
          <CardTitle className="text-[2rem] font-semibold tracking-tight text-[var(--brand-ink)]">
            Reset your password.
          </CardTitle>
          <p className="mx-auto max-w-sm text-[15px] leading-7 text-muted-foreground">
            Enter the email for your Vela account and we&apos;ll send a secure
            reset link.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-9 px-8 pb-0 sm:px-10">
        {expired ? (
          <div className="state-pop rounded-(--radius-field) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            That recovery link expired. Request a fresh password reset email below.
          </div>
        ) : null}
        <ForgotPasswordForm />
        <div className="-mx-8 border-t border-border/70 bg-[linear-gradient(135deg,rgba(10,34,255,0.06),rgba(100,182,255,0.06))] px-8 py-6 text-center text-sm text-muted-foreground sm:-mx-10 sm:px-10">
          Remembered your password?{" "}
          <Link href="/login" className="font-semibold text-primary">
            Back to login
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
