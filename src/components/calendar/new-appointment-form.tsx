"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { UsersRound } from "lucide-react";

import {
  cancelAppointmentAction,
  deleteAppointmentAction,
  saveAppointmentAction,
} from "@/app/(workspace)/calendar/actions";
import { ConfirmDeleteDialog } from "@/components/clients/record-form-dialog";
import { ClientCombobox } from "@/components/calendar/client-combobox";
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
  fieldSelectClass,
  fieldTextareaClass,
  WorkspaceEmptyState,
  WorkspaceFormSection,
} from "@/components/workspace/workspace-layout";
import { useI18n, useServerText } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { fmt, plural } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { businessHoursForDate, minutesToTime, quarterHourTimes, timeToMinutes } from "@/lib/calendar";
import type {
  CalendarAppointment,
  CalendarAppointmentStatus,
  CalendarBusinessHours,
  CalendarSelectOption,
} from "@/lib/calendar";

type NewAppointmentFormProps = {
  clients: CalendarSelectOption[];
  staffMembers: CalendarSelectOption[];
  businessHours: CalendarBusinessHours[];
  ownerName: string;
  initialClientId?: string;
  initialDate: string;
  initialStartTime?: string;
  initialService?: string;
  initialStaffMemberId?: string;
  initialDuration?: number;
  initialAppointment?: CalendarAppointment;
  canRecordNoShows?: boolean;
};

const statusOptions: CalendarAppointmentStatus[] = [
  "confirmed",
  "pending",
  "cancelled",
  "completed",
  "no-show",
];


function formatDuration(minutes: number, t: Messages["calendar"]["form"], locale: Locale) {
  if (minutes < 60) {
    return fmt(t.minutes, { minutes });
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (rest === 0) {
    return plural(t.hours, hours, locale);
  }

  return fmt(t.hoursMinutes, { hours, minutes: rest });
}

export function NewAppointmentForm({
  clients,
  staffMembers,
  businessHours,
  ownerName,
  initialClientId,
  initialDate,
  initialStartTime,
  initialService,
  initialStaffMemberId,
  initialDuration,
  initialAppointment,
  canRecordNoShows = false,
}: NewAppointmentFormProps) {
  const { locale, m } = useI18n();
  const t = m.calendar.form;
  const serverText = useServerText();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [confirmingAction, setConfirmingAction] = useState<"cancel" | "delete" | null>(null);
  const [clientId, setClientId] = useState(
    initialAppointment?.clientId ?? initialClientId ?? clients[0]?.id ?? ""
  );
  const [staffMemberId, setStaffMemberId] = useState(
    initialAppointment?.staffMemberId ?? initialStaffMemberId ?? staffMembers[0]?.id ?? ""
  );
  const [date, setDate] = useState(initialAppointment?.date ?? initialDate);
  const [startTime, setStartTime] = useState(
    initialAppointment?.startTime ?? initialStartTime ?? "09:00"
  );
  // The booking is one time plus a length; the end time is derived on save.
  const savedMinutes = initialAppointment
    ? timeToMinutes(initialAppointment.endTime) - timeToMinutes(initialAppointment.startTime)
    : 0;
  // Every positive saved length is kept exactly (a short remainder before
  // closing can be under 15 minutes); only a corrupt zero/negative range falls
  // back to one 15-minute slot. A fresh booking pre-filled from a freed
  // waiting-list slot (initialDuration) is treated the same way, so a
  // non-15-minute opening (e.g. 20 or 40 minutes) survives instead of
  // silently rounding to the 60-minute default (Codex).
  const savedDuration = initialAppointment
    ? savedMinutes > 0
      ? savedMinutes
      : 15
    : initialDuration && initialDuration > 0
      ? initialDuration
      : null;
  const [duration, setDuration] = useState(savedDuration ?? 60);
  const [status, setStatus] = useState<CalendarAppointmentStatus>(
    initialAppointment?.status ?? "confirmed"
  );
  // Frozen at mount, never updated by the Status dropdown — this is what the
  // server's concurrent-edit guard compares against, so it must reflect what
  // this form actually loaded with, not the user's in-progress selection.
  const [baselineStatus] = useState<CalendarAppointmentStatus>(
    initialAppointment?.status ?? "confirmed"
  );
  const isEditing = Boolean(initialAppointment);
  // "Cancelled" isn't offered on a completed or no-show visit (the server
  // refuses it — a no-show is undone with "Mark as attended"), and
  // "No-show" is a Pro option that isn't offered on a cancelled visit either
  // (the server refuses cancelled -> no-show) — but a visit that is already a
  // no-show keeps it listed so the dropdown never shows a blank. No useMemo:
  // baselineStatus is frozen at mount, so this can never recompute to a
  // different value anyway.
  const editStatusOptions = statusOptions.filter(
    (option) =>
      (option !== "cancelled" || (baselineStatus !== "completed" && baselineStatus !== "no-show")) &&
      (option !== "no-show" || canRecordNoShows || baselineStatus === "no-show") &&
      (option !== "no-show" || baselineStatus !== "cancelled")
  );
  const selectedHours = useMemo(
    () => businessHoursForDate(date, businessHours),
    [businessHours, date]
  );
  const openMinutes = timeToMinutes(selectedHours.start);
  const closeMinutes = timeToMinutes(selectedHours.end);
  // 15-minute slots inside opening hours. The booking's own start is kept as an
  // option even when it sits off the grid (e.g. 12:39), so editing shows it
  // instead of a blank select.
  const startOptions = selectedHours.enabled
    ? Array.from(new Set([...quarterHourTimes, startTime]))
        .filter((time) => {
          const minutes = timeToMinutes(time);
          return minutes >= openMinutes && minutes < closeMinutes;
        })
        .sort()
    : [];
  // Every 15-minute length that still finishes by closing time, like the old
  // end-time picker. An off-grid start close to closing can have less than one
  // slot left, so offer the exact remainder rather than an empty select.
  const maxDuration = closeMinutes - timeToMinutes(startTime);
  const fittingDurations = Array.from(
    { length: Math.max(0, Math.floor(maxDuration / 15)) },
    (_, index) => (index + 1) * 15
  );

  if (fittingDurations.length === 0 && maxDuration > 0) {
    fittingDurations.push(maxDuration);
  }

  // An existing booking keeps its saved length as an option in two cases: it
  // still fits the slot (so a non-15-minute length survives being moved), or the
  // date and start are unchanged — then even if the clinic's hours shrank past
  // it, an unrelated edit (notes, status) must not silently shorten it; the
  // server refuses it with a clear message instead. A moved booking whose length
  // no longer fits only gets lengths that do. A fresh booking pre-filled from a
  // freed slot (initialDuration, no initialAppointment) falls into the same
  // "still fits" branch — keepsSavedSlot is always false with nothing to keep
  // the date/start unchanged from.
  const keepsSavedSlot =
    initialAppointment !== undefined &&
    date === initialAppointment.date &&
    startTime === initialAppointment.startTime;
  const savedOption =
    savedDuration !== null && (keepsSavedSlot || savedDuration <= maxDuration)
      ? [savedDuration]
      : [];
  const durationOptions = Array.from(new Set([...fittingDurations, ...savedOption])).sort(
    (a, b) => a - b
  );
  const effectiveDuration = durationOptions.includes(duration)
    ? duration
    : (durationOptions[durationOptions.length - 1] ?? duration);

  // A new date can have different opening hours; if the chosen time no longer
  // fits, move it to the day's first slot instead of leaving a hidden value
  // that the select shows as blank.
  function changeDate(nextDate: string) {
    setDate(nextDate);

    const nextHours = businessHoursForDate(nextDate, businessHours);
    const minutes = timeToMinutes(startTime);

    if (
      nextHours.enabled &&
      (minutes < timeToMinutes(nextHours.start) || minutes >= timeToMinutes(nextHours.end))
    ) {
      setStartTime(nextHours.start);
    }
  }

  function handleSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await saveAppointmentAction({
        id: initialAppointment?.id,
        clientId,
        service: String(formData.get("service") ?? ""),
        staffMemberId: staffMemberId || undefined,
        date,
        startTime,
        endTime: minutesToTime(timeToMinutes(startTime) + effectiveDuration),
        notes: String(formData.get("notes") ?? ""),
        status,
        baselineStatus,
      });

      if (!result.ok || !result.appointment) {
        setError(result.error ?? (isEditing ? t.updateFailed : t.createFailed));
        return;
      }

      router.push(`/calendar?date=${result.appointment.date}`);
    });
  }

  function cancelAppointment() {
    if (!initialAppointment) {
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await cancelAppointmentAction(initialAppointment.id);

      if (!result.ok) {
        setConfirmingAction(null);
        setError(result.error ?? t.cancelFailed);
        return;
      }

      router.push(`/calendar?date=${initialAppointment.date}`);
    });
  }

  function deleteAppointment() {
    if (!initialAppointment) {
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await deleteAppointmentAction(initialAppointment.id);

      if (!result.ok) {
        setConfirmingAction(null);
        setError(result.error ?? t.deleteFailed);
        return;
      }

      router.push(`/calendar?date=${initialAppointment.date}`);
    });
  }

  if (clients.length === 0) {
    return (
      <WorkspaceEmptyState
        icon={UsersRound}
        title={m.calendar.firstRun.title}
        actionHref="/clients/new?next=calendar"
        actionLabel={m.calendar.addClient}
      />
    );
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <WorkspaceFormSection>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t.client} className={isEditing ? undefined : "sm:col-span-2"}>
            <ClientCombobox value={clientId} onChange={setClientId} initialOptions={clients} />
          </FormField>
          {/* Status is only a choice when editing — a new booking is confirmed by
              default and moves to completed/cancelled later from the calendar. */}
          {isEditing ? (
            <FormSelect
              label={t.status}
              value={status}
              options={editStatusOptions}
              optionLabels={m.common.appointmentStatus}
              onChange={(value) => setStatus(value as CalendarAppointmentStatus)}
            />
          ) : null}
          <FormField label={t.service}>
            <Input
              name="service"
              required
              defaultValue={initialAppointment?.service ?? initialService}
              className={fieldInputClass}
            />
          </FormField>
          <FormField label={t.staff}>
            <select
              value={staffMemberId}
              onChange={(event) => setStaffMemberId(event.target.value)}
              className={fieldSelectClass}
            >
              <option value="">{ownerName || t.workspaceStaff}</option>
              {staffMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-3">
            <FormField label={t.date} className="col-span-2 sm:col-span-1">
              <Input
                type="date"
                value={date}
                onChange={(event) => changeDate(event.target.value)}
                className={fieldInputClass}
              />
            </FormField>
            <FormField label={t.time}>
              <select
                value={startOptions.includes(startTime) ? startTime : ""}
                onChange={(event) => setStartTime(event.target.value)}
                className={fieldSelectClass}
              >
                <option value="" disabled>
                  {t.select}
                </option>
                {startOptions.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label={t.duration}>
              <select
                value={effectiveDuration}
                onChange={(event) => setDuration(Number(event.target.value))}
                className={fieldSelectClass}
              >
                {durationOptions.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDuration(minutes, t, locale)}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          {selectedHours.enabled || !date ? null : (
            <p className="text-sm text-destructive sm:col-span-2">{t.closedDate}</p>
          )}
          <FormField label={t.notes} className="sm:col-span-2">
            <Textarea name="notes" defaultValue={initialAppointment?.notes} className={fieldTextareaClass} />
          </FormField>
        </div>
      </WorkspaceFormSection>

      <FormError message={serverText(error) ?? ""} />

      <FormActions
        cancelHref={initialAppointment ? `/calendar?date=${initialAppointment.date}` : "/calendar"}
        submitLabel={isEditing ? t.save : t.book}
        isPending={isPending}
      >
        {initialAppointment ? (
          <>
            <DestructiveTextButton
              onClick={() => setConfirmingAction("cancel")}
              disabled={
                isPending ||
                status === "cancelled" ||
                baselineStatus === "completed" ||
                baselineStatus === "no-show"
              }
            >
              {t.cancelBooking}
            </DestructiveTextButton>
            <DestructiveTextButton onClick={() => setConfirmingAction("delete")} disabled={isPending}>
              {t.deleteBooking}
            </DestructiveTextButton>
          </>
        ) : null}
      </FormActions>

      <ConfirmDeleteDialog
        open={confirmingAction !== null}
        onOpenChange={(open) => setConfirmingAction(open ? confirmingAction : null)}
        title={confirmingAction === "cancel" ? t.confirmCancelTitle : t.confirmDeleteTitle}
        description={confirmingAction === "cancel" ? t.confirmCancelDetail : t.confirmDeleteDetail}
        confirmLabel={confirmingAction === "cancel" ? t.cancelBooking : t.delete}
        isPending={isPending}
        onConfirm={confirmingAction === "cancel" ? cancelAppointment : deleteAppointment}
      />
    </form>
  );
}
