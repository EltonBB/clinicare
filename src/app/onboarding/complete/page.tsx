import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, ShieldCheck } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentBusiness } from "@/lib/business";
import { resolveBrandAccentPreset } from "@/lib/branding";
import { isOnboardingCompleted } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/server";

export default async function OnboardingCompletePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/onboarding/complete");
  }

  if (!user.email_confirmed_at) {
    redirect(`/confirm-email?email=${encodeURIComponent(user.email ?? "")}`);
  }

  const metadata = user.user_metadata ?? {};
  const business = await getCurrentBusiness(user.id);

  if (!isOnboardingCompleted(metadata)) {
    redirect("/onboarding");
  }

  if (!business) {
    redirect("/onboarding");
  }

  const accent = resolveBrandAccentPreset(business.brandAccentColor);

  return (
    <div
      className="min-h-screen bg-background"
      style={
        {
          "--primary": accent.value,
          "--primary-soft": accent.soft,
          "--primary-shadow": accent.shadow,
          "--ring": accent.shadow,
          "--accent": accent.soft,
          "--accent-foreground": accent.value,
        } as CSSProperties
      }
    >
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="border-b border-border pb-6">
          <BrandMark href="/dashboard" includeSubtitle={false} />
        </div>
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center py-12 text-center">
          <div className="flex size-24 items-center justify-center rounded-[1.75rem] bg-primary/14 text-primary">
            <CheckCircle2 className="size-12" />
          </div>
          <div className="mt-8 space-y-4">
            <h1 className="text-5xl font-semibold tracking-tight text-foreground">
              You are ready.
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-8 text-muted-foreground">
              Your workspace is configured for the MVP. Step into the dashboard and
              start managing appointments, clients, reminders, and staff in one
              place.
            </p>
          </div>

          <div className="mt-12 grid w-full gap-4 md:grid-cols-2">
            <Card className="surface-card">
              <CardContent className="flex gap-4 p-6">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CalendarDays className="size-5" />
                </div>
                <div className="space-y-2 text-left">
                  <p className="text-sm font-semibold text-foreground">Workspace ready</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Your clinic profile, hours, staff, and reminder settings are saved.
                    Clients, bookings, and WhatsApp setup can all be completed later from the workspace.
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="surface-card">
              <CardContent className="flex gap-4 p-6">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShieldCheck className="size-5" />
                </div>
                <div className="space-y-2 text-left">
                  <p className="text-sm font-semibold text-foreground">Status</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Onboarding is complete. WhatsApp setup is available from
                    Settings when you are ready to connect the clinic number.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-12 rounded-[0.95rem] px-5"
              )}
            >
              Go to dashboard
              <ArrowRight data-icon="inline-end" />
            </Link>
            <Link
              href="/settings#whatsapp-configuration"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 rounded-[0.95rem] bg-white/78 px-5"
              )}
            >
              Connect WhatsApp later
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
