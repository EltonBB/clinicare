import Image from "next/image";
import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  CreditCard,
  FileImage,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
  UserRound,
  UsersRound,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { publicPlans } from "@/lib/public-plans";

const navItems = [
  { label: "Product", href: "/product" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

const footerLinks = [
  ...navItems,
  { label: "Terms", href: "/terms-and-conditions" },
  { label: "Privacy", href: "/privacy" },
  { label: "Refund", href: "/refund" },
];

const marketingImages = {
  calendar: "/marketing/vela-calendar-clarity.png",
  clients: "/marketing/vela-clients-confidence.png",
  reports: "/marketing/vela-reports-action.png",
};

const clinicTypes = [
  "Dental clinics",
  "Aesthetic clinics",
  "Dermatology clinics",
  "Physiotherapy clinics",
  "Wellness clinics",
  "Private practices",
];

const productPillars = [
  {
    icon: CalendarDays,
    title: "Manage appointments",
    copy: "Keep the day visible with clear bookings, status, staff ownership, and blocked time.",
  },
  {
    icon: UserRound,
    title: "Organize patient records",
    copy: "Attach visits, notes, images, documents, messages, and payments to one patient profile.",
  },
  {
    icon: UsersRound,
    title: "Coordinate staff",
    copy: "See who is available, what is assigned, and where the clinic needs more coverage.",
  },
  {
    icon: BarChart3,
    title: "Understand performance",
    copy: "Turn daily activity into operational reports, trends, and recommended next actions.",
  },
];

const workflowSteps = [
  "Scattered calendars and notes",
  "Unclear staff availability",
  "Lost WhatsApp follow-ups",
  "Disconnected documents and payments",
  "Reports that take too long to read",
];

const comparisonRows = [
  ["Appointments and calendar", "Included", "Included"],
  ["Patient record timeline", "Included", "Included"],
  ["Documents, scans, and images", "Included", "Included"],
  ["WhatsApp-ready inbox", "Included", "Included"],
  ["Operational reports", "Basic", "Advanced"],
  ["AI-assisted insights", "Limited", "Full"],
  ["Setup support", "Standard", "Priority"],
];

const productFeatures = [
  {
    title: "Know what needs attention today.",
    copy: "Open Vela and see the clinic day: today's appointments, unread messages, recent clients, staff activity, and the operational insight that needs attention.",
    visual: "dashboard",
  },
  {
    title: "A clearer schedule for every clinic day.",
    copy: "Plan by day or week, protect blocked time, assign staff, and keep appointment statuses visible without leaving the calendar.",
    visual: "calendar",
  },
  {
    title: "Every patient record in one place.",
    copy: "Keep profile details, appointment history, notes, documents, images, payments, and messages connected to the same patient record.",
    visual: "patients",
  },
  {
    title: "Keep clinic conversations organized.",
    copy: "Manage WhatsApp-style conversations, unread messages, unknown contacts, and patient-linked replies without losing context.",
    visual: "inbox",
  },
  {
    title: "Understand performance without spreadsheets.",
    copy: "Review trends, completion rate, revenue and payment context, AI-assisted operational insights, and recommended next actions.",
    visual: "reports",
  },
] satisfies Array<{
  title: string;
  copy: string;
  visual: "dashboard" | "calendar" | "patients" | "inbox" | "reports";
}>;

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <main className="app-shell-bg min-h-screen w-screen max-w-[100vw] overflow-x-hidden text-foreground">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </main>
  );
}

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-white/86 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <BrandMark href="/" includeSubtitle={false} />
        <nav className="hidden items-center gap-9 text-sm font-semibold text-muted-foreground lg:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-primary">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden h-10 items-center rounded-[0.75rem] border border-border/80 bg-white px-4 text-sm font-semibold text-foreground shadow-[0_10px_24px_rgba(20,21,47,0.04)] transition hover:border-primary/40 hover:text-primary sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/sign-up"
            className="vela-gradient inline-flex h-10 items-center rounded-[0.75rem] px-4 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(150,118,247,0.26)] transition hover:-translate-y-0.5"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}

export function HomePage() {
  return (
    <MarketingShell>
      <HeroSection />
      <ClinicTypesSection />
      <ProblemSection />
      <SolutionSection />
      <ProductDeepDive />
      <AiInsightsSection />
      <TrustSection />
      <PricingPreviewSection />
      <FinalCtaSection />
    </MarketingShell>
  );
}

export function ProductPage() {
  return (
    <MarketingShell>
      <PageHero
        title="A calmer operating system for clinic work"
        copy="Vela connects the daily schedule, patient record, staff activity, messages, documents, payments, and reports in one product."
        primaryHref="/sign-up"
        primaryLabel="Start free"
        secondaryHref="/pricing"
        secondaryLabel="View pricing"
      />
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-2 xl:grid-cols-4">
          {productPillars.map((pillar) => (
            <PillarCard key={pillar.title} {...pillar} />
          ))}
        </div>
      </section>
      <ProductShowcase />
      <WorkflowSection compact />
      <CtaBand />
    </MarketingShell>
  );
}

export function PricingPageContent() {
  return (
    <MarketingShell>
      <PageHero
        title="Simple pricing for real clinic operations"
        copy="Start with the operating system. Upgrade when you need deeper reporting, staff visibility, automation, and setup support."
        primaryHref="/sign-up"
        primaryLabel="Start free"
        secondaryHref="/contact"
        secondaryLabel="Talk to us"
      />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
          {publicPlans.map((plan) => (
            <PlanCard
              key={plan.key}
              name={plan.name}
              price={plan.price}
              description={plan.description}
              features={plan.features}
              checkoutHref={`/checkout?plan=${plan.key}`}
              highlighted={plan.highlighted}
            />
          ))}
        </div>
        <PricingTable />
      </section>
      <CtaBand />
    </MarketingShell>
  );
}

export function AboutPage() {
  return (
    <MarketingShell>
      <PageHero
        title="Calm operational intelligence for clinics"
        copy="Vela is built around one belief: clinics should understand the day, care for patients, and improve performance without wrestling with disconnected tools."
        primaryHref="/sign-up"
        primaryLabel="Start free"
        secondaryHref="/contact"
        secondaryLabel="Contact us"
      />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="surface-card p-6 sm:p-8">
            <h2 className="text-3xl font-semibold text-[var(--brand-ink)] sm:text-5xl">
              A workspace that gives the clinic its focus back.
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              The product hides provider complexity and keeps the customer experience simple: configure the clinic, book care, manage relationships, follow up, and understand performance.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <MetricPill value="1" label="workspace" />
              <MetricPill value="6" label="core modules" />
              <MetricPill value="3" label="report windows" />
            </div>
          </div>
          <ImageCard src={marketingImages.reports} alt="Vela reporting product scene" />
        </div>
      </section>
      <LegalPanel />
      <CtaBand />
    </MarketingShell>
  );
}

export function ContactPage() {
  return (
    <MarketingShell>
      <section className="px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="rounded-[1.5rem] bg-[var(--brand-ink)] p-6 text-white shadow-[0_28px_90px_rgba(20,21,47,0.20)] sm:p-8">
            <h1 className="max-w-md text-4xl font-semibold leading-[0.98] sm:text-6xl">
              See how Vela fits your clinic.
            </h1>
            <p className="mt-5 max-w-md text-base leading-8 text-white/72">
              Ask about setup, workflows, WhatsApp readiness, reporting, pricing, or moving your current process into Vela.
            </p>
            <div className="mt-8 grid gap-4">
              <ContactMethod icon={CalendarDays} title="Book a demo" copy="Walk through scheduling, records, inbox, and reports." />
              <ContactMethod icon={MessageCircle} title="Setup questions" copy="Ask about moving clinic workflows into Vela." />
              <ContactMethod icon={ShieldCheck} title="Privacy-conscious workflows" copy="Discuss records, documents, workspace access, and reporting expectations." />
              <ContactMethod icon={Sparkles} title="Early access" copy="Share what your clinic needs before online checkout is fully available." />
            </div>
          </div>
          <div className="surface-card p-5 sm:p-8">
            <form className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Full name" placeholder="Your name" />
                <FormField label="Email" placeholder="you@example.com" type="email" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Clinic / business name" placeholder="Your clinic name" />
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  How can we help?
                  <select className="h-12 rounded-[0.75rem] border border-border/80 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10">
                    <option>I want to book a demo</option>
                    <option>I have a pricing question</option>
                    <option>I need help with setup</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Message
                <textarea
                  rows={7}
                  placeholder="Tell us about your clinic and what you need..."
                  className="resize-none rounded-[0.75rem] border border-border/80 bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </label>
              <button
                type="button"
                className="vela-gradient inline-flex h-12 items-center justify-center rounded-[0.85rem] px-5 text-sm font-bold text-white shadow-[0_18px_36px_rgba(150,118,247,0.24)] transition hover:-translate-y-0.5"
              >
                Send message
              </button>
            </form>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(150,118,247,0.16),transparent_34%),radial-gradient(circle_at_82%_16%,rgba(109,195,213,0.16),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f8faff_54%,#ffffff_100%)]" />
      <div className="landing-gradient-glow absolute left-1/2 top-20 h-48 w-[36rem] -translate-x-1/2 rounded-full opacity-70 blur-3xl" />
      <div className="relative mx-auto max-w-7xl">
        <div className="mx-auto max-w-5xl text-center section-reveal">
          <h1 className="mx-auto max-w-5xl text-[3rem] font-semibold leading-[0.94] text-[var(--brand-ink)] sm:text-7xl lg:text-[5.85rem]">
            Run your clinic from one calm, intelligent workspace.
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
            Vela brings appointments, patients, staff, WhatsApp messages, payments, documents, and reports into one clean system built for modern clinics.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/sign-up"
              className="vela-gradient inline-flex h-12 items-center justify-center gap-2 rounded-[0.85rem] px-6 text-sm font-bold text-white shadow-[0_18px_44px_rgba(150,118,247,0.28)] transition hover:-translate-y-0.5"
            >
              Start free
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/product"
              className="inline-flex h-12 items-center justify-center rounded-[0.85rem] border border-border/80 bg-white px-6 text-sm font-bold text-foreground shadow-[0_14px_36px_rgba(20,21,47,0.05)] transition hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary"
            >
              View product
            </Link>
          </div>
        </div>
        <div className="landing-command-stage mx-auto mt-12 max-w-6xl section-reveal-delayed">
          <CommandCenterMockup />
        </div>
      </div>
    </section>
  );
}

function CommandCenterMockup() {
  return (
    <div className="landing-card-pop relative overflow-hidden rounded-[1.65rem] border border-white/80 bg-white/92 p-3 shadow-[0_34px_110px_rgba(54,65,112,0.18)] backdrop-blur-xl sm:p-4 lg:p-5">
      <div className="grid gap-3 rounded-[1.25rem] border border-border/70 bg-[#fbfdff] p-3 sm:grid-cols-[1.08fr_0.92fr] sm:p-4 lg:grid-cols-[1.18fr_0.82fr]">
        <div className="min-w-0 rounded-[1rem] border border-border/70 bg-white p-4 shadow-[0_18px_48px_rgba(20,21,47,0.055)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Today</p>
              <h3 className="mt-1 text-xl font-semibold text-[var(--brand-ink)]">Clinic dashboard</h3>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">7 appointments</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <MiniMetric label="Completion" value="84%" icon={CheckCircle2} />
            <MiniMetric label="Unread" value="12" icon={MessageCircle} />
            <MiniMetric label="Collected" value="$2.4k" icon={CreditCard} />
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_0.82fr]">
            <AppointmentsPanel />
            <InsightMiniPanel />
          </div>
        </div>
        <div className="grid min-w-0 gap-3">
          <PatientProfilePanel />
          <StaffSchedulePanel />
          <InboxPreviewPanel />
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value, icon: Icon }: { label: string; value: string; icon: ElementType }) {
  return (
    <div className="rounded-[0.9rem] border border-border/70 bg-[var(--brand-wash)]/45 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">{value}</p>
    </div>
  );
}

function AppointmentsPanel() {
  const appointments = [
    ["09:30", "Maya N.", "Dental cleaning", "Checked in"],
    ["11:00", "Daniel K.", "Skin consultation", "Confirmed"],
    ["14:30", "Anna R.", "Physiotherapy", "Payment due"],
  ];

  return (
    <div className="rounded-[0.95rem] border border-border/70 bg-white p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-[var(--brand-ink)]">Today&apos;s appointments</h4>
        <CalendarDays className="size-4 text-primary" />
      </div>
      <div className="mt-4 grid gap-3">
        {appointments.map(([time, name, service, status]) => (
          <div key={`${time}-${name}`} className="grid grid-cols-[3.5rem_1fr] gap-3 rounded-[0.75rem] bg-[var(--brand-wash)]/45 p-3">
            <span className="text-sm font-bold text-primary">{time}</span>
            <span>
              <span className="block text-sm font-bold text-[var(--brand-ink)]">{name}</span>
              <span className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
                <span>{service}</span>
                <span>/</span>
                <span>{status}</span>
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightMiniPanel() {
  return (
    <div className="rounded-[0.95rem] border border-primary/20 bg-gradient-to-br from-primary/10 to-[#6dc3d5]/10 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-primary">
        <Sparkles className="size-4" />
        Operational insight
      </div>
      <p className="mt-4 text-sm font-semibold leading-6 text-[var(--brand-ink)]">
        Afternoon bookings are filling fastest this week. Add one more staff block on Thursday to protect wait times.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-muted-foreground">
        <span className="rounded-full bg-white/80 px-3 py-1">Demand +18%</span>
        <span className="rounded-full bg-white/80 px-3 py-1">Confidence 82%</span>
      </div>
    </div>
  );
}

function PatientProfilePanel() {
  return (
    <div className="landing-card-delay rounded-[1rem] border border-border/70 bg-white p-4 shadow-[0_18px_52px_rgba(20,21,47,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex size-11 items-center justify-center rounded-[0.9rem] bg-primary/10 text-sm font-bold text-primary">MN</span>
          <div>
            <h4 className="text-sm font-bold text-[var(--brand-ink)]">Maya Novak</h4>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">Last visit 14 days ago</p>
          </div>
        </div>
        <span className="rounded-full bg-[#6dc3d5]/12 px-3 py-1 text-xs font-bold text-[#297f91]">Profile linked</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold text-muted-foreground">
        <span className="rounded-[0.75rem] bg-[var(--brand-wash)] p-2">6 visits</span>
        <span className="rounded-[0.75rem] bg-[var(--brand-wash)] p-2">4 files</span>
        <span className="rounded-[0.75rem] bg-[var(--brand-wash)] p-2">$420 paid</span>
      </div>
    </div>
  );
}

function StaffSchedulePanel() {
  return (
    <div className="landing-card-delay-2 rounded-[1rem] border border-border/70 bg-white p-4 shadow-[0_18px_52px_rgba(20,21,47,0.06)]">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-[var(--brand-ink)]">Staff schedule</h4>
        <Clock3 className="size-4 text-primary" />
      </div>
      <div className="mt-4 grid gap-2">
        {["Dr. Kim / Room 2 / 09:00-15:00", "Nora Bell / Front desk / 10:00-18:00"].map((row) => (
          <div key={row} className="rounded-[0.75rem] border border-border/60 bg-[var(--brand-wash)]/45 px-3 py-2 text-xs font-semibold text-muted-foreground">
            {row}
          </div>
        ))}
      </div>
    </div>
  );
}

function InboxPreviewPanel() {
  return (
    <div className="rounded-[1rem] border border-border/70 bg-white p-4 shadow-[0_18px_52px_rgba(20,21,47,0.06)]">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-[var(--brand-ink)]">WhatsApp inbox</h4>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">12 unread</span>
      </div>
      <p className="mt-3 rounded-[0.75rem] bg-[#effafc] p-3 text-xs font-semibold leading-5 text-muted-foreground">
        Unknown number matched to Maya Novak after appointment confirmation.
      </p>
    </div>
  );
}

function ClinicTypesSection() {
  return (
    <section className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[1.25rem] border border-border/80 bg-white/88 p-5 shadow-[0_24px_70px_rgba(20,21,47,0.055)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="max-w-xl text-2xl font-semibold leading-tight text-[var(--brand-ink)] sm:text-3xl">
            Built for clinics that need structure without complexity.
          </h2>
          <div className="flex flex-wrap gap-2">
            {clinicTypes.map((type) => (
              <span key={type} className="rounded-full border border-border/80 bg-[var(--brand-wash)]/60 px-4 py-2 text-sm font-bold text-foreground">
                {type}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">The daily friction</p>
          <h2 className="mt-4 text-4xl font-semibold leading-[0.98] text-[var(--brand-ink)] sm:text-6xl">
            Clinic work breaks down when every task lives somewhere else.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground">
            Appointments, staff, patient context, messages, documents, payments, and reports should not require six disconnected tools.
          </p>
        </div>
        <div className="rounded-[1.35rem] border border-border/80 bg-white p-4 shadow-[0_24px_80px_rgba(20,21,47,0.07)]">
          <div className="grid gap-3 md:grid-cols-2">
            {workflowSteps.map((step, index) => (
              <div key={step} className="rounded-[0.95rem] border border-border/70 bg-[var(--brand-wash)]/45 p-4">
                <span className="flex size-8 items-center justify-center rounded-[0.7rem] bg-white text-sm font-bold text-primary shadow-[0_10px_24px_rgba(20,21,47,0.05)]">
                  {index + 1}
                </span>
                <p className="mt-4 text-sm font-bold text-[var(--brand-ink)]">{step}</p>
              </div>
            ))}
            <div className="rounded-[0.95rem] border border-primary/30 bg-gradient-to-br from-primary/12 to-[#6dc3d5]/12 p-4 md:col-span-2">
              <p className="text-sm font-bold text-primary">Vela organizes the same work into one operating view.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SolutionSection() {
  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <h2 className="text-4xl font-semibold leading-[0.98] text-[var(--brand-ink)] sm:text-6xl">
            Vela gives every clinic a single workspace for daily operations.
          </h2>
          <p className="mt-5 text-base leading-8 text-muted-foreground">
            The product is organized around the way a clinic actually runs: schedule the day, serve patients, coordinate staff, follow up, and read performance clearly.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {productPillars.map((pillar) => (
            <PillarCard key={pillar.title} {...pillar} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductDeepDive() {
  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8">
        {productFeatures.map((feature, index) => (
          <div
            key={feature.title}
            className="grid gap-8 rounded-[1.45rem] border border-border/80 bg-white p-5 shadow-[0_24px_84px_rgba(20,21,47,0.06)] lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:p-7"
          >
            <div className={index % 2 === 1 ? "lg:order-2" : ""}>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Product</p>
              <h2 className="mt-4 text-4xl font-semibold leading-[0.98] text-[var(--brand-ink)] sm:text-5xl">
                {feature.title}
              </h2>
              <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground">{feature.copy}</p>
            </div>
            <div className={index % 2 === 1 ? "lg:order-1" : ""}>
              <FeatureMockup visual={feature.visual} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatureMockup({ visual }: { visual: "dashboard" | "calendar" | "patients" | "inbox" | "reports" }) {
  if (visual === "calendar") return <CalendarMockup />;
  if (visual === "patients") return <PatientsMockup />;
  if (visual === "inbox") return <InboxMockup />;
  if (visual === "reports") return <ReportsMockup />;
  return <DashboardMockup />;
}

function DashboardMockup() {
  return (
    <div className="mockup-frame">
      <div className="grid gap-3 md:grid-cols-3">
        <MiniMetric label="Appointments" value="7" icon={CalendarDays} />
        <MiniMetric label="Unread" value="12" icon={MessageCircle} />
        <MiniMetric label="Staff active" value="5" icon={UsersRound} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
        <AppointmentsPanel />
        <InsightMiniPanel />
      </div>
    </div>
  );
}

function CalendarMockup() {
  const rows = [
    ["09:00", "Blocked prep", "Room 1"],
    ["10:30", "Consultation", "Dr. Kim"],
    ["13:00", "Follow-up", "Nora Bell"],
    ["15:30", "New booking", "Open slot"],
  ];

  return (
    <div className="mockup-frame">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--brand-ink)]">Thursday schedule</h3>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Create appointment</span>
      </div>
      <div className="mt-4 grid gap-2">
        {rows.map(([time, event, staff]) => (
          <div key={`${time}-${event}`} className="grid grid-cols-[4rem_1fr_auto] gap-3 rounded-[0.85rem] border border-border/70 bg-white p-3 text-sm">
            <span className="font-bold text-primary">{time}</span>
            <span className="font-bold text-[var(--brand-ink)]">{event}</span>
            <span className="text-xs font-semibold text-muted-foreground">{staff}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PatientsMockup() {
  return (
    <div className="mockup-frame">
      <PatientProfilePanel />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {["Appointment history", "Medical notes", "Documents and images", "Payments and messages"].map((item) => (
          <div key={item} className="rounded-[0.85rem] border border-border/70 bg-white p-3 text-sm font-bold text-[var(--brand-ink)]">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function InboxMockup() {
  const conversations = [
    ["Maya Novak", "Can I move my appointment to 11:00?", "2 unread"],
    ["Unknown contact", "I would like to book a first visit.", "New"],
    ["Daniel Kiss", "Thanks, see you Thursday.", "Linked"],
  ];

  return (
    <div className="mockup-frame">
      <div className="grid gap-3">
        {conversations.map(([name, message, status]) => (
          <div key={name} className="rounded-[0.9rem] border border-border/70 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-bold text-[var(--brand-ink)]">{name}</h4>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{status}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportsMockup() {
  return (
    <div className="mockup-frame">
      <div className="grid gap-3 md:grid-cols-3">
        <MiniMetric label="Completion" value="84%" icon={CheckCircle2} />
        <MiniMetric label="Revenue" value="$12.8k" icon={CreditCard} />
        <MiniMetric label="Growth" value="+18%" icon={TrendingUp} />
      </div>
      <div className="mt-4 rounded-[0.95rem] border border-primary/20 bg-gradient-to-br from-primary/10 to-[#6dc3d5]/10 p-4">
        <p className="text-sm font-bold text-primary">Recommended next action</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--brand-ink)]">
          Bookings are strongest on Tuesday and Thursday afternoons. Consider moving more staff availability into these periods.
        </p>
      </div>
    </div>
  );
}

function AiInsightsSection() {
  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 rounded-[1.6rem] bg-[var(--brand-ink)] p-6 text-white shadow-[0_30px_100px_rgba(20,21,47,0.22)] sm:p-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:p-10">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-white/55">AI-assisted operations</p>
          <h2 className="mt-4 text-4xl font-semibold leading-[0.98] sm:text-6xl">
            Understand what changed, why it matters, and what to improve next.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-8 text-white/72">
            Vela keeps insights operational: demand patterns, completion rate, payment context, staff coverage, and next actions.
          </p>
        </div>
        <div className="rounded-[1.25rem] border border-white/12 bg-white/[0.07] p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Sparkles className="size-5 text-[#6dc3d5]" />
            Insight summary
          </div>
          <p className="mt-5 text-xl font-semibold leading-8">
            Bookings are strongest on Tuesday and Thursday afternoons. Consider moving more staff availability into these periods.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <DarkMetric label="Demand lift" value="+18%" />
            <DarkMetric label="Completion" value="84%" />
            <DarkMetric label="Fallback ready" value="Rules" />
          </div>
        </div>
      </div>
    </section>
  );
}

function DarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[0.9rem] border border-white/10 bg-white/[0.06] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/52">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function TrustSection() {
  const trustItems = [
    ["Private clinic records", LockKeyhole],
    ["Secure document storage", FileImage],
    ["Authenticated workspace access", ShieldCheck],
    ["Customer-safe reporting", ClipboardList],
    ["Provider complexity hidden", Stethoscope],
    ["Operational privacy in mind", Activity],
  ] satisfies Array<[string, ElementType]>;

  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <h2 className="text-4xl font-semibold leading-[0.98] text-[var(--brand-ink)] sm:text-6xl">
            Designed with privacy-conscious clinic workflows in mind.
          </h2>
          <p className="mt-5 text-base leading-8 text-muted-foreground">
            Vela keeps the clinic experience focused on safe access, organized records, readable reporting, and simple product language.
          </p>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trustItems.map(([label, Icon]) => (
            <div key={label} className="rounded-[1rem] border border-border/80 bg-white p-4 shadow-[0_16px_44px_rgba(20,21,47,0.045)]">
              <Icon className="size-5 text-primary" />
              <p className="mt-4 text-sm font-bold text-[var(--brand-ink)]">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingPreviewSection() {
  const previewPlans = [
    {
      name: "Basic",
      copy: "Core clinic operations for teams getting organized.",
      features: ["Appointments", "Clients", "Staff", "Inbox", "Basic reports"],
    },
    {
      name: "Pro",
      copy: "Deeper reporting and operational insight for growing clinics.",
      features: ["Advanced reports", "AI-assisted insights", "Operational analytics", "Growth tools"],
    },
  ];

  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-4xl font-semibold leading-[0.98] text-[var(--brand-ink)] sm:text-6xl">
              Start simple. Grow into deeper insight.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground">
              The homepage gives a quick plan preview. The pricing page keeps the full comparison.
            </p>
          </div>
          <Link href="/pricing" className="inline-flex h-11 items-center justify-center gap-2 rounded-[0.85rem] border border-border/80 bg-white px-5 text-sm font-bold text-primary shadow-[0_14px_34px_rgba(20,21,47,0.05)] transition hover:-translate-y-0.5 hover:border-primary/40">
            View pricing
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {previewPlans.map((plan) => (
            <article key={plan.name} className="rounded-[1.25rem] border border-border/80 bg-white p-6 shadow-[0_24px_80px_rgba(20,21,47,0.06)]">
              <h3 className="text-2xl font-semibold text-[var(--brand-ink)]">{plan.name}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.copy}</p>
              <div className="mt-6 grid gap-3">
                {plan.features.map((feature) => (
                  <CheckLine key={feature}>{feature}</CheckLine>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section className="px-4 pb-14 sm:px-6 lg:px-8">
      <div className="vela-gradient mx-auto flex max-w-7xl flex-col gap-5 rounded-[1.5rem] p-6 text-white shadow-[0_24px_80px_rgba(150,118,247,0.24)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-semibold sm:text-5xl">Bring your clinic into one organized workspace.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/82">
            Start with appointments, patients, staff, and reports - then grow into messaging, automation, and deeper insights.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className="inline-flex h-11 items-center justify-center rounded-[0.85rem] bg-white px-5 text-sm font-bold text-primary transition hover:bg-white/90">
            Start free
          </Link>
          <Link href="/contact" className="inline-flex h-11 items-center justify-center rounded-[0.85rem] border border-white/40 px-5 text-sm font-bold text-white transition hover:bg-white/10">
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}

function WorkflowSection({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? "px-4 py-10 sm:px-6 lg:px-8" : "px-4 py-14 sm:px-6 sm:py-20 lg:px-8"}>
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <h2 className="text-4xl font-semibold leading-[0.98] text-[var(--brand-ink)] sm:text-6xl">
              From booking to follow-up in one flow.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground">
              Every step updates the same clinic workspace, so records stay complete and the team knows what to do next.
            </p>
          </div>
          <div className="grid gap-3">
            {["Create the patient profile", "Book the appointment and staff member", "Record service, payment, notes, and files", "Follow up with context", "Review what needs attention"].map((step, index) => (
              <div key={step} className="group flex items-center gap-4 rounded-[0.95rem] border border-border/80 bg-white p-4 shadow-[0_16px_48px_rgba(20,21,47,0.045)] transition hover:-translate-y-0.5 hover:border-primary/35">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[0.65rem] bg-primary/10 text-sm font-bold text-primary">
                  {index + 1}
                </span>
                <p className="text-sm font-semibold text-foreground">{step}</p>
                <ChevronRight className="ml-auto size-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductShowcase() {
  const items = [
    {
      image: marketingImages.calendar,
      title: "Calendar",
      copy: "Keep the whole week visible and make changes without breaking the clinic rhythm.",
    },
    {
      image: marketingImages.clients,
      title: "Clients",
      copy: "Open the full patient relationship from one clean directory.",
    },
    {
      image: marketingImages.reports,
      title: "Reports",
      copy: "See performance insights and next actions in one readout.",
    },
  ];

  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6">
        {items.map((item, index) => (
          <div key={item.title} className="grid gap-5 rounded-[1.5rem] border border-border/80 bg-white p-4 shadow-[0_24px_80px_rgba(20,21,47,0.06)] lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:p-6">
            <div className={index % 2 === 1 ? "lg:order-2" : ""}>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">{item.title}</p>
              <h2 className="mt-3 text-3xl font-semibold text-[var(--brand-ink)] sm:text-5xl">{item.copy}</h2>
            </div>
            <ImageCard src={item.image} alt={`${item.title} Vela product visual`} compact />
          </div>
        ))}
      </div>
    </section>
  );
}

function PageHero({
  title,
  copy,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  copy: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
}) {
  return (
    <section className="px-4 py-12 text-center sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-[2.8rem] font-semibold leading-[0.96] text-[var(--brand-ink)] sm:text-7xl">{title}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">{copy}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={primaryHref} className="vela-gradient inline-flex h-12 items-center justify-center gap-2 rounded-[0.85rem] px-6 text-sm font-bold text-white shadow-[0_18px_44px_rgba(150,118,247,0.24)] transition hover:-translate-y-0.5">
            {primaryLabel}
            <ArrowRight className="size-4" />
          </Link>
          <Link href={secondaryHref} className="inline-flex h-12 items-center justify-center rounded-[0.85rem] border border-border/80 bg-white px-6 text-sm font-bold text-foreground transition hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary">
            {secondaryLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

function ImageCard({
  src,
  alt,
  priority = false,
  hero = false,
  compact = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  hero?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="group relative min-w-0 overflow-hidden rounded-[1.5rem] border border-white/70 bg-white shadow-[0_30px_90px_rgba(74,99,138,0.16)]">
      <Image
        src={src}
        alt={alt}
        width={1680}
        height={945}
        priority={priority}
        sizes={hero ? "(min-width: 1024px) 80vw, 100vw" : "(min-width: 1024px) 52vw, 100vw"}
        className={[
          "w-full object-cover transition duration-700 group-hover:scale-[1.015]",
          compact ? "aspect-[1.78]" : "aspect-video",
        ].join(" ")}
      />
      <div className="pointer-events-none absolute inset-0 rounded-[1.5rem] ring-1 ring-inset ring-white/70" />
    </div>
  );
}

function PillarCard({ icon: Icon, title, copy, compact = false }: { icon: ElementType; title: string; copy: string; compact?: boolean }) {
  return (
    <article className={compact ? "flex gap-3 rounded-[0.9rem] p-4" : "rounded-[1.1rem] border border-border/80 bg-white p-5 shadow-[0_18px_54px_rgba(20,21,47,0.05)] transition hover:-translate-y-0.5 hover:border-primary/35"}>
      <span className="vela-icon-tile">
        <Icon className="size-5" />
      </span>
      <div className={compact ? "" : "mt-5"}>
        <h3 className="text-base font-bold text-[var(--brand-ink)]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
      </div>
    </article>
  );
}

function PlanCard({
  name,
  price,
  description,
  features,
  checkoutHref,
  highlighted = false,
}: {
  name: string;
  price: string;
  description: string;
  features: string[];
  checkoutHref: string;
  highlighted?: boolean;
}) {
  return (
    <article className={highlighted ? "rounded-[1.5rem] border border-primary/60 bg-white p-6 shadow-[0_24px_80px_rgba(150,118,247,0.15)]" : "rounded-[1.5rem] border border-border/80 bg-white p-6 shadow-[0_24px_80px_rgba(20,21,47,0.06)]"}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--brand-ink)]">{name}</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {highlighted ? <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Most popular</span> : null}
      </div>
      <div className="mt-8 flex items-end gap-2">
        <span className="text-5xl font-semibold text-[var(--brand-ink)]">{price}</span>
        <span className="pb-2 text-sm font-semibold text-muted-foreground">/month</span>
      </div>
      <Link href={checkoutHref} className="vela-gradient mt-8 inline-flex h-12 w-full items-center justify-center rounded-[0.85rem] text-sm font-bold text-white shadow-[0_18px_36px_rgba(150,118,247,0.22)] transition hover:-translate-y-0.5">
        Continue to checkout
      </Link>
      <div className="mt-7 grid gap-3">
        {features.map((feature) => (
          <CheckLine key={feature}>{feature}</CheckLine>
        ))}
      </div>
    </article>
  );
}

function PricingTable() {
  return (
    <div className="mx-auto mt-8 max-w-6xl overflow-hidden rounded-[1.25rem] border border-border/80 bg-white shadow-[0_24px_80px_rgba(20,21,47,0.06)]">
      <div className="grid grid-cols-[1.3fr_0.7fr_0.7fr] border-b border-border/70 bg-[var(--brand-wash)]/55 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
        <span>Feature</span>
        <span>Basic</span>
        <span>Pro</span>
      </div>
      {comparisonRows.map(([feature, basic, pro]) => (
        <div key={feature} className="grid grid-cols-[1.3fr_0.7fr_0.7fr] border-b border-border/70 px-4 py-4 text-sm font-semibold text-foreground last:border-b-0">
          <span>{feature}</span>
          <span>{basic}</span>
          <span>{pro}</span>
        </div>
      ))}
    </div>
  );
}

function LegalPanel() {
  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-4 rounded-[1.5rem] border border-border/80 bg-white p-5 shadow-[0_24px_80px_rgba(20,21,47,0.06)] sm:grid-cols-3">
        {[
          ["Terms & Conditions", "/terms-and-conditions"],
          ["Privacy Policy", "/privacy"],
          ["Refund Policy", "/refund"],
        ].map(([label, href]) => (
          <Link key={href} href={href} className="group flex items-center justify-between rounded-[0.95rem] border border-border/80 p-4 text-sm font-bold text-foreground transition hover:border-primary/40 hover:text-primary">
            {label}
            <ChevronRight className="size-4 transition group-hover:translate-x-1" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="px-4 pb-14 sm:px-6 lg:px-8">
      <div className="vela-gradient mx-auto flex max-w-7xl flex-col gap-5 rounded-[1.5rem] p-6 text-white shadow-[0_24px_80px_rgba(150,118,247,0.24)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-semibold sm:text-4xl">Start with one clearer clinic workspace.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">Centralize appointment, patient, communication, media, payment, and reporting work.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className="inline-flex h-11 items-center justify-center rounded-[0.85rem] bg-white px-5 text-sm font-bold text-primary transition hover:bg-white/90">
            Start free
          </Link>
          <Link href="/contact" className="inline-flex h-11 items-center justify-center rounded-[0.85rem] border border-white/40 px-5 text-sm font-bold text-white transition hover:bg-white/10">
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}

function ContactMethod({ icon: Icon, title, copy }: { icon: ElementType; title: string; copy: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[0.85rem] bg-white/10 text-white">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="mt-1 text-sm text-white/72">{copy}</p>
      </div>
    </div>
  );
}

function FormField({ label, placeholder, type = "text" }: { label: string; placeholder: string; type?: string }) {
  return (
    <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
      {label}
      <input
        type={type}
        placeholder={placeholder}
        className="h-12 rounded-[0.75rem] border border-border/80 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-4 focus:ring-primary/10"
      />
    </label>
  );
}

function MetricPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[0.95rem] bg-[var(--brand-wash)] p-4">
      <p className="text-2xl font-semibold text-primary">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
    </div>
  );
}

function CheckLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
      <CheckCircle2 className="size-4 shrink-0 text-primary" />
      <span>{children}</span>
    </div>
  );
}

function MarketingFooter() {
  return (
    <footer className="border-t border-border/70 bg-white px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <BrandMark href="/" includeSubtitle={false} />
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
            Vela brings appointments, patient records, staff, messaging, payments, and reports into one calm clinic workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-muted-foreground">
          {footerLinks.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-primary">
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-8 max-w-7xl text-xs font-semibold text-muted-foreground">
        &copy; 2026 Vela. All rights reserved.
      </div>
    </footer>
  );
}
