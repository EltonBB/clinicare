import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getI18n } from "@/i18n/server";
import { confirmPasswordRecoveryAction } from "@/app/(auth)/actions";
import { RECOVERY_EXPIRED_REDIRECT } from "@/lib/app-url-policy";
import { SubmitButton } from "@/components/auth/submit-button";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.auth.resetConfirm.meta };
}

type ConfirmRecoveryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConfirmRecoveryPage({ searchParams }: ConfirmRecoveryPageProps) {
  const params = searchParams ? await searchParams : {};
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = typeof params.type === "string" ? params.type : "";

  if (!tokenHash || type !== "recovery") {
    redirect(RECOVERY_EXPIRED_REDIRECT);
  }
  const t = (await getI18n()).m.auth.resetConfirm;

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

      <form action={confirmPasswordRecoveryAction.bind(null, tokenHash)} className="mt-8">
        <SubmitButton
          pendingLabel={t.pending}
          className="h-12 w-full rounded-(--radius-field) text-[15px] font-semibold"
        >
          {t.continue}
        </SubmitButton>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t.notYou}{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          {t.backToLogin}
        </Link>
      </p>
    </>
  );
}
