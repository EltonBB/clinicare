"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { Check } from "lucide-react";

import { renderReminder } from "@/lib/messaging/render";
import { addZonedDays, formatZonedFullDate, getZonedDateParts } from "@/lib/time-zone";
import { hoursBetweenTimes, weekdayOrder, type WeekdayKey, type WorkingHoursState } from "@/lib/onboarding";
import { cn, getInitials } from "@/lib/utils";

export type ClinicPreviewFocus = "intro" | "clinic" | "hours" | "team" | "done";
type StepFocus = "clinic" | "hours" | "team";

// Brand-tinted surfaces for the ink panel (no white boxes on the dark blue).
const tintTile =
  "border border-[color-mix(in_oklab,var(--clinic-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--clinic-accent)_22%,transparent)] text-[var(--clinic-bright)]";
const tintSurface =
  "border border-[color-mix(in_oklab,var(--clinic-accent)_30%,transparent)] bg-[color-mix(in_oklab,var(--clinic-accent)_14%,rgba(255,255,255,0.04))]";

export type ClinicPreviewProps = {
  name: string;
  type: string;
  /** A display URL that is already safe to render (signed or validated), or "". */
  logoUrl: string;
  /** The stored logo reference, used to tell a new upload from a restored one. */
  logoRef?: string;
  /** True once the starting state (including any restored draft) is in place; edits after it are announced. */
  announceChanges?: boolean;
  accent: string;
  hours: WorkingHoursState;
  team: Array<{ name: string; role: string }>;
  /** The workspace's saved reminder template; empty means the default. */
  reminderTemplate?: string | null;
  /** The step being filled in (its card lifts, the rest dim); "intro" and "done" light everything. */
  focus: ClinicPreviewFocus;
};

const EASE = [0.23, 1, 0.32, 1] as const;
const SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;

// The week chart spans 07:00 to 19:00, the range the hours step offers.
const DAY_START = 7;
const DAY_SPAN = 12;
const TICKS = [9, 12, 15, 18];

const dayLabel = (day: WeekdayKey) => day[0].toUpperCase() + day.slice(1);

function toHours(time: string) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour + minute / 60;
}

const position = (hours: number) => Math.min(Math.max((hours - DAY_START) / DAY_SPAN, 0), 1) * 100;

// weekdayOrder starts on Monday; getUTCDay() starts on Sunday.
const weekdayOf = (utcDay: number) => weekdayOrder[(utcDay + 6) % 7];

/**
 * The soonest open day after today in the clinic's time zone (the zone
 * reminders are sent in), with that date already formatted, or null when the
 * week is closed. Day search and date math both stay on the zone's calendar.
 */
function nextOpenDay(hours: WorkingHoursState) {
  const today = getZonedDateParts(new Date());
  for (let ahead = 1; ahead <= 7; ahead++) {
    const { year, month, day } = addZonedDays(today, ahead);
    const calendarDay = new Date(Date.UTC(year, month - 1, day, 12));
    const weekday = weekdayOf(calendarDay.getUTCDay());
    if (hours[weekday].enabled) return { day: weekday, label: formatZonedFullDate(calendarDay, "UTC") };
  }
  return null;
}

/** Today's weekday and hour in the clinic's time zone. */
function clinicNow() {
  const parts = getZonedDateParts(new Date());
  return {
    day: weekdayOf(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()),
    hours: parts.hour + parts.minute / 60,
  };
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** A number that counts to its new value instead of jumping (jumps under reduced motion). */
function CountUp({ value, format = (v: number) => String(Math.round(v)) }: { value: number; format?: (v: number) => string }) {
  const still = useReducedMotion();
  const spring = useSpring(value, { stiffness: 90, damping: 20 });
  const text = useTransform(spring, format);
  useEffect(() => {
    if (still) spring.jump(value);
    else spring.set(value);
  }, [spring, value, still]);
  return <motion.span className="tabular-nums">{text}</motion.span>;
}

/** Types the text out again whenever it changes (instant under reduced motion). */
function useTyped(text: string, still: boolean) {
  // Starts fully typed (so the server render is complete); a new text restarts at 0.
  const [progress, setProgress] = useState({ text, count: text.length });
  const count = still ? text.length : progress.text === text ? progress.count : 0;
  const done = count >= text.length;
  useEffect(() => {
    if (still || done) return;
    const id = window.setInterval(() => {
      setProgress((current) => ({
        text,
        count: Math.min((current.text === text ? current.count : 0) + 2, text.length),
      }));
    }, 18);
    return () => window.clearInterval(id);
  }, [text, still, done]);
  return { shown: text.slice(0, count), done };
}

type Change = { id: number; text: string };

/**
 * Turns what the visitor just edited into one plain line about what it does
 * for their clinic ("Saturdays are now bookable, 09:00 to 13:00"). Name and
 * team text wait until typing pauses so the feed doesn't fire per keystroke.
 */
function useChangeFeed(props: ClinicPreviewProps) {
  const [changes, setChanges] = useState<Change[]>([]);
  const { name, type, logoRef = "", accent, hours, team, announceChanges = false } = props;
  const member = team[0]?.name.trim() ?? "";
  // The last values seen; every render moves it forward, announced or not.
  const previous = useRef({ name: name.trim(), type, logoRef, accent, hours, member });
  // Armed one render after the owner says its starting state is in place
  // (announceChanges), so a restored draft, which lands in that same render,
  // only ever becomes the baseline and is never announced.
  const armed = useRef(false);
  const nextId = useRef(0);
  const expiry = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(expiry.current), []);

  function push(text: string) {
    const id = nextId.current++;
    setChanges([{ id, text }]);
    window.clearTimeout(expiry.current);
    expiry.current = window.setTimeout(() => setChanges([]), 4200);
  }

  useEffect(() => {
    const before = previous.current;
    previous.current = { ...before, type, logoRef, accent, hours };
    if (!armed.current) return;
    if (accent !== before.accent) push("Brand color set. Buttons, the calendar and your records now use it.");
    // Compared by the stored reference: the signed display URL resolves later.
    if (logoRef && !before.logoRef) push("Logo added. It shows across your workspace.");
    if (type !== before.type) push(`Set up as a ${type.toLowerCase()}.`);
    for (const day of weekdayOrder) {
      const now = hours[day];
      const was = before.hours[day];
      if (now.enabled !== was.enabled) {
        push(
          now.enabled
            ? `${dayLabel(day)}s are now bookable, ${now.start} to ${now.end}.`
            : `${dayLabel(day)}s are closed. Nothing can be booked then.`
        );
      } else if (now.enabled && (now.start !== was.start || now.end !== was.end)) {
        push(`${dayLabel(day)} now runs ${now.start} to ${now.end}.`);
      }
    }
  }, [type, logoRef, accent, hours]);

  // Typed text waits for a pause, so it isn't announced per keystroke.
  useEffect(() => {
    const announce = armed.current;
    const trimmed = name.trim();
    const id = window.setTimeout(() => {
      const before = previous.current;
      previous.current = { ...before, name: trimmed, member };
      if (!announce) return;
      if (trimmed && trimmed !== before.name) push(`Your workspace is now ${trimmed}.`);
      if (member && member !== before.member) push(`${member} can now take appointments.`);
    }, 900);
    return () => window.clearTimeout(id);
  }, [name, member]);

  // Declared after the effects above, so the render that brings the restored
  // draft is recorded as the baseline before announcing starts.
  useEffect(() => {
    armed.current = announceChanges;
  }, [announceChanges]);

  return changes;
}

function Card({ lit, label, children, className }: { lit: boolean; label: string; children: ReactNode; className?: string }) {
  const still = useReducedMotion();
  return (
    <motion.section
      aria-label={label}
      initial={false}
      animate={{ opacity: lit ? 1 : 0.42, scale: lit || still ? 1 : 0.985 }}
      transition={{ duration: 0.4, ease: EASE }}
      className={cn(
        "rounded-(--radius-panel) border p-3.5 transition-[background-color,border-color] duration-(--duration-slow)",
        lit ? "border-white/15 bg-white/[0.075]" : "border-white/[0.07] bg-white/[0.03]",
        className
      )}
    >
      {children}
    </motion.section>
  );
}

/**
 * The ink panel beside onboarding: the visitor's own clinic, assembled from
 * what they enter and nothing else. The card for the current step lifts while
 * the rest dims; every edit says in one line what it changed for the clinic.
 * The week is a real 07:00 to 19:00 timeline with today and the current time
 * marked, and the reminder is the workspace's template rendered the way
 * reminders are sent, for a sample patient on the next open day.
 */
export function ClinicPreview(props: ClinicPreviewProps) {
  const { name, type, logoUrl, accent, hours, team, reminderTemplate, focus } = props;
  const still = useReducedMotion() ?? false;
  const latest = useChangeFeed(props)[0];
  const [hoveredDay, setHoveredDay] = useState<WeekdayKey | null>(null);
  // Today and the time of day (clinic zone) change while the page is open, so
  // they're set after mount and refreshed each minute.
  const [now, setNow] = useState<{ day: WeekdayKey; hours: number } | null>(null);

  useEffect(() => {
    const tick = () => setNow(clinicNow());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const lit = (section: StepFocus) => focus === "intro" || focus === "done" || focus === section;
  const clinicName = name.trim();
  const openDays = weekdayOrder.filter((day) => hours[day].enabled);
  const dayHours = (day: WeekdayKey) => hoursBetweenTimes(hours[day].start, hours[day].end);
  const weeklyHours = openDays.reduce((total, day) => total + dayHours(day), 0);
  const nextOpen = nextOpenDay(hours);
  const reminder = nextOpen
    ? renderReminder({
        kind: "appointment_reminder",
        recipientName: "Maya",
        appointmentDate: nextOpen.label,
        appointmentTime: hours[nextOpen.day].start,
        template: reminderTemplate ?? undefined,
      })
    : "";
  const typed = useTyped(reminder, still);
  const members = team.filter((member) => member.name.trim());
  const hovered = hoveredDay ? hours[hoveredDay] : null;
  const steps = ["clinic", "hours", "team"] as const;
  const stepIndex = focus === "intro" ? -1 : focus === "done" ? steps.length : steps.indexOf(focus);

  return (
    <div
      className="relative w-full max-w-[440px]"
      style={
        {
          "--clinic-accent": accent,
          // The raw accent is often too dark to read on ink; marks use a lifted mix.
          "--clinic-bright": `color-mix(in oklab, ${accent} 72%, white)`,
        } as CSSProperties
      }
    >
      <div className="mb-3 flex min-h-8 items-center justify-between gap-4 text-xs">
        {/* The header doubles as the change ticker: each edit shows what it did
            for the clinic for a few seconds, then it settles back. */}
        <div className="min-w-0 flex-1" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            {latest ? (
              <motion.p
                key={latest.id}
                initial={{ opacity: 0, y: still ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: still ? 0 : -4 }}
                transition={{ duration: 0.25, ease: EASE }}
                className={cn(
                  "inline-flex items-start gap-2 rounded-(--radius-field) px-2.5 py-1.5 font-medium leading-4 text-white backdrop-blur-sm",
                  tintSurface
                )}
              >
                <span className="mt-px flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--clinic-bright)] text-[var(--brand-ink)]">
                  <Check className="size-2.5" />
                </span>
                {latest.text}
              </motion.p>
            ) : (
              <motion.p
                key="live"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="inline-flex items-center gap-2 font-medium text-white/75"
              >
                <span className="relative flex size-2">
                  {!still && focus !== "done" ? (
                    <span className="absolute inset-0 animate-ping rounded-full bg-[var(--clinic-bright)] opacity-60" />
                  ) : null}
                  <span className="relative size-2 rounded-full bg-[var(--clinic-bright)]" />
                </span>
                {focus === "done" ? "Ready for day one" : "Live preview"}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
          {steps.map((step, index) => (
            <span
              key={step}
              className={cn(
                "h-1 rounded-full transition-[width,background-color] duration-(--duration-slow) ease-out-quint motion-reduce:transition-none",
                index < stepIndex ? "w-4 bg-[var(--clinic-bright)]" : index === stepIndex ? "w-6 bg-white" : "w-4 bg-white/20"
              )}
            />
          ))}
        </span>
      </div>

      <div className="space-y-2">
        <Card lit={lit("clinic")} label="Clinic">
          <div className="flex items-center gap-4">
            <span
              className={cn(
                "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-(--radius-tile) text-base font-semibold transition-[box-shadow,background-color,border-color,color] duration-(--duration-slow)",
                // An uploaded logo keeps a light ground so its own colors read.
                logoUrl ? "bg-white/90" : tintTile
              )}
              style={{ boxShadow: `0 10px 32px -10px ${accent}` }}
            >
              {logoUrl ? (
                <span aria-hidden className="size-full bg-cover bg-center" style={{ backgroundImage: `url("${logoUrl}")` }} />
              ) : (
                getInitials(clinicName || "Your clinic")
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("flex items-center truncate text-xl font-semibold tracking-tight", clinicName ? "text-white" : "text-white/40")}>
                <span className="truncate">{clinicName || "Your clinic"}</span>
                {focus === "clinic" && !still ? (
                  <motion.span
                    aria-hidden
                    className="ml-0.5 inline-block h-5 w-[2px] rounded-full bg-[var(--clinic-bright)]"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                ) : null}
              </p>
              <p className="mt-0.5 text-sm text-white/65">{type}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2" aria-hidden>
            <span className="inline-flex h-7 items-center rounded-(--radius-field) bg-[var(--clinic-accent)] px-3 text-xs font-semibold text-white transition-colors duration-(--duration-slow)">
              Book appointment
            </span>
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--clinic-accent)_22%,transparent)] px-2.5 text-xs font-medium text-[var(--clinic-bright)] transition-colors duration-(--duration-slow)">
              <Check className="size-3" />
              Confirmed
            </span>
            <span className="ml-auto font-mono text-[11px] uppercase text-white/50">{accent}</span>
          </div>
        </Card>

        <Card lit={lit("hours")} label="Opening hours">
          <div className="flex items-baseline justify-between text-sm">
            <p className="font-medium text-white">Your week</p>
            <p className="text-xs text-white/65" aria-live="polite">
              {hovered && hoveredDay ? (
                hovered.enabled ? (
                  `${dayLabel(hoveredDay)} · ${hovered.start} to ${hovered.end} · ${formatHours(dayHours(hoveredDay))}h`
                ) : (
                  `${dayLabel(hoveredDay)} · closed`
                )
              ) : openDays.length ? (
                <>
                  <CountUp value={weeklyHours} format={(v) => formatHours(Math.round(v * 2) / 2)} />h open · {openDays.length}{" "}
                  {openDays.length === 1 ? "day" : "days"}
                </>
              ) : (
                "Closed all week"
              )}
            </p>
          </div>

          <div className="relative mt-3 pl-9">
            <div className="pointer-events-none absolute inset-y-0 left-9 right-0" aria-hidden>
              {TICKS.map((tick) => (
                <span key={tick} className="absolute inset-y-0 w-px bg-white/[0.07]" style={{ left: `${position(tick)}%` }} />
              ))}
              {now && now.hours >= DAY_START && now.hours <= DAY_START + DAY_SPAN ? (
                <span
                  className="absolute -inset-y-1 w-px bg-white/60"
                  style={{ left: `${position(now.hours)}%` }}
                />
              ) : null}
            </div>
            <ul className="space-y-1" onMouseLeave={() => setHoveredDay(null)}>
              {weekdayOrder.map((day) => {
                const item = hours[day];
                const start = position(toHours(item.start));
                const end = position(toHours(item.end));
                const isToday = now?.day === day;
                return (
                  <li
                    key={day}
                    onMouseEnter={() => setHoveredDay(day)}
                    className="relative flex h-3.5 items-center"
                  >
                    <span
                      className={cn(
                        "absolute -left-9 w-8 whitespace-nowrap text-[11px] font-medium transition-colors duration-(--duration-base)",
                        hoveredDay === day || isToday ? "text-white" : item.enabled ? "text-white/70" : "text-white/35"
                      )}
                    >
                      {dayLabel(day).slice(0, 3)}
                      {isToday ? (
                        <span title="Today" className="absolute -left-2.5 top-1/2 size-1 -translate-y-1/2 rounded-full bg-white" />
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "relative h-2.5 w-full overflow-hidden rounded-full transition-colors duration-(--duration-base)",
                        hoveredDay === day ? "bg-white/[0.12]" : "bg-white/[0.06]"
                      )}
                    >
                      <motion.span
                        className="absolute inset-y-0 rounded-full bg-[var(--clinic-bright)]"
                        initial={false}
                        animate={{
                          left: `${start}%`,
                          width: `${Math.max(end - start, 0)}%`,
                          opacity: item.enabled ? 1 : 0,
                        }}
                        transition={still ? { duration: 0 } : SPRING}
                        style={{ boxShadow: item.enabled ? `0 0 14px -2px ${accent}` : undefined }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="relative mt-1.5 h-3 text-[10px] text-white/40" aria-hidden>
              {TICKS.map((tick) => (
                <span key={tick} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${position(tick)}%` }}>
                  {String(tick).padStart(2, "0")}
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Card lit={lit("team")} label="Team">
          <div className="flex items-center justify-between gap-4">
            <ul className="min-w-0 flex-1 space-y-2">
              <AnimatePresence initial={false} mode="popLayout">
                {members.length ? (
                  members.map((member, index) => (
                    <motion.li
                      key={`${member.name}-${index}`}
                      layout={!still}
                      initial={{ opacity: 0, y: still ? 0 : 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="flex items-center gap-3"
                    >
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-(--radius-tile) text-xs font-semibold", tintTile)}>
                        {getInitials(member.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-white">{member.name}</span>
                        <span className="block truncate text-xs text-white/60">
                          {member.role}
                          {members.length === 1 ? " · takes every appointment" : null}
                        </span>
                      </span>
                    </motion.li>
                  ))
                ) : (
                  <motion.li key="empty" exit={{ opacity: 0 }} className="text-sm text-white/50">
                    Your first team member shows here.
                  </motion.li>
                )}
              </AnimatePresence>
            </ul>
            {openDays.length ? (
              <div className="shrink-0 text-right">
                <p className="text-2xl font-semibold tracking-tight text-white">
                  <CountUp value={Math.floor(weeklyHours * 2)} />
                </p>
                <p className="text-[11px] leading-4 text-white/60">
                  bookable
                  <br />
                  half-hours a week
                </p>
              </div>
            ) : null}
          </div>
        </Card>

        {reminder ? (
          <Card lit={lit("hours") || lit("clinic")} label="Reminder preview">
            <p className="flex justify-between text-xs text-white/60">
              What a patient receives
              <span className="text-white/45">Name and time only</span>
            </p>
            <div className="mt-2.5 flex gap-2.5">
              <span
                aria-hidden
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-(--radius-tile) text-[10px] font-semibold",
                  logoUrl ? "bg-white/90" : tintTile
                )}
              >
                {logoUrl ? (
                  <span className="size-full bg-cover bg-center" style={{ backgroundImage: `url("${logoUrl}")` }} />
                ) : (
                  getInitials(clinicName || "Your clinic")
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white/80">
                  {clinicName || "Your clinic"} <span className="font-normal text-white/40">· WhatsApp</span>
                </p>
                <p
                  aria-label={reminder}
                  suppressHydrationWarning
                  className={cn(
                    "mt-1 min-h-[3.75rem] rounded-(--radius-card) rounded-tl-[3px] px-3.5 py-2.5 text-[13px] leading-[1.55] text-white/90",
                    tintSurface
                  )}
                >
                  <span aria-hidden suppressHydrationWarning>
                    {typed.shown}
                  </span>
                  {!typed.done ? (
                    <span aria-hidden className="ml-px inline-block h-3.5 w-[2px] translate-y-0.5 bg-[var(--clinic-bright)]" />
                  ) : null}
                </p>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
