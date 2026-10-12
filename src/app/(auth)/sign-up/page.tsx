import type { Metadata } from "next";
import Link from "next/link";

import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Create your workspace | Vela" };

export default function SignUpPage() {
  return (
    <>

      <div className="space-y-2">
        <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
          Create your account
        </h1>
        <p className="text-[15px] leading-7 text-muted-foreground">
          Start with an email and password. Clinic details come after you confirm your email.
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
