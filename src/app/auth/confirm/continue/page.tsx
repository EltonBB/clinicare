import { redirect } from "next/navigation";

import { confirmEmailLinkAction } from "@/app/(auth)/actions";
import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { BrandMark } from "@/components/brand-mark";
import { SubmitButton } from "@/components/auth/submit-button";

const INVALID_LINK =
  "/confirm-email?error=" +
  encodeURIComponent("That verification link is no longer valid. Request a new one below.");

type ConfirmContinuePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The generic (non-recovery) continuation page /auth/confirm redirects a
 * bare GET to instead of verifying there — see route.ts for why. Rendering
 * this page never consumes the token; only submitting the form below does.
 * Outside the (auth) route group, so it wraps itself in AuthSplitShell.
 */
export default async function ConfirmContinuePage({ searchParams }: ConfirmContinuePageProps) {
  const params = searchParams ? await searchParams : {};
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const type = typeof params.type === "string" ? params.type : "";

  if (!tokenHash || !type) {
    redirect(INVALID_LINK);
  }

  return (
    <AuthSplitShell>
      {/* Mobile brand (the desktop brand lives in the left panel) */}
      <BrandMark href="/" includeSubtitle={false} className="mb-10 lg:hidden" />

      <div className="space-y-2">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-[var(--brand-ink)]">
          Confirm your email
        </h1>
        <p className="text-[15px] leading-7 text-muted-foreground">
          For your security, confirm below to continue.
        </p>
      </div>

      <form action={confirmEmailLinkAction.bind(null, tokenHash, type)} className="mt-8">
        <SubmitButton
          pendingLabel="Confirming..."
          className="h-12 w-full rounded-(--radius-field) text-[15px] font-semibold"
        >
          Continue
        </SubmitButton>
      </form>
    </AuthSplitShell>
  );
}
