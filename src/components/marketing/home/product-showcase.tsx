"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { m, useInView, useReducedMotion } from "framer-motion";
import { BarChart3, CalendarDays, Check, MessagesSquare, Sparkles, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { Reveal } from "../motion/reveal";
import { useMarketingScroll } from "../motion/scroll-context";
import { AppFrame, type AppNav } from "../appframe/app-frame";
import { FloatingToast } from "../appframe/atoms";
import { CrossfadePane } from "../appframe/crossfade-pane";
import { EASE } from "../appframe/ease";
import { PaneSignalContext } from "../appframe/pane-context";
import {
  CalendarBody,
  ClientsBody,
  FinanceBody,
  InboxBody,
  InsightBody,
} from "../appframe/panes";

const AUTO_MS = 5200;

type Feature = {
  key: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  copy: string;
  nav: AppNav;
  Body: ComponentType;
};

const FEATURES: Feature[] = [
  {
    key: "calendar",
    icon: CalendarDays,
    title: "Visual calendar",
    copy: "Day, week, and month views with reminders before every appointment.",
    nav: "calendar",
    Body: CalendarBody,
  },
  {
    key: "finance",
    icon: BarChart3,
    title: "Finances & reports",
    copy: "Revenue, balances, and trends in one place — export, no spreadsheets.",
    nav: "reports",
    Body: FinanceBody,
  },
  {
    key: "patients",
    icon: UserRound,
    title: "Patient directory",
    copy: "Find, filter, and open any patient — status, balance, and last visit at a glance.",
    nav: "clients",
    Body: ClientsBody,
  },
  {
    key: "inbox",
    icon: MessagesSquare,
    title: "Messaging",
    copy: "Conversations stay linked to the right patient and appointment.",
    nav: "inbox",
    Body: InboxBody,
  },
  {
    key: "insight",
    icon: Sparkles,
    title: "Operational insights",
    copy: "AI-assisted insights turn the day’s activity into a clear next step.",
    nav: "reports",
    Body: () => <InsightBody tone="light" />,
  },
];

export function ProductShowcase() {
  const { coarse } = useMarketingScroll();
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { amount: 0.3 });
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const interactive = !reduce && !coarse;

  useEffect(() => {
    if (!interactive || paused || !inView) return;
    const id = window.setTimeout(() => setActive((a) => (a + 1) % FEATURES.length), AUTO_MS);
    return () => clearTimeout(id);
  }, [active, paused, inView, interactive]);

  const Header = (
    <Reveal className="max-w-xl">
      <p className="eyebrow text-[#9ec3ff]">Product in action</p>
      <h2 className="mt-3 display-2 text-balance text-white">
        See it for <em className="italic font-semibold text-[#9ec3ff]">yourself</em>.
      </h2>
      <p className="mt-4 max-w-md text-lg leading-8 text-white/70">
        Real parts of the workspace — calendar, finances, the patient record, messaging, and insight — shown with sample
        clinic data.
      </p>
    </Reveal>
  );

  if (!interactive) {
    return (
      <section className="vela-night relative overflow-hidden py-20 sm:py-24">
        <div aria-hidden className="vela-grid-texture pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          {Header}
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.key} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-(--radius-tile) border border-white/15 bg-white/10 p-2 text-[#9ec3ff]">
                    <f.icon className="size-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">{f.title}</h3>
                    <p className="text-xs leading-5 text-white/55">{f.copy}</p>
                  </div>
                </div>
                <AppFrame chrome="app" nav={f.nav} glow bodyClassName="min-h-[16rem]">
                  <f.Body />
                </AppFrame>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const ActiveBody = FEATURES[active].Body;

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-[#0a1024] py-24 sm:py-32">
      {/* rendered iridescent cobalt mesh — the product pane sits in a composed scene (Stripe-style),
          replacing the busier stack of CSS aurora + ribbon layers for a cleaner, richer backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url(/marketing/mesh-dark.webp)] bg-cover bg-center"
      />
      {/* vignette so the white window stays legible on the vivid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(135%_120%_at_62%_46%,transparent_50%,rgba(4,7,20,0.58))]"
      />
      {/* a single glossy cobalt brand object floating in the open negative space,
          tucked behind the window for depth (Stripe-style hero object) */}
      <m.div
        aria-hidden
        className="pointer-events-none absolute right-[2%] top-[10%] hidden h-[14rem] w-[14rem] lg:block xl:h-[17rem] xl:w-[17rem]"
        initial={{ opacity: 0, scale: 0.94 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.8, ease: EASE }}
      >
        <m.div
          className="h-full w-full bg-[url(/marketing/object-knot.png)] bg-contain bg-no-repeat drop-shadow-[0_30px_60px_rgba(4,8,30,0.55)]"
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
      </m.div>
      <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {Header}
        <div
          className="mt-14 grid items-center gap-8 lg:grid-cols-[19rem_minmax(0,1fr)]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          {/* feature list */}
          <div className="flex flex-col gap-1.5">
            {FEATURES.map((f, i) => {
              const on = i === active;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn(
                    "group relative overflow-hidden rounded-(--radius-field) border px-4 py-3.5 text-left transition-[background-color,border-color,transform] duration-300",
                    on ? "border-white/15 bg-white/[0.08]" : "border-transparent hover:-translate-y-px hover:bg-white/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-y-2 left-0 w-1 rounded-full bg-gradient-to-b from-primary to-[#64B6FF] transition-opacity duration-300",
                      on ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-(--radius-tile) border transition-colors",
                        on ? "border-white/20 bg-white/10 text-[#9ec3ff]" : "border-white/10 bg-white/[0.04] text-white/55",
                      )}
                    >
                      <f.icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className={cn("text-sm font-bold", on ? "text-white" : "text-white/80")}>{f.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-white/55">{f.copy}</p>
                    </div>
                  </div>
                  {on ? (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/15">
                      <m.span
                        key={`${active}-${paused}`}
                        className="block h-full origin-left bg-gradient-to-r from-primary to-[#64B6FF]"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: paused ? 0 : 1 }}
                        transition={{ duration: paused ? 0 : AUTO_MS / 1000, ease: "linear" }}
                      />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* live pane */}
          <div className="relative">
            <AppFrame
              chrome="app"
              nav={FEATURES[active].nav}
              glow
              bodyClassName="min-h-[19rem]"
              float={
                <FloatingToast className="-bottom-7 -left-4 sm:-left-10">
                  <div className="w-56">
                    <div className="flex items-center gap-2.5 border-b border-black/[0.06] pb-2.5">
                      <span className="flex size-8 items-center justify-center rounded-(--radius-tile) bg-emerald-50 text-emerald-600">
                        <Check className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-[var(--brand-ink)]">Payment received</p>
                        <p className="truncate text-[11px] font-semibold text-muted-foreground">Maya Novak · #194756</p>
                      </div>
                    </div>
                    <div className="mt-2.5 space-y-1.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Consultation</span>
                        <span className="font-semibold text-[var(--brand-ink)]">€80.00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cleaning</span>
                        <span className="font-semibold text-[var(--brand-ink)]">€30.00</span>
                      </div>
                      <div className="flex justify-between border-t border-black/[0.06] pt-1.5">
                        <span className="font-bold text-[var(--brand-ink)]">Total</span>
                        <span className="font-bold text-emerald-600">€110.00</span>
                      </div>
                    </div>
                  </div>
                </FloatingToast>
              }
            >
              <PaneSignalContext.Provider value={{ active: inView, visible: inView }}>
                <CrossfadePane activeKey={FEATURES[active].key} durationMs={260}>
                  <ActiveBody />
                </CrossfadePane>
              </PaneSignalContext.Provider>
            </AppFrame>
          </div>
        </div>
      </div>
    </section>
  );
}
