import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Vela | Clinic operating system",
  description:
    "Run bookings, clients, reminders, private media, and AI clinic reports from one calm workspace.",
};

const navItems = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#flow" },
  { label: "Security", href: "#security" },
  { label: "Pricing", href: "/pricing" },
];

const flowItems = [
  {
    title: "Manage bookings",
    copy: "Smart calendar, staff schedules, and clean appointment flow.",
    icon: CalendarDays,
  },
  {
    title: "Care for clients",
    copy: "Profiles, visit history, notes, messages, and private media.",
    icon: UsersRound,
  },
  {
    title: "Stay in touch",
    copy: "WhatsApp-ready reminders and inbox context for follow-up.",
    icon: MessageCircle,
  },
  {
    title: "Improve with AI",
    copy: "Reports that explain trends, risks, and next actions.",
    icon: BarChart3,
  },
];

const reportStats = [
  ["Completion", "92%", "+12%"],
  ["No-show risk", "8%", "-10%"],
  ["New clients", "24", "+33%"],
  ["Follow-up", "81%", "+15%"],
];

const recommendations = [
  "Move three quiet slots into posted hours.",
  "Follow up with inactive clients this week.",
  "Keep morning capacity protected for repeat visits.",
];

const securityHighlights = [
  {
    title: "Private by design",
    copy: "Client photos and records are scoped to the clinic.",
    icon: ShieldCheck,
  },
  {
    title: "Secure workspace",
    copy: "Protected routes keep clinic tools behind auth.",
    icon: LockKeyhole,
  },
  {
    title: "You stay in control",
    copy: "Clean policies and simple account access.",
    icon: CheckCircle2,
  },
];

function BrandMark() {
  return (
    <span className="flex items-center gap-3">
      <span className="relative flex size-9 items-center justify-center">
        <span className="absolute h-8 w-3 -rotate-12 rounded-full bg-[#73a7fb]" />
        <span className="absolute h-8 w-3 rotate-[28deg] rounded-full bg-[#3b82f6]" />
      </span>
      <span className="text-lg font-black tracking-[0.08em] text-[#101820]">VELA</span>
    </span>
  );
}

function PrimaryButton({ href = "/sign-up", children = "Start free" }) {
  return (
    <Link
      href={href}
      className="group inline-flex h-12 items-center justify-center rounded-[0.8rem] bg-[#3b82f6] px-5 text-sm font-extrabold text-white shadow-[0_16px_34px_rgba(59,130,246,0.24)] hover:-translate-y-0.5 hover:bg-[#2563eb] focus-visible:ring-3 focus-visible:ring-[#3b82f6]/25"
    >
      {children}
      <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function SecondaryButton({ href = "/login", children = "Log in" }) {
  return (
    <Link
      href={href}
      className="group inline-flex h-12 items-center justify-center rounded-[0.8rem] border border-[#d9e7e6] bg-white px-5 text-sm font-extrabold text-[#10252b] shadow-[0_12px_26px_rgba(16,37,43,0.06)] hover:-translate-y-0.5 hover:border-[#b9d5d0]"
    >
      {children}
      <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function HeroMockup() {
  return (
    <div className="relative mx-auto mt-14 flex w-full max-w-[19.5rem] flex-col gap-4 overflow-hidden sm:mt-16 sm:max-w-6xl lg:mt-10 lg:block lg:h-[40rem] lg:overflow-visible">
      <div className="landing-streak landing-streak-left hidden lg:block" />
      <div className="landing-streak landing-streak-right hidden lg:block" />
      <div className="landing-arc hidden lg:block" />

      <div className="landing-float relative w-full overflow-hidden rounded-[1.15rem] border border-[#dce9e7] bg-white/88 p-3 shadow-[0_26px_70px_rgba(16,37,43,0.12)] backdrop-blur sm:p-4 lg:absolute lg:left-1/2 lg:top-8 lg:w-[min(88vw,780px)] lg:-translate-x-1/2 lg:overflow-visible lg:rounded-[1.35rem] lg:shadow-[0_42px_100px_rgba(16,37,43,0.14)]">
        <div className="flex h-10 items-center gap-2 border-b border-[#edf3f2] px-1 pb-4">
          <span className="size-2.5 rounded-full bg-[#7fb0ff]" />
          <span className="size-2.5 rounded-full bg-[#e9c85d]" />
          <span className="size-2.5 rounded-full bg-[#3b82f6]" />
          <span className="ml-3 text-xs font-black text-[#10252b] sm:ml-5">Dashboard</span>
          <span className="ml-auto hidden rounded-full bg-[#f4faf8] px-3 py-1 text-xs font-bold text-[#58716f] sm:inline-flex">
            This week
          </span>
        </div>

        <div className="grid gap-4 pt-5 lg:grid-cols-[155px_1fr]">
          <aside className="hidden rounded-[1rem] bg-[#f7fbfa] p-4 text-xs font-bold text-[#607774] lg:block">
            {["Overview", "Calendar", "Clients", "Inbox", "Reports"].map((item, index) => (
              <div
                key={item}
                className={`mb-2 rounded-[0.7rem] px-3 py-2 ${
                  index === 0 ? "bg-[#eef5ff] text-[#3b82f6]" : ""
                }`}
              >
                {item}
              </div>
            ))}
          </aside>

          <div className="min-w-0 sm:hidden">
            <div className="grid grid-cols-5 border-b border-l border-[#e8f0ef] text-center text-[9px] font-black text-[#6d8180]">
              {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
                <div key={day} className="border-r border-[#e8f0ef] py-2">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid h-44 grid-cols-5 border-l border-[#e8f0ef]">
              {Array.from({ length: 20 }).map((_, index) => (
                <div key={index} className="relative border-b border-r border-[#e8f0ef] bg-white">
                  {[2, 6, 12, 18].includes(index) ? (
                    <div className="absolute inset-x-1 top-2 rounded-[0.55rem] bg-[#e8f6f1] px-1.5 py-1.5 text-[9px] font-black leading-3 text-[#0d6556]">
                      {["09:00", "11:15", "13:00", "14:00"][index % 4]}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="hidden min-w-0 sm:block">
            <div className="grid grid-cols-7 border-b border-l border-[#e8f0ef] text-center text-[10px] font-black text-[#6d8180]">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div key={day} className="border-r border-[#e8f0ef] py-2">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid h-64 grid-cols-7 border-l border-[#e8f0ef] lg:h-72">
              {Array.from({ length: 35 }).map((_, index) => (
                <div key={index} className="relative border-b border-r border-[#e8f0ef] bg-white">
                  {[2, 8, 12, 18, 23].includes(index) ? (
                    <div className="absolute inset-x-2 top-3 rounded-[0.65rem] bg-[#e8f6f1] px-2 py-2 text-[10px] font-black leading-4 text-[#0d6556]">
                      {["09:00", "10:30", "13:00", "11:15", "14:00"][index % 5]}
                      <span className="block font-bold text-[#62807b]">Client visit</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="landing-card-pop relative w-full overflow-hidden rounded-[1.1rem] border border-[#dce9e7] bg-white p-4 shadow-[0_18px_44px_rgba(16,37,43,0.1)] sm:w-[15.5rem] lg:absolute lg:left-12 lg:top-[18rem] lg:overflow-visible lg:shadow-[0_28px_70px_rgba(16,37,43,0.14)]">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-full bg-[linear-gradient(135deg,#fdd8d0,#dff4ef)]" />
          <div>
            <p className="text-sm font-black text-[#10252b]">Sofia Martinez</p>
            <p className="text-xs font-bold text-[#748986]">Returning client</p>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-xs font-bold text-[#607774]">
          <p>Last visit: Apr 26, 2026</p>
          <p>Next: Tomorrow, 11:00 AM</p>
        </div>
        <div className="mt-4 rounded-[0.75rem] bg-[#3b82f6] px-3 py-3 text-center text-xs font-black leading-4 text-white">
          <span className="sm:hidden">Send reminder</span>
          <span className="hidden sm:inline">Send WhatsApp reminder</span>
        </div>
      </div>

      <div className="landing-card-pop landing-card-delay relative w-full overflow-hidden rounded-[1.1rem] border border-[#dce9e7] bg-white p-4 shadow-[0_18px_44px_rgba(16,37,43,0.1)] sm:w-[14rem] sm:self-end lg:absolute lg:right-10 lg:top-[10rem] lg:overflow-visible lg:shadow-[0_28px_70px_rgba(16,37,43,0.14)]">
        <p className="text-sm font-black text-[#10252b]">Today&apos;s appointments</p>
        <p className="mt-3 text-5xl font-black tracking-[-0.06em] text-[#10252b]">8</p>
        <p className="text-xs font-black text-[#3b82f6]">+20% vs yesterday</p>
        <div className="mt-5 h-16 rounded-[0.8rem] bg-[linear-gradient(135deg,rgba(59,130,246,0.14),rgba(255,255,255,0.7))]">
          <svg viewBox="0 0 180 64" className="h-full w-full text-[#3b82f6]">
            <path
              d="M8 48 C 30 12, 46 58, 66 31 S 98 15, 116 30 S 150 16, 172 22"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      <div className="landing-card-pop landing-card-delay-2 relative w-full overflow-hidden rounded-[1.1rem] border border-[#dce9e7] bg-white p-4 shadow-[0_18px_44px_rgba(16,37,43,0.1)] sm:w-[18rem] sm:self-center lg:absolute lg:bottom-4 lg:right-8 lg:overflow-visible lg:shadow-[0_28px_70px_rgba(16,37,43,0.14)]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-black text-[#10252b]">AI snapshot</p>
          <span className="hidden rounded-full bg-[#f7fbfa] px-3 py-1 text-xs font-bold text-[#607774] sm:inline-flex">
            This week
          </span>
        </div>
        <div className="mt-5 flex items-center gap-4">
          <div className="grid size-20 place-items-center rounded-full border-[7px] border-[#3b82f6] text-center">
            <span className="text-2xl font-black leading-none text-[#3b82f6]">86</span>
          </div>
          <div>
            <p className="text-sm font-black text-[#10252b]">Excellent week</p>
            <p className="mt-1 text-xs font-bold leading-5 text-[#607774]">
              Completion is up and no-shows are down.
            </p>
          </div>
        </div>
        <Link
          href="/sign-up"
          className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-[0.75rem] border border-[#d9e7e6] text-xs font-black text-[#10252b]"
        >
          View full report
          <ArrowRight className="ml-2 size-3.5" />
        </Link>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f5f8fc] text-[#10252b]">
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_72%_20%,rgba(191,215,255,0.44),transparent_38%),linear-gradient(180deg,#f8fbff_0%,#eef5ff_100%)]">
        <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
          <Link href="/" aria-label="Vela home">
            <BrandMark />
          </Link>
          <nav className="hidden items-center gap-10 text-sm font-extrabold text-[#344a4f] lg:flex">
            {navItems.map((item) => (
              <Link key={item.label} href={item.href} className="hover:text-[#3b82f6]">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm font-extrabold text-[#344a4f] hover:text-[#3b82f6] sm:inline"
            >
              Log in
            </Link>
            <span className="hidden sm:inline-flex">
              <PrimaryButton />
            </span>
          </div>
        </header>

        <div className="relative z-10 mx-auto max-w-7xl px-5 pb-20 pt-12 text-center sm:px-8 sm:text-left lg:pt-20">
          <h1 className="mx-auto max-w-[19rem] text-[2.25rem] font-black leading-[0.98] tracking-[-0.035em] text-[#101820] sm:mx-0 sm:max-w-5xl sm:text-[clamp(2.65rem,8.8vw,7.6rem)] sm:leading-[0.94] sm:tracking-[-0.065em]">
            Run the clinic from one calm system
          </h1>
          <p className="mx-auto mt-7 max-w-[19rem] text-base font-semibold leading-7 text-[#637775] sm:mx-0 sm:max-w-xl sm:text-lg sm:leading-8">
            Bookings, clients, reminders, and AI insights. Everything you need
            to deliver exceptional care.
          </p>
          <div className="mx-auto mt-8 flex max-w-[19.5rem] flex-col gap-3 sm:mx-0 sm:max-w-none sm:flex-row [&>a]:w-full sm:[&>a]:w-auto">
            <PrimaryButton />
            <SecondaryButton />
          </div>
          <HeroMockup />
        </div>
      </section>

      <section id="features" className="bg-[#f5f8fc] px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <h2 className="text-3xl font-black leading-tight tracking-[-0.035em] text-[#101820] sm:text-5xl sm:tracking-[-0.055em]">
              Everything flows.
              <span className="block text-[#3b82f6]">So your day can too.</span>
            </h2>
          </div>
          <div className="mt-16 grid gap-10 md:grid-cols-4">
            {flowItems.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="landing-reveal text-center">
                  <div className="mx-auto grid size-16 place-items-center rounded-[1rem] bg-[#eef5ff] text-[#3b82f6]">
                    <Icon className="size-7" />
                  </div>
                  <h3 className="mt-6 text-lg font-black text-[#10252b]">{item.title}</h3>
                  <p className="mx-auto mt-3 max-w-[15rem] text-sm font-semibold leading-6 text-[#637775]">
                    {item.copy}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="flow" className="bg-[#f5f8fc] px-5 py-20 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.62fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#3b82f6]">AI reports</p>
            <h2 className="mt-5 text-3xl font-black leading-tight tracking-[-0.035em] text-[#101820] sm:text-5xl sm:tracking-[-0.055em]">
              Insights that help you make better calls.
            </h2>
            <p className="mt-5 max-w-md text-base font-semibold leading-8 text-[#637775]">
              Vela turns daily clinic activity into clear recommendations your team can act on.
            </p>
            <div className="mt-8 space-y-4">
              {[
                "Performance snapshots across time",
                "Trends, risks, and opportunities",
                "Personalized improvement suggestions",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm font-black text-[#10252b]">
                  <CheckCircle2 className="size-5 fill-[#3b82f6] text-white" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="landing-reveal rounded-[1.35rem] border border-[#dce9e7] bg-white/86 p-5 shadow-[0_34px_90px_rgba(16,37,43,0.09)]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[#10252b]">AI performance overview</h3>
              <span className="rounded-full border border-[#dce9e7] px-3 py-1 text-xs font-black text-[#637775]">
                This month
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              {reportStats.map(([label, value, change]) => (
                <div key={label} className="rounded-[0.9rem] border border-[#edf3f2] bg-[#fbfefd] p-4">
                  <p className="text-xs font-black text-[#637775]">{label}</p>
                  <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-[#3b82f6]">{value}</p>
                  <p className="mt-1 text-xs font-black text-[#3b82f6]">{change} vs last month</p>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.78fr]">
              <div className="rounded-[1rem] border border-[#edf3f2] p-5">
                <p className="text-sm font-black text-[#10252b]">Trend</p>
                <svg viewBox="0 0 520 220" className="mt-6 h-56 w-full text-[#3b82f6]">
                  <path
                    d="M10 170 C 45 98, 80 110, 116 138 S 178 38, 224 92 S 300 70, 340 58 S 420 92, 500 42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeLinecap="round"
                  />
                  {[80, 160, 240, 320, 400].map((x) => (
                    <line key={x} x1={x} x2={x} y1="20" y2="205" stroke="#edf3f2" strokeWidth="2" />
                  ))}
                </svg>
              </div>
              <div className="rounded-[1rem] border border-[#edf3f2] p-5">
                <p className="text-sm font-black text-[#10252b]">Top recommendations</p>
                <div className="mt-5 space-y-4">
                  {recommendations.map((item) => (
                    <div key={item} className="flex gap-3 text-sm font-semibold leading-6 text-[#637775]">
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#3b82f6]" />
                      {item}
                    </div>
                  ))}
                </div>
                <Link href="/sign-up" className="mt-7 inline-flex items-center text-sm font-black text-[#3b82f6]">
                  View full AI report
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="security" className="bg-[#f5f8fc] px-5 py-24 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.58fr_1fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-black leading-tight tracking-[-0.035em] text-[#101820] sm:text-5xl sm:tracking-[-0.055em]">
              Your data.
              <span className="block text-[#3b82f6]">Always private.</span>
            </h2>
            <p className="mt-5 max-w-md text-base font-semibold leading-8 text-[#637775]">
              Vela is designed so each clinic sees its own workspace, client records,
              and media. Provider details stay behind the product.
            </p>
          </div>
          <div className="grid gap-0 md:grid-cols-3">
            {securityHighlights.map((item, index) => {
              const SecurityIcon = item.icon;
              return (
                <article
                  key={item.title}
                  className={`landing-reveal px-7 py-8 text-center ${
                    index > 0 ? "border-t border-[#dce9e7] md:border-l md:border-t-0" : ""
                  }`}
                >
                  <div className="mx-auto grid size-16 place-items-center rounded-[1rem] bg-[#eef5ff] text-[#3b82f6]">
                    <SecurityIcon className="size-7" />
                  </div>
                  <h3 className="mt-6 text-base font-black text-[#10252b]">{item.title}</h3>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[#637775]">{item.copy}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-[#f5f8fc] px-5 pb-16 sm:px-8">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[1.35rem] border border-[#dce9e7] bg-[radial-gradient(circle_at_88%_12%,rgba(191,215,255,0.58),transparent_34%),#eef5ff] p-8 shadow-[0_28px_80px_rgba(16,37,43,0.08)] sm:p-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="max-w-xl text-3xl font-black leading-tight tracking-[-0.035em] text-[#101820] sm:text-5xl sm:tracking-[-0.055em]">
                Ready to simplify your clinic?
              </h2>
              <p className="mt-4 max-w-xl text-base font-semibold leading-8 text-[#637775]">
                Join clinics that want fewer handoffs, better follow-up, and clearer decisions.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <PrimaryButton />
              <SecondaryButton />
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-[#f5f8fc] px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 text-xs font-bold text-[#637775] md:flex-row md:items-center md:justify-between">
          <BrandMark />
          <div className="flex flex-wrap gap-6">
            <Link href="#features">Features</Link>
            <Link href="#flow">How it works</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="#security">Security</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms-and-conditions">Terms</Link>
          </div>
          <p>(c) 2026 Vela. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
