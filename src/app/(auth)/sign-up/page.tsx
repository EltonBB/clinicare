import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignUpPage() {
  return (
    <Card className="surface-card overflow-hidden border-white/75 bg-white/86 shadow-[0_26px_80px_rgba(20,32,51,0.12)] backdrop-blur">
      <div className="h-1.5 bg-[linear-gradient(90deg,var(--primary),color-mix(in_oklab,var(--primary)_34%,white),var(--primary))]" />
      <CardHeader className="space-y-7 px-8 pt-9 text-center sm:px-10 sm:pt-10">
        <div className="mx-auto flex size-12 items-center justify-center rounded-[1rem] bg-primary/10 text-primary shadow-[0_16px_34px_var(--primary-shadow)]">
          <BrandMark
            href="/sign-up"
            compact
            includeSubtitle={false}
            className="justify-center"
          />
        </div>
        <div className="space-y-3">
          <CardTitle className="text-[2rem] font-semibold tracking-tight">
            Create your Vela account.
          </CardTitle>
          <p className="mx-auto max-w-sm text-[15px] leading-7 text-muted-foreground">
            Start with email and password. Clinic details come after email
            confirmation.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-9 px-8 pb-0 sm:px-10">
        <SignUpForm />
        <div className="-mx-8 border-t border-border bg-card px-8 py-6 text-center text-sm text-muted-foreground sm:-mx-10 sm:px-10">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary">
            Log in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
