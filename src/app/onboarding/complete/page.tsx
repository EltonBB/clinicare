import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { ArrowRight, CalendarPlus, Check, MessageCircle, UserPlus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { getCurrentBusiness } from "@/lib/business";
import { resolveBrandAccentPreset } from "@/lib/branding";
import { isOnboardingCompleted } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { cn, getInitials } from "@/lib/utils";
import { createClient } from "@/utils/supabase/server";

const nextActions = [
  {
    href: "/calendar/new",
    icon: CalendarPlus,
    title: "Book your first appointment",
    detail: "Drop it straight onto your calendar",
    hint: "Start here",
  },
  {
    href: "/clients/new",
    icon: UserPlus,
    title: "Add a patient",
    detail: "Build your patient list as you go",
    hint: "2 min",
  },
  {
    href: "/settings",
    icon: MessageCircle,
    title: "Connect WhatsApp",
    detail: "Send reminders from your number",
    hint: "Later",
  },
];

function hoursBetween(start: string, end: string) {
  const [startHour] = start.split(":").map(Number);
  const [endHour] = end.split(":").map(Number);
  return Math.max((endHour || 0) - (startHour || 0), 0);
}

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

  const [hours, teamCount] = await Promise.all([
    prisma.businessHours.findMany({
      where: { businessId: business.id },
      select: { isOpen: true, startTime: true, endTime: true },
    }),
    prisma.staffMember.count({ where: { businessId: business.id } }),
  ]);

  const openDays = hours.filter((day) => day.isOpen).length;
  const weeklyHours = hours.reduce(
    (total, day) => (day.isOpen ? total + hoursBetween(day.startTime, day.endTime) : total),
    0
  );
  const ownerFirstName =
    (typeof metadata.full_name === "string" ? metadata.full_name : "").trim().split(/\s+/)[0] || "you";

  const accent = resolveBrandAccentPreset(business.brandAccentColor);

  const stats = [
    { value: `${weeklyHours}h`, label: "Open per week" },
    { value: `${openDays}`, label: "Days a week" },
    { value: `${teamCount}`, label: teamCount === 1 ? "Team member" : "Team members" },
  ];

  return (
    <div
      className="app-shell-bg min-h-screen"
      style={
        {
          "--primary": accent.value,
          "--primary-hover": accent.hover,
          "--primary-soft": accent.soft,
          "--primary-shadow": accent.shadow,
          "--ring": accent.shadow,
          "--accent": accent.soft,
          "--accent-foreground": accent.value,
        } as CSSProperties
      }
    >
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-5 py-12 text-center">
        <span className="section-reveal flex size-14 items-center justify-center rounded-(--radius-panel) border border-border bg-white text-lg font-semibold text-primary">
          {getInitials(business.name)}
        </span>
        <span className="section-reveal mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          <Check className="size-4" />
          Setup complete
        </span>

        <h1 className="section-reveal mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2.5rem]">
          {business.name} is ready, {ownerFirstName}.
        </h1>
        <p className="section-reveal mt-3 max-w-md text-[15px] leading-7 text-muted-foreground">
          Your branded workspace is live. Here are the best next steps to start your first calm clinic
          day.
        </p>

        <div className="section-reveal-delayed mt-8 grid w-full grid-cols-3 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="surface-card p-4 text-left">
              <p className="text-2xl font-semibold tracking-tight text-foreground">{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="section-reveal-delayed mt-4 w-full overflow-hidden rounded-(--radius-panel) border border-border bg-white text-left shadow-[var(--shadow-card)]">
          <p className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            Next best actions
          </p>
          <div className="divide-y divide-border">
            {nextActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted/50"
              >
                <span className="flex size-9 items-center justify-center rounded-(--radius-tile) border border-border bg-white text-primary">
                  <action.icon className="size-4" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-foreground">{action.title}</span>
                  <span className="block text-sm text-muted-foreground">{action.detail}</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  {action.hint}
                  <ArrowRight className="size-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>

        <Link
          href="/dashboard"
          className={cn(
            buttonVariants({ size: "lg" }),
            "section-reveal-delayed mt-6 h-12 rounded-(--radius-field) px-6"
          )}
        >
          Go to dashboard
          <ArrowRight data-icon="inline-end" />
        </Link>
      </div>
    </div>
  );
}
