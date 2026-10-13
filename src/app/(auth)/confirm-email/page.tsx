import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";

import { EmailVerificationWatcher } from "@/components/auth/email-verification-watcher";
import { ResendConfirmationForm } from "@/components/auth/resend-confirmation-form";
import { createClient } from "@/utils/supabase/server";

export const metadata: Metadata = { title: "Check your email | Vela" };

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

        <div className="flex size-14 items-center justify-center rounded-(--radius-field) border border-border/80 bg-white">
          <Mail className="size-6 text-primary" />
        </div>
        <div className="mt-6 space-y-2">
          <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
            Email confirmed
          </h1>
          <p className="text-[15px] leading-7 text-muted-foreground">
            Your Vela account is ready. Log in to continue.
          </p>
        </div>

        <Link
          href="/login"
          className="mt-8 flex h-12 w-full items-center justify-center rounded-(--radius-field) bg-[var(--brand-ink)] text-[15px] font-semibold text-white transition-[transform,background-color] duration-(--duration-base) ease-out-quint hover:bg-[var(--brand-ink)]/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45"
        >
          Continue to login
        </Link>
      </>
    );
  }

  return (
    <>
      {sent && ticket ? <EmailVerificationWatcher ticket={ticket} /> : null}

      <div className="flex size-14 items-center justify-center rounded-(--radius-field) border border-border/80 bg-white">
        <Mail className="size-6 text-primary" />
      </div>
      <div className="mt-6 space-y-2">
        <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
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
              That verification link is no longer valid. Request a new one below.
            </div>
          ) : null}

          {sent && !already ? (
            <div className="rounded-(--radius-field) border border-border/75 bg-[var(--brand-wash)]/50 px-4 py-3 text-sm text-muted-foreground">
              Once the email is confirmed, this page will redirect you to login automatically.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6">
        <ResendConfirmationForm email={email} ticket={ticket} />
      </div>

      <div className="mt-8 flex items-center justify-between gap-4 border-t border-border/70 pt-6 text-sm">
        <Link href="/sign-up" className="font-medium text-muted-foreground transition-colors hover:text-[var(--brand-ink)]">
          Back to sign up
        </Link>
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">
          Reset your password
        </Link>
      </div>

      <p className="mt-6 text-sm leading-6 text-muted-foreground">
        Can&apos;t find the email? Check your spam folder or{" "}
        <Link href="/contact" className="font-medium text-primary hover:underline">
          contact us
        </Link>
        .
      </p>
    </>
  );
}
