import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

import { ClinicPreview } from "@/components/onboarding/clinic-preview";
import { inkButtonClassName } from "@/components/onboarding/form-parts";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { buttonVariants } from "@/components/ui/button-variants";
import { workspaceAccess } from "@/lib/billing-access";
import { getCurrentBusiness } from "@/lib/business";
import { resolveBrandAccentPreset } from "@/lib/branding";
import { resolveMediaDisplayUrl } from "@/lib/media-storage-server";
import { createDefaultOnboardingState, isOnboardingCompleted, weekdayOrder } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { cn, firstDisplayName } from "@/lib/utils";
import { createClient } from "@/utils/supabase/server";

export const metadata: Metadata = { title: "Setup complete | Vela" };

type FirstStep = { href: string; title: string; detail: string };

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

  if (!isOnboardingCompleted(metadata) || !business) {
    redirect("/onboarding");
  }

  const [hours, staff, reminderSettings, logoUrl] = await Promise.all([
    prisma.businessHours.findMany({
      where: { businessId: business.id },
      select: { weekday: true, isOpen: true, startTime: true, endTime: true },
    }),
    prisma.staffMember.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "asc" },
      select: { name: true, role: true },
      take: 3,
    }),
    prisma.reminderSettings.findUnique({ where: { businessId: business.id }, select: { template: true } }),
    resolveMediaDisplayUrl(business.logoUrl).catch(() => ""),
  ]);

  // Rows are stored by weekday index in weekdayOrder; a missing row is a closed day.
  const workingHours = { ...createDefaultOnboardingState().workingHours };
  for (const [index, day] of weekdayOrder.entries()) {
    const row = hours.find((item) => item.weekday === index);
    workingHours[day] = row
      ? { enabled: row.isOpen, start: row.startTime, end: row.endTime }
      : { ...workingHours[day], enabled: false };
  }

  const ownerFirstName = firstDisplayName(typeof metadata.full_name === "string" ? metadata.full_name : "");

  // A new clinic starts its free trial before anything else opens.
  const needsPlan = workspaceAccess(business).kind === "needs_plan";
  const firstSteps: FirstStep[] = [
    ...(needsPlan
      ? [{ href: "/checkout", title: "Start your free trial", detail: "14 days free, cancel any time before" }]
      : []),
    { href: "/calendar/new", title: "Book your first appointment", detail: "It lands straight on the calendar" },
    { href: "/clients/new", title: "Add a patient", detail: "Their record starts with the first visit" },
    ...(staff.length <= 1
      ? [{ href: "/staff/new", title: "Add your team", detail: "So visits can be shared out" }]
      : []),
    { href: "/settings?section=whatsapp", title: "Connect WhatsApp", detail: "Reminders go out from your own number" },
  ];

  const panel = (
    <ClinicPreview
      name={business.name}
      type={business.businessType}
      logoUrl={logoUrl}
      accent={resolveBrandAccentPreset(business.brandAccentColor).value}
      hours={workingHours}
      team={staff}
      reminderTemplate={reminderSettings?.template}
      focus="done"
    />
  );

  return (
    <OnboardingShell panel={panel} panelLead="Your clinic," panelTail="ready for day one.">
      <p className="state-pop inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
        <Check className="size-4" />
        Setup complete
      </p>
      <h1 className="mt-3 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
        {business.name} is ready{ownerFirstName ? "," : "."}{" "}
        {ownerFirstName ? <span className="text-muted-foreground">{ownerFirstName}.</span> : null}
      </h1>

      <p className="mt-8 text-sm font-semibold text-foreground">First steps</p>
      <ol className="mt-2 space-y-1">
        {firstSteps.map((item, index) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="group/step -mx-2 flex items-center gap-4 rounded-(--radius-field) px-2 py-2.5 transition-colors duration-(--duration-base) hover:bg-[var(--brand-wash)]/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-tile) border border-border bg-white text-xs font-semibold text-[var(--brand-ink)] tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{item.title}</span>
                <span className="block text-sm text-muted-foreground">{item.detail}</span>
              </span>
              <ArrowRight className="size-4 text-muted-foreground transition-transform duration-(--duration-base) ease-out-quint group-hover/step:translate-x-0.5 group-hover/step:text-[var(--brand-ink)]" />
            </Link>
          </li>
        ))}
      </ol>

      <Link
        href={needsPlan ? "/checkout" : "/dashboard"}
        className={cn(buttonVariants({ size: "lg" }), inkButtonClassName, "mt-8 w-full")}
      >
        {needsPlan ? "Choose your plan" : "Go to dashboard"}
        <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/next:translate-x-0.5" data-icon="inline-end" />
      </Link>
    </OnboardingShell>
  );
}
