import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default function SignUpPage() {
  return (
    <>
      {/* Mobile brand (the desktop brand lives in the left panel) */}
      <BrandMark href="/" includeSubtitle={false} className="mb-10 lg:hidden" />

      <div className="space-y-2">
        <h1 className="text-[2rem] font-semibold leading-tight tracking-tight text-[var(--brand-ink)]">
          Create your account
        </h1>
        <p className="text-[15px] leading-7 text-muted-foreground">
          Start with email and password — clinic details come after you confirm your email.
        </p>
      </div>

      <div className="mt-8">
        <SignUpForm />
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}
