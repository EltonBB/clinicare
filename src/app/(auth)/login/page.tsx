import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { getI18n } from "@/i18n/server";
import { sanitizeOversizedAuthMetadataByEmail } from "@/lib/auth-metadata";
import { getEmailVerificationReceiptEmail } from "@/lib/email-verification-receipts";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.auth.login.meta };
}

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const ticket = typeof params.ticket === "string" ? params.ticket : "";
  const receiptEmail = ticket ? await getEmailVerificationReceiptEmail(ticket) : null;

  if (receiptEmail) {
    await sanitizeOversizedAuthMetadataByEmail(receiptEmail);
  }

  const nextPath = typeof params.next === "string" ? params.next : "/dashboard";
  const reset = params.reset === "1";
  const verified = params.verified === "1";
  const t = (await getI18n()).m.auth.login;

  return (
    <>

      <div className="space-y-2">
        <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
          {t.title}
        </h1>
        <p className="text-[15px] leading-7 text-muted-foreground">{t.lede}</p>
      </div>

      {verified ? (
        <div className="state-pop mt-6 rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary">
          {t.verified}
        </div>
      ) : null}
      {reset ? (
        <div className="state-pop mt-6 rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary">
          {t.reset}
        </div>
      ) : null}

      <div className="mt-8">
        <LoginForm nextPath={nextPath} />
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t.noAccount}{" "}
        <Link href="/sign-up" className="font-semibold text-primary hover:underline">
          {t.createAccount}
        </Link>
      </p>
    </>
  );
}
