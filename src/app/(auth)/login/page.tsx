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
      <Card className="surface-card overflow-hidden">
        <CardHeader className="space-y-6 px-8 pt-9 text-center sm:px-10 sm:pt-10">
          <BrandMark href="/sign-up" includeSubtitle={false} className="justify-center" />
          <div className="space-y-3">
            <CardTitle className="text-[2rem] font-semibold tracking-tight">
              Welcome back.
            </CardTitle>
            <p className="mx-auto max-w-sm text-[15px] leading-7 text-muted-foreground">
              Sign in to access your schedule, clients, and daily operations.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-9 px-8 pb-0 sm:px-10">
          {verified ? (
            <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
              Your email was confirmed. Log in to continue.
            </div>
          ) : null}
          {reset ? (
            <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
              Your password has been reset. Log in with the new one.
            </div>
          ) : null}
          <LoginForm nextPath={nextPath} />
          <div className="-mt-2 text-right text-sm">
            <Link href="/forgot-password" className="font-medium text-primary">
              Forgot password?
            </Link>
          </div>
          <div className="-mx-8 border-t border-border bg-card px-8 py-6 text-center text-sm text-muted-foreground sm:-mx-10 sm:px-10">
            Need a new workspace?{" "}
            <Link href="/sign-up" className="font-medium text-primary">
              Create account
            </Link>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
