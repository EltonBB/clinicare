"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { saveAutomationSettingAction } from "@/app/(workspace)/automations/actions";
import { Toggle } from "@/components/settings/settings-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { fieldSelectClass, fieldTextareaClass } from "@/components/workspace/workspace-layout";
import { useI18n, useServerText } from "@/i18n/client";
import { fmt, plural } from "@/i18n/format";
import {
  insertTokenAt,
  MAX_AUTOMATION_MESSAGE_LENGTH,
  renderAutomationMessage,
  visitDateTokens,
  type AutomationMode,
  type AutomationToken,
} from "@/lib/automations";
import type { AutomationEditorData } from "@/lib/automations-view";
import { getZonedDateParts, zonedDateTimeToUtc } from "@/lib/time-zone";
import { cn } from "@/lib/utils";

/** Tomorrow at 10:30 in the clinic's zone: the visit the preview describes. */
function sampleVisit(): Date {
  const tomorrow = getZonedDateParts(new Date(Date.now() + 24 * 3_600_000));
  return zonedDateTimeToUtc({ year: tomorrow.year, month: tomorrow.month, day: tomorrow.day, hour: 10, minute: 30 });
}

type Box = "template" | "template2";

/**
 * One automation's settings: the switch, one sentence for when (and, on Pro,
 * how) it sends, and the message beside what the patient sees. Saves on its
 * own; the board refreshes after.
 */
export function AutomationEditor({
  data,
  clinicName,
  staffName,
  onClose,
  onSaved,
}: {
  data: AutomationEditorData;
  clinicName: string;
  staffName: string;
  onClose: () => void;
  onSaved: (saved: { kind: AutomationEditorData["kind"]; enabled: boolean }) => void;
}) {
  const { locale, m } = useI18n();
  const t = m.automations.editor;
  const kindCopy = m.automations.kinds[data.kind];
  const serverText = useServerText();
  const [enabled, setEnabled] = useState(data.enabled);
  const [mode, setMode] = useState<AutomationMode>(data.mode);
  const [timing, setTiming] = useState<number | null>(data.timing);
  const [texts, setTexts] = useState<Record<Box, string>>({ template: data.template, template2: data.template2 ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const boxes = useRef<Record<Box, HTMLTextAreaElement | null>>({ template: null, template2: null });
  const lastBox = useRef<Box>("template");

  const hasSecondText = data.template2 !== null;
  const visit = useMemo(() => sampleVisit(), []);
  const sample = { client_name: "Maya", clinic_name: clinicName, staff_name: staffName };
  // The visit's date reads in the language the message is written in.
  const preview = (box: Box, variant: "moved" | "cancelled") =>
    renderAutomationMessage(
      data.kind,
      texts[box],
      { ...sample, ...visitDateTokens(data.kind, texts[box], visit, variant) },
      variant
    );
  const timingOptions = timing !== null && !data.timingOptions.includes(timing) ? [...data.timingOptions, timing].sort((a, b) => a - b) : data.timingOptions;

  function insert(token: AutomationToken) {
    const box = lastBox.current;
    const element = boxes.current[box];
    const cursor = element?.selectionStart ?? texts[box].length;
    const next = insertTokenAt(texts[box], cursor, token);
    setTexts((current) => ({ ...current, [box]: next.text }));
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(next.cursor, next.cursor);
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveAutomationSettingAction({
        kind: data.kind,
        enabled,
        mode,
        timing,
        template: texts.template,
        template2: hasSecondText ? texts.template2 : null,
      });
      if (!result.ok) {
        setError(serverText(result.error) ?? result.error);
        return;
      }
      onSaved({ kind: data.kind, enabled });
    });
  }

  const messageBox = (box: Box, label: string, defaultText: string) => (
    <label className="flex min-h-0 flex-1 flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Textarea
        ref={(element) => {
          boxes.current[box] = element;
        }}
        value={texts[box]}
        maxLength={MAX_AUTOMATION_MESSAGE_LENGTH}
        onFocus={() => {
          lastBox.current = box;
        }}
        onChange={(event) => {
          const value = event.target.value;
          setTexts((current) => ({ ...current, [box]: value }));
        }}
        className={cn(fieldTextareaClass, "min-h-28 flex-1 resize-none leading-relaxed")}
      />
      {texts[box] !== defaultText ? (
        <button
          type="button"
          onClick={() => setTexts((current) => ({ ...current, [box]: defaultText }))}
          className="self-end text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {t.reset}
        </button>
      ) : null}
    </label>
  );

  return (
    // While a save is on its way the editor stays open (Escape, the close
    // button and the backdrop included), so a failed save can show its error.
    <Dialog open onOpenChange={(open) => (open || pending ? null : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-[780px] sm:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-5 p-6">
          <div className="flex items-center justify-between gap-4 pr-8 sm:pr-0">
            <DialogTitle className="text-base font-semibold">{data.label}</DialogTitle>
            <Toggle checked={enabled} onPressedChange={setEnabled} ariaLabel={fmt(t.on, { label: data.label })} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">{t.when}</span>
              {data.timingUnit && timing !== null ? (
                <select
                  value={timing}
                  onChange={(event) => setTiming(Number(event.target.value))}
                  className={fieldSelectClass}
                >
                  {timingOptions.map((value) => (
                    <option key={value} value={value}>
                      {"option" in kindCopy ? plural(kindCopy.option, value, locale) : value}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={FIXED_FIELD_CLASS}>{data.fixedTiming}</span>
              )}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">{t.how}</span>
              {data.canChooseMode ? (
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as AutomationMode)}
                  className={fieldSelectClass}
                >
                  <option value="AUTOMATIC">{t.automatically}</option>
                  <option value="REVIEW">{t.afterReview}</option>
                </select>
              ) : (
                <span className={FIXED_FIELD_CLASS}>{t.automatically}</span>
              )}
            </label>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {messageBox("template", hasSecondText ? t.moved : t.message, data.defaultTemplate)}
            {hasSecondText ? messageBox("template2", t.cancelled, data.defaultTemplate2 ?? "") : null}
            <DropdownMenu>
              <DropdownMenuTrigger className="self-start text-xs font-medium text-primary transition-colors hover:text-foreground">
                {t.insertDetail}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-40">
                {data.tokens.map((token) => (
                  <DropdownMenuItem key={token} onClick={() => insert(token)}>
                    {t.tokens[token]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {m.common.cancel}
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? m.common.saving : m.common.save}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 bg-[#eaf4ff] p-5">
          <span className="text-xs font-medium text-[#3b5b86]">{t.phone}</span>
          <div className="flex flex-1 flex-col justify-center gap-2">
            <PreviewBubble text={preview("template", "moved")} />
            {hasSecondText ? <PreviewBubble text={preview("template2", "cancelled")} /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A setting the clinic can't change here, shown in the same box as the fields beside it. */
const FIXED_FIELD_CLASS =
  "flex min-h-10 items-center rounded-(--radius-card) py-2 leading-snug border border-border/80 bg-muted/40 px-3 text-sm text-muted-foreground";

function PreviewBubble({ text }: { text: string }) {
  return (
    <div className="rounded-[10px] rounded-tl-[3px] bg-white px-3 py-2.5 text-[13px] leading-relaxed text-foreground shadow-[0_1px_1px_rgba(20,32,51,0.06)]">
      <p className="whitespace-pre-wrap break-words">{text}</p>
    </div>
  );
}
