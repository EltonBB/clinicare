"use client";

import { useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Check, CheckCheck, Lock } from "lucide-react";

import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { cn } from "@/lib/utils";
import { EASE } from "../motion/ease";
import { Reveal } from "../motion/reveal";
import { SectionHeader } from "../shared/section-header";

// What a reminder can carry, mirroring the product: only these four fields are
// ever filled in. Anything clinical stays out of the message.
const ALLOWED = ["name", "staff", "time", "date"] as const;

type Key = (typeof ALLOWED)[number];
type Trust = Messages["marketing"]["home"]["trust"];

function message(on: Set<Key>, t: Trust["message"]) {
  let text = on.has("name") ? t.greetingNamed : t.greeting;
  if (on.has("staff")) text += t.withStaff;
  if (on.has("time")) text += t.atTime;
  if (on.has("date")) text += t.onDate;
  return text + t.closing;
}

/**
 * A working miniature of the reminder settings in two plain steps: pick what
 * the reminder says, then read exactly what Maya receives on WhatsApp.
 * Clinical fields sit in their own locked row; trying one shakes it and says
 * why, so the rule is learned by touching it.
 */
function ReminderBuilder() {
  const [on, setOn] = useState<Set<Key>>(() => new Set<Key>(["name", "time", "date"]));
  const [denied, setDenied] = useState<{ label: string; n: number } | null>(null);
  const t = useI18n().m.marketing.home.trust;

  const toggle = (key: Key) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="overflow-hidden rounded-(--radius-mkt-card) border border-border/70 bg-white shadow-[0_30px_80px_-48px_rgba(20,21,47,0.4)]">
      <div className="p-6 sm:p-7">
        <p className="text-sm font-semibold text-[var(--brand-ink)]">
          <span className="mr-2 text-primary tabular-nums">1</span>{t.chooseStep}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {ALLOWED.map((key) => {
            const pressed = on.has(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={pressed}
                onClick={() => toggle(key)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color,transform] duration-(--duration-base) ease-out-quint active:scale-[0.96] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                  pressed ? "border-primary bg-primary text-white" : "border-border/80 bg-white text-muted-foreground hover:border-primary/40 hover:text-primary",
                )}
              >
                <Check className={cn("h-3.5 shrink-0 transition-[width,margin,opacity] duration-(--duration-base)", pressed ? "w-3.5 opacity-100" : "-mr-1.5 w-0 opacity-0")} />
                {t.fields[key]}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-border/80 pt-4">
          <span className="mr-1 text-xs font-medium text-muted-foreground">{t.neverIncluded}</span>
          {t.clinical.map((label) => (
            <button
              key={label}
              type="button"
              aria-disabled
              onClick={() => setDenied((d) => ({ label, n: (d?.n ?? 0) + 1 }))}
              className="inline-flex h-8 cursor-not-allowed items-center rounded-full border border-dashed border-border bg-[var(--brand-wash)]/40 px-3 text-xs font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <span key={denied?.label === label ? denied.n : 0} className={cn("inline-flex items-center gap-1.5", denied?.label === label && "motion-safe:animate-[vela-shake_380ms_ease-out]")}>
                <Lock className="size-3" />
                {label}
              </span>
            </button>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {denied ? (
            <m.p
              key="denied"
              role="status"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="overflow-hidden text-xs text-[var(--brand-ink)]"
            >
              <span className="block pt-3">{fmt(t.denied, { label: denied.label })}</span>
            </m.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="border-t border-border/60 bg-[var(--brand-wash)]/35 px-6 py-6 sm:px-7">
        <p className="text-sm font-semibold text-[var(--brand-ink)]">
          <span className="mr-2 text-primary tabular-nums">2</span>{t.receiveStep}
        </p>
        <div className="mt-4 flex flex-col items-end gap-2">
          <div className="max-w-[24rem] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-white">{message(on, t.message)}</div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CheckCheck className="size-3.5 text-primary" /> {t.delivered}
          </p>
        </div>
      </div>
    </div>
  );
}

export function TrustSection() {
  const t = useI18n().m.marketing.home.trust;
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:gap-20 lg:px-8">
        <div>
          <SectionHeader
            lead={t.lead}
            rest={t.rest}
          />
          <Reveal delay={0.08}>
            <dl className="mt-10 max-w-md divide-y divide-border/60 border-y border-border/60 text-sm">
              {t.facts.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-3.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium text-[var(--brand-ink)]">{value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <ReminderBuilder />
        </Reveal>
      </div>
    </section>
  );
}
