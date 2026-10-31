import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.auth.forgot.meta };
}

type ForgotPasswordPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = searchParams ? await searchParams : {};
  const expired = params.expired === "1";
  const t = (await getI18n()).m.auth.forgot;

  return (
    <>

      <div className="space-y-2">
        <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
          {t.title}
        </h1>
        <p className="text-[15px] leading-7 text-muted-foreground">
          {t.lede}
        </p>
      </div>

      {expired ? (
        <div className="state-pop mt-6 rounded-(--radius-field) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t.expired}
        </div>
      ) : null}

      <div className="mt-8">
        <ForgotPasswordForm />
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t.remembered}{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          {t.backToLogin}
        </Link>
      </p>
    </>
  );
}
