import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";

import { MarketingShell } from "../shell/marketing-shell";
import { InnerHero, Highlight } from "../shared/inner-hero";
import { CtaBand } from "../shared/cta-band";
import { Reveal, RevealGroup, RevealItem } from "../motion/reveal";

const context = [
  {
    title: "Why Vela exists",
    copy: "Appointment-based clinics often grow by adding disconnected tools. Vela brings the daily work back into one calm place: schedule, records, communication, payments, and reporting.",
  },
  {
    title: "What stays simple",
    copy: "Clinic users should see product language, not provider setup. Vela keeps technical services behind clear, customer-safe states and support-ready flows.",
  },
  {
    title: "How it grows",
    copy: "Clinics can begin with appointments, patients, and staff, then expand into messaging, document workflows, payments, advanced reports, and operational recommendations.",
  },
];

const model = [
  ["Configure", "Set clinic identity, hours, staff, and workspace preferences."],
  ["Operate", "Run appointments, patient records, messages, documents, and payments."],
  ["Understand", "Read performance trends and AI-assisted operational insights."],
  ["Improve", "Adjust availability, follow-up, and reporting with clearer context."],
];

const stats = [
  ["1", "workspace"],
  ["6", "core modules"],
  ["3", "report windows"],
];

const principles = [
  {
    title: "Built around the clinic day",
    copy: "The product starts from the work clinics repeat every day: bookings, arrivals, follow-ups, staff coverage, payments, documents, and easy-to-find records.",
  },
  {
    title: "Operational clarity, not medical claims",
    copy: "Recommendations stay focused on clinic operations: demand patterns, completion rates, message workload, staff availability, and reporting habits.",
  },
  {
    title: "Simple surfaces over provider setup",
    copy: "Messaging, storage, reports, and access should feel like one product. Technical provider details stay behind support-ready states.",
  },
  {
    title: "Designed to grow carefully",
    copy: "Clinics can begin with the essentials and add deeper reporting, messaging, automation, and insight as their team and process mature.",
  },
];

const legal = [
  ["Terms & Conditions", "/terms-and-conditions"],
  ["Privacy Policy", "/privacy"],
  ["Refund Policy", "/refund"],
];

export function AboutPage() {
  return (
    <MarketingShell overlay>
      <InnerHero
        eyebrow="About Vela"
        title={
          <>
            Calm operational intelligence for <Highlight>clinics</Highlight>.
          </>
        }
        copy="Vela is built around one belief: clinics should understand the day, care for patients, and improve performance without wrestling with disconnected tools."
        primaryHref="/sign-up"
        primaryLabel="Start free"
        secondaryHref="/contact"
        secondaryLabel="Contact us"
      />

      {/* context + stats */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <RevealGroup className="grid gap-5 lg:grid-cols-3">
          {context.map((c) => (
            <RevealItem key={c.title} className="rounded-(--radius-hero) border border-border/80 bg-white p-6 shadow-[0_18px_54px_rgba(20,21,47,0.05)]">
              <h2 className="text-xl font-semibold text-[var(--brand-ink)]">{c.title}</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{c.copy}</p>
            </RevealItem>
          ))}
        </RevealGroup>
        <Reveal className="mt-6 grid gap-3 rounded-(--radius-hero) border border-border/80 bg-[var(--brand-wash)]/40 p-4 sm:grid-cols-3">
          {stats.map(([value, label]) => (
            <div key={label} className="rounded-(--radius-field) bg-white p-5 text-center shadow-[0_12px_30px_rgba(20,21,47,0.04)]">
              <p className="text-4xl font-semibold text-primary">{value}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            </div>
          ))}
        </Reveal>
      </section>

      {/* operating model */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <Reveal className="mx-auto mb-10 max-w-2xl text-center">
          <p className="eyebrow text-primary">The operating model</p>
          <h2 className="mt-3 display-2 text-[var(--brand-ink)]">A workspace that gives the clinic its focus back.</h2>
        </Reveal>
        <RevealGroup className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {model.map(([title, copy], i) => (
            <RevealItem key={title} className="relative rounded-(--radius-panel) border border-border/80 bg-white p-6 shadow-[0_16px_44px_rgba(20,21,47,0.045)]">
              <span className="flex size-9 items-center justify-center rounded-(--radius-tile) vela-gradient text-sm font-bold text-white">{i + 1}</span>
              <h3 className="mt-4 text-base font-bold text-[var(--brand-ink)]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
              {i < model.length - 1 ? (
                <ChevronRight aria-hidden className="absolute -right-2.5 top-1/2 hidden size-5 -translate-y-1/2 text-border xl:block" />
              ) : null}
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* principles — dark band */}
      <section className="vela-night relative overflow-hidden text-white">
        <div aria-hidden className="vela-grid-texture pointer-events-none absolute inset-0 opacity-50" />
        <Reveal className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="eyebrow text-white/55">How Vela thinks</p>
              <h2 className="mt-4 display-2">Calm software for busy appointment teams.</h2>
              <p className="mt-5 max-w-md text-base leading-8 text-white/65">
                Vela is shaped for owners, managers, providers, and front-desk teams who need a shared source of truth
                without turning the clinic into a technical project.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {principles.map((p) => (
                <article key={p.title} className="rounded-(--radius-field) border border-white/12 bg-white/[0.05] p-5 backdrop-blur">
                  <span className="flex size-9 items-center justify-center rounded-(--radius-tile) bg-white/10 text-[#9ec3ff]">
                    <CheckCircle2 className="size-5" />
                  </span>
                  <h3 className="mt-4 text-base font-bold text-white">{p.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/60">{p.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* legal */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <Reveal className="grid gap-4 rounded-(--radius-hero) border border-border/80 bg-white p-5 shadow-[0_24px_80px_rgba(20,21,47,0.06)] sm:grid-cols-3">
          {legal.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center justify-between rounded-(--radius-field) border border-border/80 p-4 text-sm font-bold text-foreground transition-[border-color,color] duration-(--duration-base) ease-out-quint hover:border-primary/40 hover:text-primary"
            >
              {label}
              <ChevronRight className="size-4 transition-transform duration-(--duration-base) group-hover:translate-x-1" />
            </Link>
          ))}
        </Reveal>
      </section>

      <CtaBand />
    </MarketingShell>
  );
}
