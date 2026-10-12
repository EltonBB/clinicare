import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

type ForgotPasswordPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = searchParams ? await searchParams : {};
  const expired = params.expired === "1";

  return (
    <>

      <div className="space-y-2">
        <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
          Reset your password
        </h1>
        <p className="text-[15px] leading-7 text-muted-foreground">
          Enter the email for your Vela account and we&apos;ll send a secure reset link.
        </p>
      </div>

      {expired ? (
        <div className="state-pop mt-6 rounded-(--radius-field) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          That recovery link expired. Request a fresh password reset email below.
        </div>
      ) : null}

      <div className="mt-8">
        <ForgotPasswordForm />
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Remembered your password?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Back to login
        </Link>
      </p>
    </>
  );
}
