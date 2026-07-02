import Link from "next/link";
import { redirect } from "next/navigation";

import { confirmPasswordRecoveryAction } from "@/app/(auth)/actions";
import { BrandMark } from "@/components/brand-mark";
import { SubmitButton } from "@/components/auth/submit-button";

type ConfirmRecoveryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConfirmRecoveryPage({ searchParams }: ConfirmRecoveryPageProps) {
  const params = searchParams ? await searchParams : {};
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = typeof params.type === "string" ? params.type : "";

  if (!tokenHash || type !== "recovery") {
    redirect("/forgot-password?expired=1");
  }

  return (
    <>
      {/* Mobile brand (the desktop brand lives in the left panel) */}
      <BrandMark href="/" includeSubtitle={false} className="mb-10 lg:hidden" />

      <div className="space-y-2">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-[var(--brand-ink)]">
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
