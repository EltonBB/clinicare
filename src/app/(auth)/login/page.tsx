import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/components/auth/login-form";
import { sanitizeOversizedAuthMetadataByEmail } from "@/lib/auth-metadata";
import { getEmailVerificationReceiptEmail } from "@/lib/email-verification-receipts";

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

  return (
    <>
      {/* Mobile brand (the desktop brand lives in the left panel) */}
      <BrandMark href="/" includeSubtitle={false} className="mb-10 lg:hidden" />

      <div className="space-y-2">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-[var(--brand-ink)]">
          Welcome back
        </h1>
        <p className="text-[15px] leading-7 text-muted-foreground">Sign in to your clinic workspace.</p>
      </div>

      {verified ? (
        <div className="state-pop mt-6 rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary">
          Your email was confirmed. Log in to continue.
        </div>
      ) : null}
      {reset ? (
        <div className="state-pop mt-6 rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary">
          Your password has been reset. Log in with the new one.
        </div>
      ) : null}

      <div className="mt-8">
        <LoginForm nextPath={nextPath} />
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Need a new workspace?{" "}
        <Link href="/sign-up" className="font-semibold text-primary hover:underline">
          Create account
        </Link>
      </p>
    </>
  );
}
