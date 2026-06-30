"use client";

import { BarChart3, Bell, CalendarDays, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Reveal, RevealGroup, RevealItem } from "../motion/reveal";
import { AppPane } from "../appframe/app-pane";
import { DrawArea, FloatingToast, StatusDot } from "../appframe/atoms";
import { CalendarBody } from "../appframe/panes";

// Shared cobalt-tinted elevation for the sub-cards inside the bento — so every
// surface on the page shares one depth language, never a flatter sibling.
const SUBCARD =
  "rounded-(--radius-field) border border-black/[0.06] bg-white ring-1 ring-primary/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(10,34,255,0.05),0_16px_36px_-16px_rgba(10,34,255,0.22)]";

export function Capabilities() {
  return (
    <section className="relative overflow-hidden bg-[var(--brand-wash)]/40 py-24 sm:py-32">
      {/* soft cobalt → cyan mesh so the light band carries temperature, not airless white */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-10 size-[36rem] rounded-full bg-[radial-gradient(circle,rgba(10,34,255,0.07),transparent_62%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-0 size-[34rem] rounded-full bg-[radial-gradient(circle,rgba(100,182,255,0.10),transparent_62%)] blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow text-primary">Everything in one place</p>
          <h2 className="mt-3 display-2 text-balance text-[var(--brand-ink)]">The whole clinic, organized around the day.</h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Appointments, patient context, staff, messages, payments, and reports — connected in one calm workspace instead
            of six disconnected tools.
          </p>
        </Reveal>

        <RevealGroup className="mt-14 grid gap-4 md:grid-cols-6">
          {/* Hero tile — live calendar */}
          <BentoTile
            icon={CalendarDays}
            title="Manage appointments"
            copy="Keep the day visible with clear bookings, status, staff ownership, and protected blocked time."
            className="bg-[linear-gradient(125deg,#eaeeff_0%,#dde6ff_45%,#e8ddff_100%)] md:col-span-6"
          >
            <div className="relative mt-6">
              <AppPane
                chrome="app"
                glow
                nav="calendar"
                className="w-full"
                float={
                  <>
                    <FloatingToast className="-top-4 -right-3 sm:-right-8">
                      <span className="flex size-8 items-center justify-center rounded-(--radius-tile) bg-primary/10 text-primary">
                        <Bell className="size-4" />
                      </span>
                      <div>
                        <p className="text-xs font-bold text-[var(--brand-ink)]">Automatic reminders</p>
                        <p className="text-[10px] font-semibold text-muted-foreground">Sent before every appointment</p>
                      </div>
                    </FloatingToast>
                    <FloatingToast className="-bottom-4 -left-3 sm:-left-8">
                      <span className="flex size-8 items-center justify-center rounded-(--radius-tile) bg-emerald-50 text-emerald-600">
                        <ShieldCheck className="size-4" />
                      </span>
                      <div>
                        <p className="text-xs font-bold text-[var(--brand-ink)]">Protected blocked time</p>
                        <p className="text-[10px] font-semibold text-muted-foreground">Prep &amp; breaks stay booked</p>
                      </div>
                    </FloatingToast>
                  </>
                }
              >
                <CalendarBody />
              </AppPane>
            </div>
          </BentoTile>

          {/* Performance */}
          <BentoTile icon={BarChart3} title="Understand performance" copy="Turn daily activity into reports and a next action." className="md:col-span-2">
            <div className={cn("mt-5 flex flex-1 flex-col p-4", SUBCARD)}>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-semibold leading-none text-[var(--brand-ink)]">88%</p>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">+6%</span>
              </div>
              <p className="mt-1 text-[11px] font-semibold text-muted-foreground">Completion rate · 6 weeks</p>
              <DrawArea values={[54, 61, 58, 69, 64, 72, 70, 81, 77, 88]} className="mt-4 min-h-[5rem] flex-1" />
              <div className="mt-1.5 flex justify-between text-[9px] font-bold uppercase tracking-wide text-muted-foreground/60">
                <span>Wk 1</span>
                <span>Wk 3</span>
                <span>Wk 6</span>
              </div>
            </div>
          </BentoTile>

          {/* Patient records */}
          <BentoTile icon={UserRound} title="Organize patient records" copy="One profile for visits, notes, files, and payments." className="md:col-span-2">
            <div className={cn("mt-5 flex flex-1 flex-col p-4", SUBCARD)}>
              <div className="flex items-center gap-3">
                <span className="vela-gradient flex size-10 items-center justify-center rounded-(--radius-tile) text-sm font-bold text-white">
                  MN
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-[var(--brand-ink)]">Maya Novak</p>
                  <p className="truncate text-[12px] font-semibold text-muted-foreground">Active · 12 visits</p>
                </div>
              </div>
              <div className="mt-3.5 grid grid-cols-3 divide-x divide-black/[0.06] overflow-hidden rounded-(--radius-field) border border-black/[0.06] bg-[var(--brand-wash)]/40">
                {[
                  ["12", "Visits"],
                  ["11", "Done"],
                  ["€60", "Balance"],
                ].map(([v, l]) => (
                  <div key={l} className="px-2 py-2 text-center">
                    <p className="text-[15px] font-semibold leading-none text-[var(--brand-ink)]">{v}</p>
                    <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{l}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3.5 space-y-2.5">
                {[
                  ["12 Jun", "Filling · tooth 16", "Paid"],
                  ["28 May", "Routine check-up", "Paid"],
                  ["10 May", "Crown · tooth 26", "Due"],
                ].map(([d, t, s]) => (
                  <div key={d + t} className="flex items-center gap-2.5 text-[12px]">
                    <span className="w-12 shrink-0 font-bold text-muted-foreground">{d}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-[var(--brand-ink)]">{t}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                        s === "Paid" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600",
                      )}
                    >
                      {s}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </BentoTile>

          {/* Staff */}
          <BentoTile icon={UsersRound} title="Coordinate staff" copy="See who is available, what is assigned, and where coverage is thin." className="md:col-span-2">
            <div className="mt-5 grid flex-1 grid-cols-1 gap-2">
              {[
                { initials: "JC", role: "Dentist", on: true },
                { initials: "ER", role: "Hygienist", on: true },
                { initials: "MB", role: "Front desk", on: false },
                { initials: "OH", role: "Assistant", on: true },
              ].map((m) => (
                <div key={m.initials} className={cn("flex items-center gap-2.5 p-3", SUBCARD)}>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-tile) border border-black/[0.06] bg-[var(--brand-wash)]/60 text-xs font-bold text-primary">
                    {m.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[var(--brand-ink)]">{m.role}</p>
                    <span
                      className={cn(
                        "mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold",
                        m.on ? "text-emerald-600" : "text-muted-foreground",
                      )}
                    >
                      {m.on ? <StatusDot className="size-1.5" /> : <span className="size-1.5 rounded-full bg-muted-foreground/40" />}
                      {m.on ? "On shift" : "Off"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </BentoTile>
        </RevealGroup>
      </div>
    </section>
  );
}

function BentoTile({
  icon: Icon,
  title,
  copy,
  children,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  copy: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RevealItem
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-(--radius-hero) border border-black/[0.06] bg-white p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_1px_rgba(10,34,255,0.04),0_26px_60px_-26px_rgba(10,34,255,0.26)] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_1px_rgba(10,34,255,0.04),0_36px_84px_-30px_rgba(10,34,255,0.36)] sm:p-7",
        className,
      )}
    >
      <span className="vela-icon-tile transition-transform duration-300 group-hover:scale-105">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-5 text-xl font-bold tracking-[-0.012em] text-[var(--brand-ink)] sm:text-2xl">{title}</h3>
      <p className="mt-2.5 max-w-md text-[15px] leading-6 text-muted-foreground">{copy}</p>
      {children}
    </RevealItem>
  );
}
