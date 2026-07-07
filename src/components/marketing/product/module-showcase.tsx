"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Reveal } from "../motion/reveal";
import { useMarketingScroll } from "../motion/scroll-context";
import { AppFrame, type AppNav } from "../appframe/app-frame";
import { AppPane } from "../appframe/app-pane";
import { FloatingToast } from "../appframe/atoms";
import { CrossfadePane } from "../appframe/crossfade-pane";
import { PaneSignalContext } from "../appframe/pane-context";
import {
  CalendarBody,
  DashboardBody,
  DocumentsBody,
  FinanceBody,
  InboxBody,
  RecordBody,
  StaffBody,
} from "../appframe/panes";

type ModuleDef = {
  key: string;
  n: string;
  title: string;
  copy: string;
  points: string[];
  nav: AppNav;
  /** Overrides the in-frame topbar title when it differs from the nav label. */
  frameTitle?: string;
  Body: ComponentType;
};

const MODULES: ModuleDef[] = [
  {
    key: "dashboard",
    n: "01",
    title: "Start the day with what needs attention.",
    copy: "Appointments, unread conversations, payment follow-up, and the operational signal that matters — before the clinic gets busy.",
    points: ["Today’s appointments", "Unread messages", "Payment follow-up"],
    nav: "dashboard",
    Body: DashboardBody,
  },
  {
    key: "calendar",
    n: "02",
    title: "Every appointment and blocked hour, easy to read.",
    copy: "Plan the day or week, protect preparation time, assign staff, and keep status changes visible without a spreadsheet.",
    points: ["Day / week / month", "Protected blocked time", "Staff assignment"],
    nav: "calendar",
    Body: CalendarBody,
  },
  {
    key: "patients",
    n: "03",
    title: "Open the full relationship from one record.",
    copy: "Profile, visit history, notes, documents, images, payments, and messages stay connected to the same patient.",
    points: ["Full visit history", "Documents & images", "Payments & notes"],
    nav: "clients",
    Body: RecordBody,
  },
  {
    key: "staff",
    n: "04",
    title: "Coordinate coverage before gaps become problems.",
    copy: "See who is available, where they are assigned, what is complete, and where the clinic may need more coverage.",
    points: ["Availability today", "Assignments", "Coverage gaps"],
    nav: "clients",
    frameTitle: "Staff",
    Body: StaffBody,
  },
  {
    key: "inbox",
    n: "05",
    title: "Keep clinic conversations attached to real context.",
    copy: "Manage unread messages and patient-linked threads without losing the appointment or record behind the conversation.",
    points: ["Patient-linked threads", "Unread filter", "Quick replies"],
    nav: "inbox",
    Body: InboxBody,
  },
  {
    key: "documents",
    n: "06",
    title: "Keep documents and payments beside the record.",
    copy: "Scans, consent forms, invoices, and payment status attach to the same patient — private storage with short-lived signed access.",
    points: ["Private document storage", "Signed access links", "Payment status"],
    nav: "clients",
    frameTitle: "Documents",
    Body: DocumentsBody,
  },
  {
    key: "reports",
    n: "07",
    title: "Understand performance without another spreadsheet.",
    copy: "Appointment trends, completion rate, revenue context, and AI-assisted operational recommendations — never medical claims.",
    points: ["Appointment trends", "Completion rate", "AI next step"],
    nav: "reports",
    Body: FinanceBody,
  },
];

// Per-module floating success card (Stripe's per-feature card pattern).
const MODULE_FLOAT: Record<string, { title: string; sub: string }> = {
  dashboard: { title: "Reminder sent", sub: "Maya · Thu 14:30" },
  calendar: { title: "Appointment booked", sub: "F. Rama · Thu 14:30" },
  patients: { title: "Payment received", sub: "Maya Novak · €110" },
  staff: { title: "Emily checked in", sub: "On shift · 08:30" },
  inbox: { title: "Message delivered", sub: "Maya Novak · 2m ago" },
  documents: { title: "Document secured", sub: "x-ray · signed access" },
  reports: { title: "Health score 92/100", sub: "Operational · Healthy" },
};

export function ModuleShowcase() {
  const { coarse } = useMarketingScroll();
  const reduce = useReducedMotion();
  const interactive = !reduce && !coarse;

  const sectionRef = useRef<HTMLDivElement>(null);
  const sectionInView = useInView(sectionRef, { amount: 0 });
  const [active, setActive] = useState(0);
  const onEnter = useCallback((i: number) => setActive(i), []);

  const Heading = (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="eyebrow text-primary">A guided tour</p>
      <h2 className="mt-3 display-2 text-balance text-[var(--brand-ink)]">Every surface a clinic uses, all day.</h2>
    </Reveal>
  );

  if (!interactive) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        {Heading}
        <div className="mt-16 flex flex-col gap-20">
          {MODULES.map((mod, i) => (
            <div key={mod.key} className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                <p className="text-xs font-bold text-primary">{mod.n}</p>
                <h3 className="mt-2 display-3 text-[var(--brand-ink)]">{mod.title}</h3>
                <p className="mt-4 max-w-xl text-base leading-8 text-muted-foreground">{mod.copy}</p>
              </div>
              <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                <AppPane chrome="app" nav={mod.nav} title={mod.frameTitle} stage glow className="w-full">
                  <mod.Body />
                </AppPane>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const ActiveBody = MODULES[active].Body;

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      {Heading}
      <div ref={sectionRef} className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* scrolling blurbs */}
        <div>
          {MODULES.map((mod, i) => (
            <Blurb key={mod.key} index={i} module={mod} active={i === active} onEnter={onEnter} />
          ))}
        </div>

        {/* sticky live pane */}
        <div className="relative hidden lg:block">
          <div className="sticky top-[18vh]">
            <AppFrame
              chrome="app"
              nav={MODULES[active].nav}
              title={MODULES[active].frameTitle}
              stage
              glow
              float={
                <FloatingToast className="-bottom-5 -left-4 sm:-left-10">
                  <span className="flex size-7 items-center justify-center rounded-(--radius-tile) bg-emerald-50 text-emerald-600">
                    <Check className="size-4" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-[var(--brand-ink)]">{MODULE_FLOAT[MODULES[active].key].title}</p>
                    <p className="text-[10px] font-semibold text-muted-foreground">{MODULE_FLOAT[MODULES[active].key].sub}</p>
                  </div>
                </FloatingToast>
              }
            >
              <PaneSignalContext.Provider value={{ active: true, visible: sectionInView }}>
                <CrossfadePane activeKey={MODULES[active].key}>
                  <ActiveBody />
                </CrossfadePane>
              </PaneSignalContext.Provider>
            </AppFrame>
          </div>
        </div>
      </div>
    </section>
  );
}

function Blurb({
  index,
  module: mod,
  active,
  onEnter,
}: {
  index: number;
  module: ModuleDef;
  active: boolean;
  onEnter: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const centered = useInView(ref, { margin: "-45% 0px -45% 0px" });
  useEffect(() => {
    if (centered) onEnter(index);
  }, [centered, index, onEnter]);

  return (
    <div ref={ref} className="flex min-h-[46vh] flex-col justify-center py-6">
      <p className={cn("text-xs font-bold transition-colors duration-300", active ? "text-primary" : "text-muted-foreground/70")}>
        {mod.n} / {String(MODULES.length).padStart(2, "0")}
      </p>
      <h3
        className={cn(
          "mt-3 display-3 transition-colors duration-300",
          active ? "text-[var(--brand-ink)]" : "text-[var(--brand-ink)]/55",
        )}
      >
        {mod.title}
      </h3>
      <p
        className={cn(
          "mt-5 max-w-md text-base leading-8 transition-colors duration-300",
          active ? "text-muted-foreground" : "text-muted-foreground/65",
        )}
      >
        {mod.copy}
      </p>
      <ul className="mt-5 flex flex-wrap gap-2">
        {mod.points.map((point) => (
          <li
            key={point}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-300",
              active
                ? "border-primary/15 bg-primary/[0.06] text-[var(--brand-ink)]"
                : "border-black/[0.06] bg-white/60 text-muted-foreground/60",
            )}
          >
            <Check className={cn("size-3.5", active ? "text-primary" : "text-muted-foreground/50")} />
            {point}
          </li>
        ))}
      </ul>
      <Link
        href="/sign-up"
        className={cn(
          "mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-primary transition-opacity duration-300 hover:gap-2.5",
          active ? "opacity-100" : "opacity-40",
        )}
      >
        Try it free
        <ArrowRight className="size-4" />
      </Link>
      {/* Below lg the sticky pane column is hidden, so render this module's pane
          inline — pure CSS (lg:hidden), so it's present on first paint and with
          no JS, never a text-only tour. */}
      <div className="mt-8 lg:hidden">
        <AppPane chrome="app" nav={mod.nav} title={mod.frameTitle} stage glow className="w-full">
          <mod.Body />
        </AppPane>
      </div>
    </div>
  );
}
