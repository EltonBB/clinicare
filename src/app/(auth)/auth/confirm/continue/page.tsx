import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getI18n } from "@/i18n/server";
import { confirmEmailLinkAction } from "@/app/(auth)/actions";
import {
  authConfirmContinuationPath,
  CONFIRMABLE_EMAIL_OTP_TYPES,
  INVALID_CONFIRM_LINK_REDIRECT,
} from "@/lib/app-url-policy";
import { SubmitButton } from "@/components/auth/submit-button";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.auth.confirmContinue.meta };
}

type ConfirmContinuePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The generic (non-recovery) continuation page /auth/confirm redirects a
 * bare GET to instead of verifying there — see that route for why. Rendering
 * this page never consumes the token; only submitting the form below does.
 * The render gate mirrors the action's allowlist so a link that can only
 * fail is rejected (or, for recovery, handed to the right page) up front —
 * never shown a Continue button that is guaranteed to dead-end.
 */
export default async function ConfirmContinuePage({ searchParams }: ConfirmContinuePageProps) {
  const params = searchParams ? await searchParams : {};
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = typeof params.type === "string" ? params.type : "";
  const next = typeof params.next === "string" ? params.next : "";

  if (!tokenHash || !type) {
    redirect(INVALID_CONFIRM_LINK_REDIRECT);
  }

  if (type === "recovery") {
    redirect(authConfirmContinuationPath(tokenHash, type));
  }

  if (!CONFIRMABLE_EMAIL_OTP_TYPES.has(type)) {
    redirect(INVALID_CONFIRM_LINK_REDIRECT);
  }

  const { m } = await getI18n();
  const t = m.auth.confirmContinue;

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

      <form action={confirmEmailLinkAction.bind(null, tokenHash, type, next)} className="mt-8">
        <SubmitButton
          pendingLabel={m.auth.resetConfirm.pending}
          className="h-12 w-full rounded-(--radius-field) text-[15px] font-semibold"
        >
          {m.auth.resetConfirm.continue}
        </SubmitButton>
      </form>
    </>
  );
}
