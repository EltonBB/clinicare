import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignUpPage() {
  return (
    <Card className="surface-card overflow-hidden">
      <CardHeader className="space-y-6 px-8 pt-9 text-center sm:px-10 sm:pt-10">
        <BrandMark
          href="/sign-up"
          includeSubtitle={false}
          className="justify-center"
        />
        <div className="space-y-3">
          <CardTitle className="text-[2rem] font-semibold tracking-tight">
          Start managing with clarity.
          </CardTitle>
          <p className="mx-auto max-w-sm text-[15px] leading-7 text-muted-foreground">
            Create your Vela workspace for appointments, clients, staff, and
            WhatsApp reminders.
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
