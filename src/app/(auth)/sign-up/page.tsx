import type { Metadata } from "next";
import Link from "next/link";

import { SignUpForm } from "@/components/auth/sign-up-form";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.auth.signUp.meta };
}

export default async function SignUpPage() {
  const t = (await getI18n()).m.auth.signUp;
  return (
    <>

      <div className="space-y-2">
        <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
          {t.title}
        </h1>
        <p className="text-[15px] leading-7 text-muted-foreground">
          {t.lede}
        </p>
      </div>

      <div className="mt-8">
        <SignUpForm />
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t.haveAccount}{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          {t.logIn}
        </Link>
      </p>
    </>
  );
}
