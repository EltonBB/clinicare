import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { AuthConfirmationBridge } from "@/components/auth/auth-confirmation-bridge";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <AuthConfirmationBridge />
      <Card className="surface-card overflow-hidden border-white/75 bg-white/90 shadow-[0_30px_90px_rgba(20,21,47,0.12)]">
        <div className="h-1.5 bg-[linear-gradient(90deg,var(--brand-start),var(--brand-end))]" />
        <CardHeader className="space-y-6 px-8 pt-9 text-center sm:px-10 sm:pt-10">
          <BrandMark href="/sign-up" includeSubtitle={false} className="justify-center" />
          <div className="space-y-3">
            <CardTitle className="text-[2rem] font-semibold tracking-tight text-[var(--brand-ink)]">
              Welcome back.
            </CardTitle>
            <p className="mx-auto max-w-sm text-[15px] leading-7 text-muted-foreground">
              Sign in to access your schedule, clients, and daily operations.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-9 px-8 pb-0 sm:px-10">
          {verified ? (
            <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary">
              Your email was confirmed. Log in to continue.
            </div>
          ) : null}
          {reset ? (
            <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-medium text-primary">
              Your password has been reset. Log in with the new one.
            </div>
          ) : null}
          <LoginForm nextPath={nextPath} />
          <div className="-mt-2 text-right text-sm">
            <Link href="/forgot-password" className="font-semibold text-primary">
              Forgot password?
            </Link>
          </div>
          <div className="-mx-8 border-t border-border/70 bg-[linear-gradient(135deg,rgba(150,118,247,0.06),rgba(109,195,213,0.06))] px-8 py-6 text-center text-sm text-muted-foreground sm:-mx-10 sm:px-10">
            Need a new workspace?{" "}
            <Link href="/sign-up" className="font-semibold text-primary">
              Create account
            </Link>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
