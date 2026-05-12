import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileImage,
  HeartPulse,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";

const navItems = [
  { label: "Product", href: "/product" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

const featureRows = [
  {
    icon: CalendarDays,
    title: "Calendar that keeps the day moving",
    copy: "Book appointments, assign staff, track status, and see the working day without opening a drawer or switching context.",
  },
  {
    icon: UsersRound,
    title: "Patient records built for repeat care",
    copy: "Keep contact details, history, notes, documents, scans, messages, and payments in one clean profile.",
  },
  {
    icon: MessageCircle,
    title: "Follow-up without scattered messages",
    copy: "WhatsApp-ready reminders and message context help teams stay close to clients before and after a visit.",
  },
  {
    icon: BarChart3,
    title: "Reports that diagnose operations",
    copy: "AI and rules review bookings, completion, utilization, follow-up, and trends across daily, weekly, and monthly snapshots.",
  },
];

const workflowSteps = [
  "Register the patient once",
  "Book the service and payment",
  "Capture clinical notes and files",
  "Follow up through reminders",
  "Review performance trends",
];

const planFeatures = {
  basic: [
    "Calendar and booking management",
    "Patient profiles and appointment history",
    "Documents, images, notes, and payments",
    "WhatsApp-ready reminders and inbox context",
    "Private clinic workspace and media storage",
  ],
  pro: [
    "Everything in Basic",
    "Advanced AI reports and diagnosis",
    "Staff activity and utilization views",
    "Priority setup support",
    "Workflow hardening for growing clinics",
  ],
};

const proofItems = [
  "Built around clinic workflows",
  "Private records per clinic",
  "Fast page-to-page operations",
  "Simple enough for daily staff use",
];

const footerLinks = [
  ...navItems,
  { label: "Terms", href: "/terms-and-conditions" },
  { label: "Privacy", href: "/privacy" },
  { label: "Refund", href: "/refund" },
];

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen w-screen max-w-[100vw] overflow-x-hidden bg-[#f5f8fc] text-[#142033]">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </main>
  );
}

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 w-screen max-w-[100vw] overflow-hidden border-b border-[#dce6f2]/80 bg-white/86 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandMark href="/" includeSubtitle={false} />
        <nav className="hidden items-center gap-8 text-sm font-semibold text-[#5d6d85] lg:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-[#3b82f6]">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden h-10 items-center justify-center rounded-[8px] border border-[#dbe5f2] bg-white px-4 text-sm font-semibold text-[#142033] shadow-[0_8px_20px_rgba(20,32,51,0.04)] hover:border-[#b8c8dd] sm:inline-flex"
          >
            Login
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[#3b82f6] px-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(59,130,246,0.24)] hover:bg-[#2563eb] sm:px-4"
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
      <section className="w-screen max-w-[100vw] overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#eef5ff_100%)]">
        <div className="mx-auto grid min-w-0 max-w-7xl gap-10 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:pb-24 lg:pt-24">
          <div className="min-w-0 overflow-hidden text-center lg:flex lg:flex-col lg:justify-center lg:text-left">
            <h1 className="mx-auto max-w-[22rem] text-4xl font-semibold leading-[1.06] tracking-[-0.04em] text-[#101820] sm:max-w-2xl sm:text-6xl lg:mx-0 lg:text-7xl">
              Run your clinic. Deliver exceptional care.
            </h1>
            <p className="mx-auto mt-6 max-w-[21rem] text-base font-medium leading-8 text-[#607089] sm:max-w-xl sm:text-lg lg:mx-0">
              Vela brings appointments, clients, staff, payments, reminders, documents, and AI reports into one fast clinic workspace.
            </p>
            <div className="mx-auto mt-8 flex max-w-[21rem] flex-col justify-center gap-3 sm:max-w-none sm:flex-row lg:mx-0 lg:justify-start [&>a]:w-full sm:[&>a]:w-auto">
              <PrimaryCta href="/sign-up">Get started</PrimaryCta>
              <SecondaryCta href="/product">See product</SecondaryCta>
            </div>
            <div className="mt-8 grid gap-3 text-sm font-semibold text-[#607089] sm:grid-cols-2">
              {proofItems.map((item) => (
                <div key={item} className="flex items-center justify-center gap-2 lg:justify-start">
                  <CheckCircle2 className="size-4 text-[#3b82f6]" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <ProductDashboardMockup />
        </div>
      </section>

      <section className="px-4 py-18 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            title="Everything connected. Everything in sync."
            copy="The strongest clinic products lead with scheduling, patient records, communication, billing, and operational clarity. Vela puts those jobs into one simple flow."
          />
          <div className="mt-12 grid gap-4 lg:grid-cols-4">
            {featureRows.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-18 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <h2 className="max-w-xl text-4xl font-semibold leading-tight tracking-[-0.035em] text-[#101820] sm:text-5xl">
              From first booking to repeat care.
            </h2>
            <p className="mt-5 max-w-xl text-base font-medium leading-8 text-[#607089]">
              The client record becomes the source of truth. Each appointment can add service details, notes, payments, files, and follow-up context.
            </p>
            <div className="mt-8 space-y-3">
              {workflowSteps.map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-[8px] border border-[#dbe5f2] bg-white px-4 py-3">
                  <span className="grid size-8 place-items-center rounded-[8px] bg-[#eef5ff] text-sm font-semibold text-[#3b82f6]">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-[#142033]">{step}</span>
                </div>
              ))}
            </div>
          </div>
          <PatientRecordMockup />
        </div>
      </section>

      <CtaBand />
    </MarketingShell>
  );
}

export function ProductPage() {
  return (
    <MarketingShell>
      <PageHero
        title="Built for how clinics actually work."
        copy="Vela keeps daily operations simple: schedule the visit, keep the patient record complete, follow up, and learn what is improving or slipping."
        primaryHref="/sign-up"
        primaryLabel="Start free"
        secondaryHref="/pricing"
        secondaryLabel="View pricing"
      />
      <section className="px-4 pb-18 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-2">
          <WorkflowPanel
            icon={CalendarDays}
            title="Bookings and calendar"
            items={["Single-page create and edit flows", "Staff assignment and appointment status", "Payment context captured around the booking"]}
          />
          <WorkflowPanel
            icon={UsersRound}
            title="Client details"
            items={["Overview, appointments, medical info, documents, messages, payments", "Images and scans attached to the right clinic record", "Edit page mirrors the creation flow"]}
          />
          <WorkflowPanel
            icon={MessageCircle}
            title="Communication"
            items={["WhatsApp-ready contact preferences", "Message history tied back to the client", "Reminder-ready structure for follow-up"]}
          />
          <WorkflowPanel
            icon={Sparkles}
            title="AI reports"
            items={["Daily, weekly, and monthly snapshots", "Clinic diagnosis, causes, next moves, and key stats", "Rule fallback when AI is unavailable"]}
          />
        </div>
      </section>
      <section className="px-4 pb-18 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 rounded-[8px] border border-[#dbe5f2] bg-white p-5 shadow-[0_24px_70px_rgba(20,32,51,0.06)] sm:p-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <ProductDashboardMockup compact />
          <div>
            <h2 className="text-4xl font-semibold leading-tight tracking-[-0.035em] text-[#101820]">
              Less clicking. More usable context.
            </h2>
            <p className="mt-5 text-base font-medium leading-8 text-[#607089]">
              The app has moved away from crowded side drawers and toward dedicated pages. That makes each workflow easier to scan and faster to use.
            </p>
            <div className="mt-8 grid gap-3">
              {["Dedicated detail pages", "Lightweight directory lists", "Fast protected navigation", "Cleaner patient history"].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm font-semibold text-[#142033]">
                  <CheckCircle2 className="size-5 text-[#3b82f6]" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <CtaBand />
    </MarketingShell>
  );
}

export function PricingPageContent() {
  return (
    <MarketingShell>
      <PageHero
        title="Simple pricing. No surprises."
        copy="Start with the clinic operating system, then move into deeper automation and reporting when your team needs it."
        primaryHref="/sign-up"
        primaryLabel="Start free"
        secondaryHref="/contact"
        secondaryLabel="Talk to us"
      />
      <section className="px-4 pb-18 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
          <PlanCard name="Basic" price="$39" description="For solo practitioners and small clinics that need daily operations in one place." features={planFeatures.basic} />
          <PlanCard name="Pro" price="$79" description="For growing teams that need stronger reporting, staff visibility, and workflow support." features={planFeatures.pro} highlighted />
        </div>
        <div className="mx-auto mt-8 max-w-6xl overflow-hidden rounded-[8px] border border-[#dbe5f2] bg-white">
          {[
            ["Appointments and calendar", "Included", "Included"],
            ["Client records and files", "Included", "Included"],
            ["Payments tracking", "Included", "Included"],
            ["AI reports", "Basic", "Advanced"],
            ["Staff operations", "1 staff", "Up to 10 staff"],
            ["Setup support", "Standard", "Priority"],
          ].map(([feature, basic, pro]) => (
            <div key={feature} className="grid grid-cols-[1.2fr_0.8fr_0.8fr] border-b border-[#edf2f8] px-4 py-4 text-sm last:border-b-0 sm:px-6">
              <span className="font-semibold text-[#142033]">{feature}</span>
              <span className="text-center text-[#607089]">{basic}</span>
              <span className="text-center font-semibold text-[#3b82f6]">{pro}</span>
            </div>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}

export function AboutPage() {
  return (
    <MarketingShell>
      <PageHero
        title="A calmer operating system for clinics."
        copy="Vela exists to remove administrative noise from small and growing clinics, so teams can manage care with less friction."
        primaryHref="/contact"
        primaryLabel="Contact us"
        secondaryHref="/terms-and-conditions"
        secondaryLabel="Read terms"
      />
      <section className="px-4 pb-18 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1fr_1fr_0.8fr]">
          <InfoPanel
            icon={HeartPulse}
            title="Why Vela"
            items={["Clinics need fast scheduling and complete client context.", "The system should feel simple enough for reception and useful enough for owners.", "Reports should explain what to improve, not just show charts."]}
          />
          <InfoPanel
            icon={ShieldCheck}
            title="Trust and privacy"
            items={["Each clinic works inside its own protected workspace.", "Client media is designed to stay private to the clinic.", "Public policy pages explain terms, privacy, and refunds clearly."]}
          />
          <div className="rounded-[8px] border border-[#dbe5f2] bg-white p-6 shadow-[0_18px_50px_rgba(20,32,51,0.05)]">
            <h2 className="text-xl font-semibold text-[#101820]">Legal</h2>
            <div className="mt-5 grid gap-3">
              <LegalLink href="/terms-and-conditions" label="Terms & Conditions" />
              <LegalLink href="/privacy" label="Privacy Policy" />
              <LegalLink href="/refund" label="Refund Policy" />
            </div>
          </div>
        </div>
      </section>
      <CtaBand />
    </MarketingShell>
  );
}

export function ContactPage() {
  return (
    <MarketingShell>
      <section className="px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h1 className="max-w-[22rem] text-4xl font-semibold leading-tight tracking-[-0.04em] text-[#101820] sm:max-w-none sm:text-6xl">
              Get in touch.
            </h1>
            <p className="mt-5 max-w-lg text-base font-medium leading-8 text-[#607089]">
              Ask a question, request a walkthrough, or tell us what your clinic needs before you start.
            </p>
            <div className="mt-8 grid gap-4">
              <ContactMethod icon={CalendarDays} title="Book a demo" copy="See how Vela fits your clinic workflow." />
              <ContactMethod icon={Mail} title="Email us" copy="support@clinicare-vela.space" />
              <ContactMethod icon={Phone} title="Response time" copy="We usually reply within a few hours." />
            </div>
          </div>
          <div className="rounded-[8px] border border-[#dbe5f2] bg-white p-5 shadow-[0_24px_70px_rgba(20,32,51,0.06)] sm:p-8">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[#101820]">Send us a message</h2>
            <form className="mt-6 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <MarketingInput label="Full name" placeholder="Your name" />
                <MarketingInput label="Email" placeholder="you@example.com" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <MarketingInput label="Clinic name" placeholder="Your clinic" />
                <MarketingInput label="What can we help with?" placeholder="Book a demo" />
              </div>
              <label className="grid gap-2 text-sm font-semibold text-[#142033]">
                Message
                <textarea
                  className="min-h-36 rounded-[8px] border border-[#dbe5f2] bg-[#fbfdff] px-4 py-3 text-sm font-medium text-[#142033] outline-none focus:border-[#3b82f6] focus:ring-3 focus:ring-[#3b82f6]/15"
                  placeholder="Tell us about your clinic and what you need."
                />
              </label>
              <a
                href="mailto:support@clinicare-vela.space?subject=Vela%20demo%20request"
                className="inline-flex h-12 items-center justify-center rounded-[8px] bg-[#3b82f6] px-5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(59,130,246,0.24)] hover:bg-[#2563eb]"
              >
                Send message
                <ArrowRight className="ml-2 size-4" />
              </a>
            </form>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function PrimaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-12 items-center justify-center rounded-[8px] bg-[#3b82f6] px-6 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(59,130,246,0.24)] hover:bg-[#2563eb]">
      {children}
      <ArrowRight className="ml-2 size-4" />
    </Link>
  );
}

function SecondaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-12 items-center justify-center rounded-[8px] border border-[#dbe5f2] bg-white px-6 text-sm font-semibold text-[#142033] shadow-[0_10px_24px_rgba(20,32,51,0.04)] hover:border-[#b8c8dd]">
      {children}
    </Link>
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
      <section className="w-screen max-w-[100vw] overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#eef5ff_100%)] px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-4xl">
        <h1 className="mx-auto max-w-[22rem] text-4xl font-semibold leading-tight tracking-[-0.04em] text-[#101820] sm:max-w-4xl sm:text-6xl">
          {title}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-8 text-[#607089] sm:text-lg">
          {copy}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row [&>a]:w-full sm:[&>a]:w-auto">
          <PrimaryCta href={primaryHref}>{primaryLabel}</PrimaryCta>
          <SecondaryCta href={secondaryHref}>{secondaryLabel}</SecondaryCta>
        </div>
      </div>
    </section>
  );
}

function SectionIntro({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <h2 className="text-4xl font-semibold leading-tight tracking-[-0.035em] text-[#101820] sm:text-5xl">{title}</h2>
      <p className="mt-5 text-base font-medium leading-8 text-[#607089]">{copy}</p>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, copy }: { icon: ElementType; title: string; copy: string }) {
  return (
    <article className="rounded-[8px] border border-[#dbe5f2] bg-white p-6 shadow-[0_18px_50px_rgba(20,32,51,0.05)]">
      <div className="grid size-12 place-items-center rounded-[8px] bg-[#eef5ff] text-[#3b82f6]">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em] text-[#101820]">{title}</h3>
      <p className="mt-3 text-sm font-medium leading-7 text-[#607089]">{copy}</p>
    </article>
  );
}

function ProductDashboardMockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`w-full min-w-0 max-w-full overflow-hidden rounded-[8px] border border-[#dbe5f2] bg-white p-3 shadow-[0_28px_80px_rgba(20,32,51,0.1)] ${compact ? "" : "lg:mt-4"}`}>
      <div className="flex h-10 items-center gap-2 border-b border-[#edf2f8] px-2">
        <span className="grid size-6 place-items-center rounded-[6px] bg-[#3b82f6] text-xs font-bold text-white">V</span>
        <span className="text-xs font-semibold text-[#142033]">Vela dashboard</span>
        <span className="ml-auto hidden h-7 w-44 rounded-[6px] bg-[#f5f8fc] sm:block" />
      </div>
      <div className="grid gap-3 pt-3 sm:grid-cols-[140px_1fr]">
        <aside className="hidden rounded-[8px] bg-[#f5f8fc] p-3 text-xs font-semibold text-[#607089] sm:block">
          {["Dashboard", "Calendar", "Clients", "Inbox", "Reports"].map((item, index) => (
            <div key={item} className={`rounded-[6px] px-3 py-2 ${index === 0 ? "bg-[#eef5ff] text-[#3b82f6]" : ""}`}>{item}</div>
          ))}
        </aside>
        <div className="min-w-0">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Today", "24", "+12%"],
              ["New clients", "5", "+25%"],
              ["Revenue", "$2,450", "+10%"],
              ["No-shows", "6%", "-4%"],
            ].map(([label, value, change]) => (
              <div key={label} className="rounded-[8px] border border-[#edf2f8] p-3">
                <p className="text-[11px] font-semibold text-[#607089]">{label}</p>
                <p className="mt-1 text-xl font-semibold text-[#101820]">{value}</p>
                <p className="text-[11px] font-semibold text-[#2f9c77]">{change}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_0.8fr]">
            <div className="rounded-[8px] border border-[#edf2f8] p-4">
              <p className="text-sm font-semibold text-[#101820]">Today&apos;s schedule</p>
              <div className="mt-3 space-y-2">
                {["09:00 Sofia Martinez", "10:30 Liam Johnson", "13:00 Emma Davis", "14:00 Noah Smith"].map((item) => (
                  <div key={item} className="flex items-center justify-between rounded-[6px] bg-[#f8fbff] px-3 py-2 text-xs font-semibold text-[#607089]">
                    <span>{item}</span>
                    <span className="text-[#3b82f6]">Confirmed</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[8px] border border-[#edf2f8] p-4">
              <p className="text-sm font-semibold text-[#101820]">AI snapshot</p>
              <div className="mt-4 flex items-center gap-4">
                <div className="grid size-18 place-items-center rounded-full border-[6px] border-[#3b82f6] text-xl font-semibold text-[#3b82f6]">86</div>
                <p className="text-xs font-medium leading-5 text-[#607089]">Completion is up. Protect morning capacity and follow up inactive clients.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PatientRecordMockup() {
  return (
    <div className="rounded-[8px] border border-[#dbe5f2] bg-white p-5 shadow-[0_24px_70px_rgba(20,32,51,0.06)]">
      <div className="flex flex-col gap-4 border-b border-[#edf2f8] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-full bg-[#eef5ff] text-sm font-semibold text-[#3b82f6]">SM</div>
          <div>
            <p className="text-lg font-semibold text-[#101820]">Sofia Martinez</p>
            <p className="text-sm font-medium text-[#607089]">Returning patient</p>
          </div>
        </div>
        <PrimaryCta href="/sign-up">Create record</PrimaryCta>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <MiniMetric icon={ClipboardList} label="Past visits" value="8" />
        <MiniMetric icon={FileImage} label="Files & scans" value="14" />
        <MiniMetric icon={CreditCard} label="Balance" value="$0" />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[8px] border border-[#edf2f8] p-4">
          <p className="text-sm font-semibold text-[#101820]">Medical info</p>
          <p className="mt-3 text-sm font-medium leading-7 text-[#607089]">Allergies, medication, important notes, previous treatments, and treatment plan.</p>
        </div>
        <div className="rounded-[8px] border border-[#edf2f8] p-4">
          <p className="text-sm font-semibold text-[#101820]">Recent activity</p>
          <p className="mt-3 text-sm font-medium leading-7 text-[#607089]">Last visit completed, payment recorded, reminder sent through WhatsApp.</p>
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ icon: Icon, label, value }: { icon: ElementType; label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[#edf2f8] bg-[#fbfdff] p-4">
      <Icon className="size-5 text-[#3b82f6]" />
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#607089]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#101820]">{value}</p>
    </div>
  );
}

function WorkflowPanel({ icon: Icon, title, items }: { icon: ElementType; title: string; items: string[] }) {
  return (
    <article className="rounded-[8px] border border-[#dbe5f2] bg-white p-6 shadow-[0_18px_50px_rgba(20,32,51,0.05)]">
      <Icon className="size-7 text-[#3b82f6]" />
      <h2 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-[#101820]">{title}</h2>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item} className="flex gap-3 text-sm font-medium leading-7 text-[#607089]">
            <CheckCircle2 className="mt-1 size-4 shrink-0 text-[#3b82f6]" />
            {item}
          </div>
        ))}
      </div>
    </article>
  );
}

function PlanCard({ name, price, description, features, highlighted = false }: { name: string; price: string; description: string; features: string[]; highlighted?: boolean }) {
  return (
    <article className={`rounded-[8px] border bg-white p-6 shadow-[0_24px_70px_rgba(20,32,51,0.06)] ${highlighted ? "border-[#3b82f6]" : "border-[#dbe5f2]"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[#101820]">{name}</h2>
          <p className="mt-3 text-sm font-medium leading-7 text-[#607089]">{description}</p>
        </div>
        {highlighted ? <span className="rounded-[8px] bg-[#eef5ff] px-3 py-1 text-xs font-semibold text-[#3b82f6]">Popular</span> : null}
      </div>
      <div className="mt-8 flex items-end gap-2">
        <span className="text-5xl font-semibold tracking-[-0.05em] text-[#101820]">{price}</span>
        <span className="pb-2 text-sm font-medium text-[#607089]">/month</span>
      </div>
      <PrimaryCta href="/sign-up">Get started</PrimaryCta>
      <div className="mt-6 space-y-3 border-t border-[#edf2f8] pt-6">
        {features.map((feature) => (
          <div key={feature} className="flex gap-3 text-sm font-medium leading-7 text-[#607089]">
            <CheckCircle2 className="mt-1 size-4 shrink-0 text-[#3b82f6]" />
            {feature}
          </div>
        ))}
      </div>
    </article>
  );
}

function InfoPanel({ icon: Icon, title, items }: { icon: ElementType; title: string; items: string[] }) {
  return (
    <article className="rounded-[8px] border border-[#dbe5f2] bg-white p-6 shadow-[0_18px_50px_rgba(20,32,51,0.05)]">
      <Icon className="size-7 text-[#3b82f6]" />
      <h2 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-[#101820]">{title}</h2>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <p key={item} className="text-sm font-medium leading-7 text-[#607089]">{item}</p>
        ))}
      </div>
    </article>
  );
}

function LegalLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-[8px] border border-[#edf2f8] px-4 py-3 text-sm font-semibold text-[#142033] hover:border-[#3b82f6] hover:text-[#3b82f6]">
      {label}
      <ArrowRight className="size-4" />
    </Link>
  );
}

function ContactMethod({ icon: Icon, title, copy }: { icon: ElementType; title: string; copy: string }) {
  return (
    <div className="flex gap-4 rounded-[8px] border border-[#dbe5f2] bg-white p-4">
      <div className="grid size-11 shrink-0 place-items-center rounded-[8px] bg-[#eef5ff] text-[#3b82f6]">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-[#101820]">{title}</p>
        <p className="mt-1 text-sm font-medium leading-6 text-[#607089]">{copy}</p>
      </div>
    </div>
  );
}

function MarketingInput({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#142033]">
      {label}
      <input
        className="h-12 rounded-[8px] border border-[#dbe5f2] bg-[#fbfdff] px-4 text-sm font-medium text-[#142033] outline-none focus:border-[#3b82f6] focus:ring-3 focus:ring-[#3b82f6]/15"
        placeholder={placeholder}
      />
    </label>
  );
}

function CtaBand() {
  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 rounded-[8px] border border-[#cfe0f7] bg-[#eef5ff] p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-[#101820]">Start with one cleaner clinic workspace.</h2>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-[#607089]">Use Vela to centralize appointments, clients, communication, and reporting before daily admin gets scattered.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <PrimaryCta href="/sign-up">Get started</PrimaryCta>
          <SecondaryCta href="/contact">Contact us</SecondaryCta>
        </div>
      </div>
    </section>
  );
}

function MarketingFooter() {
  return (
    <footer className="border-t border-[#dce6f2] bg-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_auto] lg:px-8">
        <div>
          <BrandMark href="/" includeSubtitle={false} />
          <p className="mt-3 max-w-md text-sm font-medium leading-7 text-[#607089]">
            Modern clinic operations for appointments, clients, communication, payments, and AI-assisted reports.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-[#607089] lg:justify-end">
          {footerLinks.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-[#3b82f6]">
              {item.label}
            </Link>
          ))}
        </div>
        <p className="text-xs font-medium text-[#7b8ca4] lg:col-span-2">(c) 2026 Vela. All rights reserved.</p>
      </div>
    </footer>
  );
}
