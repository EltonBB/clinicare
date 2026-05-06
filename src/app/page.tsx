import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  FileImage,
  LockKeyhole,
  MessageSquareText,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  UsersRound,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Vela | Clinic operating system",
  description:
    "Run bookings, clients, staff, WhatsApp reminders, private media, and AI clinic reports from one calm workspace.",
};

const navItems = ["Product", "Workflows", "Reports", "Security", "Pricing"];

const proofPoints = [
  "Built for appointment-led clinics",
  "Private client galleries",
  "WhatsApp-ready workflows",
  "AI reporting with rule fallback",
];

const workflow = [
  {
    title: "Book the visit",
    detail: "Create appointments inside clinic hours, assign staff, and keep today clear.",
    icon: CalendarDays,
  },
  {
    title: "Know the client",
    detail: "See history, notes, messages, and private photos before every appointment.",
    icon: UsersRound,
  },
  {
    title: "Follow up faster",
    detail: "Reply from the inbox and send reminder workflows without exposing providers.",
    icon: MessageSquareText,
  },
  {
    title: "Improve the clinic",
    detail: "Use daily, weekly, and monthly analysis to catch weak spots early.",
    icon: BarChart3,
  },
];

const featureBands = [
  {
    title: "A calendar that protects the day",
    detail:
      "Appointments, clients, staff, operating hours, and completion status stay connected, so the clinic team can trust the schedule.",
    stat: "4 views",
    label: "Schedule control",
    icon: CalendarDays,
  },
  {
    title: "Client records with visual context",
    detail:
      "Keep notes, visit history, message context, and private before/after style gallery images in the same record.",
    stat: "Private",
    label: "Media by clinic",
    icon: FileImage,
  },
  {
    title: "Inbox and reminders in one flow",
    detail:
      "Manage conversations, unread messages, unknown contacts, and reminder templates from the workspace.",
    stat: "Live",
    label: "WhatsApp inbox",
    icon: MessageSquareText,
  },
];

const reportCards = [
  "Schedule utilization",
  "Completion rate",
  "Follow-up coverage",
  "Repeat visits",
  "Staff load",
  "At-risk clients",
];

const securityItems = [
  "Clinic-scoped data access",
  "Private media storage",
  "Short-lived image display URLs",
  "Server-side database access",
  "Protected workspace routes",
  "Customer-safe error states",
];

const faqs = [
  {
    question: "Is Vela only for medical clinics?",
    answer:
      "No. Vela is designed for appointment-based clinics, med spas, beauty clinics, wellness teams, and similar service businesses that need a clean operating workspace.",
  },
  {
    question: "Can a clinic test it before committing?",
    answer:
      "Yes. The primary path is to start free, set up a workspace, add clients, create appointments, and test reports with real clinic-style workflows.",
  },
  {
    question: "Does Vela expose technical provider details?",
    answer:
      "No. The product language stays focused on clinic workflows. Provider complexity stays behind simple states and support-friendly messages.",
  },
];

function CtaButtons({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Link
        href="/sign-up"
        className="group inline-flex h-12 items-center justify-center rounded-[0.9rem] bg-[#e36f54] px-5 text-sm font-extrabold text-white shadow-[0_18px_38px_rgba(227,111,84,0.28)] hover:-translate-y-0.5 hover:bg-[#d86149] focus-visible:ring-3 focus-visible:ring-[#e36f54]/30"
      >
        Start free
        <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <Link
        href={compact ? "/pricing" : "#product-tour"}
        className="inline-flex h-12 items-center justify-center rounded-[0.9rem] border border-[#c8d7dc] bg-white/82 px-5 text-sm font-bold text-[#12303a] shadow-[0_14px_30px_rgba(18,48,58,0.06)] hover:-translate-y-0.5 hover:border-[#8bb7af] hover:bg-white"
      >
        {compact ? "See pricing" : "Watch product tour"}
        {compact ? (
          <ChevronRight className="ml-2 size-4" />
        ) : (
          <Play className="ml-2 size-4 fill-current" />
        )}
      </Link>
    </div>
  );
}

function ProductScene() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(248,251,252,0.95)_0%,rgba(238,247,244,0.72)_44%,rgba(255,246,242,0.72)_100%)]" />
      <div className="absolute left-[5vw] top-28 hidden h-[32rem] w-[48rem] rotate-[-4deg] rounded-[1.4rem] border border-white/80 bg-white/58 shadow-[0_40px_100px_rgba(18,48,58,0.14)] backdrop-blur-md lg:block">
        <div className="flex h-14 items-center gap-2 border-b border-[#d7e4e7]/70 px-5">
          <span className="size-3 rounded-full bg-[#e36f54]" />
          <span className="size-3 rounded-full bg-[#e8bd5f]" />
          <span className="size-3 rounded-full bg-[#45a88a]" />
          <span className="ml-4 text-xs font-bold text-[#67818a]">Clinic dashboard</span>
        </div>
        <div className="grid grid-cols-[170px_1fr] gap-4 p-5">
          <div className="space-y-3">
            {["Dashboard", "Calendar", "Clients", "Reports"].map((item, index) => (
              <div
                key={item}
                className={`rounded-[0.75rem] px-3 py-3 text-xs font-bold ${
                  index === 0 ? "bg-[#eaf7f2] text-[#1c6958]" : "bg-white/66 text-[#6a8088]"
                }`}
              >
                {item}
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Today", "12 visits"],
                ["Completion", "94%"],
                ["Unread", "3"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[0.9rem] bg-white/86 p-4 shadow-sm">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#78909a]">
                    {label}
                  </p>
                  <p className="mt-2 text-xl font-extrabold text-[#12303a]">{value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-[1rem] bg-white/88 p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-extrabold text-[#12303a]">Appointments</p>
                <p className="text-xs font-bold text-[#45a88a]">Open slots protected</p>
              </div>
              <div className="space-y-3">
                {[
                  ["09:30", "Mira Jensen", "Facial follow-up"],
                  ["11:00", "Alex Barta", "Laser consultation"],
                  ["14:15", "Noemi Hart", "Review photos"],
                ].map(([time, name, detail]) => (
                  <div key={time} className="grid grid-cols-[64px_1fr] rounded-[0.8rem] bg-[#f5faf8] p-3">
                    <span className="text-xs font-extrabold text-[#45a88a]">{time}</span>
                    <span>
                      <span className="block text-sm font-extrabold text-[#12303a]">{name}</span>
                      <span className="block text-xs text-[#6f858c]">{detail}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute right-[7vw] top-24 hidden h-[27rem] w-[24rem] rotate-[5deg] rounded-[1.25rem] border border-white/80 bg-white/72 p-5 shadow-[0_34px_90px_rgba(18,48,58,0.13)] backdrop-blur-md md:block">
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold text-[#12303a]">AI readout</p>
          <span className="rounded-full bg-[#fff2ed] px-3 py-1 text-xs font-extrabold text-[#d86149]">
            88/100
          </span>
        </div>
        <div className="mt-5 space-y-3">
          {[
            ["Diagnosis", "Completion is strong; utilization can improve."],
            ["Cause", "Open capacity is not converting into visits."],
            ["Next move", "Reduce no-shows and fill midweek gaps."],
          ].map(([label, detail]) => (
            <div key={label} className="rounded-[0.95rem] border border-[#dce8e8] bg-white/78 p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#78909a]">
                {label}
              </p>
              <p className="mt-2 text-sm font-bold leading-6 text-[#24434b]">{detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7fbfc] text-[#12303a]">
      <section className="relative min-h-[92vh] overflow-hidden">
        <ProductScene />
        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-[0.9rem] bg-[#45a88a] text-sm font-black text-white shadow-[0_16px_34px_rgba(69,168,138,0.24)]">
              V
            </span>
            <span className="text-xl font-black tracking-tight">Vela</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-bold text-[#496670] lg:flex">
            {navItems.map((item) => (
              <Link
                key={item}
                href={item === "Pricing" ? "/pricing" : `#${item.toLowerCase()}`}
                className="hover:text-[#12303a]"
              >
                {item}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden h-10 items-center justify-center rounded-[0.8rem] px-4 text-sm font-extrabold text-[#12303a] hover:bg-white/70 sm:inline-flex"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex h-10 items-center justify-center rounded-[0.8rem] bg-[#12303a] px-4 text-sm font-extrabold text-white shadow-[0_14px_28px_rgba(18,48,58,0.2)] hover:-translate-y-0.5"
            >
              Start free
            </Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto grid min-h-[calc(92vh-5rem)] max-w-7xl content-center px-5 pb-14 pt-16 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(22rem,0.5fr)]">
          <div className="max-w-3xl">
            <h1 className="max-w-4xl text-[clamp(3.2rem,7vw,6.6rem)] font-black leading-[0.93] tracking-[-0.045em] text-[#102b34]">
              Run your clinic from one calm workspace
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#496670] sm:text-xl sm:leading-9">
              Vela brings bookings, clients, staff, WhatsApp reminders, private photos,
              and AI performance reports into one operating system built for clinics.
            </p>
            <div className="mt-9">
              <CtaButtons />
            </div>
            <div className="mt-10 grid max-w-2xl grid-cols-2 gap-3 text-sm font-bold text-[#496670] sm:grid-cols-4">
              {proofPoints.map((point) => (
                <div key={point} className="flex items-center gap-2">
                  <Check className="size-4 text-[#45a88a]" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="border-y border-[#dbe8e8] bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-4">
          {[
            ["Less admin", "Fewer handoffs between calendars, client notes, messages, and reports."],
            ["Better follow-up", "Messages and reminders stay connected to the client relationship."],
            ["Clearer decisions", "AI and rule-based snapshots explain what changed and what to do next."],
            ["Safer media", "Private clinic media references avoid public gallery links."],
          ].map(([title, detail]) => (
            <div key={title} className="landing-reveal">
              <p className="text-xl font-black text-[#102b34]">{title}</p>
              <p className="mt-3 text-sm leading-6 text-[#5b737b]">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="workflows" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.75fr_1fr] lg:items-start">
          <div className="sticky top-8">
            <h2 className="text-4xl font-black tracking-[-0.04em] text-[#102b34] sm:text-5xl">
              The clinic day, connected end to end.
            </h2>
            <p className="mt-5 text-lg leading-8 text-[#5b737b]">
              Vela focuses on the work clinics repeat every day: fill the calendar,
              understand the client, follow up, and improve performance.
            </p>
            <div className="mt-8">
              <CtaButtons compact />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {workflow.map((item, index) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  className="landing-reveal rounded-[1.1rem] border border-[#dbe8e8] bg-white p-6 shadow-[0_22px_52px_rgba(18,48,58,0.06)]"
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  <Icon className="size-6 text-[#45a88a]" />
                  <h3 className="mt-8 text-2xl font-black tracking-[-0.03em]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#5b737b]">{item.detail}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#102b34] py-24 text-white">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.1fr] lg:items-center">
            <div>
              <h2 className="text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                See the exact state of the clinic in seconds.
              </h2>
              <p className="mt-5 text-lg leading-8 text-[#b6c7cb]">
                The workspace is built around real clinic signals, not disconnected feature tabs.
                Each module feeds the next.
              </p>
            </div>
            <div id="product-tour" className="grid gap-4">
              {featureBands.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.title}
                    className="landing-reveal grid gap-5 rounded-[1.1rem] border border-white/12 bg-white/[0.06] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.2)] backdrop-blur md:grid-cols-[88px_1fr_120px]"
                    style={{ animationDelay: `${index * 90}ms` }}
                  >
                    <div className="flex size-14 items-center justify-center rounded-[0.9rem] bg-[#45a88a] text-white">
                      <Icon className="size-6" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black tracking-[-0.03em]">{feature.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-[#c7d6d9]">{feature.detail}</p>
                    </div>
                    <div className="rounded-[0.9rem] bg-white/10 p-4">
                      <p className="text-2xl font-black">{feature.stat}</p>
                      <p className="mt-1 text-xs font-extrabold uppercase tracking-[0.16em] text-[#9eb4b9]">
                        {feature.label}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="reports" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_0.78fr] lg:items-center">
          <div className="rounded-[1.25rem] border border-[#dbe8e8] bg-white p-5 shadow-[0_30px_70px_rgba(18,48,58,0.08)]">
            <div className="grid gap-4 sm:grid-cols-3">
              {reportCards.map((card, index) => (
                <div key={card} className="rounded-[0.9rem] bg-[#f5faf8] p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#6f858c]">
                    {card}
                  </p>
                  <p className="mt-3 text-2xl font-black text-[#102b34]">
                    {["87%", "94%", "72%", "31%", "Balanced", "4"][index]}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-[1rem] bg-[#fff5f0] p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-[#102b34]">This month readout</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-sm font-black text-[#d86149]">
                  <Sparkles className="size-4" /> 88/100
                </span>
              </div>
              <p className="mt-4 text-lg font-black leading-7 text-[#102b34]">
                Strong visit execution, but open capacity is not converting into booked care time.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {["Likely cause", "Next move", "Monitor"].map((label, index) => (
                  <div key={label} className="rounded-[0.8rem] bg-white p-4">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#78909a]">
                      {label}
                    </p>
                    <p className="mt-2 text-sm font-bold leading-6 text-[#496670]">
                      {[
                        "Midweek demand is underused.",
                        "Prompt clients before gaps widen.",
                        "Utilization and follow-up coverage.",
                      ][index]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-4xl font-black tracking-[-0.04em] text-[#102b34] sm:text-5xl">
              Reports that diagnose, not just decorate.
            </h2>
            <p className="mt-5 text-lg leading-8 text-[#5b737b]">
              Daily, weekly, and monthly readouts turn appointments, client activity,
              messages, and staff load into specific next moves.
            </p>
            <div className="mt-8 flex flex-col gap-3">
              {["AI-generated recommendations", "Rule-based fallback when AI is unavailable", "Auditable snapshots for each period"].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm font-extrabold text-[#24434b]">
                  <Check className="size-5 text-[#45a88a]" />
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-9">
              <CtaButtons compact />
            </div>
          </div>
        </div>
      </section>

      <section id="security" className="bg-white py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[0.72fr_1fr] lg:items-center">
          <div>
            <ShieldCheck className="size-10 text-[#45a88a]" />
            <h2 className="mt-6 text-4xl font-black tracking-[-0.04em] text-[#102b34] sm:text-5xl">
              Built to keep each clinic’s workspace separate.
            </h2>
            <p className="mt-5 text-lg leading-8 text-[#5b737b]">
              Vela keeps app data server-side, protects workspace routes, and uses
              private media handling so client photos do not become public links.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {securityItems.map((item, index) => (
              <div
                key={item}
                className="landing-reveal flex items-center gap-3 rounded-[0.95rem] border border-[#dbe8e8] bg-[#f7fbfc] p-4 text-sm font-extrabold text-[#24434b]"
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <LockKeyhole className="size-5 text-[#45a88a]" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <div className="overflow-hidden rounded-[1.35rem] bg-[#12303a] text-white shadow-[0_34px_90px_rgba(18,48,58,0.2)]">
          <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1fr_360px] lg:items-center">
            <div>
              <h2 className="text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                Start with the operating system. Upgrade when the clinic is ready.
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#c5d4d8]">
                Launch the workspace, test the workflows, and move to advanced reporting
                when you want deeper visibility.
              </p>
            </div>
            <div className="rounded-[1rem] bg-white p-6 text-[#102b34]">
              <div className="flex items-center gap-2">
                <Star className="size-5 fill-[#e8bd5f] text-[#e8bd5f]" />
                <p className="text-sm font-black">Launch offer</p>
              </div>
              <p className="mt-5 text-4xl font-black tracking-[-0.04em]">Test Vela free</p>
              <p className="mt-3 text-sm leading-6 text-[#5b737b]">
                Create a clinic workspace, try clients and appointments, then choose a plan.
              </p>
              <div className="mt-6">
                <CtaButtons compact />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.65fr_1fr]">
          <div>
            <h2 className="text-4xl font-black tracking-[-0.04em] text-[#102b34]">Questions before you test?</h2>
            <p className="mt-4 text-lg leading-8 text-[#5b737b]">
              The fastest way to evaluate Vela is to create a workspace and run through a real clinic day.
            </p>
          </div>
          <div className="space-y-3">
            {faqs.map((faq) => (
              <details key={faq.question} className="group rounded-[1rem] border border-[#dbe8e8] bg-white p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-black">
                  {faq.question}
                  <ChevronRight className="size-5 transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-4 text-sm leading-7 text-[#5b737b]">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[#eaf7f2] px-5 py-24 text-center sm:px-8">
        <div className="mx-auto max-w-4xl">
          <Zap className="mx-auto size-10 text-[#45a88a]" />
          <h2 className="mt-6 text-4xl font-black tracking-[-0.045em] text-[#102b34] sm:text-6xl">
            Give your clinic a calmer way to run.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#496670]">
            Start free, add a few clients, book appointments, and see how Vela turns
            daily operations into a clear workspace.
          </p>
          <div className="mt-9 flex justify-center">
            <CtaButtons />
          </div>
        </div>
      </section>

      <footer className="border-t border-[#dbe8e8] bg-white px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-sm text-[#5b737b] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-[0.8rem] bg-[#45a88a] text-sm font-black text-white">
              V
            </span>
            <span className="font-black text-[#102b34]">Vela</span>
            <span>Clinic management</span>
          </div>
          <div className="flex flex-wrap gap-5">
            <Link href="/terms-and-conditions">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refund">Refunds</Link>
            <Link href="/login">Log in</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
