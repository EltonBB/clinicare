import { MarketingShell } from "../shell/marketing-shell";
import { SectionHeader } from "../shared/section-header";
import { Reveal } from "../motion/reveal";
import { Highlight, WordReveal } from "../motion/word-reveal";
import { ScrollStatement } from "./about-motion";
import { LoopSteps } from "./loop-steps";
import { ToolsConverge } from "./tools-converge";

const STATEMENT =
  "Clinics grow by adding tools: a calendar here, a spreadsheet there, a phone full of messages. Vela brings the day back into one calm place. Staff see plain product language, never provider setup, and the workspace grows with the clinic, from appointments and staff to messaging, payments, and reports.";

const principles: { title: string; copy: string; row: string; status: string }[] = [
  {
    title: "Plain language",
    copy: "Clinic staff see product words, never provider setup or raw system errors.",
    row: "Provider details on screen",
    status: "Hidden",
  },
  {
    title: "Minimum necessary",
    copy: "Patient reminders carry a name and an appointment time. Nothing clinical.",
    row: "Clinical detail in reminders",
    status: "Never",
  },
  {
    title: "One record",
    copy: "Every module reads from the same patient record instead of keeping its own copy.",
    row: "Copying between tools",
    status: "Not needed",
  },
];

export function AboutPage() {
  return (
    <MarketingShell
      footerCta={{
        lead: "Run the day.",
        rest: "Don’t chase it.",
        copy: "Start with your calendar and patients. Add staff, messages, and reports when you are ready.",
      }}
    >
      {/* manifesto hero: the one centered opening on the site, no actions until the end */}
      <section className="pb-16 pt-24 sm:pb-20 sm:pt-32">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <p className="section-reveal text-sm font-semibold text-muted-foreground">About Vela</p>
          <h1 className="display-1 mx-auto mt-6 max-w-5xl text-balance text-[var(--brand-ink)]">
            <WordReveal>
              Calm operational intelligence for <Highlight>clinics.</Highlight>
            </WordReveal>
          </h1>
          <div className="hero-follow">
            <p className="mx-auto mt-8 max-w-lg text-lg leading-8 text-muted-foreground">
              One belief: clinics should run without wrestling disconnected tools.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ToolsConverge />
        </div>
      </section>

      <section className="border-t border-border/60 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ScrollStatement text={STATEMENT} />
        </div>
      </section>

      <section className="border-t border-border/60 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader className="mb-10" lead="How a clinic runs on Vela." rest="Four steps, on repeat." />
          <Reveal>
            <LoopSteps />
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border/60 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader className="mb-10" lead="What stays true." rest="However the clinic grows." />
          <Reveal className="grid grid-cols-1 overflow-hidden rounded-(--radius-mkt-card) border border-border/70 divide-y divide-border/60 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {principles.map((p) => (
              <div key={p.title} className="flex flex-col">
                <div className="p-8">
                  <p className="text-xl font-semibold text-[var(--brand-ink)]">{p.title}</p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{p.copy}</p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-4 border-t border-border/60 bg-[var(--brand-wash)]/40 px-8 py-4 text-sm">
                  <span className="text-muted-foreground">{p.row}</span>
                  <span className="shrink-0 font-semibold text-primary">{p.status}</span>
                </div>
              </div>
            ))}
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
