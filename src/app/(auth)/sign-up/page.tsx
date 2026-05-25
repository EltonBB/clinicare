import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignUpPage() {
  return (
    <Card className="surface-card overflow-hidden border-white/75 bg-white/94 backdrop-blur">
      <div className="h-1.5 bg-[linear-gradient(90deg,var(--brand-start),var(--brand-end))]" />
      <CardHeader className="space-y-5 px-7 pt-8 text-center sm:px-9 sm:pt-9">
        <BrandMark href="/sign-up" includeSubtitle={false} className="justify-center" />
        <div className="space-y-3">
          <CardTitle className="text-[2rem] font-semibold tracking-tight text-[var(--brand-ink)]">
            Create your Vela account.
          </CardTitle>
          <p className="mx-auto max-w-sm text-[15px] leading-7 text-muted-foreground">
            Start with email and password. Clinic details come after email
            confirmation.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-7 px-7 pb-0 sm:px-9">
        <SignUpForm />
        <div className="-mx-7 border-t border-border/70 bg-[linear-gradient(135deg,rgba(10,34,255,0.05),rgba(100,182,255,0.05))] px-7 py-5 text-center text-sm text-muted-foreground sm:-mx-9 sm:px-9">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary">
            Log in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
