import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignUpPage() {
  return (
    <Card className="surface-card overflow-hidden border-white/75 bg-white/90 shadow-[0_30px_90px_rgba(20,21,47,0.12)] backdrop-blur">
      <div className="h-1.5 bg-[linear-gradient(90deg,var(--brand-start),var(--brand-end))]" />
      <CardHeader className="space-y-7 px-8 pt-9 text-center sm:px-10 sm:pt-10">
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
      <CardContent className="space-y-9 px-8 pb-0 sm:px-10">
        <SignUpForm />
        <div className="-mx-8 border-t border-border/70 bg-[linear-gradient(135deg,rgba(150,118,247,0.06),rgba(109,195,213,0.06))] px-8 py-6 text-center text-sm text-muted-foreground sm:-mx-10 sm:px-10">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary">
            Log in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
