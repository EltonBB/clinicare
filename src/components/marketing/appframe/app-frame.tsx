"use client";

import type { ReactNode } from "react";
import {
  BarChart3,
  Bell,
  CalendarDays,
  LayoutDashboard,
  Lock,
  MessagesSquare,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { m, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { EASE } from "./ease";

export type AppNav = "dashboard" | "calendar" | "clients" | "inbox" | "reports";

export type AppFrameProps = {
  children: ReactNode;
  /** "window" = title bar only (default); "app" = title bar + sidebar rail + topbar. */
  chrome?: "window" | "app";
  /** 3D perspective settle on scroll-in (hero panes only). */
  tilt?: boolean;
  /** Mesh glow backdrop so the pane lifts off the section. */
  glow?: boolean;
  /** Wrap the window in a soft, gradient-lit "stage" card (the Stripe move). */
  stage?: boolean;
  /** "night" = sits on a dark section. */
  tone?: "light" | "night";
  /** Active nav glyph for the "app" chrome. */
  nav?: AppNav;
  /** Overrides the topbar breadcrumb (defaults to the nav label). */
  title?: string;
  /** Floating accent cards, rendered over the window edges (outside its clip). */
  float?: ReactNode;
  className?: string;
  bodyClassName?: string;
};

const NAV: { key: AppNav; icon: typeof LayoutDashboard; label: string }[] = [
  { key: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { key: "calendar", icon: CalendarDays, label: "Calendar" },
  { key: "clients", icon: Users, label: "Patients" },
  { key: "inbox", icon: MessagesSquare, label: "Inbox" },
  { key: "reports", icon: BarChart3, label: "Reports" },
];

const TITLES: Record<AppNav, string> = {
  dashboard: "Dashboard",
  calendar: "Calendar",
  clients: "Patients",
  inbox: "Inbox",
  reports: "Reports",
};

// Layered, grounded depth — a tight contact shadow seats the pane, a wide
// black-based ambient grounds it, and a cobalt accent keeps it on-brand. A
// single tinted blur reads toy-like; this stack reads like a real product card.
const LIGHT_SHADOW =
  "0 1px 2px rgba(13,18,40,.07), 0 3px 8px -2px rgba(13,18,40,.08), 0 11px 18px -8px rgba(13,18,40,.22), 0 22px 40px -16px rgba(13,18,40,.18), 0 48px 80px -36px rgba(10,34,255,.2), inset 0 1px 0 rgba(255,255,255,.9)";
const NIGHT_SHADOW =
  "inset 0 1px 0 rgba(140,175,255,.24), 0 2px 6px rgba(0,0,0,.34), 0 13px 22px -8px rgba(0,0,0,.55), 0 26px 56px -20px rgba(0,0,0,.5), 0 52px 104px -40px rgba(0,0,0,.46), 0 40px 84px -32px rgba(10,34,255,.26), 0 0 0 1px rgba(100,182,255,.1)";

export function AppFrame({
  children,
  chrome = "window",
  tilt = false,
  glow = false,
  stage = false,
  tone = "light",
  nav = "dashboard",
  title,
  float,
  className,
  bodyClassName,
}: AppFrameProps) {
  const reduce = useReducedMotion();
  const night = tone === "night";

  // A named container, not a viewport breakpoint: this pane is reused inside
  // wildly different widths at the same viewport (full-width hero, a bento
  // tile, a 2-up card in a coarse-pointer grid) — @sm:/@md: below react to
  // *this box's* rendered width, not the window's, so "enough room" is never
  // decided by how many unrelated columns share the row.
  const body = (
    <div className={cn("@container/pane p-5 sm:p-6", night && "text-white", bodyClassName)}>{children}</div>
  );

  const frame = (
    <div
      className={cn(
        "relative overflow-hidden rounded-(--radius-hero)",
        night
          ? "border border-white/10 bg-[radial-gradient(135%_95%_at_72%_-14%,rgba(48,80,205,0.5),#0a1330_56%)] ring-1 ring-white/[0.08]"
          : "border border-black/[0.06] bg-white ring-1 ring-primary/[0.07]",
        className,
      )}
      style={{ boxShadow: night ? NIGHT_SHADOW : LIGHT_SHADOW, transformStyle: tilt ? "preserve-3d" : undefined }}
    >
      <TitleBar night={night} />
      {chrome === "app" ? (
        <div className="flex">
          <Rail nav={nav} night={night} />
          <div className="min-w-0 flex-1">
            <Topbar nav={nav} title={title} night={night} />
            {body}
          </div>
        </div>
      ) : (
        body
      )}
    </div>
  );

  // Optional gradient "stage" — the window floats inside a softly lit card so it
  // never reads as a bare rectangle on flat ground (Stripe's product surfaces).
  const staged = stage ? (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[1.8rem] p-6 sm:p-9",
        night
          ? "bg-[linear-gradient(135deg,#111d44_0%,#0b1430_55%,#070d22_100%)] ring-1 ring-white/[0.06]"
          : "bg-[linear-gradient(120deg,#eef2ff_0%,#dde6ff_38%,#e4ddff_72%,#d6ecff_100%)] ring-1 ring-primary/[0.08]",
      )}
    >
      {/* cobalt → cyan → violet mesh so the stage never reads single-temperature */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute rounded-full blur-[90px]",
          night
            ? "-right-16 -top-20 size-96 bg-[radial-gradient(circle,rgba(100,182,255,0.44),transparent_66%)]"
            : "-right-14 -top-16 size-80 bg-[radial-gradient(circle,rgba(100,182,255,0.42),transparent_66%)]",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute rounded-full blur-[90px]",
          night
            ? "-bottom-24 -left-16 size-96 bg-[radial-gradient(circle,rgba(99,90,214,0.38),transparent_66%)]"
            : "-bottom-20 -left-14 size-80 bg-[radial-gradient(circle,rgba(99,90,214,0.3),transparent_66%)]",
        )}
      />
      <div aria-hidden className="vela-grid-texture pointer-events-none absolute inset-0 opacity-[0.3]" />
      {night ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_42%,transparent_48%,rgba(3,6,18,0.55))]"
        />
      ) : null}
      <div className="relative">{frame}</div>
    </div>
  ) : (
    frame
  );

  const inner =
    tilt && !reduce ? (
      <div className="relative" style={{ perspective: 1800 }}>
        <m.div
          style={{ transformStyle: "preserve-3d" }}
          initial={{ rotateX: 8, rotateY: -11, y: 28, opacity: 0 }}
          whileInView={{ rotateX: 2, rotateY: 0, y: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 1, ease: EASE }}
        >
          {staged}
        </m.div>
      </div>
    ) : (
      staged
    );

  return (
    <div className="relative">
      {/* Two-layer volumetric glow so the pane reads as lit in space, not pasted on:
          a wide soft halo + a tighter brighter core spilling from behind the window. */}
      {glow ? (
        <>
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute -inset-x-24 -inset-y-16 -z-10 blur-[96px]",
              night
                ? "bg-[radial-gradient(58%_58%_at_38%_26%,rgba(100,182,255,0.4),transparent_72%)]"
                : "bg-[radial-gradient(62%_62%_at_38%_26%,rgba(10,34,255,0.3),transparent_73%)]",
            )}
          />
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute -inset-x-6 -inset-y-3 -z-10 blur-[52px]",
              night
                ? "bg-[radial-gradient(52%_52%_at_42%_32%,rgba(125,172,255,0.5),transparent_70%)]"
                : "bg-[radial-gradient(56%_56%_at_42%_34%,rgba(10,34,255,0.26),transparent_70%)]",
            )}
          />
        </>
      ) : null}
      {inner}
      {float}
    </div>
  );
}

/** The mac-style window bar every pane shares — so all panes read as the real app in a window. */
function TitleBar({ night }: { night: boolean }) {
  return (
    <div
      className={cn(
        "flex h-9 items-center gap-2.5 border-b px-4",
        night ? "border-white/10 bg-white/[0.04]" : "border-black/5 bg-white/70 backdrop-blur",
      )}
      style={{ boxShadow: night ? "inset 0 1px 0 rgba(255,255,255,0.06)" : "inset 0 1px 0 rgba(255,255,255,0.7)" }}
    >
      <div className="flex items-center gap-2">
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span
            key={c}
            className="size-3 rounded-full"
            style={{ background: c, opacity: 0.85, boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.08)" }}
          />
        ))}
      </div>
      <div
        className={cn(
          "ml-auto flex h-6 items-center gap-1.5 rounded-full pl-2.5 pr-3.5",
          night ? "bg-white/[0.06] text-white/55" : "bg-[var(--brand-wash)] text-muted-foreground",
        )}
      >
        <Lock className="size-3 opacity-70" />
        <span className="text-[12px] font-semibold tracking-tight">app.vela.care</span>
      </div>
    </div>
  );
}

function Rail({ nav, night }: { nav: AppNav; night: boolean }) {
  return (
    <div
      className={cn(
        "flex w-14 shrink-0 flex-col gap-4 border-r px-2.5 py-4 sm:w-[10rem] sm:px-3",
        night ? "border-white/10 bg-white/[0.03]" : "border-black/5 bg-[var(--brand-wash)]/55",
      )}
    >
      {/* brand */}
      <div className="flex items-center gap-2 px-0.5 sm:px-1.5">
        <span
          className="vela-gradient size-7 shrink-0 rounded-[0.5rem] shadow-[0_4px_12px_-2px_rgba(10,34,255,0.5)]"
          aria-hidden
        />
        <span className={cn("hidden text-[15px] font-bold tracking-tight sm:inline", night ? "text-white" : "text-[var(--brand-ink)]")}>
          Vela
        </span>
      </div>

      {/* nav */}
      <div className="flex flex-col items-center gap-1 sm:items-stretch">
        {NAV.map(({ key, icon: Icon, label }) => {
          const on = key === nav;
          return (
            <span
              key={key}
              className={cn(
                "relative flex items-center justify-center gap-2.5 rounded-[0.6rem] px-0 py-2 text-[13px] font-bold sm:justify-start sm:px-2.5",
                on
                  ? night
                    ? "bg-primary/25 text-white"
                    : "bg-primary/10 text-primary"
                  : night
                    ? "text-white/45"
                    : "text-muted-foreground/80",
              )}
            >
              {on ? (
                <span className="absolute left-0 top-1/2 hidden h-5 w-0.5 -translate-y-1/2 rounded-full bg-current sm:block" />
              ) : null}
              <Icon className="size-[1.05rem] shrink-0" />
              <span className="hidden truncate sm:inline">{label}</span>
            </span>
          );
        })}
      </div>

      {/* account chip */}
      <div
        className={cn(
          "mt-auto flex items-center gap-2 rounded-[0.6rem] px-1 py-1.5 sm:px-2",
          night ? "sm:bg-white/[0.04]" : "sm:bg-white",
        )}
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-[0.45rem] text-[11px] font-bold",
            night ? "bg-white/10 text-white" : "border border-black/[0.06] bg-[var(--brand-wash)] text-primary",
          )}
        >
          VC
        </span>
        <div className="hidden min-w-0 sm:block">
          <p className={cn("truncate text-[12px] font-bold leading-tight", night ? "text-white" : "text-[var(--brand-ink)]")}>
            Vela Clinic
          </p>
          <p className={cn("truncate text-[11px] font-semibold leading-tight", night ? "text-white/45" : "text-muted-foreground")}>
            Pro plan
          </p>
        </div>
      </div>
    </div>
  );
}

function Topbar({ nav, title, night }: { nav: AppNav; title?: string; night: boolean }) {
  const ink = night ? "text-white" : "text-[var(--brand-ink)]";
  return (
    <div
      className={cn(
        "flex h-12 items-center gap-2.5 border-b px-4",
        night ? "border-white/10 bg-white/[0.03]" : "border-black/5 bg-white/60",
      )}
    >
      <p className={cn("text-[15px] font-bold tracking-tight", ink)}>{title ?? TITLES[nav]}</p>
      <div className="ml-auto flex items-center gap-2">
        <div
          className={cn(
            "hidden h-7 items-center gap-1.5 rounded-full px-3 sm:flex",
            night ? "bg-white/[0.06] text-white/45" : "bg-[var(--brand-wash)] text-muted-foreground",
          )}
        >
          <Search className="size-3.5" />
          <span className="text-[12px] font-semibold">Search…</span>
        </div>
        <span className="vela-gradient inline-flex h-7 items-center gap-1 rounded-full pl-2 pr-3 text-[12px] font-bold text-white">
          <Plus className="size-3.5" />
          New
        </span>
        <span className={cn("relative flex size-7 items-center justify-center rounded-[0.5rem]", night ? "text-white/55" : "text-muted-foreground")}>
          <Bell className="size-[1.05rem]" />
          <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-[#e05261] ring-2 ring-white" />
        </span>
        <Settings className={cn("hidden size-[1.05rem] sm:block", night ? "text-white/40" : "text-muted-foreground/70")} />
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-[0.5rem] text-[11px] font-bold",
            night ? "bg-white/10 text-white" : "vela-gradient text-white",
          )}
        >
          AM
        </span>
      </div>
    </div>
  );
}
