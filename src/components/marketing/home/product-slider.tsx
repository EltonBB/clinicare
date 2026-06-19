"use client";

import { useRef, type ReactNode } from "react";
import { CalendarDays, CheckCircle2, CreditCard, MessageCircle, Sparkles } from "lucide-react";

import { Reveal } from "../motion/reveal";
import { useScrollScene } from "../motion/use-scroll-scene";

/**
 * "See it for yourself" — a centered coverflow carousel. The section pins and,
 * as the page scrolls, the focused card stays centered while neighbours peek at
 * the sides, dimmed by opacity + scale. Scroll snaps one card at a time: the
 * centered card slides left and the next slides into focus from the right, until
 * the last card — then the section releases. On touch / reduced-motion it falls
 * back to a native snap-swipe row (no pin). Cards are code-native sample data.
 */
export function ProductSlider() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const sectionRef = useScrollScene<HTMLElement>(({ root, gsap, ScrollTrigger }) => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    const cards = gsap.utils.toArray<HTMLElement>("[data-card]", track);
    const n = cards.length;
    if (n < 2) return;

    const stepX = () => cards[1].offsetLeft - cards[0].offsetLeft;
    const baseLeft = () => cards[0].offsetLeft;
    const cardW = () => cards[0].offsetWidth;

    const state = { p: 0 };
    const render = () => {
      // Centre card `p` in the viewport.
      const x = viewport.clientWidth / 2 - cardW() / 2 - baseLeft() - state.p * stepX();
      gsap.set(track, { x });
      cards.forEach((card, i) => {
        const d = Math.min(Math.abs(i - state.p), 1.6);
        gsap.set(card, {
          opacity: gsap.utils.clamp(0.18, 1, 1 - d * 0.6),
          scale: gsap.utils.clamp(0.84, 1, 1 - d * 0.1),
          filter: `blur(${(gsap.utils.clamp(0, 1, d) * 1.4).toFixed(2)}px)`,
          zIndex: Math.round(100 - d * 10),
        });
      });
    };

    // Take over native overflow while pinned; gsap.context restores it on revert.
    gsap.set(viewport, { overflow: "hidden" });
    render();

    ScrollTrigger.create({
      trigger: root,
      start: "top top",
      end: () => "+=" + (n - 1) * Math.max(window.innerHeight * 0.72, 460),
      pin: root,
      scrub: 1,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      snap: {
        snapTo: 1 / (n - 1),
        duration: { min: 0.2, max: 0.5 },
        ease: "power1.inOut",
      },
      onUpdate: (self) => {
        state.p = self.progress * (n - 1);
        render();
      },
      onRefresh: render,
    });
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-[var(--brand-wash)]/30 py-20"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-xl">
          <p className="eyebrow text-primary">Product in action</p>
          <h2 className="mt-3 display-2 text-[var(--brand-ink)]">
            See it for <em className="italic font-semibold text-primary">yourself</em>.
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Real parts of the workspace — calendar, finances, the patient record, inbox, and insight — shown with
            sample clinic data.
          </p>
        </Reveal>
      </div>

      <div
        ref={viewportRef}
        className="relative mt-12 w-full snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div ref={trackRef} className="flex w-max items-stretch gap-6 px-6">
          <FeatureCard eyebrow="Scheduling" title="A visual calendar, no overlaps." copy="Day, week, and month views with automatic reminders before every appointment.">
            <CalendarMock />
          </FeatureCard>
          <FeatureCard eyebrow="Payments" title="Revenue, balances, and reports." copy="Everything about clinic finances in one place — one-click PDF export, no spreadsheets.">
            <FinanceMock />
          </FeatureCard>
          <FeatureCard eyebrow="Patient record" title="The full medical history." copy="Every visit, invoice, document, and image — organized and reachable from any device.">
            <PatientMock />
          </FeatureCard>
          <FeatureCard eyebrow="Conversations" title="WhatsApp, linked to the record." copy="Replies stay attached to the right patient and appointment — context is never lost.">
            <InboxMock />
          </FeatureCard>
          <FeatureCard eyebrow="Insights" title="Know what to do next." copy="AI-assisted operational insights turn the day's activity into a clear next step.">
            <InsightMock />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  eyebrow,
  title,
  copy,
  children,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  children: ReactNode;
}) {
  return (
    <article
      data-card
      className="flex w-[clamp(280px,33vw,440px)] shrink-0 snap-center flex-col overflow-hidden rounded-(--radius-hero) border border-border/80 bg-white shadow-[0_24px_70px_rgba(20,21,47,0.07)]"
    >
      <div className="flex h-60 flex-col border-b border-border/60 bg-[var(--brand-wash)]/45 p-5">{children}</div>
      <div className="p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
        <h3 className="mt-2 text-xl font-semibold text-[var(--brand-ink)]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
      </div>
    </article>
  );
}

function MockHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs font-bold text-[var(--brand-ink)]">{title}</p>
      {badge ? (
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">{badge}</span>
      ) : null}
    </div>
  );
}

function CalendarMock() {
  const cols = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const events = [
    { col: 0, top: 6, h: 22, label: "A. Krasniqi", tone: "bg-primary/10 text-primary" },
    { col: 1, top: 14, h: 26, label: "B. Gashi", tone: "bg-[#eef] text-[#5b6bd6]" },
    { col: 2, top: 30, h: 20, label: "D. Shala", tone: "bg-emerald-50 text-emerald-600" },
    { col: 3, top: 44, h: 28, label: "F. Rama", tone: "bg-amber-50 text-amber-600" },
    { col: 0, top: 52, h: 18, label: "L. Berisha", tone: "bg-primary/10 text-primary" },
  ];
  return (
    <>
      <MockHeader title="Calendar · April" badge="Week" />
      <div className="mt-3 grid grid-cols-5 gap-1.5 text-center">
        {cols.map((c) => (
          <span key={c} className="text-[10px] font-bold text-muted-foreground">{c}</span>
        ))}
      </div>
      <div className="relative mt-1.5 grid flex-1 grid-cols-5 gap-1.5">
        {cols.map((c) => (
          <div key={c} className="rounded-[0.5rem] border border-border/50 bg-white/70" />
        ))}
        {events.map((e, i) => (
          <span
            key={i}
            className={"absolute rounded-[0.4rem] px-1.5 py-1 text-[9px] font-bold " + e.tone}
            style={{ left: `calc(${e.col} * 20% + 2px)`, width: "calc(20% - 4px)", top: `${e.top}%`, height: `${e.h}%` }}
          >
            {e.label}
          </span>
        ))}
      </div>
    </>
  );
}

function FinanceMock() {
  const tiles = [
    { label: "Revenue", value: "€8,240", note: "+14%", tone: "text-emerald-600" },
    { label: "Expenses", value: "€1,820", note: "", tone: "text-muted-foreground" },
    { label: "Outstanding", value: "€640", note: "4 patients", tone: "text-amber-600" },
  ];
  const bars = [48, 64, 52, 78, 92, 70, 58];
  return (
    <>
      <MockHeader title="Finance · April" badge="Export PDF" />
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[0.5rem] border border-border/60 bg-white p-2">
            <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{t.label}</p>
            <p className="mt-0.5 text-[13px] font-semibold text-[var(--brand-ink)]">{t.value}</p>
            {t.note ? <p className={"text-[8px] font-bold " + t.tone}>{t.note}</p> : null}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-1 items-end gap-1.5">
        {bars.map((h, i) => (
          <span
            key={i}
            className={"flex-1 rounded-t-[3px] " + (i === 4 ? "bg-primary" : "bg-primary/30")}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </>
  );
}

function PatientMock() {
  const rows = [
    ["12 Apr", "Filling, tooth 16", "€80"],
    ["28 Mar", "Routine check", "€30"],
    ["10 Mar", "Crown, tooth 26", "€250"],
    ["15 Jan", "Extraction 38", "€60"],
  ];
  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-(--radius-tile) bg-primary text-xs font-bold text-white">VK</span>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-[var(--brand-ink)]">Valdete Krasniqi</p>
          <p className="text-[10px] font-semibold text-muted-foreground">34 y · 12 visits</p>
        </div>
        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">+ Visit</span>
      </div>
      <div className="mt-2.5 flex gap-3 border-b border-border/60 pb-1.5 text-[10px] font-bold">
        <span className="text-muted-foreground">Info</span>
        <span className="text-primary">History</span>
        <span className="text-muted-foreground">Payments</span>
        <span className="text-muted-foreground">Docs</span>
      </div>
      <div className="mt-1.5 flex-1 space-y-1">
        {rows.map(([date, treatment, amount]) => (
          <div key={date} className="grid grid-cols-[3.2rem_1fr_auto] items-center gap-2 rounded-[0.4rem] px-1.5 py-1 text-[10px] odd:bg-[var(--brand-wash)]/50">
            <span className="font-bold text-muted-foreground">{date}</span>
            <span className="truncate font-semibold text-[var(--brand-ink)]">{treatment}</span>
            <span className="font-bold text-[var(--brand-ink)]">{amount}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function InboxMock() {
  return (
    <>
      <MockHeader title="Maya Novak" badge="WhatsApp" />
      <div className="mt-3 flex flex-1 flex-col justify-center gap-2 text-[11px] font-semibold">
        <p className="mr-8 rounded-[0.6rem] bg-[var(--brand-wash)] p-2.5 text-muted-foreground">
          Can I move my appointment to 11:00?
        </p>
        <p className="ml-8 rounded-[0.6rem] bg-primary/10 p-2.5 text-primary">
          Done — confirmed for 11:00 with Dr. Kim.
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 rounded-[0.6rem] border border-[#64B6FF]/25 bg-[#eff7ff] p-2 text-[9px] font-bold text-[#0A22FF]">
          <MessageCircle className="size-3" />
          Linked to appointment + patient record
        </div>
      </div>
    </>
  );
}

function InsightMock() {
  const kpis = [
    { label: "Completion", value: "84%", icon: CheckCircle2 },
    { label: "Revenue", value: "$2.4k", icon: CreditCard },
    { label: "Visits", value: "18", icon: CalendarDays },
  ];
  const bars = [44, 58, 50, 70, 62, 80, 72];
  return (
    <>
      <MockHeader title="Today's performance" />
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {kpis.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-[0.5rem] border border-border/60 bg-white p-2">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
              <Icon className="size-3 text-primary" />
            </div>
            <p className="mt-0.5 text-[13px] font-semibold text-[var(--brand-ink)]">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex h-10 items-end gap-1">
        {bars.map((h, i) => (
          <span key={i} className="flex-1 rounded-t-[2px] bg-gradient-to-t from-primary to-[#64B6FF]" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="mt-2.5 flex items-start gap-1.5 rounded-[0.6rem] border border-primary/20 bg-gradient-to-br from-primary/10 to-[#64B6FF]/10 p-2">
        <Sparkles className="mt-0.5 size-3 shrink-0 text-primary" />
        <p className="text-[10px] font-semibold leading-4 text-[var(--brand-ink)]">
          Thursday afternoons run hottest — add one staff block next week.
        </p>
      </div>
    </>
  );
}
