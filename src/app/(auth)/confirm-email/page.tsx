import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";

import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { EmailVerificationWatcher } from "@/components/auth/email-verification-watcher";
import { ResendConfirmationForm } from "@/components/auth/resend-confirmation-form";
import { createClient } from "@/utils/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.auth.confirmEmail.meta };
}

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
  const t = (await getI18n()).m.auth.confirmEmail;

  if (verified) {
    return (
      <>

        <div className="flex size-14 items-center justify-center rounded-(--radius-field) border border-border/80 bg-white">
          <Mail className="size-6 text-primary" />
        </div>
        <div className="mt-6 space-y-2">
          <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
            {t.confirmedTitle}
          </h1>
          <p className="text-[15px] leading-7 text-muted-foreground">
            {t.confirmedLede}
          </p>
        </div>

        <Link
          href="/login"
          className="mt-8 flex h-12 w-full items-center justify-center rounded-(--radius-field) bg-[var(--brand-ink)] text-[15px] font-semibold text-white transition-[transform,background-color] duration-(--duration-base) ease-out-quint hover:bg-[var(--brand-ink)]/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45"
        >
          {t.continueToLogin}
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
          {t.title}
        </h1>
        <p className="text-[15px] leading-7 text-muted-foreground">
          {email ? fmt(t.sentTo, { email }) : t.sentInbox}
        </p>
      </div>

      {already || pending || error || (sent && !already) ? (
        <div className="mt-6 space-y-4">
          {already ? (
            <div className="state-pop rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary">
              {t.already}
            </div>
          ) : null}

          {pending ? (
            <div className="state-pop rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary">
              {t.pending}
            </div>
          ) : null}

          {error ? (
            <div className="state-pop rounded-(--radius-field) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {t.invalid}
            </div>
          ) : null}

          {sent && !already ? (
            <div className="rounded-(--radius-field) border border-border/75 bg-[var(--brand-wash)]/50 px-4 py-3 text-sm text-muted-foreground">
              {t.autoRedirect}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6">
        <ResendConfirmationForm email={email} ticket={ticket} />
      </div>

      <div className="mt-8 flex items-center justify-between gap-4 border-t border-border/70 pt-6 text-sm">
        <Link href="/sign-up" className="font-medium text-muted-foreground transition-colors hover:text-[var(--brand-ink)]">
          {t.backToSignUp}
        </Link>
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">
          {t.resetPassword}
        </Link>
      </div>

      <p className="mt-6 text-sm leading-6 text-muted-foreground">
        {t.cantFind}{" "}
        <Link href="/contact" className="font-medium text-primary hover:underline">
          {t.contactUs}
        </Link>
        .
      </p>
    </>
  );
}
