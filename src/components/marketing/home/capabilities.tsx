"use client";

import { BarChart3, CalendarDays, UserRound, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal, RevealGroup, RevealItem } from "../motion/reveal";

export function Capabilities() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="eyebrow text-muted-foreground">Everything in one place</p>
        <h2 className="mt-3 display-2 text-[var(--brand-ink)]">The whole clinic, organized around the day.</h2>
        <p className="mt-5 text-base leading-8 text-muted-foreground">
          Appointments, patient context, staff, messages, payments, and reports — connected in one calm workspace
          instead of six disconnected tools.
        </p>
      </Reveal>

      <RevealGroup className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
        <BentoTile
          icon={CalendarDays}
          title="Manage appointments"
          copy="Keep the day visible with clear bookings, status, staff ownership, and protected blocked time."
          className="lg:col-span-7"
          visual={<ScheduleVisual />}
        />
        <BentoTile
          icon={BarChart3}
          title="Understand performance"
          copy="Turn daily activity into operational reports, trends, and a recommended next action."
          className="lg:col-span-5"
          visual={<ChartVisual />}
        />
        <BentoTile
          icon={UserRound}
          title="Organize patient records"
          copy="Attach visits, notes, images, documents, messages, and payments to one profile."
          className="lg:col-span-5"
          visual={<RecordVisual />}
        />
        <BentoTile
          icon={UsersRound}
          title="Coordinate staff"
          copy="See who is available, what is assigned, and where the clinic needs more coverage."
          className="lg:col-span-7"
          visual={<StaffVisual />}
        />
      </RevealGroup>
    </section>
  );
}

function BentoTile({
  icon: Icon,
  title,
  copy,
  visual,
  className,
}: {
  icon: typeof CalendarDays;
  title: string;
  copy: string;
  visual: ReactNode;
  className?: string;
}) {
  return (
    <RevealItem
      className={
        "group relative flex flex-col overflow-hidden rounded-(--radius-hero) border border-border/80 bg-white p-6 shadow-[0_18px_54px_rgba(20,21,47,0.05)] transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_30px_80px_rgba(10,34,255,0.12)] sm:p-7 " +
        (className ?? "")
      }
    >
      <span className="vela-icon-tile transition-transform duration-300 group-hover:scale-105">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-5 text-lg font-bold text-[var(--brand-ink)]">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{copy}</p>
      <div className="mt-6 flex-1">{visual}</div>
    </RevealItem>
  );
}

function ScheduleVisual() {
  const rows = [
    ["09:30", "Maya N.", "Checked in", "live"],
    ["11:00", "Daniel K.", "Confirmed", "calm"],
    ["13:30", "Anna R.", "Payment due", "warn"],
  ];
  return (
    <div className="grid gap-2">
      {rows.map(([time, name, status, tone]) => (
        <div
          key={time}
          className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 rounded-(--radius-field) border border-border/60 bg-[var(--brand-wash)]/45 px-3 py-2.5"
        >
          <span className="text-xs font-bold text-primary">{time}</span>
          <span className="text-sm font-bold text-[var(--brand-ink)]">{name}</span>
          <span
            className={
              "rounded-full px-2.5 py-0.5 text-[10px] font-bold " +
              (tone === "live"
                ? "bg-emerald-50 text-emerald-600"
                : tone === "warn"
                  ? "bg-amber-50 text-amber-600"
                  : "bg-primary/10 text-primary")
            }
          >
            {status}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartVisual() {
  const bars = [48, 62, 54, 76, 68, 88];
  return (
    <div className="rounded-(--radius-field) border border-border/60 bg-[var(--brand-wash)]/45 p-4">
      <div className="flex items-center justify-between text-xs font-bold">
        <span className="text-muted-foreground">Completion</span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-600">+6%</span>
      </div>
      <div className="mt-3 flex h-16 items-end gap-1.5">
        {bars.map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-t-[3px] bg-gradient-to-t from-primary to-[#64B6FF]"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function RecordVisual() {
  return (
    <div className="rounded-(--radius-field) border border-border/60 bg-[var(--brand-wash)]/45 p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-(--radius-tile) border border-border/70 bg-white text-sm font-bold text-primary">
          MN
        </span>
        <div>
          <p className="text-sm font-bold text-[var(--brand-ink)]">Maya Novak</p>
          <p className="text-[11px] font-semibold text-muted-foreground">Active patient · 12 visits</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["Notes", "Documents", "Payments", "Messages"].map((tag) => (
          <span key={tag} className="rounded-full border border-border/70 bg-white px-2.5 py-1 text-[10px] font-bold text-muted-foreground">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

function StaffVisual() {
  const staff = [
    { initials: "RK", role: "Dentist", on: true },
    { initials: "AL", role: "Hygienist", on: true },
    { initials: "TS", role: "Front desk", on: false },
    { initials: "NB", role: "Assistant", on: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {staff.map((member) => (
        <div key={member.initials} className="rounded-(--radius-field) border border-border/60 bg-[var(--brand-wash)]/45 p-3 text-center">
          <span className="mx-auto flex size-9 items-center justify-center rounded-(--radius-tile) border border-border/70 bg-white text-xs font-bold text-primary">
            {member.initials}
          </span>
          <p className="mt-2 text-[11px] font-bold text-[var(--brand-ink)]">{member.role}</p>
          <span
            className={
              "mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold " +
              (member.on ? "bg-emerald-50 text-emerald-600" : "bg-muted text-muted-foreground")
            }
          >
            {member.on ? "On shift" : "Off"}
          </span>
        </div>
      ))}
    </div>
  );
}
