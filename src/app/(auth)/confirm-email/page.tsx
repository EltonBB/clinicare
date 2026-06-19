import Link from "next/link";
import { Mail } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { AuthConfirmationBridge } from "@/components/auth/auth-confirmation-bridge";
import { EmailVerificationWatcher } from "@/components/auth/email-verification-watcher";
import { ResendConfirmationForm } from "@/components/auth/resend-confirmation-form";
import { createClient } from "@/utils/supabase/server";

type ConfirmEmailPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConfirmEmailPage({ searchParams }: ConfirmEmailPageProps) {
  const params = searchParams ? await searchParams : {};
  const emailFromSearch = typeof params.email === "string" ? params.email : "";

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
      <>
        <AuthConfirmationBridge />
        <BrandMark href="/" includeSubtitle={false} className="mb-10 lg:hidden" />

        <div className="flex size-14 items-center justify-center rounded-(--radius-field) border border-border/80 bg-white">
          <Mail className="size-6 text-primary" />
        </div>
        <div className="mt-6 space-y-2">
          <h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-[var(--brand-ink)]">
            Email confirmed
          </h1>
          <p className="text-[15px] leading-7 text-muted-foreground">
            Your Vela account is ready. Log in to continue.
          </p>
        </div>

        <Link
          href="/login"
          className="vela-gradient mt-8 flex h-12 w-full items-center justify-center rounded-(--radius-field) text-[15px] font-semibold text-white shadow-[0_18px_36px_rgba(10,34,255,0.24)] transition-[transform,box-shadow] duration-(--duration-base) ease-out-quint hover:shadow-[0_22px_44px_rgba(10,34,255,0.30)] active:translate-y-px active:scale-[0.99] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45"
        >
          Continue to login
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthConfirmationBridge />
      {sent && ticket ? <EmailVerificationWatcher ticket={ticket} /> : null}
      <BrandMark href="/" includeSubtitle={false} className="mb-10 lg:hidden" />

      <div className="flex size-14 items-center justify-center rounded-(--radius-field) border border-border/80 bg-white">
        <Mail className="size-6 text-primary" />
      </div>
      <div className="mt-6 space-y-2">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-[var(--brand-ink)]">
          Check your email
        </h1>
        <p className="text-[15px] leading-7 text-muted-foreground">
          {email
            ? `We've sent a verification link to ${email}. Open it to confirm your account before entering the app.`
            : "We've sent a verification link to your inbox. Open it to confirm your account before entering the app."}
        </p>
      </div>

      {already || pending || error || (sent && !already) ? (
        <div className="mt-6 space-y-4">
          {already ? (
            <div className="state-pop rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary">
              That link was already used or the email was already confirmed. If you already verified on another device, continue to login.
            </div>
          ) : null}

          {pending ? (
            <div className="state-pop rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary">
              Your account exists, but the email still needs verification.
            </div>
          ) : null}

          {error ? (
            <div className="state-pop rounded-(--radius-field) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {sent && !already ? (
            <div className="rounded-(--radius-field) border border-border/75 bg-[linear-gradient(135deg,rgba(10,34,255,0.06),rgba(100,182,255,0.06))] px-4 py-3 text-sm text-muted-foreground">
              Once the email is confirmed, this page will redirect you to login automatically.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6">
        <ResendConfirmationForm email={email} ticket={ticket} />
      </div>

      <div className="mt-8 space-y-3 border-t border-border/70 pt-6 text-center text-sm">
        <Link href="/sign-up" className="font-semibold text-foreground hover:underline">
          Back to sign up
        </Link>
        <div>
          <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
            Need to reset your password?
          </Link>
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Can&apos;t find the email? Check your spam folder or contact{" "}
        <span className="font-semibold text-primary">Support</span>.
      </p>
    </>
  );
}
