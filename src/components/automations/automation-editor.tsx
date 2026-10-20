"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { saveAutomationSettingAction } from "@/app/(workspace)/automations/actions";
import { Toggle } from "@/components/settings/settings-toggle";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { fieldTextareaClass } from "@/components/workspace/workspace-layout";
import {
  insertTokenAt,
  MAX_AUTOMATION_MESSAGE_LENGTH,
  renderAutomationMessage,
  timingOptionLabel,
  TOKEN_LABELS,
  type AutomationMode,
  type AutomationToken,
} from "@/lib/automations";
import type { AutomationEditorData } from "@/lib/automations-view";
import { formatZonedFullDate, formatZonedTime, getZonedDateParts, zonedDateTimeToUtc } from "@/lib/time-zone";
import { cn } from "@/lib/utils";

const pickClass =
  "mx-1 inline-flex h-8 cursor-pointer appearance-none rounded-(--radius-field) border-0 bg-[#f1f3f8] px-2.5 text-sm font-medium text-foreground outline-none transition-colors duration-(--duration-base) hover:bg-[#e9ecf4] focus-visible:ring-3 focus-visible:ring-ring/40";

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
  const sample = {
    client_name: "Maya",
    clinic_name: clinicName,
    staff_name: staffName,
    date: formatZonedFullDate(visit),
    time: formatZonedTime(visit),
  };
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
        setError(result.error);
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
          Reset to default
        </button>
      ) : null}
    </label>
  );

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[calc(100vh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-[780px] sm:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-5 p-6">
          <div className="flex items-center justify-between gap-4 pr-8 sm:pr-0">
            <DialogTitle className="text-base font-semibold">{data.label}</DialogTitle>
            <Toggle checked={enabled} onPressedChange={setEnabled} ariaLabel={`${data.label} on`} />
          </div>

          <p className="text-sm leading-9 text-muted-foreground">
            Send
            {data.timingUnit && timing !== null ? (
              <>
                <select
                  aria-label="When it sends"
                  value={timing}
                  onChange={(event) => setTiming(Number(event.target.value))}
                  className={pickClass}
                >
                  {timingOptions.map((value) => (
                    <option key={value} value={value}>
                      {timingOptionLabel(data.timingUnit!, value)}
                    </option>
                  ))}
                </select>
                {data.timingSuffix}
              </>
            ) : (
              <> {data.fixedTiming}</>
            )}
            {data.canChooseMode ? (
              <>
                ,
                <select
                  aria-label="How it sends"
                  value={mode}
                  onChange={(event) => setMode(event.target.value as AutomationMode)}
                  className={pickClass}
                >
                  <option value="AUTOMATIC">automatically</option>
                  <option value="REVIEW">after I review it</option>
                </select>
              </>
            ) : (
              ", automatically"
            )}
            .
          </p>

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {messageBox("template", hasSecondText ? "When a visit is moved" : "Message", data.defaultTemplate)}
            {hasSecondText ? messageBox("template2", "When a visit is cancelled", data.defaultTemplate2 ?? "") : null}
            <DropdownMenu>
              <DropdownMenuTrigger className="self-start text-xs font-medium text-primary transition-colors hover:text-foreground">
                + Insert detail
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-40">
                {data.tokens.map((token) => (
                  <DropdownMenuItem key={token} onClick={() => insert(token)}>
                    {TOKEN_LABELS[token]}
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
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 bg-[#eaf4ff] p-5 pt-12 sm:pt-5">
          <span className="text-xs font-medium text-[#3b5b86]">Maya&apos;s phone</span>
          <div className="flex flex-1 flex-col justify-center gap-2">
            <PreviewBubble text={renderAutomationMessage(data.kind, texts.template, sample, "moved")} />
            {hasSecondText ? (
              <PreviewBubble text={renderAutomationMessage(data.kind, texts.template2, sample, "cancelled")} />
            ) : null}
          </div>
          <span className="text-center text-[11px] text-[#5d7aa3]">Updates as you type</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewBubble({ text }: { text: string }) {
  return (
    <div className="rounded-[10px] rounded-tl-[3px] bg-white px-3 py-2.5 text-[13px] leading-relaxed text-foreground shadow-[0_1px_1px_rgba(20,32,51,0.06)]">
      <p className="whitespace-pre-wrap break-words">{text}</p>
      <p className="mt-1 text-right text-[10px] text-muted-foreground">10:30</p>
    </div>
  );
}
