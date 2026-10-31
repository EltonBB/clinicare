"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { format } from "date-fns";

import type { Locale } from "@/i18n/config";
import { useI18n, useServerText } from "@/i18n/client";
import { dateText, fmt } from "@/i18n/format";

import { deleteStaffAction, saveStaffAction } from "@/app/(workspace)/staff/actions";
import { ConfirmDeleteDialog } from "@/components/clients/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DestructiveTextButton,
  FormActions,
  FormError,
  FormField,
  FormSelect,
} from "@/components/workspace/form-parts";
import {
  fieldInputClass,
  fieldTextareaClass,
  WorkspaceFormSection,
} from "@/components/workspace/workspace-layout";
import type { StaffRecord } from "@/lib/staff";
import { staffRoles, staffStatuses, type StaffStatus } from "@/lib/staff-options";

type NewStaffFormProps = {
  staff?: StaffRecord;
  businessHours?: StaffBusinessHour[];
};

type ScheduleDraft = {
  date: string;
  day: string;
  clinicStart: string;
  clinicEnd: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

type StaffBusinessHour = {
  weekday: number;
  isOpen: boolean;
  startTime: string;
  endTime: string;
};

function businessWeekdayIndex(date: Date) {
  return (date.getDay() + 6) % 7;
}

function getBusinessHoursForDate(date: Date, businessHours: StaffBusinessHour[]) {
  const weekday = businessWeekdayIndex(date);
  const configured = businessHours.find((item) => item.weekday === weekday);

  if (configured) {
    return configured;
  }

  // No configured row for this weekday is treated as closed everywhere else
  // that reads BusinessHours (calendar-workspace.tsx, reports.ts) — match
  // that instead of guessing a Mon-Fri 9-5 default with no basis in the
  // clinic's actual settings.
  return {
    weekday,
    isOpen: false,
    startTime: "09:00",
    endTime: "17:00",
  };
}

function buildInitialSchedule(
  locale: Locale,
  staff?: StaffRecord,
  businessHours: StaffBusinessHour[] = []
): ScheduleDraft[] {
  const existingByDate = new Map(staff?.schedule.map((shift) => [shift.date, shift]) ?? []);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    const dateKey = format(date, "yyyy-MM-dd");
    const clinicHours = getBusinessHoursForDate(date, businessHours);
    const existing = existingByDate.get(dateKey);

    if (!clinicHours.isOpen && !existing) {
      return null;
    }

    return {
      date: dateKey,
      day: dateText(locale, date, { weekday: "short", month: "short", day: "numeric" }),
      clinicStart: clinicHours.startTime,
      clinicEnd: clinicHours.endTime,
      enabled: Boolean(existing),
      startTime: existing?.startTime ?? clinicHours.startTime,
      endTime: existing?.endTime ?? clinicHours.endTime,
    };
  }).filter((item): item is ScheduleDraft => Boolean(item));
}

export function NewStaffForm({ staff, businessHours = [] }: NewStaffFormProps) {
  const router = useRouter();
  const { locale, m } = useI18n();
  const t = m.staff.form;
  const serverText = useServerText();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [role, setRole] = useState(staff?.role ?? "Specialist");
  const [status, setStatus] = useState<StaffStatus>(staff?.status ?? "ACTIVE");
  const isEditing = Boolean(staff);
  const [schedule, setSchedule] = useState<ScheduleDraft[]>(() =>
    buildInitialSchedule(locale, staff, businessHours)
  );

  function updateSchedule(index: number, patch: Partial<ScheduleDraft>) {
    setSchedule((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  function handleSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await saveStaffAction({
        id: staff?.id,
        name: String(formData.get("name") ?? ""),
        role,
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        profileNote: String(formData.get("profileNote") ?? ""),
        status,
        weeklySchedule: schedule.map(({ date, enabled, startTime, endTime }) => ({
          date,
          enabled,
          startTime,
          endTime,
        })),
      });

      if (!result.ok || !result.staff) {
        setError(serverText(result.error) ?? (isEditing ? t.updateFailed : t.createFailed));
        return;
      }

      router.push(`/staff/${result.staff.id}`);
    });
  }

  function deleteStaff() {
    if (!staff) {
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await deleteStaffAction(staff.id);

      if (!result.ok) {
        setConfirmingDelete(false);
        setError(serverText(result.error) ?? t.deleteFailed);
        return;
      }

      router.push("/staff");
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <WorkspaceFormSection>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t.name} className="sm:col-span-2">
            <Input name="name" required defaultValue={staff?.name} className={fieldInputClass} />
          </FormField>
          <FormSelect
            label={t.role}
            name="role"
            value={role}
            options={staffRoles}
            optionLabels={m.staff.roles}
            onChange={setRole}
          />
          {/* A new staff member is active by default; status (Away / Inactive) is
              only set later, so it's an edit-only control. */}
          {isEditing ? (
            <FormSelect
              label={t.status}
              name="status"
              value={status}
              options={staffStatuses}
              optionLabels={m.staff.status}
              onChange={(value) => setStatus(value as StaffStatus)}
            />
          ) : null}
          <FormField label={t.phone}>
            <Input name="phone" defaultValue={staff?.phone} placeholder={t.phoneHint} className={fieldInputClass} />
          </FormField>
          <FormField label={t.email} className={isEditing ? undefined : "sm:col-span-2"}>
            <Input name="email" type="email" defaultValue={staff?.email} className={fieldInputClass} />
          </FormField>
          <FormField label={t.note} className="sm:col-span-2">
            <Textarea name="profileNote" defaultValue={staff?.profileNote} className={fieldTextareaClass} />
          </FormField>
        </div>
      </WorkspaceFormSection>

      <WorkspaceFormSection
        title={t.weeklySchedule}
        action={
          schedule.length > 0 ? (
            <button
              type="button"
              onClick={() =>
                setSchedule((current) =>
                  current.map((item) => ({
                    ...item,
                    enabled: true,
                    startTime: item.clinicStart,
                    endTime: item.clinicEnd,
                  }))
                )
              }
              className="text-sm font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
            >
              {t.useClinicHours}
            </button>
          ) : null
        }
        contentClassName="space-y-0.5"
      >
        {schedule.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noOpenDays}</p>
        ) : (
          schedule.map((item, index) => (
            <div
              key={item.date}
              className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-(--radius-card) px-2 py-1 transition-colors duration-(--duration-base) hover:bg-secondary/40"
            >
              <label className="flex w-36 shrink-0 items-center gap-2.5 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  onChange={(event) => updateSchedule(index, { enabled: event.target.checked })}
                  className="size-4 rounded border-border accent-primary"
                />
                {item.day}
              </label>
              {item.enabled ? (
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <Input
                    type="time"
                    value={item.startTime}
                    onChange={(event) => updateSchedule(index, { startTime: event.target.value })}
                    className="h-9 min-w-0 flex-1 rounded-(--radius-card) bg-white px-2 text-sm max-sm:[&::-webkit-calendar-picker-indicator]:hidden sm:w-32 sm:flex-none sm:px-3.5"
                    aria-label={fmt(t.shiftStart, { day: item.day })}
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    value={item.endTime}
                    onChange={(event) => updateSchedule(index, { endTime: event.target.value })}
                    className="h-9 min-w-0 flex-1 rounded-(--radius-card) bg-white px-2 text-sm max-sm:[&::-webkit-calendar-picker-indicator]:hidden sm:w-32 sm:flex-none sm:px-3.5"
                    aria-label={fmt(t.shiftEnd, { day: item.day })}
                  />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">{t.off}</span>
              )}
            </div>
          ))
        )}
      </WorkspaceFormSection>

      <FormError message={error} />

      <FormActions
        cancelHref={staff ? `/staff/${staff.id}` : "/staff"}
        submitLabel={isEditing ? m.common.save : t.create}
        isPending={isPending}
      >
        {staff ? (
          <DestructiveTextButton onClick={() => setConfirmingDelete(true)} disabled={isPending}>
            {t.deleteMember}
          </DestructiveTextButton>
        ) : null}
      </FormActions>

      <ConfirmDeleteDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t.deleteTitle}
        description={t.deleteDescription}
        isPending={isPending}
        onConfirm={deleteStaff}
      />
    </form>
  );
}
