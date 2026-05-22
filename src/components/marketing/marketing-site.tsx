import Image from "next/image";
import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Mail,
  MessageCircle,
  Phone,
  Sparkles,
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
  hero: "/marketing/vela-hero-clarity.png",
  calendar: "/marketing/vela-calendar-clarity.png",
  clients: "/marketing/vela-clients-confidence.png",
  reports: "/marketing/vela-reports-action.png",
};

const productPillars = [
  {
    icon: CalendarDays,
    title: "Scheduling clarity",
    copy: "See the day, week, and month without digging through separate booking tools.",
  },
  {
    icon: UsersRound,
    title: "Client continuity",
    copy: "Keep profiles, visit history, images, notes, messages, and payments attached to the patient.",
  },
  {
    icon: BarChart3,
    title: "Operational intelligence",
    copy: "Turn activity into diagnosis, trends, and the next move for the clinic.",
  },
];

const workflowSteps = [
  "Create the patient profile",
  "Book the appointment and staff member",
  "Record service, payment, notes, and files",
  "Follow up with context",
  "Review what needs attention",
];

const comparisonRows = [
  ["Appointments and calendar", "Included", "Included"],
  ["Patient record timeline", "Included", "Included"],
  ["Documents, scans, and images", "Included", "Included"],
  ["WhatsApp-ready inbox", "Included", "Included"],
  ["Reports and diagnosis", "Basic", "Advanced"],
  ["Staff performance view", "Limited", "Full"],
  ["Setup support", "Standard", "Priority"],
];

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
            Login
          </Link>
          <Link
            href="/sign-up"
            className="vela-gradient inline-flex h-10 items-center rounded-[0.75rem] px-3 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(150,118,247,0.26)] transition hover:-translate-y-0.5 sm:px-4"
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
      <LogoStrip />
      <WorkflowSection />
      <FeatureImageSection
        image={marketingImages.calendar}
        title="Stay on schedule with total clarity"
        copy="Vela keeps bookings, staff, open slots, and changes visible so the clinic day stays under control."
        points={["Day, week, and month views", "Quick rescheduling", "Color-coded appointments", "Real-time visibility"]}
        ctaHref="/product"
        ctaLabel="Explore scheduling"
      />
      <FeatureImageSection
        image={marketingImages.clients}
        title="Manage every client relationship with confidence"
        copy="Profiles are built for real clinic history: visits, notes, images, documents, reminders, messages, and payments."
        points={["Complete patient overview", "Visit and payment history", "Documents and scans", "Follow-up context"]}
        imageFirst
        ctaHref="/product"
        ctaLabel="See patient records"
      />
      <FeatureImageSection
        image={marketingImages.reports}
        title="Turn clinic data into action"
        copy="Reports show what is happening, why it matters, and which action helps the clinic improve next."
        points={["Daily, weekly, monthly views", "Clear KPIs", "AI-assisted diagnosis", "Rule-based fallback states"]}
        ctaHref="/product"
        ctaLabel="View reporting"
      />
      <PlatformSection />
      <CtaBand />
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
        primaryLabel="Get started"
        secondaryHref="/pricing"
        secondaryLabel="View pricing"
      />
      <section className="px-4 pb-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
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
        primaryLabel="Get started"
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
        primaryLabel="Get started"
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
              <ContactMethod icon={CalendarDays} title="Book a demo" copy="Walk through scheduling, records, and reports." />
              <ContactMethod icon={Mail} title="Email us" copy="hello@vela.app" />
              <ContactMethod icon={Phone} title="Call us" copy="+1 (555) 123-4567" />
              <ContactMethod icon={MessageCircle} title="Live chat" copy="Available during weekday business hours." />
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
    <section className="relative overflow-hidden px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(150,118,247,0.16),transparent_36%),radial-gradient(circle_at_82%_14%,rgba(109,195,213,0.16),transparent_32%),linear-gradient(180deg,#ffffff_0%,#f2f7ff_100%)]" />
      <div className="absolute left-1/2 top-24 h-40 w-[34rem] -translate-x-1/2 rounded-full bg-[#8b5cf6]/18 blur-3xl" />
      <div className="relative mx-auto max-w-7xl text-center">
        <h1 className="mx-auto max-w-5xl text-[3.05rem] font-semibold leading-[0.92] text-[var(--brand-ink)] sm:text-7xl lg:text-8xl">
          Run your clinic with <span className="vela-gradient-text">clarity</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
          Vela keeps appointments, clients, staff, messages, payments, documents, and reports organized for better care and calmer operations.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="vela-gradient inline-flex h-12 items-center justify-center gap-2 rounded-[0.85rem] px-6 text-sm font-bold text-white shadow-[0_18px_44px_rgba(150,118,247,0.28)] transition hover:-translate-y-0.5"
          >
            Get started
            <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/product"
            className="inline-flex h-12 items-center justify-center rounded-[0.85rem] border border-border/80 bg-white px-6 text-sm font-bold text-foreground shadow-[0_14px_36px_rgba(20,21,47,0.05)] transition hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary"
          >
            See product
          </Link>
        </div>
        <div className="landing-card-pop mx-auto mt-10 max-w-6xl">
          <ImageCard src={marketingImages.hero} alt="Vela clinic dashboard product scene" priority hero />
        </div>
      </div>
    </section>
  );
}

function LogoStrip() {
  return (
    <section className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-3 rounded-[1.1rem] border border-border/80 bg-white/82 p-4 shadow-[0_24px_70px_rgba(20,21,47,0.06)] sm:grid-cols-3">
        {productPillars.map((pillar) => (
          <PillarCard key={pillar.title} {...pillar} compact />
        ))}
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
            {workflowSteps.map((step, index) => (
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

function FeatureImageSection({
  image,
  title,
  copy,
  points,
  ctaHref,
  ctaLabel,
  imageFirst = false,
}: {
  image: string;
  title: string;
  copy: string;
  points: string[];
  ctaHref: string;
  ctaLabel: string;
  imageFirst?: boolean;
}) {
  return (
    <section className="px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <div className={imageFirst ? "lg:order-2" : ""}>
          <h2 className="text-4xl font-semibold leading-[0.98] text-[var(--brand-ink)] sm:text-6xl">
            {title}
          </h2>
          <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground">{copy}</p>
          <div className="mt-7 grid gap-3">
            {points.map((point) => (
              <CheckLine key={point}>{point}</CheckLine>
            ))}
          </div>
          <Link
            href={ctaHref}
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-[0.85rem] bg-white px-5 text-sm font-bold text-primary shadow-[inset_0_0_0_1px_hsl(var(--border)),0_16px_40px_rgba(20,21,47,0.06)] transition hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_rgba(150,118,247,0.55),0_18px_48px_rgba(150,118,247,0.12)]"
          >
            {ctaLabel}
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className={imageFirst ? "lg:order-1" : ""}>
          <ImageCard src={image} alt={`${title} Vela product scene`} />
        </div>
      </div>
    </section>
  );
}

function PlatformSection() {
  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[1.75rem] bg-[var(--brand-ink)] p-6 text-white shadow-[0_30px_100px_rgba(20,21,47,0.22)] sm:p-8 lg:p-10">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <h2 className="text-4xl font-semibold leading-[0.98] sm:text-6xl">
              One workspace. Every clinic signal.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-white/72">
              Vela connects care delivery with operational awareness: what is booked, who needs follow-up, where capacity is open, and what improved.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DarkCard icon={CalendarDays} title="Bookings" copy="Schedule, reschedule, and complete appointments." />
            <DarkCard icon={UsersRound} title="Patients" copy="Keep records, media, messages, and payments together." />
            <DarkCard icon={MessageCircle} title="Follow-up" copy="Stay close to clients with WhatsApp-ready context." />
            <DarkCard icon={Sparkles} title="Insights" copy="Read the clinic clearly with AI-assisted reports." />
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
      copy: "See performance, diagnosis, and next actions in one readout.",
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
    <article className={compact ? "flex gap-3 rounded-[0.9rem] p-4" : "rounded-[1.1rem] border border-border/80 bg-white p-5 shadow-[0_18px_54px_rgba(20,21,47,0.05)]"}>
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

function DarkCard({ icon: Icon, title, copy }: { icon: ElementType; title: string; copy: string }) {
  return (
    <article className="rounded-[18px] border border-white/10 bg-white/[0.06] p-5">
      <span className="flex size-10 items-center justify-center rounded-[0.85rem] bg-white/10 text-white">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-4 text-lg font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/72">{copy}</p>
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
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">Centralize appointment, client, communication, media, payment, and reporting work.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className="inline-flex h-11 items-center justify-center rounded-[0.85rem] bg-white px-5 text-sm font-bold text-primary transition hover:bg-white/90">
            Get started
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
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">Modern clinic operations for appointments, clients, communication, payments, and AI-assisted reports.</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-muted-foreground">
          {footerLinks.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-primary">
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-8 max-w-7xl text-xs font-semibold text-muted-foreground">© 2026 Vela. All rights reserved.</div>
    </footer>
  );
}
