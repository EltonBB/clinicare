import Link from "next/link";
import { Mail } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { AuthConfirmationBridge } from "@/components/auth/auth-confirmation-bridge";
import { EmailVerificationWatcher } from "@/components/auth/email-verification-watcher";
import { ResendConfirmationForm } from "@/components/auth/resend-confirmation-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sanitizeOversizedAuthMetadataByEmail } from "@/lib/auth-metadata";
import { createClient } from "@/utils/supabase/server";

type ConfirmEmailPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConfirmEmailPage({
  searchParams,
}: ConfirmEmailPageProps) {
  const params = searchParams ? await searchParams : {};
  const emailFromSearch = typeof params.email === "string" ? params.email : "";

  if (emailFromSearch) {
    await sanitizeOversizedAuthMetadataByEmail(emailFromSearch);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = emailFromSearch || user?.email || "";
  const error = typeof params.error === "string" ? params.error : "";
  const already = params.already === "1";
  const pending = params.pending === "1";
  const sent = params.sent === "1";
  const ticket = typeof params.ticket === "string" ? params.ticket : "";
  const verified = params.verified === "1";

  if (verified) {
    return (
      <div className="space-y-6">
        <AuthConfirmationBridge />
        <Card className="surface-card overflow-hidden border-white/75 bg-white/90 shadow-[0_30px_90px_rgba(20,21,47,0.12)]">
          <div className="h-1.5 bg-[linear-gradient(90deg,var(--brand-start),var(--brand-end))]" />
          <CardHeader className="space-y-6 px-8 pt-9 text-center sm:px-10 sm:pt-10">
            <BrandMark
              href="/login"
              includeSubtitle={false}
              className="justify-center"
            />
            <div className="vela-icon-tile mx-auto size-[4.75rem] rounded-[1.5rem]">
              <Mail className="size-7" />
            </div>
            <div className="space-y-3">
              <CardTitle className="text-[2rem] font-semibold tracking-tight text-[var(--brand-ink)]">
                Congratulations.
              </CardTitle>
              <p className="mx-auto max-w-sm text-[15px] leading-7 text-muted-foreground">
                Your email is confirmed and your Vela account is ready.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-8 pb-9 text-center sm:px-10 sm:pb-10">
            <Link href="/login" className="font-semibold text-primary">
              Continue to login
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AuthConfirmationBridge />
      {sent && ticket ? <EmailVerificationWatcher ticket={ticket} /> : null}
      <Card className="surface-card overflow-hidden border-white/75 bg-white/90 shadow-[0_30px_90px_rgba(20,21,47,0.12)]">
        <div className="h-1.5 bg-[linear-gradient(90deg,var(--brand-start),var(--brand-end))]" />
        <CardHeader className="space-y-6 px-8 pt-9 text-center sm:px-10 sm:pt-10">
          <BrandMark
            href="/sign-up"
            includeSubtitle={false}
            className="justify-center"
          />
          <div className="mx-auto flex size-[4.75rem] items-center justify-center rounded-[1.5rem] border border-border/80 bg-white">
            <Mail className="size-7 text-primary" />
          </div>
          <div className="space-y-3">
            <CardTitle className="text-[2rem] font-semibold tracking-tight text-[var(--brand-ink)]">
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
          {already ? (
            <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary">
              That link was already used or the email was already confirmed. If you already verified on another device, continue to login.
            </div>
          ) : null}

          {pending ? (
            <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary">
              Your account exists, but the email still needs verification.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {sent && !already ? (
            <div className="rounded-[1rem] border border-border/75 bg-[linear-gradient(135deg,rgba(10,34,255,0.06),rgba(100,182,255,0.06))] px-4 py-4 text-sm text-muted-foreground">
              Once the email is confirmed, this page will redirect you to login automatically.
            </div>
          ) : null}

          <ResendConfirmationForm email={email} ticket={ticket} />

          <div className="space-y-3 border-t border-border pt-5 text-center text-sm">
            <Link href="/sign-up" className="font-semibold text-foreground">
              Back to sign up
            </Link>
            <div>
              <Link href="/forgot-password" className="font-semibold text-primary">
                Need to reset your password?
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Can&apos;t find the email? Check your spam folder or contact{" "}
        <span className="font-semibold text-primary">Support</span>.
      </p>
    </div>
  );
}
