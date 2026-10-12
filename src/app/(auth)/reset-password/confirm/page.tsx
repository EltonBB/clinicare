import Link from "next/link";
import { redirect } from "next/navigation";

import { confirmPasswordRecoveryAction } from "@/app/(auth)/actions";
import { RECOVERY_EXPIRED_REDIRECT } from "@/lib/app-url-policy";
import { SubmitButton } from "@/components/auth/submit-button";

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

  return (
    <>

      <div className="space-y-2">
        <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
          Confirm password reset
        </h1>
        <p className="text-[15px] leading-7 text-muted-foreground">
          For your security, confirm below to continue resetting your password.
        </p>
      </div>

      <form action={confirmPasswordRecoveryAction.bind(null, tokenHash)} className="mt-8">
        <SubmitButton
          pendingLabel="Confirming..."
          className="h-12 w-full rounded-(--radius-field) text-[15px] font-semibold"
        >
          Continue
        </SubmitButton>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Didn&apos;t request this?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Back to login
        </Link>
      </p>
    </>
  );
}
