import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
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

const footerLinks = [
  ...navItems,
  { label: "Terms", href: "/terms-and-conditions" },
  { label: "Privacy", href: "/privacy" },
  { label: "Refund", href: "/refund" },
];

const pillars = [
  {
    icon: CalendarDays,
    title: "All-in-one platform",
    copy: "Calendar, clients, staff, reminders, payments, files, and reports stay in one operating system.",
  },
  {
    icon: Sparkles,
    title: "AI-powered insights",
    copy: "Reports explain demand, utilization, completion, follow-up, and the next best actions.",
  },
  {
    icon: MessageCircle,
    title: "Automated reminders",
    copy: "Keep WhatsApp-ready communication close to bookings and patient records.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by design",
    copy: "Private workspace boundaries and private media flows keep clinic data separated.",
  },
];

const productCards = [
  {
    icon: CalendarDays,
    title: "Calendar",
    copy: "Book, edit, reschedule, cancel, and complete visits from dedicated appointment pages.",
  },
  {
    icon: UsersRound,
    title: "Patient records",
    copy: "Full patient profiles include overview, appointments, medical info, documents, messages, and payments.",
  },
  {
    icon: MessageCircle,
    title: "Messaging",
    copy: "WhatsApp inbox context, unknown-contact conversion, and reminder-ready communication.",
  },
  {
    icon: BarChart3,
    title: "Reports",
    copy: "Daily, weekly, and monthly operational diagnosis with metrics, causes, and recommended moves.",
  },
];

const workflowSteps = [
  "Create or find the patient",
  "Book service, staff, time, and payment",
  "Attach notes, documents, images, or scans",
  "Send reminders and continue messages",
  "Review reports and improve the next week",
];

const pricingRows = [
  ["Appointments", "Calendar and booking pages", "Advanced workflow support"],
  ["Client records", "Overview, history, files, messages", "Deeper medical and payment tracking"],
  ["Staff", "Single staff workspace", "Team visibility and staff performance"],
  ["Reports", "Core metrics and fallback rules", "Advanced AI diagnosis and playbooks"],
  ["Support", "Standard support", "Priority setup support"],
];

const basicFeatures = [
  "Appointments and calendar",
  "Client records and notes",
  "Documents and images",
  "Payments and invoices",
  "Basic reports",
  "1 staff member",
];

const proFeatures = [
  "Everything in Basic",
  "Up to 10 staff members",
  "Advanced AI reports",
  "Waitlist and workflow support",
  "Custom forms",
  "Priority support",
];

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen w-screen max-w-[100vw] overflow-x-hidden bg-[#f5f9ff] text-[#101820]">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </main>
  );
}

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#d9e5f4] bg-white/92 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <BrandMark href="/" includeSubtitle={false} />
        <nav className="hidden items-center gap-9 text-sm font-semibold text-[#5d6d85] lg:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-[#3b82f6]">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden h-10 items-center rounded-[8px] border border-[#d7e2f0] bg-white px-4 text-sm font-semibold text-[#101820] hover:border-[#a9bfda] sm:inline-flex"
          >
            Login
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-10 items-center rounded-[8px] bg-[#3b82f6] px-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(59,130,246,0.22)] hover:bg-[#2563eb] sm:px-4"
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
      <section className="bg-[linear-gradient(180deg,#ffffff_0%,#edf5ff_100%)]">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8 lg:py-22">
          <div className="self-center text-center lg:text-left">
            <h1 className="mx-auto max-w-[22rem] text-4xl font-semibold leading-[1.04] tracking-[-0.04em] text-[#101820] sm:max-w-3xl sm:text-6xl lg:mx-0">
              Run your clinic. Deliver exceptional care.
            </h1>
            <p className="mx-auto mt-6 max-w-[24rem] text-base font-medium leading-8 text-[#607089] lg:mx-0">
              Vela is the all-in-one operating system for clinics and appointment-based businesses. Manage appointments, clients, staff, reminders, payments, documents, and AI insights from one beautiful workspace.
            </p>
            <div className="mx-auto mt-8 flex max-w-[24rem] flex-col gap-3 sm:flex-row lg:mx-0 [&>a]:w-full sm:[&>a]:w-auto">
              <PrimaryCta href="/sign-up">Get started</PrimaryCta>
              <SecondaryCta href="/login">Login</SecondaryCta>
            </div>
            <div className="mt-8 grid gap-3 text-sm font-semibold text-[#607089] sm:grid-cols-3 lg:max-w-xl">
              {["No setup fees", "Cancel anytime", "Secure and private"].map((item) => (
                <div key={item} className="flex items-center justify-center gap-2 lg:justify-start">
                  <CheckCircle2 className="size-4 text-[#3b82f6]" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <HeroProductImage />
        </div>
      </section>

      <section className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-[8px] border border-[#d7e2f0] bg-white p-5 shadow-[0_18px_55px_rgba(20,32,51,0.05)]">
          <p className="text-center text-sm font-semibold text-[#101820]">
            Trusted by modern clinics to save time and grow
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {pillars.map((pillar) => (
              <CompactProof key={pillar.title} {...pillar} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.72fr_1fr] lg:items-center">
          <div>
            <h2 className="max-w-xl text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
              Everything connected. Everything in sync.
            </h2>
            <p className="mt-5 max-w-xl text-base font-medium leading-8 text-[#607089]">
              From booking to payment, Vela keeps your clinic running smoothly so your team can focus on what matters most: patients.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[0.8fr_1fr] sm:items-center">
            <PhoneCalendarImage />
            <div className="space-y-4">
              <MessageCard />
              <ReportMiniImage />
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            title="One platform. Every part of your clinic."
            copy="The app now uses dedicated pages for bookings, patients, staff, reports, messages, and settings, so each workflow is easier to scan and faster to complete."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {productCards.map((card) => (
              <FeatureCard key={card.title} {...card} />
            ))}
          </div>
        </div>
      </section>

      <WorkflowSection />
      <CtaBand />
    </MarketingShell>
  );
}

export function ProductPage() {
  return (
    <MarketingShell>
      <PageHero
        title="Built for how clinics work"
        copy="Vela connects the daily front desk workflow with the deeper patient record, so scheduling, care context, files, payments, messages, and reporting stay aligned."
        primaryHref="/sign-up"
        primaryLabel="Get started"
        secondaryHref="/pricing"
        secondaryLabel="View pricing"
      />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <CalendarScreenshot />
          <ProductNarrative
            title="Smart scheduling that saves time"
            copy="Book a visit, assign the right staff member, protect operating hours, record payment context, and edit from a full appointment page."
            points={["Drag-free structured booking", "Staff availability and working hours", "Cancel, reschedule, or complete appointments", "Completed work flows into patient and staff history"]}
          />
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-3">
          <ProductFeatureImage title="Complete patient records" icon={UsersRound}>
            <PatientRecordImage />
          </ProductFeatureImage>
          <ProductFeatureImage title="Stay in touch effortlessly" icon={MessageCircle}>
            <InboxImage />
          </ProductFeatureImage>
          <ProductFeatureImage title="AI reports that drive growth" icon={BarChart3}>
            <ReportsImage />
          </ProductFeatureImage>
        </div>
      </section>

      <WorkflowSection />
      <CtaBand />
    </MarketingShell>
  );
}

export function PricingPageContent() {
  return (
    <MarketingShell>
      <PageHero
        title="Simple pricing. No surprises."
        copy="Choose the plan that fits your clinic today. Upgrade when your team needs stronger automation, staff visibility, and advanced reports."
        primaryHref="/sign-up"
        primaryLabel="Get started"
        secondaryHref="/contact"
        secondaryLabel="Contact sales"
      />
      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
          <PlanCard
            name="Basic"
            price="$39"
            description="Perfect for solo practitioners and small clinics."
            features={basicFeatures}
          />
          <PlanCard
            name="Pro"
            price="$79"
            description="For growing clinics that need more power and insight."
            features={proFeatures}
            highlighted
          />
        </div>
        <div className="mx-auto mt-10 max-w-6xl overflow-hidden rounded-[8px] border border-[#d7e2f0] bg-white shadow-[0_18px_55px_rgba(20,32,51,0.05)]">
          <div className="grid grid-cols-[1.1fr_0.9fr_0.9fr] bg-[#f7fbff] px-4 py-4 text-sm font-semibold text-[#101820] sm:px-6">
            <span>Compare plans</span>
            <span className="text-center">Basic</span>
            <span className="text-center">Pro</span>
          </div>
          {pricingRows.map(([feature, basic, pro]) => (
            <div key={feature} className="grid grid-cols-[1.1fr_0.9fr_0.9fr] border-t border-[#e7eef8] px-4 py-4 text-sm sm:px-6">
              <span className="font-semibold text-[#101820]">{feature}</span>
              <span className="text-center text-[#607089]">{basic}</span>
              <span className="text-center text-[#3b82f6]">{pro}</span>
            </div>
          ))}
        </div>
      </section>
      <CtaBand />
    </MarketingShell>
  );
}

export function AboutPage() {
  return (
    <MarketingShell>
      <section className="bg-[linear-gradient(180deg,#ffffff_0%,#edf5ff_100%)] px-4 py-16 sm:px-6 lg:px-8 lg:py-22">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3b82f6]">About Vela</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-6xl">
              Our mission is simple: help clinics deliver better care.
            </h1>
            <p className="mt-5 max-w-xl text-base font-medium leading-8 text-[#607089]">
              Vela was built by people who understand clinics. Our goal is to remove the busywork, organize the record, and help owners understand what to improve next.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatBlock value="1000+" label="Client records supported" />
            <StatBlock value="98%" label="Target customer satisfaction" />
            <StatBlock value="30+" label="Clinic workflow areas" />
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1fr_1fr_0.72fr]">
          <InfoPanel
            icon={HeartPulse}
            title="Why clinics choose Vela"
            items={["All-in-one platform built for clinics", "Patient records that connect with bookings", "Reports that explain what to improve", "Fast, friendly support"]}
          />
          <InfoPanel
            icon={ShieldCheck}
            title="Security you can trust"
            items={["Clinic data is scoped to its workspace", "Private media access controls", "Protected application routes", "Clear privacy and refund policies"]}
          />
          <div className="rounded-[8px] border border-[#d7e2f0] bg-white p-6 shadow-[0_18px_55px_rgba(20,32,51,0.05)]">
            <h2 className="text-xl font-semibold">Legal</h2>
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
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.72fr_1fr_0.48fr]">
          <div>
            <h1 className="text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl">
              Get in touch
            </h1>
            <p className="mt-5 text-base font-medium leading-8 text-[#607089]">
              Have questions or want to see Vela in action? We would love to hear from you.
            </p>
            <div className="mt-8 grid gap-4">
              <ContactMethod icon={CalendarDays} title="Book a demo" copy="See Vela live with your workflow." />
              <ContactMethod icon={Mail} title="Email us" copy="support@clinicare-vela.space" />
              <ContactMethod icon={Phone} title="Support hours" copy="Available during business hours." />
            </div>
          </div>
          <ContactForm />
          <DemoCard />
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
    <Link href={href} className="inline-flex h-12 items-center justify-center rounded-[8px] border border-[#d7e2f0] bg-white px-6 text-sm font-semibold text-[#101820] shadow-[0_10px_24px_rgba(20,32,51,0.04)] hover:border-[#a9bfda]">
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
    <section className="bg-[linear-gradient(180deg,#ffffff_0%,#edf5ff_100%)] px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-22">
      <div className="mx-auto max-w-4xl">
        <h1 className="mx-auto max-w-[24rem] text-4xl font-semibold leading-tight tracking-[-0.04em] sm:max-w-4xl sm:text-6xl">
          {title}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-8 text-[#607089]">
          {copy}
        </p>
        <div className="mx-auto mt-8 flex max-w-[24rem] flex-col justify-center gap-3 sm:max-w-none sm:flex-row [&>a]:w-full sm:[&>a]:w-auto">
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
      <h2 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">{title}</h2>
      <p className="mt-5 text-base font-medium leading-8 text-[#607089]">{copy}</p>
    </div>
  );
}

function HeroProductImage() {
  return (
    <div className="relative">
      <DashboardScreenshot />
      <div className="mt-4 grid gap-4 lg:absolute lg:-bottom-10 lg:left-10 lg:right-8 lg:grid-cols-[0.72fr_0.58fr]">
        <MiniScheduleImage />
        <MiniAiImage />
      </div>
    </div>
  );
}

function ScreenshotFrame({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-[8px] border border-[#cfddec] bg-white shadow-[0_26px_80px_rgba(20,32,51,0.1)] ${className ?? ""}`}>
      <div className="flex h-10 items-center gap-2 border-b border-[#e7eef8] bg-white px-3">
        <span className="grid size-6 place-items-center rounded-[6px] bg-[#3b82f6] text-xs font-bold text-white">V</span>
        <span className="text-xs font-semibold text-[#101820]">{title}</span>
        <span className="ml-auto hidden h-6 w-40 rounded-[6px] bg-[#f4f7fb] sm:block" />
      </div>
      {children}
    </div>
  );
}

function DashboardScreenshot() {
  return (
    <ScreenshotFrame title="Vela dashboard">
      <div className="grid min-h-[360px] gap-3 bg-[#fbfdff] p-3 sm:grid-cols-[138px_1fr]">
        <ProductSidebar active="Dashboard" />
        <div className="min-w-0">
          <div className="mb-4">
            <p className="text-xs font-medium text-[#607089]">Here&apos;s what is happening today.</p>
            <h3 className="text-xl font-semibold">Good morning, Dr. Alex</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <MetricTile label="Today&apos;s appointments" value="24" change="+12%" />
            <MetricTile label="New clients" value="5" change="+25%" />
            <MetricTile label="Revenue" value="$2,450" change="+10%" />
            <MetricTile label="No-show rate" value="6%" change="-4%" />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.8fr]">
            <div className="rounded-[8px] border border-[#e7eef8] bg-white p-4">
              <p className="text-sm font-semibold">Today&apos;s schedule</p>
              <div className="mt-3 space-y-2">
                {["09:00 Sofia Martinez", "10:30 Liam Johnson", "13:00 Emma Davis", "14:00 Noah Smith"].map((item, index) => (
                  <div key={item} className="flex items-center justify-between rounded-[6px] bg-[#f7fbff] px-3 py-2 text-xs">
                    <span className="font-medium text-[#607089]">{item}</span>
                    <span className={index === 3 ? "text-[#3b82f6]" : "text-[#1f9d72]"}>{index === 3 ? "Checked in" : "Confirmed"}</span>
                  </div>
                ))}
              </div>
              <Link href="/product" className="mt-4 inline-flex items-center text-xs font-semibold text-[#3b82f6]">
                View full calendar <ChevronRight className="size-3" />
              </Link>
            </div>
            <div className="rounded-[8px] border border-[#e7eef8] bg-white p-4">
              <p className="text-sm font-semibold">AI snapshot</p>
              <div className="mt-4 flex items-center gap-4">
                <div className="grid size-18 place-items-center rounded-full border-[6px] border-[#3b82f6] text-xl font-semibold text-[#3b82f6]">86</div>
                <div>
                  <p className="text-sm font-semibold">Excellent week</p>
                  <p className="mt-1 text-xs leading-5 text-[#607089]">Completion up 12%. Protect morning capacity.</p>
                </div>
              </div>
              <div className="mt-4 rounded-[6px] bg-[#f7fbff] p-3 text-xs leading-5 text-[#607089]">
                Top recommendation: move three quiet slots into posted hours.
              </div>
            </div>
          </div>
        </div>
      </div>
    </ScreenshotFrame>
  );
}

function ProductSidebar({ active }: { active: string }) {
  return (
    <aside className="hidden rounded-[8px] bg-[#f3f7fc] p-3 text-xs font-semibold text-[#607089] sm:block">
      {["Dashboard", "Calendar", "Clients", "Inbox", "Reports", "Documents", "Staff", "Settings"].map((item) => (
        <div key={item} className={`rounded-[6px] px-3 py-2 ${active === item ? "bg-[#eaf2ff] text-[#3b82f6]" : ""}`}>
          {item}
        </div>
      ))}
    </aside>
  );
}

function MetricTile({ label, value, change }: { label: string; value: string; change: string }) {
  return (
    <div className="rounded-[8px] border border-[#e7eef8] bg-white p-3">
      <p className="text-[11px] font-medium text-[#607089]">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      <p className="text-[11px] font-semibold text-[#1f9d72]">{change} vs yesterday</p>
    </div>
  );
}

function MiniScheduleImage() {
  return (
    <div className="rounded-[8px] border border-[#cfddec] bg-white p-4 shadow-[0_18px_45px_rgba(20,32,51,0.08)]">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-full bg-[#eaf2ff] text-sm font-semibold text-[#3b82f6]">SM</div>
        <div>
          <p className="text-sm font-semibold">Sofia Martinez</p>
          <p className="text-xs font-medium text-[#607089]">Returning patient</p>
        </div>
      </div>
      <div className="mt-4 space-y-2 text-xs font-medium text-[#607089]">
        <p>Last visit: Apr 26, 2026</p>
        <p>Next: Tomorrow, 11:00 AM</p>
      </div>
      <div className="mt-4 rounded-[8px] bg-[#3b82f6] px-3 py-2 text-center text-xs font-semibold text-white">
        Send WhatsApp reminder
      </div>
    </div>
  );
}

function MiniAiImage() {
  return (
    <div className="rounded-[8px] border border-[#cfddec] bg-white p-4 shadow-[0_18px_45px_rgba(20,32,51,0.08)]">
      <p className="text-sm font-semibold">Today&apos;s appointments</p>
      <p className="mt-2 text-4xl font-semibold tracking-[-0.04em]">8</p>
      <p className="text-xs font-semibold text-[#1f9d72]">+20% vs yesterday</p>
      <div className="mt-4 h-14 rounded-[8px] bg-[#edf5ff]">
        <svg viewBox="0 0 180 56" className="h-full w-full text-[#3b82f6]">
          <path d="M10 42 C 35 18, 50 46, 74 25 S 120 18, 170 12" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="5" />
        </svg>
      </div>
    </div>
  );
}

function CompactProof({ icon: Icon, title, copy }: { icon: ElementType; title: string; copy: string }) {
  return (
    <div className="flex gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-[#eaf2ff] text-[#3b82f6]">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs font-medium leading-5 text-[#607089]">{copy}</p>
      </div>
    </div>
  );
}

function PhoneCalendarImage() {
  return (
    <div className="mx-auto w-full max-w-[230px] rounded-[28px] border-[10px] border-[#101820] bg-white p-3 shadow-[0_24px_70px_rgba(20,32,51,0.16)]">
      <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[#d9e5f4]" />
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Calendar</p>
        <span className="rounded-[6px] bg-[#eaf2ff] px-2 py-1 text-[10px] font-semibold text-[#3b82f6]">May</span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[#607089]">
        {["M", "T", "W", "T", "F", "S", "S"].map((day) => (
          <span key={day}>{day}</span>
        ))}
        {Array.from({ length: 28 }).map((_, index) => (
          <span key={index} className={`rounded-[6px] py-1 ${[8, 11, 15].includes(index) ? "bg-[#3b82f6] text-white" : "bg-[#f7fbff]"}`}>
            {index + 1}
          </span>
        ))}
      </div>
      <div className="mt-4 rounded-[8px] bg-[#f7fbff] p-3 text-xs">
        <p className="font-semibold">Sofia Martinez</p>
        <p className="mt-1 text-[#607089]">Consultation - 09:00</p>
      </div>
    </div>
  );
}

function MessageCard() {
  return (
    <div className="rounded-[8px] border border-[#d7e2f0] bg-white p-5 shadow-[0_18px_55px_rgba(20,32,51,0.05)]">
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-[8px] bg-[#dcfce7] text-[#15803d]">
          <MessageCircle className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold">Appointment confirmed</p>
          <p className="text-xs font-medium text-[#607089]">Sofia Martinez - Tomorrow at 09:00 AM</p>
        </div>
      </div>
    </div>
  );
}

function ReportMiniImage() {
  return (
    <div className="rounded-[8px] border border-[#d7e2f0] bg-white p-5 shadow-[0_18px_55px_rgba(20,32,51,0.05)]">
      <p className="text-sm font-semibold">Reports readout</p>
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-4">
        <div className="grid size-16 place-items-center rounded-full border-[6px] border-[#3b82f6] text-lg font-semibold text-[#3b82f6]">91</div>
        <div className="text-xs font-medium leading-5 text-[#607089]">
          Demand is rising. Keep follow-up active and protect your best performing hours.
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, copy }: { icon: ElementType; title: string; copy: string }) {
  return (
    <article className="rounded-[8px] border border-[#d7e2f0] bg-white p-6 shadow-[0_18px_55px_rgba(20,32,51,0.05)]">
      <div className="grid size-12 place-items-center rounded-[8px] bg-[#eaf2ff] text-[#3b82f6]">
        <Icon className="size-6" />
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em]">{title}</h3>
      <p className="mt-3 text-sm font-medium leading-7 text-[#607089]">{copy}</p>
      <Link href="/product" className="mt-5 inline-flex items-center text-sm font-semibold text-[#3b82f6]">
        Learn more <ArrowRight className="ml-2 size-4" />
      </Link>
    </article>
  );
}

function WorkflowSection() {
  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
        <div>
          <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
            From first booking to repeat care.
          </h2>
          <p className="mt-5 max-w-xl text-base font-medium leading-8 text-[#607089]">
            Register the patient once, then let every booking, payment, note, message, document, and scan build the long-term history.
          </p>
          <div className="mt-8 space-y-3">
            {workflowSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-3 rounded-[8px] border border-[#d7e2f0] bg-white px-4 py-3">
                <span className="grid size-8 place-items-center rounded-[8px] bg-[#eaf2ff] text-sm font-semibold text-[#3b82f6]">
                  {index + 1}
                </span>
                <span className="text-sm font-semibold">{step}</span>
              </div>
            ))}
          </div>
        </div>
        <PatientRecordImage />
      </div>
    </section>
  );
}

function CalendarScreenshot() {
  return (
    <ScreenshotFrame title="Calendar">
      <div className="grid gap-4 bg-[#fbfdff] p-4 sm:grid-cols-[84px_1fr]">
        <div className="hidden rounded-[8px] bg-white p-2 shadow-[inset_0_0_0_1px_#e7eef8] sm:block">
          {["", "", "", "", "", ""].map((_, index) => (
            <div key={index} className="mb-2 grid size-8 place-items-center rounded-[6px] bg-[#f7fbff] text-[#607089]">
              <CalendarDays className="size-4" />
            </div>
          ))}
        </div>
        <div className="min-w-0">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">May 12-18, 2026</h3>
            <span className="rounded-[8px] border border-[#d7e2f0] bg-white px-3 py-1 text-xs font-semibold">Week</span>
          </div>
          <div className="grid grid-cols-5 border-l border-t border-[#e7eef8] text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
              <div key={day} className="border-b border-r border-[#e7eef8] bg-white px-2 py-2 text-center font-semibold text-[#607089]">
                {day}
              </div>
            ))}
            {Array.from({ length: 30 }).map((_, index) => (
              <div key={index} className="relative h-14 border-b border-r border-[#e7eef8] bg-white">
                {[2, 8, 13, 17, 24].includes(index) ? (
                  <div className={`absolute inset-x-1 top-2 rounded-[6px] px-2 py-1 text-[10px] font-semibold ${index === 17 ? "bg-[#dff7ef] text-[#11745c]" : "bg-[#eaf2ff] text-[#2766c7]"}`}>
                    {index === 17 ? "Benjamin Lee" : "Client visit"}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </ScreenshotFrame>
  );
}

function ProductNarrative({
  title,
  copy,
  points,
}: {
  title: string;
  copy: string;
  points: string[];
}) {
  return (
    <div>
      <h2 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">{title}</h2>
      <p className="mt-5 text-base font-medium leading-8 text-[#607089]">{copy}</p>
      <div className="mt-6 space-y-3">
        {points.map((point) => (
          <div key={point} className="flex gap-3 text-sm font-semibold text-[#43536a]">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#3b82f6]" />
            {point}
          </div>
        ))}
      </div>
      <Link href="/sign-up" className="mt-8 inline-flex items-center text-sm font-semibold text-[#3b82f6]">
        Learn more about bookings <ArrowRight className="ml-2 size-4" />
      </Link>
    </div>
  );
}

function ProductFeatureImage({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: ElementType;
  children: ReactNode;
}) {
  return (
    <article className="rounded-[8px] border border-[#d7e2f0] bg-white p-5 shadow-[0_18px_55px_rgba(20,32,51,0.05)]">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-[8px] bg-[#eaf2ff] text-[#3b82f6]">
          <Icon className="size-5" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
      <Link href="/sign-up" className="mt-5 inline-flex items-center text-sm font-semibold text-[#3b82f6]">
        Learn more <ArrowRight className="ml-2 size-4" />
      </Link>
    </article>
  );
}

function PatientRecordImage() {
  return (
    <ScreenshotFrame title="Patient details" className="shadow-[0_22px_65px_rgba(20,32,51,0.08)]">
      <div className="bg-[#fbfdff] p-4">
        <div className="rounded-[8px] border border-[#e7eef8] bg-white p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-full bg-[#eaf2ff] font-semibold text-[#3b82f6]">SM</div>
              <div>
                <p className="font-semibold">Sofia Martinez</p>
                <p className="text-xs font-medium text-[#607089]">Returning patient - Active</p>
              </div>
            </div>
            <div className="flex gap-2">
              <span className="rounded-[8px] border border-[#d7e2f0] px-3 py-2 text-xs font-semibold">Edit</span>
              <span className="rounded-[8px] bg-[#3b82f6] px-3 py-2 text-xs font-semibold text-white">Book</span>
            </div>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <MiniMetric icon={ClipboardList} label="Past visits" value="8" />
          <MiniMetric icon={FileImage} label="Files & scans" value="14" />
          <MiniMetric icon={CreditCard} label="Balance" value="$0" />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <PatientPanel title="Medical info" copy="Allergies, current medication, health notes, previous treatments, and treatment plan." />
          <PatientPanel title="Recent activity" copy="Last appointment completed, payment recorded, reminder sent through WhatsApp." />
        </div>
      </div>
    </ScreenshotFrame>
  );
}

function MiniMetric({ icon: Icon, label, value }: { icon: ElementType; label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[#e7eef8] bg-white p-4">
      <Icon className="size-5 text-[#3b82f6]" />
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#607089]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function PatientPanel({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-[8px] border border-[#e7eef8] bg-white p-4">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-xs font-medium leading-5 text-[#607089]">{copy}</p>
    </div>
  );
}

function InboxImage() {
  return (
    <div className="rounded-[8px] border border-[#e7eef8] bg-[#fbfdff] p-3">
      {["Reminder sent", "Client replied", "Follow-up booked"].map((item, index) => (
        <div key={item} className="mb-2 flex items-center gap-3 rounded-[8px] bg-white p-3 last:mb-0">
          <div className={`grid size-9 place-items-center rounded-full ${index === 1 ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#eaf2ff] text-[#3b82f6]"}`}>
            <MessageCircle className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">{item}</p>
            <p className="text-xs text-[#607089]">Linked to Sofia Martinez</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportsImage() {
  return (
    <div className="rounded-[8px] border border-[#e7eef8] bg-[#fbfdff] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">This month readout</p>
        <span className="rounded-[8px] bg-white px-3 py-1 text-xs font-semibold text-[#3b82f6]">88/100</span>
      </div>
      <div className="mt-4 h-24 rounded-[8px] bg-white">
        <svg viewBox="0 0 260 90" className="h-full w-full text-[#3b82f6]">
          <path d="M12 70 C 45 30, 78 55, 106 38 S 160 20, 202 32 S 230 30, 248 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="6" />
        </svg>
      </div>
      <p className="mt-3 text-xs font-medium leading-5 text-[#607089]">
        Diagnosis: schedule utilization is low while completion is strong.
      </p>
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
    <article className={`rounded-[8px] border bg-white p-6 shadow-[0_24px_70px_rgba(20,32,51,0.06)] ${highlighted ? "border-[#3b82f6]" : "border-[#d7e2f0]"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{name}</h2>
          <p className="mt-3 text-sm font-medium leading-7 text-[#607089]">{description}</p>
        </div>
        {highlighted ? (
          <span className="rounded-[8px] bg-[#eaf2ff] px-3 py-1 text-xs font-semibold text-[#3b82f6]">
            Most popular
          </span>
        ) : null}
      </div>
      <div className="mt-8 flex items-end gap-2">
        <span className="text-5xl font-semibold tracking-[-0.05em]">{price}</span>
        <span className="pb-2 text-sm font-medium text-[#607089]">/month</span>
      </div>
      <div className="mt-5">
        <PrimaryCta href="/sign-up">Get started</PrimaryCta>
      </div>
      <div className="mt-6 space-y-3 border-t border-[#e7eef8] pt-6">
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
    <article className="rounded-[8px] border border-[#d7e2f0] bg-white p-6 shadow-[0_18px_55px_rgba(20,32,51,0.05)]">
      <Icon className="size-7 text-[#3b82f6]" />
      <h2 className="mt-5 text-2xl font-semibold tracking-[-0.025em]">{title}</h2>
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

function LegalLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-[8px] border border-[#e7eef8] px-4 py-3 text-sm font-semibold hover:border-[#3b82f6] hover:text-[#3b82f6]">
      {label}
      <ArrowRight className="size-4" />
    </Link>
  );
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[8px] border border-[#d7e2f0] bg-white p-5 text-center shadow-[0_18px_55px_rgba(20,32,51,0.05)]">
      <p className="text-2xl font-semibold text-[#3b82f6]">{value}</p>
      <p className="mt-2 text-xs font-semibold text-[#607089]">{label}</p>
    </div>
  );
}

function ContactMethod({ icon: Icon, title, copy }: { icon: ElementType; title: string; copy: string }) {
  return (
    <div className="flex gap-4 rounded-[8px] border border-[#d7e2f0] bg-white p-4">
      <div className="grid size-11 shrink-0 place-items-center rounded-[8px] bg-[#eaf2ff] text-[#3b82f6]">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm font-medium leading-6 text-[#607089]">{copy}</p>
      </div>
    </div>
  );
}

function ContactForm() {
  return (
    <div className="rounded-[8px] border border-[#d7e2f0] bg-white p-5 shadow-[0_24px_70px_rgba(20,32,51,0.06)] sm:p-8">
      <h2 className="text-2xl font-semibold tracking-[-0.02em]">Send us a message</h2>
      <form className="mt-6 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <MarketingInput label="Full name" placeholder="Your name" />
          <MarketingInput label="Email" placeholder="you@example.com" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <MarketingInput label="Clinic / business name" placeholder="Your clinic name" />
          <MarketingInput label="How can we help?" placeholder="I want to book a demo" />
        </div>
        <label className="grid gap-2 text-sm font-semibold">
          Message
          <textarea
            className="min-h-36 rounded-[8px] border border-[#d7e2f0] bg-[#fbfdff] px-4 py-3 text-sm font-medium outline-none focus:border-[#3b82f6] focus:ring-3 focus:ring-[#3b82f6]/15"
            placeholder="Tell us a bit about your clinic and what you need."
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
  );
}

function DemoCard() {
  return (
    <div className="rounded-[8px] border border-[#d7e2f0] bg-[#eef5ff] p-5">
      <h2 className="text-lg font-semibold text-[#3b82f6]">Book a demo</h2>
      <p className="mt-2 text-sm font-medium leading-7 text-[#607089]">
        Pick a time that works for you and we&apos;ll walk you through Vela.
      </p>
      <Link href="/sign-up" className="mt-5 inline-flex h-10 items-center justify-center rounded-[8px] bg-[#3b82f6] px-4 text-sm font-semibold text-white">
        Schedule demo
      </Link>
      <div className="mt-6 rounded-[8px] bg-white p-4">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span>May 2026</span>
          <span>›</span>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[#607089]">
          {Array.from({ length: 28 }).map((_, index) => (
            <span key={index} className={`rounded-[6px] py-1 ${index === 14 ? "bg-[#3b82f6] text-white" : "bg-[#f7fbff]"}`}>{index + 1}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MarketingInput({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {label}
      <input
        className="h-12 rounded-[8px] border border-[#d7e2f0] bg-[#fbfdff] px-4 text-sm font-medium outline-none focus:border-[#3b82f6] focus:ring-3 focus:ring-[#3b82f6]/15"
        placeholder={placeholder}
      />
    </label>
  );
}

function CtaBand() {
  return (
    <section className="px-4 pb-16 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 rounded-[8px] border border-[#c9daf1] bg-[#eaf2ff] p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.03em]">Join clinics that work smarter, not harder.</h2>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-[#607089]">
            Start with a clean operating system for bookings, patients, messages, payments, and reports.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <PrimaryCta href="/sign-up">Get started free</PrimaryCta>
          <SecondaryCta href="/login">Login</SecondaryCta>
        </div>
      </div>
    </section>
  );
}

function MarketingFooter() {
  return (
    <footer className="border-t border-[#d9e5f4] bg-white">
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
