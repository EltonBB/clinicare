import Image from "next/image";
import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileImage,
  LayoutGrid,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UsersRound,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";

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

const productImages = {
  dashboard: "/marketing/vela-dashboard.png",
  calendar: "/marketing/vela-calendar.png",
  patientReports: "/marketing/vela-patient-reports.png",
};

const modules = [
  {
    icon: CalendarDays,
    title: "Booking timeline",
    copy: "Appointments, staff, service notes, status, and payment context stay connected from the first booking.",
  },
  {
    icon: UsersRound,
    title: "Patient records",
    copy: "Profiles include appointments, medical notes, medications, documents, images, messages, and payment history.",
  },
  {
    icon: MessageCircle,
    title: "Message continuity",
    copy: "WhatsApp-ready conversations keep patient context close to reminders, follow-ups, and client conversion.",
  },
  {
    icon: BarChart3,
    title: "Clinic intelligence",
    copy: "Daily, weekly, and monthly reports diagnose schedule pressure, retention, lost slots, and next actions.",
  },
];

const workflowSteps = [
  "Register a patient with only the essentials",
  "Book the visit, staff member, service, and payment",
  "Complete the appointment and update the record",
  "Attach documents, images, scans, notes, and medication context",
  "Review reports and follow up with the right patients",
];

const basicFeatures = [
  "Calendar and appointment pages",
  "Client records and notes",
  "Documents, images, and scans",
  "Payments and invoice tracking",
  "WhatsApp-ready inbox context",
  "Basic operational reports",
];

const proFeatures = [
  "Everything in Basic",
  "Advanced AI reports and diagnosis",
  "Staff activity and utilization",
  "More workflow automation",
  "Priority setup support",
  "Launch-ready clinic operations",
];

const comparisonRows = [
  ["Calendar and appointments", "Included", "Included"],
  ["Patient medical profile", "Included", "Included"],
  ["Documents, scans, and images", "Included", "Included"],
  ["WhatsApp-ready inbox", "Included", "Included"],
  ["AI report diagnosis", "Basic", "Advanced"],
  ["Staff performance view", "Limited", "Full"],
  ["Setup support", "Standard", "Priority"],
];

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen w-screen max-w-[100vw] overflow-x-hidden bg-[#f4f8fd] text-[#101820]">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </main>
  );
}

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#dbe6f4] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <BrandMark href="/" includeSubtitle={false} />
        <nav className="hidden items-center gap-9 text-sm font-semibold text-[#5e6f87] lg:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-[#3b82f6]">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden h-10 items-center rounded-[8px] border border-[#d7e2f0] bg-white px-4 text-sm font-semibold text-[#101820] transition hover:border-[#9fb7d4] sm:inline-flex"
          >
            Login
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-10 items-center rounded-[8px] bg-[#3b82f6] px-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(59,130,246,0.24)] transition hover:bg-[#2563eb] sm:px-4"
          >
            <span className="sm:hidden">Start</span>
            <span className="hidden sm:inline">Get started</span>
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
      <ProofStrip />
      <ProductSystemSection />
      <LifecycleSection />
      <IntelligenceSection />
      <SecuritySection />
      <CtaBand />
    </MarketingShell>
  );
}

export function ProductPage() {
  return (
    <MarketingShell>
      <PageHero
        title="One system for the clinic workday"
        copy="Vela brings scheduling, patient records, staff work, messaging, payments, media, and performance reporting into a workspace your team can use every day."
        primaryHref="/sign-up"
        primaryLabel="Get started"
        secondaryHref="/pricing"
        secondaryLabel="View pricing"
      />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <ProductImageFrame
            src={productImages.calendar}
            alt="Generated Vela calendar workspace with made-up clinic appointments"
            priority
          />
          <NarrativeBlock
            title="A calendar that behaves like clinic operations"
            copy="Book visits from a focused page, keep staff assignments visible, protect opening hours, and keep completed work flowing into patient and staff records."
            points={[
              "Day, week, and month views",
              "Dedicated create and edit pages",
              "Booking-time service and payment context",
              "Completed visits become record history",
            ]}
          />
        </div>
      </section>
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-3">
          <FeatureShowcase title="Patient command center" icon={UsersRound}>
            <ProductImageFrame
              src={productImages.patientReports}
              alt="Generated Vela patient record and clinic report view with made-up patient data"
              compact
            />
          </FeatureShowcase>
          <FeatureShowcase title="Clinic intelligence" icon={Sparkles}>
            <ReportPreviewCard />
          </FeatureShowcase>
          <FeatureShowcase title="Message continuity" icon={MessageCircle}>
            <InboxPreviewCard />
          </FeatureShowcase>
        </div>
      </section>
      <LifecycleSection />
      <CtaBand />
    </MarketingShell>
  );
}

export function PricingPageContent() {
  return (
    <MarketingShell>
      <PageHero
        title="Simple pricing for a serious clinic workspace"
        copy="Start with the operating system. Upgrade when you need stronger reporting, staff visibility, automation, and launch support."
        primaryHref="/sign-up"
        primaryLabel="Get started"
        secondaryHref="/contact"
        secondaryLabel="Talk to us"
      />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
          <PlanCard
            name="Basic"
            price="$39"
            description="For solo practitioners and small clinics that need one clean daily workspace."
            features={basicFeatures}
          />
          <PlanCard
            name="Pro"
            price="$79"
            description="For growing clinics that need deeper intelligence, team visibility, and stronger support."
            features={proFeatures}
            highlighted
          />
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
        title="Built for clinics that want calmer operations"
        copy="Vela keeps patient work, appointment work, and performance work in one place so clinic teams spend less time switching tools and more time delivering care."
        primaryHref="/sign-up"
        primaryLabel="Get started"
        secondaryHref="/contact"
        secondaryLabel="Contact us"
      />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-[10px] border border-[#dbe6f4] bg-white p-6 shadow-[0_24px_80px_rgba(16,24,32,0.06)] sm:p-8">
            <p className="max-w-xl text-2xl font-semibold leading-tight tracking-[-0.01em] text-[#111827] sm:text-3xl">
              The product direction is simple: every clinic should be able to open one workspace and understand what needs attention today.
            </p>
            <div className="mt-8 grid gap-4 text-sm font-semibold text-[#53667f] sm:grid-cols-3">
              <MetricPill value="1" label="workspace" />
              <MetricPill value="6" label="core modules" />
              <MetricPill value="3" label="report windows" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard title="Clinic-first workflow" icon={Stethoscope}>
              Patients, bookings, staff, documents, messages, and payments are arranged around the way appointment-based clinics actually work.
            </InfoCard>
            <InfoCard title="Privacy-minded design" icon={ShieldCheck}>
              Private media handling, server-side app data access, route protection, and simple customer-facing states are part of the product foundation.
            </InfoCard>
            <InfoCard title="Useful reports" icon={Sparkles}>
              Reports are built to diagnose schedule utilization, completions, client mix, demand windows, and follow-up opportunities.
            </InfoCard>
            <InfoCard title="Legal pages included" icon={FileImage}>
              Terms, privacy, and refund pages are available for launch readiness and customer review.
            </InfoCard>
          </div>
        </div>
      </section>
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 rounded-[10px] border border-[#dbe6f4] bg-white p-5 shadow-[0_24px_80px_rgba(16,24,32,0.06)] lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
          <ProductImageFrame
            src={productImages.dashboard}
            alt="Generated Vela dashboard with made-up clinic data"
            compact
          />
          <div className="flex flex-col justify-center">
            <h2 className="text-3xl font-semibold tracking-[-0.02em] text-[#111827]">Designed around the operator, not the provider stack.</h2>
            <p className="mt-4 text-base leading-8 text-[#5d6d85]">
              Vela hides implementation complexity behind simple product language, so the clinic can configure hours, staff, branding, patients, messages, reports, and reminders without thinking about infrastructure.
            </p>
            <div className="mt-7 grid gap-3">
              {["Customer-safe wording", "Clean workspace navigation", "Launch-ready public pages"].map((item) => (
                <CheckLine key={item}>{item}</CheckLine>
              ))}
            </div>
          </div>
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
          <div className="rounded-[10px] border border-[#dbe6f4] bg-[#07162b] p-6 text-white shadow-[0_24px_80px_rgba(16,24,32,0.12)] sm:p-8">
            <h1 className="max-w-md text-4xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-5xl">See how Vela fits your clinic.</h1>
            <p className="mt-5 max-w-md text-base leading-8 text-[#b8c7dc]">
              Ask about setup, patient workflows, WhatsApp readiness, reporting, pricing, or moving your current clinic process into Vela.
            </p>
            <div className="mt-8 grid gap-4">
              <ContactMethod icon={CalendarDays} title="Book a demo" copy="Walk through daily scheduling, records, and reports." />
              <ContactMethod icon={Mail} title="Email us" copy="hello@vela.app" />
              <ContactMethod icon={Phone} title="Call us" copy="+1 (555) 123-4567" />
              <ContactMethod icon={MessageCircle} title="Live chat" copy="Available during weekday business hours." />
            </div>
          </div>
          <div className="rounded-[10px] border border-[#dbe6f4] bg-white p-5 shadow-[0_24px_80px_rgba(16,24,32,0.06)] sm:p-8">
            <form className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Full name" placeholder="Your name" />
                <FormField label="Email" placeholder="you@example.com" type="email" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Clinic / business name" placeholder="Your clinic name" />
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#63748c]">
                  How can we help?
                  <select className="h-12 rounded-[8px] border border-[#d7e2f0] bg-white px-4 text-sm font-semibold normal-case tracking-normal text-[#101820] outline-none transition focus:border-[#3b82f6]">
                    <option>I want to book a demo</option>
                    <option>I have a pricing question</option>
                    <option>I need help with setup</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#63748c]">
                Message
                <textarea
                  rows={7}
                  placeholder="Tell us about your clinic and what you need..."
                  className="resize-none rounded-[8px] border border-[#d7e2f0] bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-[#101820] outline-none transition placeholder:text-[#8da0b8] focus:border-[#3b82f6]"
                />
              </label>
              <button
                type="button"
                className="inline-flex h-12 items-center justify-center rounded-[8px] bg-[#3b82f6] px-5 text-sm font-bold text-white shadow-[0_18px_36px_rgba(59,130,246,0.24)] transition hover:bg-[#2563eb]"
              >
                Send message
              </button>
            </form>
            <div className="mt-6 grid gap-3 border-t border-[#e5edf7] pt-6 sm:grid-cols-3">
              <MiniFact label="Response" value="within 24h" />
              <MiniFact label="Best for" value="clinics" />
              <MiniFact label="Setup" value="guided" />
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.18),transparent_34%),linear-gradient(180deg,#ffffff_0%,#edf5ff_100%)] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-9 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
        <div className="relative z-10 min-w-0">
          <h1 className="max-w-xl break-words text-[2.72rem] font-semibold leading-[0.95] tracking-[-0.045em] text-[#07162b] sm:text-6xl lg:text-7xl">
            <span className="block">Run your clinic</span>
            <span className="block">from one calm</span>
            <span className="block">workspace.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-[#53667f] sm:text-lg">
            Vela connects appointments, patient records, staff, WhatsApp context, payments, documents, images, and clinic intelligence without forcing your team through scattered tools.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/sign-up"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[#3b82f6] px-6 text-sm font-bold text-white shadow-[0_18px_36px_rgba(59,130,246,0.28)] transition hover:bg-[#2563eb] sm:w-auto"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/product"
              className="inline-flex h-12 w-full items-center justify-center rounded-[8px] border border-[#cddcf0] bg-white px-6 text-sm font-bold text-[#111827] transition hover:border-[#9fb7d4] sm:w-auto"
            >
              See product
            </Link>
          </div>
          <div className="mt-8 grid gap-3 text-sm font-semibold text-[#53667f] sm:grid-cols-2">
            <CheckLine>No setup fee for MVP access</CheckLine>
            <CheckLine>Built for appointment-based clinics</CheckLine>
            <CheckLine>Private media-ready records</CheckLine>
            <CheckLine>AI reports with rule fallback</CheckLine>
          </div>
        </div>
        <div className="relative min-w-0">
          <div className="absolute -right-8 top-8 hidden h-40 w-40 rounded-full bg-[#3b82f6]/16 blur-3xl lg:block" />
          <ProductImageFrame
            src={productImages.dashboard}
            alt="Generated Vela dashboard preview using made-up clinic names and appointments"
            priority
            hero
          />
          <div className="pointer-events-none absolute -bottom-6 left-4 hidden rounded-[10px] border border-[#dbe6f4] bg-white/95 p-4 shadow-[0_22px_60px_rgba(16,24,32,0.14)] backdrop-blur md:block">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6a7d96]">Today</p>
            <p className="mt-1 text-2xl font-semibold text-[#111827]">94% completion</p>
            <p className="mt-1 text-sm text-[#62748b]">2 appointments scheduled</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProofStrip() {
  return (
    <section className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-3 rounded-[10px] border border-[#dbe6f4] bg-white p-4 shadow-[0_18px_50px_rgba(16,24,32,0.05)] sm:grid-cols-2 lg:grid-cols-4">
        {modules.map((module) => (
          <div key={module.title} className="flex gap-3 rounded-[8px] p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#eef4ff] text-[#3b82f6]">
              <module.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold text-[#111827]">{module.title}</p>
              <p className="mt-1 text-xs leading-5 text-[#6a7d96]">{module.copy}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductSystemSection() {
  return (
    <section className="px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-5 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <h2 className="max-w-xl text-4xl font-semibold leading-[0.98] tracking-[-0.04em] text-[#07162b] sm:text-5xl">
              Everything connected. Everything in sync.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[#5d6d85]">
              The front desk can book the visit, the doctor can open the patient context, and the owner can see what is working without searching through separate systems.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniFact label="Workspace" value="patients + staff" />
            <MiniFact label="Records" value="notes + scans" />
            <MiniFact label="Reports" value="diagnosis + next move" />
          </div>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <ProductImageFrame
            src={productImages.calendar}
            alt="Generated Vela calendar preview with made-up bookings"
          />
          <div className="grid gap-6">
            <ProductImageFrame
              src={productImages.patientReports}
              alt="Generated Vela patient record and reports preview with made-up data"
              compact
            />
            <InboxPreviewCard />
          </div>
        </div>
      </div>
    </section>
  );
}

function LifecycleSection() {
  return (
    <section className="px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
        <div>
          <h2 className="text-4xl font-semibold leading-[0.98] tracking-[-0.04em] text-[#07162b] sm:text-5xl">
            From first booking to repeat care.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-8 text-[#5d6d85]">
            Vela keeps the process natural: register the patient, book the visit, complete the service, document the care, and follow up from the same record.
          </p>
          <div className="mt-8 grid gap-3">
            {workflowSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-3 rounded-[8px] border border-[#dbe6f4] bg-white p-3 shadow-[0_12px_36px_rgba(16,24,32,0.04)]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#eef4ff] text-xs font-bold text-[#3b82f6]">
                  {index + 1}
                </span>
                <p className="text-sm font-semibold text-[#304158]">{step}</p>
              </div>
            ))}
          </div>
        </div>
        <ProductImageFrame
          src={productImages.patientReports}
          alt="Generated Vela patient details, documents, payments, and AI report preview"
        />
      </div>
    </section>
  );
}

function IntelligenceSection() {
  return (
    <section className="px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 rounded-[10px] border border-[#cfe0f6] bg-[#07162b] p-5 text-white shadow-[0_28px_90px_rgba(7,22,43,0.18)] sm:p-8 lg:grid-cols-[1fr_0.92fr] lg:p-10">
        <div>
          <h2 className="max-w-2xl text-4xl font-semibold leading-[0.98] tracking-[-0.04em] sm:text-5xl">
            Reports that explain what to do next.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-8 text-[#b8c7dc]">
            Vela turns appointment activity into a practical readout: what is working, what needs attention, likely causes, and the next action to improve the clinic.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <DarkMetric value="Daily" label="today readout" />
            <DarkMetric value="Weekly" label="trend diagnosis" />
            <DarkMetric value="Monthly" label="growth view" />
          </div>
          <div className="mt-8 grid gap-3">
            {["Schedule utilization", "Completion rate", "Client mix", "Lost slots", "Follow-up coverage"].map((item) => (
              <CheckLine key={item} dark>
                {item}
              </CheckLine>
            ))}
          </div>
        </div>
        <ReportPreviewCard dark />
      </div>
    </section>
  );
}

function SecuritySection() {
  return (
    <section className="px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-3">
        <InfoCard title="Private by design" icon={ShieldCheck}>
          Clinic records stay behind authenticated app routes, media is stored privately, and signed display URLs are used for images.
        </InfoCard>
        <InfoCard title="Launch-ready pages" icon={LayoutGrid}>
          Public Home, Product, Pricing, About, Contact, Terms, Privacy, and Refund pages are ready for prospects to review.
        </InfoCard>
        <InfoCard title="Fast navigation" icon={Sparkles}>
          Workspace pages use lighter directory data and dedicated details pages, keeping the app responsive as clinics grow.
        </InfoCard>
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
    <section className="px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-4xl min-w-0 text-center">
        <h1 className="break-words text-[2.55rem] font-semibold leading-[0.98] tracking-[-0.045em] text-[#07162b] sm:text-6xl">{title}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-[#5d6d85] sm:text-lg">{copy}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={primaryHref}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[#3b82f6] px-6 text-sm font-bold text-white shadow-[0_18px_36px_rgba(59,130,246,0.24)] transition hover:bg-[#2563eb] sm:w-auto"
          >
            {primaryLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={secondaryHref}
            className="inline-flex h-12 w-full items-center justify-center rounded-[8px] border border-[#cddcf0] bg-white px-6 text-sm font-bold text-[#111827] transition hover:border-[#9fb7d4] sm:w-auto"
          >
            {secondaryLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

function ProductImageFrame({
  src,
  alt,
  priority = false,
  compact = false,
  hero = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  compact?: boolean;
  hero?: boolean;
}) {
  return (
    <div
      className={[
        "relative min-w-0 overflow-hidden rounded-[12px] border border-[#d7e2f0] bg-white shadow-[0_28px_90px_rgba(16,24,32,0.12)]",
        hero ? "p-2" : "p-2",
        compact ? "min-h-[260px]" : "",
      ].join(" ")}
    >
      <Image
        src={src}
        alt={alt}
        width={1600}
        height={1000}
        priority={priority}
        sizes={hero ? "(min-width: 1024px) 58vw, 100vw" : "(min-width: 1024px) 50vw, 100vw"}
        className={[
          "h-auto w-full rounded-[8px] object-cover",
          compact ? "aspect-[1.55] object-left-top" : "aspect-[1.6]",
        ].join(" ")}
      />
    </div>
  );
}

function NarrativeBlock({ title, copy, points }: { title: string; copy: string; points: string[] }) {
  return (
    <div className="rounded-[10px] border border-[#dbe6f4] bg-white p-6 shadow-[0_24px_80px_rgba(16,24,32,0.06)] sm:p-8">
      <h2 className="text-3xl font-semibold tracking-[-0.02em] text-[#111827]">{title}</h2>
      <p className="mt-4 text-base leading-8 text-[#5d6d85]">{copy}</p>
      <div className="mt-7 grid gap-3">
        {points.map((point) => (
          <CheckLine key={point}>{point}</CheckLine>
        ))}
      </div>
    </div>
  );
}

function FeatureShowcase({ title, icon: Icon, children }: { title: string; icon: ElementType; children: ReactNode }) {
  return (
    <article className="rounded-[10px] border border-[#dbe6f4] bg-white p-5 shadow-[0_24px_80px_rgba(16,24,32,0.06)]">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#eef4ff] text-[#3b82f6]">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="text-lg font-bold text-[#111827]">{title}</h3>
      </div>
      {children}
    </article>
  );
}

function ReportPreviewCard({ dark = false }: { dark?: boolean }) {
  return (
    <div className={dark ? "rounded-[10px] border border-white/12 bg-white p-5 text-[#111827]" : "rounded-[10px] border border-[#dbe6f4] bg-[#fbfdff] p-5"}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6a7d96]">Snapshot</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[#111827]">This week readout</h3>
        </div>
        <div className="rounded-full bg-[#eef4ff] px-3 py-2 text-sm font-bold text-[#3b82f6]">88/100</div>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#5d6d85]">Strong completion and low lost slots. Friday has open capacity that can be filled with recall clients.</p>
      <div className="mt-5 grid gap-3">
        <ReportRow label="Diagnosis" value="Utilization opportunity" tone="High" />
        <ReportRow label="Top cause" value="Open capacity on Friday" tone="Medium" />
        <ReportRow label="Next move" value="Fill 2 open slots with recalls" tone="High" />
      </div>
    </div>
  );
}

function ReportRow({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-[8px] border border-[#e1e9f4] bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6a7d96]">{label}</p>
        <span className="rounded-full bg-[#fff1eb] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#d76d4b]">{tone}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-[#223047]">{value}</p>
    </div>
  );
}

function InboxPreviewCard() {
  return (
    <div className="rounded-[10px] border border-[#dbe6f4] bg-[#fbfdff] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6a7d96]">Inbox</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[#111827]">Follow-up without losing context.</h3>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-[9px] bg-[#e9fff4] text-[#0ea56f]">
          <MessageCircle className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-5 grid gap-3">
        {[
          ["Mira Kelmendi", "Reminder sent for tomorrow at 10:30"],
          ["Adrian Hoxha", "Asked to reschedule veneers visit"],
          ["Unknown contact", "Convert to patient record"],
        ].map(([name, message]) => (
          <div key={name} className="rounded-[8px] border border-[#e1e9f4] bg-white p-3">
            <p className="text-sm font-bold text-[#111827]">{name}</p>
            <p className="mt-1 text-sm text-[#6a7d96]">{message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  description,
  features,
  highlighted = false,
}: {
  name: string;
  price: string;
  description: string;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <article className={highlighted ? "rounded-[10px] border border-[#3b82f6] bg-white p-6 shadow-[0_24px_80px_rgba(59,130,246,0.15)]" : "rounded-[10px] border border-[#dbe6f4] bg-white p-6 shadow-[0_24px_80px_rgba(16,24,32,0.06)]"}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[#111827]">{name}</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-[#62748b]">{description}</p>
        </div>
        {highlighted ? <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-bold text-[#3b82f6]">Most popular</span> : null}
      </div>
      <div className="mt-8 flex items-end gap-2">
        <span className="text-5xl font-semibold tracking-[-0.04em] text-[#07162b]">{price}</span>
        <span className="pb-2 text-sm font-semibold text-[#62748b]">/month</span>
      </div>
      <Link
        href="/sign-up"
        className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-[8px] bg-[#3b82f6] text-sm font-bold text-white shadow-[0_18px_36px_rgba(59,130,246,0.22)] transition hover:bg-[#2563eb]"
      >
        Get started
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
    <div className="mx-auto mt-8 max-w-6xl overflow-hidden rounded-[10px] border border-[#dbe6f4] bg-white shadow-[0_24px_80px_rgba(16,24,32,0.06)]">
      <div className="grid grid-cols-[1.3fr_0.7fr_0.7fr] border-b border-[#e3ebf5] bg-[#f8fbff] px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-[#63748c]">
        <span>Feature</span>
        <span>Basic</span>
        <span>Pro</span>
      </div>
      {comparisonRows.map(([feature, basic, pro]) => (
        <div key={feature} className="grid grid-cols-[1.3fr_0.7fr_0.7fr] border-b border-[#eef3f9] px-4 py-4 text-sm font-semibold text-[#304158] last:border-b-0">
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
      <div className="mx-auto grid max-w-7xl gap-4 rounded-[10px] border border-[#dbe6f4] bg-white p-5 shadow-[0_24px_80px_rgba(16,24,32,0.06)] sm:grid-cols-3">
        {[
          ["Terms & Conditions", "/terms-and-conditions"],
          ["Privacy Policy", "/privacy"],
          ["Refund Policy", "/refund"],
        ].map(([label, href]) => (
          <Link key={href} href={href} className="group flex items-center justify-between rounded-[8px] border border-[#e1e9f4] p-4 text-sm font-bold text-[#111827] transition hover:border-[#3b82f6] hover:text-[#3b82f6]">
            {label}
            <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="px-4 pb-14 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 rounded-[10px] bg-[#3b82f6] p-6 text-white shadow-[0_24px_80px_rgba(59,130,246,0.22)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.03em]">Start with one cleaner clinic workspace.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-50">Use Vela to centralize appointment, client, communication, media, payment, and reporting work.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className="inline-flex h-11 items-center justify-center rounded-[8px] bg-white px-5 text-sm font-bold text-[#2563eb] transition hover:bg-blue-50">
            Get started
          </Link>
          <Link href="/contact" className="inline-flex h-11 items-center justify-center rounded-[8px] border border-white/40 px-5 text-sm font-bold text-white transition hover:bg-white/10">
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}

function InfoCard({ title, icon: Icon, children }: { title: string; icon: ElementType; children: ReactNode }) {
  return (
    <article className="rounded-[10px] border border-[#dbe6f4] bg-white p-6 shadow-[0_24px_80px_rgba(16,24,32,0.06)]">
      <span className="flex h-11 w-11 items-center justify-center rounded-[9px] bg-[#eef4ff] text-[#3b82f6]">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-5 text-xl font-bold tracking-[-0.01em] text-[#111827]">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-[#62748b]">{children}</p>
    </article>
  );
}

function ContactMethod({ icon: Icon, title, copy }: { icon: ElementType; title: string; copy: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-white/10 text-[#74a7ff]">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="mt-1 text-sm text-[#b8c7dc]">{copy}</p>
      </div>
    </div>
  );
}

function FormField({ label, placeholder, type = "text" }: { label: string; placeholder: string; type?: string }) {
  return (
    <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#63748c]">
      {label}
      <input
        type={type}
        placeholder={placeholder}
        className="h-12 rounded-[8px] border border-[#d7e2f0] bg-white px-4 text-sm font-semibold normal-case tracking-normal text-[#101820] outline-none transition placeholder:text-[#8da0b8] focus:border-[#3b82f6]"
      />
    </label>
  );
}

function MetricPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[8px] bg-[#f3f7fd] p-4">
      <p className="text-2xl font-semibold text-[#3b82f6]">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#63748c]">{label}</p>
    </div>
  );
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[#dbe6f4] bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6a7d96]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[#111827]">{value}</p>
    </div>
  );
}

function DarkMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[8px] border border-white/12 bg-white/8 p-4">
      <p className="text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#b8c7dc]">{label}</p>
    </div>
  );
}

function CheckLine({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className={dark ? "flex items-center gap-2 text-sm font-semibold text-[#d8e5f6]" : "flex items-center gap-2 text-sm font-semibold text-[#304158]"}>
      <CheckCircle2 className={dark ? "h-4 w-4 shrink-0 text-[#74a7ff]" : "h-4 w-4 shrink-0 text-[#3b82f6]"} />
      <span>{children}</span>
    </div>
  );
}

function MarketingFooter() {
  return (
    <footer className="border-t border-[#dbe6f4] bg-white px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <BrandMark href="/" includeSubtitle={false} />
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#6a7d96]">Modern clinic operations for appointments, clients, communication, payments, and AI-assisted reports.</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-[#5e6f87]">
          {footerLinks.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-[#3b82f6]">
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-8 max-w-7xl text-xs font-semibold text-[#8b9ab0]">© 2026 Vela. All rights reserved.</div>
    </footer>
  );
}
