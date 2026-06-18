import Link from "next/link";
import { ArrowRight, BarChart3, CalendarDays, ChevronRight, UserRound, UsersRound } from "lucide-react";
import type { ElementType } from "react";

import { MarketingShell } from "../shell/marketing-shell";
import { InnerHero, Highlight } from "../shared/inner-hero";
import { CtaBand } from "../shared/cta-band";
import { AppMockup, type AppMockupKind } from "../mockups/app-mockups";
import { AiInsightBand } from "../home/ai-insight-band";
import { Reveal, RevealGroup, RevealItem } from "../motion/reveal";

const pillars: { icon: ElementType<{ className?: string }>; title: string; copy: string }[] = [
  { icon: CalendarDays, title: "Manage appointments", copy: "Clear bookings, status, staff ownership, and protected blocked time." },
  { icon: UserRound, title: "Organize patient records", copy: "Visits, notes, images, documents, messages, and payments on one profile." },
  { icon: UsersRound, title: "Coordinate staff", copy: "See who's available, what's assigned, and where coverage is thin." },
  { icon: BarChart3, title: "Understand performance", copy: "Turn daily activity into reports, trends, and a recommended next action." },
];

const modules: { title: string; heading: string; copy: string; visual: AppMockupKind }[] = [
  {
    title: "Dashboard",
    heading: "Start each day with the work that needs attention.",
    copy: "See appointments, unread conversations, payment follow-up, recent patients, and the operational signal that matters before the clinic gets busy.",
    visual: "dashboard",
  },
  {
    title: "Calendar",
    heading: "Keep every appointment and blocked hour easy to read.",
    copy: "Plan the day or week, protect preparation time, assign staff, and keep status changes visible without turning the schedule into a spreadsheet.",
    visual: "calendar",
  },
  {
    title: "Patients & clients",
    heading: "Open the full relationship from one record.",
    copy: "Profile details, visit history, notes, documents, images, payments, and messages stay connected to the same patient or client.",
    visual: "patients",
  },
  {
    title: "Staff",
    heading: "Coordinate coverage before gaps become problems.",
    copy: "Understand who is available, where they are assigned, what is complete, and where the clinic may need more coverage.",
    visual: "staff",
  },
  {
    title: "Inbox & WhatsApp",
    heading: "Keep clinic conversations attached to real context.",
    copy: "Manage unread messages, unknown contacts, and patient-linked threads without losing the appointment or record behind the conversation.",
    visual: "inbox",
  },
  {
    title: "Documents & payments",
    heading: "Keep files and payment status beside the patient journey.",
    copy: "Attach scans, images, invoices, and payment records to the same operational context your team uses every day.",
    visual: "documents",
  },
  {
    title: "Reports & insights",
    heading: "Understand performance without building another spreadsheet.",
    copy: "Review appointment trends, completion rate, revenue context, and AI-assisted operational recommendations that stay away from medical claims.",
    visual: "reports",
  },
];

const workflow = [
  "Create the patient profile",
  "Book the appointment and staff member",
  "Record service, payment, notes, and files",
  "Follow up with full context",
  "Review what needs attention",
];

export function ProductPage() {
  return (
    <MarketingShell overlay>
      <InnerHero
        eyebrow="The product"
        title={
          <>
            Every part of the clinic day, in <Highlight>one workspace</Highlight>.
          </>
        }
        copy="Vela connects the schedule, patient record, staff activity, messages, documents, payments, and reports into one calm operating system."
        primaryHref="/sign-up"
        primaryLabel="Start free"
        secondaryHref="/pricing"
        secondaryLabel="View pricing"
      >
        <Reveal className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(100,182,255,0.25),transparent_60%)] blur-2xl"
          />
          <AppMockup kind="dashboard" />
        </Reveal>
      </InnerHero>

      {/* pillars */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <RevealGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {pillars.map(({ icon: Icon, title, copy }) => (
            <RevealItem
              key={title}
              className="group rounded-(--radius-panel) border border-border/80 bg-white p-6 shadow-[0_18px_54px_rgba(20,21,47,0.05)] transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_28px_70px_rgba(10,34,255,0.12)]"
            >
              <span className="vela-icon-tile transition-transform duration-300 group-hover:scale-105">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 text-base font-bold text-[var(--brand-ink)]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* module tour */}
      <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow text-primary">A guided tour</p>
          <h2 className="mt-3 display-2 text-[var(--brand-ink)]">Every surface a clinic uses, all day.</h2>
        </Reveal>
        <div className="mt-16 flex flex-col gap-20 sm:gap-28">
          {modules.map((module, index) => (
            <ModuleSection key={module.title} module={module} index={index} alt={index % 2 === 1} />
          ))}
        </div>
      </section>

      <AiInsightBand />

      {/* workflow */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <Reveal>
            <h2 className="display-2 text-[var(--brand-ink)]">From booking to follow-up in one flow.</h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground">
              Every step updates the same workspace, so records stay complete and the team always knows what to do next.
            </p>
          </Reveal>
          <RevealGroup className="grid gap-3">
            {workflow.map((step, index) => (
              <RevealItem
                key={step}
                className="group flex items-center gap-4 rounded-(--radius-field) border border-border/80 bg-white p-4 shadow-[0_16px_48px_rgba(20,21,47,0.045)] transition-[transform,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-primary/35"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[0.65rem] bg-primary/10 text-sm font-bold text-primary">
                  {index + 1}
                </span>
                <p className="text-sm font-semibold text-foreground">{step}</p>
                <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary" />
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      <CtaBand />
    </MarketingShell>
  );
}

function ModuleSection({
  module,
  index,
  alt,
}: {
  module: { title: string; heading: string; copy: string; visual: AppMockupKind };
  index: number;
  alt: boolean;
}) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
      <Reveal y={28} className={alt ? "lg:order-2" : ""}>
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-bold text-primary">
          <span className="flex size-4 items-center justify-center rounded-full bg-primary/15 text-[9px]">{index + 1}</span>
          {module.title}
        </div>
        <h3 className="mt-4 display-3 text-[var(--brand-ink)]">{module.heading}</h3>
        <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground">{module.copy}</p>
        <Link
          href="/sign-up"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-primary transition hover:gap-2.5"
        >
          Try it free
          <ArrowRight className="size-4" />
        </Link>
      </Reveal>
      <Reveal y={28} delay={0.08} className={alt ? "lg:order-1" : ""}>
        <AppMockup kind={module.visual} />
      </Reveal>
    </div>
  );
}
