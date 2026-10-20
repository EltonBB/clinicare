"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { toggleAutomationAction } from "@/app/(workspace)/automations/actions";
import { AutomationEditor } from "@/components/automations/automation-editor";
import { Toggle } from "@/components/settings/settings-toggle";
import type { AutomationKind } from "@/lib/automations";
import type { AutomationCard, AutomationEditorData } from "@/lib/automations-view";
import { cn } from "@/lib/utils";

const MODE_TONE: Record<AutomationCard["modeLabel"], string> = {
  Automatic: "text-emerald-700",
  "Review first": "text-amber-700",
  Off: "text-muted-foreground/70",
};

/**
 * Twelve cards in four full rows of three, filling the screen below the
 * header on large screens (no blank space under the grid). Each card is the
 * automation's name and switch, then when it sends and how. Clicking a card
 * opens its editor; a Pro automation on Basic leads to the upgrade instead.
 */
export function AutomationsBoard({
  cards,
  editors,
  clinicName,
  staffName,
}: {
  cards: AutomationCard[];
  editors: Partial<Record<AutomationKind, AutomationEditorData>>;
  clinicName: string;
  staffName: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<Partial<Record<AutomationKind, boolean>>>({});
  // A switch waits for its own save before it can be flipped again.
  const [saving, setSaving] = useState<Partial<Record<AutomationKind, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [openKind, setOpenKind] = useState<AutomationKind | null>(null);
  const [, startTransition] = useTransition();

  const isOn = (card: AutomationCard) => enabled[card.kind] ?? card.enabled;

  function toggle(card: AutomationCard, next: boolean) {
    if (saving[card.kind]) return;
    setError(null);
    setEnabled((current) => ({ ...current, [card.kind]: next }));
    setSaving((current) => ({ ...current, [card.kind]: true }));
    startTransition(async () => {
      const result = await toggleAutomationAction(card.kind, next);
      setSaving((current) => ({ ...current, [card.kind]: false }));
      if (!result.ok) {
        setEnabled((current) => ({ ...current, [card.kind]: !next }));
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const editor = openKind ? editors[openKind] : undefined;

  return (
    <>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:h-[calc(100vh-174px)] lg:min-h-[520px] lg:grid-cols-3 lg:grid-rows-4">
        {cards.map((card) => {
          const on = isOn(card);
          const modeLabel = !on ? "Off" : card.mode === "REVIEW" ? "Review first" : "Automatic";

          if (card.locked) {
            return (
              <Link
                key={card.kind}
                href="/checkout?plan=pro"
                className="surface-card flex min-h-24 flex-col justify-between gap-3 p-4 transition-colors duration-(--duration-base) hover:border-border"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-muted-foreground">{card.label}</span>
                  <span className="text-xs font-semibold text-primary">Pro</span>
                </span>
                <span className="text-xs text-muted-foreground">{card.timingPhrase}</span>
              </Link>
            );
          }

          return (
            <div
              key={card.kind}
              role="button"
              tabIndex={0}
              aria-label={`Edit ${card.label}`}
              onClick={() => setOpenKind(card.kind)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setOpenKind(card.kind);
                }
              }}
              className="surface-card flex min-h-24 cursor-pointer flex-col justify-between gap-3 p-4 outline-none transition-colors duration-(--duration-base) hover:border-border focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold text-foreground">{card.label}</span>
                {/* The switch acts on its own, without opening the editor. */}
                <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                  <Toggle checked={on} onPressedChange={(next) => toggle(card, next)} ariaLabel={card.label} />
                </span>
              </span>
              <span className="flex items-end justify-between gap-3 text-xs">
                <span className="truncate text-muted-foreground">{card.timingPhrase}</span>
                <span className={cn("shrink-0 font-medium", MODE_TONE[modeLabel])}>{modeLabel}</span>
              </span>
            </div>
          );
        })}
      </div>

      {editor ? (
        <AutomationEditor
          key={editor.kind}
          data={{ ...editor, enabled: enabled[editor.kind] ?? editor.enabled }}
          clinicName={clinicName}
          staffName={staffName}
          onClose={() => setOpenKind(null)}
          onSaved={(saved) => {
            setEnabled((current) => ({ ...current, [saved.kind]: saved.enabled }));
            setOpenKind(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
