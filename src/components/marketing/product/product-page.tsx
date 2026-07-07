import { BarChart3, CalendarDays, ChevronRight, UserRound, UsersRound } from "lucide-react";
import type { ComponentType } from "react";

import { MarketingShell } from "../shell/marketing-shell";
import { InnerHero, Highlight } from "../shared/inner-hero";
import { CtaBand } from "../shared/cta-band";
import { AiInsightBand } from "../home/ai-insight-band";
import { Reveal, RevealGroup, RevealItem } from "../motion/reveal";
import { AppPane } from "../appframe/app-pane";
import { FloatingToast } from "../appframe/atoms";
import { DashboardBody } from "../appframe/panes";
import { ModuleShowcase } from "./module-showcase";

const pillars: { icon: ComponentType<{ className?: string }>; title: string; copy: string; stat: string }[] = [
  { icon: CalendarDays, title: "Manage appointments", copy: "Clear bookings, status, staff ownership, and protected blocked time.", stat: "8 today" },
  { icon: UserRound, title: "Organize patient records", copy: "Visits, notes, images, documents, messages, and payments on one profile.", stat: "12 visits" },
  { icon: UsersRound, title: "Coordinate staff", copy: "See who's available, what's assigned, and where coverage is thin.", stat: "4 on shift" },
  { icon: BarChart3, title: "Understand performance", copy: "Turn daily activity into reports, trends, and a recommended next action.", stat: "85% complete" },
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
          <AppPane
            chrome="app"
            tilt
            stage
            glow
            nav="dashboard"
            className="w-full"
            bodyClassName="min-h-[19rem]"
            float={
              <FloatingToast className="-bottom-4 left-1 sm:-bottom-6 sm:left-4">
                <span className="vela-gradient flex size-7 items-center justify-center rounded-(--radius-tile) text-white">
                  <CalendarDays className="size-4" />
                </span>
                <div>
                  <p className="text-xs font-bold text-[var(--brand-ink)]">New appointment</p>
                  <p className="text-[10px] font-semibold text-muted-foreground">14:30 · Dr. Carter</p>
                </div>
              </FloatingToast>
            }
          >
            <DashboardBody />
          </AppPane>
        </Reveal>
      </InnerHero>

      {/* pillars */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <RevealGroup className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {pillars.map(({ icon: Icon, title, copy, stat }) => (
            <RevealItem
              key={title}
              className="group flex flex-col rounded-(--radius-panel) border border-black/[0.06] bg-white p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_1px_rgba(10,34,255,0.04),0_22px_56px_-26px_rgba(10,34,255,0.2)] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_1px_rgba(10,34,255,0.04),0_34px_78px_-30px_rgba(10,34,255,0.3)]"
            >
              <div className="flex items-center justify-between">
                <span className="vela-icon-tile transition-transform duration-300 group-hover:scale-105">
                  <Icon className="size-5" />
                </span>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">{stat}</span>
              </div>
              <h3 className="mt-5 text-xl font-bold tracking-[-0.012em] text-[var(--brand-ink)] sm:text-2xl">{title}</h3>
              <p className="mt-2.5 text-[15px] leading-6 text-muted-foreground">{copy}</p>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* module tour — sticky live showcase on a rendered light mesh so the pane sits in a composed scene.
          NB: no `overflow-hidden` here — an overflow-clip ancestor breaks the pane's `position: sticky`.
          The mesh is `absolute inset-0`, already bounded to this box, so no clip is needed. */}
      <div className="relative bg-[var(--brand-wash)]/40">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[url(/marketing/mesh-light.webp)] bg-cover bg-center opacity-70"
        />
        <div className="relative">
          <ModuleShowcase />
        </div>
      </div>

      <AiInsightBand />

      {/* workflow */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <Reveal>
            <h2 className="display-2 text-balance text-[var(--brand-ink)]">From booking to follow-up in one flow.</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
              Every step updates the same workspace, so records stay complete and the team always knows what to do next.
            </p>
          </Reveal>
          <RevealGroup className="relative grid gap-3">
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-7 left-8 top-7 w-px bg-gradient-to-b from-primary/35 via-primary/15 to-transparent"
            />
            {workflow.map((step, index) => (
              <RevealItem
                key={step}
                className="group relative flex items-center gap-4 rounded-(--radius-field) border border-black/[0.06] bg-white p-4 shadow-[0_1px_1px_rgba(10,34,255,0.04),0_16px_44px_-26px_rgba(10,34,255,0.2)] transition-[transform,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-primary/30"
              >
                <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-[0.65rem] bg-primary/10 text-sm font-bold text-primary ring-4 ring-white">
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
