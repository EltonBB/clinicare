import { ToggleRow } from "@/components/settings/settings-toggle";
import {
  PAYMENT_REMINDER_DAY_OPTIONS,
  REBOOK_MONTH_OPTIONS,
  THANK_YOU_HOUR_OPTIONS,
  withCurrentOption,
} from "@/lib/settings";
import type { WorkflowSettingsValues } from "@/lib/workflow-generators";

function plural(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

function TimingSelect({
  value,
  options,
  format,
  onChange,
  ariaLabel,
}: {
  value: number;
  options: readonly number[];
  format: (count: number) => string;
  onChange: (value: number) => void;
  ariaLabel: string;
}) {
  return (
    <select
      value={String(value)}
      aria-label={ariaLabel}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-9 w-[200px] rounded-(--radius-card) border border-border/80 bg-white px-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-(--duration-base) focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      {withCurrentOption(options, value).map((option) => (
        <option key={option} value={option}>
          {format(option)}
        </option>
      ))}
    </select>
  );
}

/**
 * The rows of Settings → Workflows. The section card (title, description) is
 * rendered by settings-workspace.tsx like every other section, and edits flow
 * through its shared state so the dialog's Save/Discard buttons cover them.
 */
export function WorkflowsSection({
  workflows,
  isPro,
  onChange,
}: {
  workflows: WorkflowSettingsValues;
  isPro: boolean;
  onChange: (patch: Partial<WorkflowSettingsValues>) => void;
}) {
  return (
    // Divided rows, the same treatment as Reminders and Working hours (AGENTS.md:
    // "three divided toggle rows") - ToggleRow's first:pt-0 / last:pb-0 assume this
    // wrapper (Codex #130).
    <div className="divide-y divide-border/65">
      {isPro ? (
        <ToggleRow
          label="Rebooking nudge"
          enabled={workflows.rebookEnabled}
          onEnabledChange={(rebookEnabled) => onChange({ rebookEnabled })}
        >
          <TimingSelect
            value={workflows.rebookAfterMonths}
            options={REBOOK_MONTH_OPTIONS}
            format={(count) => `after ${plural(count, "month")}`}
            onChange={(rebookAfterMonths) => onChange({ rebookAfterMonths })}
            ariaLabel="Rebooking nudge timing"
          />
        </ToggleRow>
      ) : null}

      <ToggleRow
        label="Unpaid payment reminder"
        enabled={workflows.paymentReminderEnabled}
        onEnabledChange={(paymentReminderEnabled) => onChange({ paymentReminderEnabled })}
      >
        <TimingSelect
          value={workflows.paymentReminderAfterDays}
          options={PAYMENT_REMINDER_DAY_OPTIONS}
          format={(count) => `after ${plural(count, "day")}`}
          onChange={(paymentReminderAfterDays) => onChange({ paymentReminderAfterDays })}
          ariaLabel="Unpaid payment reminder timing"
        />
      </ToggleRow>

      <ToggleRow
        label="Thank-you message"
        enabled={workflows.thankYouEnabled}
        onEnabledChange={(thankYouEnabled) => onChange({ thankYouEnabled })}
      >
        <TimingSelect
          value={workflows.thankYouDelayHours}
          options={THANK_YOU_HOUR_OPTIONS}
          format={(count) => `${plural(count, "hour")} after the visit`}
          onChange={(thankYouDelayHours) => onChange({ thankYouDelayHours })}
          ariaLabel="Thank-you message timing"
        />
      </ToggleRow>
    </div>
  );
}
