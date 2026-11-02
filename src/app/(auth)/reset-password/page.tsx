import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { fmt } from "@/i18n/format";
import { getI18n } from "@/i18n/server";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { createClient } from "@/utils/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.auth.reset.meta };
}

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only a session that arrived via the recovery verification may use this form:
  // confirmPasswordRecoveryAction (the /reset-password/confirm Continue button)
  // sets the marker to the recovered user's id (not a forgeable ?recovery=1
  // param), so it must equal the current session's user id.
  if (!user || cookieStore.get("vela_pw_recovery")?.value !== user.id) {
    redirect("/forgot-password?expired=1");
  }
  const t = (await getI18n()).m.auth.reset;

  return (
    <>

      <div className="space-y-2">
        <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
          {t.title}
        </h1>
        <p className="text-[15px] leading-7 text-muted-foreground">
          {fmt(t.lede, { email: user.email ?? "" })}
        </p>
      </div>

      <div className="mt-8">
        <ResetPasswordForm />
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {t.needLink}{" "}
        <Link href="/forgot-password" className="font-semibold text-primary hover:underline">
          {t.requestAgain}
        </Link>
      </p>
    </>
  );
}
