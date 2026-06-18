import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Search,
  Settings,
  Sparkles,
  UsersRound,
} from "lucide-react";
import type { ElementType } from "react";

export type AppMockupKind =
  | "dashboard"
  | "calendar"
  | "patients"
  | "staff"
  | "inbox"
  | "documents"
  | "reports";

const NAV: { key: string; icon: ElementType<{ className?: string }> }[] = [
  { key: "dashboard", icon: LayoutDashboard },
  { key: "calendar", icon: CalendarDays },
  { key: "patients", icon: UsersRound },
  { key: "staff", icon: UsersRound },
  { key: "inbox", icon: MessageCircle },
  { key: "reports", icon: BarChart3 },
];

const TITLES: Record<AppMockupKind, string> = {
  dashboard: "Dashboard",
  calendar: "Calendar",
  patients: "Patients",
  staff: "Staff",
  inbox: "Inbox",
  documents: "Patient · Documents",
  reports: "Reports",
};

/** A realistic Vela app window — sidebar + topbar + content. Code-native, sample data. */
export function AppMockup({ kind }: { kind: AppMockupKind }) {
  const activeKey = kind === "documents" ? "patients" : kind;
  return (
    <div className="overflow-hidden rounded-(--radius-hero) border border-border/80 bg-white shadow-[0_40px_120px_rgba(20,21,47,0.14)]">
      <div className="flex">
        {/* sidebar */}
        <div className="hidden w-14 shrink-0 flex-col items-center gap-3 border-r border-border/60 bg-[var(--brand-wash)]/50 py-4 sm:flex">
          <span className="flex size-8 items-center justify-center rounded-(--radius-tile) vela-gradient text-[11px] font-bold text-white">V</span>
          <div className="mt-1 flex flex-col items-center gap-2.5">
            {NAV.map(({ key, icon: Icon }, i) => (
              <span
                key={key + i}
                className={
                  "flex size-8 items-center justify-center rounded-(--radius-tile) " +
                  (key === activeKey ? "border border-primary/30 bg-white text-primary" : "text-muted-foreground/60")
                }
              >
                <Icon className="size-4" />
              </span>
            ))}
          </div>
          <span className="mt-auto flex size-8 items-center justify-center rounded-(--radius-tile) text-muted-foreground/60">
            <Settings className="size-4" />
          </span>
        </div>

        {/* main */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
            <p className="text-sm font-bold text-[var(--brand-ink)]">{TITLES[kind]}</p>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-[var(--brand-wash)]/50 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground sm:flex">
                <Search className="size-3" />
                Search
              </span>
              <span className="relative flex size-7 items-center justify-center rounded-full border border-border/70 text-muted-foreground">
                <Bell className="size-3.5" />
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
              </span>
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">RK</span>
            </div>
          </div>
          <div className="p-4">
            <Content kind={kind} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Content({ kind }: { kind: AppMockupKind }) {
  if (kind === "calendar") return <CalendarContent />;
  if (kind === "patients") return <PatientsContent />;
  if (kind === "staff") return <StaffContent />;
  if (kind === "inbox") return <InboxContent />;
  if (kind === "documents") return <DocumentsContent />;
  if (kind === "reports") return <ReportsContent />;
  return <DashboardContent />;
}

function Tone({ children, tone }: { children: React.ReactNode; tone: "live" | "calm" | "warn" }) {
  return (
    <span
      className={
        "rounded-full px-2 py-0.5 text-[10px] font-bold " +
        (tone === "live"
          ? "bg-emerald-50 text-emerald-600"
          : tone === "warn"
            ? "bg-amber-50 text-amber-600"
            : "bg-primary/10 text-primary")
      }
    >
      {children}
    </span>
  );
}

function DashboardContent() {
  const kpis = [
    { label: "Appointments", value: "7" },
    { label: "Completion", value: "84%" },
    { label: "Active clients", value: "248" },
    { label: "Revenue", value: "€8.2k" },
    { label: "Unread", value: "12" },
  ];
  const schedule = [
    ["09:30", "Maya N.", "Checked in", "live"],
    ["11:00", "Daniel K.", "Confirmed", "calm"],
    ["13:30", "Anna R.", "Payment due", "warn"],
  ] as const;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-(--radius-field) border border-border/70 bg-white p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-base font-semibold text-[var(--brand-ink)]">{k.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr]">
        <div className="rounded-(--radius-field) border border-border/70 bg-white p-3">
          <p className="text-xs font-bold text-[var(--brand-ink)]">Today&apos;s schedule</p>
          <div className="mt-2 space-y-1.5">
            {schedule.map(([time, name, status, tone]) => (
              <div key={time} className="grid grid-cols-[2.8rem_1fr_auto] items-center gap-2 rounded-[0.5rem] bg-[var(--brand-wash)]/50 px-2.5 py-2 text-xs">
                <span className="font-bold text-primary">{time}</span>
                <span className="font-bold text-[var(--brand-ink)]">{name}</span>
                <Tone tone={tone}>{status}</Tone>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-(--radius-field) border border-primary/20 bg-gradient-to-br from-primary/10 to-[#64B6FF]/10 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
            <Sparkles className="size-3.5" />
            Insight
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-[var(--brand-ink)]">
            Thursday afternoons run hottest — add one staff block next week.
          </p>
          <div className="mt-3 flex items-end gap-1">
            {[44, 58, 50, 70, 62, 80, 72].map((h, i) => (
              <span key={i} className="flex-1 rounded-t-[2px] bg-gradient-to-t from-primary to-[#64B6FF]" style={{ height: `${h * 0.5}px` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarContent() {
  const cols = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const events = [
    { col: 0, top: 4, h: 18, label: "A. Krasniqi", tone: "bg-primary/10 text-primary" },
    { col: 1, top: 12, h: 22, label: "B. Gashi", tone: "bg-[#eef] text-[#5b6bd6]" },
    { col: 2, top: 26, h: 16, label: "D. Shala", tone: "bg-emerald-50 text-emerald-600" },
    { col: 3, top: 40, h: 24, label: "F. Rama", tone: "bg-amber-50 text-amber-600" },
    { col: 0, top: 46, h: 16, label: "L. Berisha", tone: "bg-primary/10 text-primary" },
    { col: 4, top: 20, h: 20, label: "N. Bell", tone: "bg-[#eef] text-[#5b6bd6]" },
  ];
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-full border border-border/70 bg-[var(--brand-wash)]/50 p-0.5 text-[10px] font-bold">
          <span className="rounded-full px-2.5 py-1 text-muted-foreground">Day</span>
          <span className="rounded-full bg-white px-2.5 py-1 text-primary shadow-sm">Week</span>
          <span className="rounded-full px-2.5 py-1 text-muted-foreground">Month</span>
        </div>
        <span className="text-xs font-bold text-[var(--brand-ink)]">April 2026</span>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5 text-center">
        {cols.map((c) => (
          <span key={c} className="text-[10px] font-bold text-muted-foreground">{c}</span>
        ))}
      </div>
      <div className="relative mt-1.5 grid h-40 grid-cols-5 gap-1.5">
        {cols.map((c) => (
          <div key={c} className="rounded-[0.5rem] border border-border/50 bg-[var(--brand-wash)]/30" />
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
    </div>
  );
}

function PatientsContent() {
  const rows = [
    { initials: "MN", name: "Maya Novak", status: "Active", tone: "calm", last: "Cleaning · Dr. Kim" },
    { initials: "DK", name: "Daniel Kelmendi", status: "Attention", tone: "warn", last: "Crown · Dr. Reka" },
    { initials: "AR", name: "Anna Rama", status: "Active", tone: "calm", last: "Whitening · Dr. Kim" },
    { initials: "LB", name: "Leon Berisha", status: "No visits", tone: "muted", last: "—" },
  ] as const;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">All · 248</span>
        <span className="rounded-full border border-border/70 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">Active · 212</span>
        <span className="rounded-full border border-border/70 px-2.5 py-1 text-[10px] font-bold text-amber-600">Attention · 9</span>
        <span className="ml-auto rounded-full vela-gradient px-2.5 py-1 text-[10px] font-bold text-white">+ New</span>
      </div>
      <div className="mt-3 overflow-hidden rounded-(--radius-field) border border-border/70">
        {rows.map((r, i) => (
          <div
            key={r.name}
            className={"grid grid-cols-[auto_1fr_auto] items-center gap-2.5 px-3 py-2.5 " + (i % 2 ? "bg-[var(--brand-wash)]/40" : "bg-white")}
          >
            <span className="flex size-8 items-center justify-center rounded-(--radius-tile) border border-border/70 bg-white text-[10px] font-bold text-primary">{r.initials}</span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-[var(--brand-ink)]">{r.name}</p>
              <p className="truncate text-[10px] font-semibold text-muted-foreground">{r.last}</p>
            </div>
            <Tone tone={r.tone === "warn" ? "warn" : r.tone === "muted" ? "calm" : "calm"}>{r.status}</Tone>
          </div>
        ))}
      </div>
    </div>
  );
}

function StaffContent() {
  const staff = [
    { initials: "RK", name: "Dr. Reka", role: "Dentist", shift: "09:00–17:00", rate: 86, on: true },
    { initials: "AL", name: "Arta L.", role: "Hygienist", shift: "10:00–18:00", rate: 74, on: true },
    { initials: "TS", name: "Teuta S.", role: "Front desk", shift: "Next: Mon", rate: 0, on: false },
  ];
  return (
    <div className="overflow-hidden rounded-(--radius-field) border border-border/70">
      {staff.map((s, i) => (
        <div key={s.name} className={"grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-3 " + (i % 2 ? "bg-[var(--brand-wash)]/40" : "bg-white")}>
          <span className="flex size-9 items-center justify-center rounded-(--radius-tile) border border-border/70 bg-white text-[11px] font-bold text-primary">{s.initials}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-xs font-bold text-[var(--brand-ink)]">{s.name}</p>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold text-primary">{s.role}</span>
            </div>
            <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
              {s.shift}
              {s.on ? <span className="ml-2 text-emerald-600">● Checked in</span> : null}
            </p>
          </div>
          {s.rate > 0 ? (
            <div className="w-16">
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--brand-wash)]">
                <span className="block h-full rounded-full vela-gradient" style={{ width: `${s.rate}%` }} />
              </div>
              <p className="mt-1 text-right text-[9px] font-bold text-muted-foreground">{s.rate}%</p>
            </div>
          ) : (
            <span className="rounded-full border border-border/70 px-2 py-0.5 text-[9px] font-bold text-muted-foreground">Off</span>
          )}
        </div>
      ))}
    </div>
  );
}

function InboxContent() {
  const convos = [
    { initials: "MN", name: "Maya Novak", snippet: "Can I move to 11:00?", unread: 2, active: true },
    { initials: "DK", name: "Daniel K.", snippet: "Thank you!", unread: 0, active: false },
    { initials: "AR", name: "Anna Rama", snippet: "See you tomorrow", unread: 0, active: false },
  ];
  return (
    <div className="grid h-44 grid-cols-[1fr_1.4fr] gap-2.5">
      <div className="space-y-1.5 overflow-hidden">
        {convos.map((c) => (
          <div
            key={c.name}
            className={
              "flex items-center gap-2 rounded-(--radius-field) p-2 " +
              (c.active ? "border-l-2 border-primary bg-primary/5" : "bg-[var(--brand-wash)]/40")
            }
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-(--radius-tile) border border-border/70 bg-white text-[9px] font-bold text-primary">{c.initials}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold text-[var(--brand-ink)]">{c.name}</p>
              <p className="truncate text-[10px] font-semibold text-muted-foreground">{c.snippet}</p>
            </div>
            {c.unread ? <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-white">{c.unread}</span> : null}
          </div>
        ))}
      </div>
      <div className="flex flex-col rounded-(--radius-field) border border-border/70 bg-white p-2.5">
        <p className="border-b border-border/60 pb-1.5 text-[11px] font-bold text-[var(--brand-ink)]">Maya Novak · +383 …</p>
        <div className="flex flex-1 flex-col justify-center gap-1.5 py-2 text-[10px] font-semibold">
          <p className="mr-6 rounded-[0.5rem] bg-[var(--brand-wash)] p-1.5 text-muted-foreground">Can I move to 11:00?</p>
          <p className="ml-6 rounded-[0.5rem] bg-primary/10 p-1.5 text-primary">Done — confirmed 11:00.</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border/70 px-2 py-1 text-[9px] text-muted-foreground">
          Type a reply…
        </div>
      </div>
    </div>
  );
}

function DocumentsContent() {
  const docs = [
    { name: "X-ray — tooth 26", icon: FileText, date: "10 Mar" },
    { name: "Consent form", icon: FileText, date: "28 Feb" },
    { name: "Invoice #1042", icon: CreditCard, date: "12 Apr" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr]">
      <div className="rounded-(--radius-field) border border-border/70 bg-white p-3">
        <p className="text-xs font-bold text-[var(--brand-ink)]">Documents</p>
        <div className="mt-2 space-y-1.5">
          {docs.map((d) => (
            <div key={d.name} className="flex items-center gap-2 rounded-[0.5rem] bg-[var(--brand-wash)]/50 px-2.5 py-2">
              <d.icon className="size-3.5 text-primary" />
              <span className="flex-1 truncate text-[11px] font-bold text-[var(--brand-ink)]">{d.name}</span>
              <span className="text-[10px] font-semibold text-muted-foreground">{d.date}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-(--radius-field) border border-border/70 bg-white p-3">
        <p className="text-xs font-bold text-[var(--brand-ink)]">Payments</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-[0.5rem] bg-[var(--brand-wash)]/50 p-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Billed</p>
            <p className="text-sm font-semibold text-[var(--brand-ink)]">€420</p>
          </div>
          <div className="rounded-[0.5rem] bg-[var(--brand-wash)]/50 p-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Paid</p>
            <p className="text-sm font-semibold text-emerald-600">€360</p>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between rounded-[0.5rem] border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-700">
          Outstanding <span>€60</span>
        </div>
      </div>
    </div>
  );
}

function ReportsContent() {
  const kpis = [
    { label: "Appointments", value: "142", delta: "+12%" },
    { label: "Completion", value: "84%", delta: "+3%" },
    { label: "New clients", value: "26", delta: "+8%" },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-(--radius-field) border border-border/70 bg-white p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{k.label}</p>
            <div className="mt-1 flex items-end justify-between">
              <p className="text-base font-semibold text-[var(--brand-ink)]">{k.value}</p>
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold text-emerald-600">{k.delta}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr]">
        <div className="rounded-(--radius-field) border border-border/70 bg-white p-3">
          <p className="text-[11px] font-bold text-[var(--brand-ink)]">Performance</p>
          <div className="mt-3 flex h-20 items-end gap-1.5">
            {[40, 52, 48, 64, 58, 72, 68, 80, 76, 88].map((h, i) => (
              <span key={i} className={"flex-1 rounded-t-[2px] " + (i === 9 ? "bg-primary" : "bg-primary/25")} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <div className="rounded-(--radius-field) border border-primary/20 bg-gradient-to-br from-primary/10 to-[#64B6FF]/10 p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary">
            <Sparkles className="size-3.5" />
            Operational health
          </div>
          <p className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">82<span className="text-sm text-muted-foreground">/100</span></p>
          <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
            <CheckCircle2 className="size-3 text-emerald-500" /> Strong completion & demand
          </p>
        </div>
      </div>
    </div>
  );
}
