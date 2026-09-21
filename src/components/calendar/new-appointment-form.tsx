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
import { timeToMinutes } from "@/lib/calendar";
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
  initialAppointment?: CalendarAppointment;
};

const statusOptions: CalendarAppointmentStatus[] = [
  "confirmed",
  "pending",
  "cancelled",
  "completed",
];

function minutesToTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

const timeSlots = Array.from({ length: 96 }, (_, index) => minutesToTime(index * 15));

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (rest === 0) {
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  return `${hours} h ${rest} min`;
}

function businessHoursForDate(date: string, hours: CalendarBusinessHours[]) {
  // Weekday of a calendar date is purely calendrical — derive it from the date
  // parts via UTC so it never shifts with the browser's local time zone.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const weekday = match
    ? (new Date(
        Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      ).getUTCDay() +
        6) %
      7
    : 0;

  // No configured row for this weekday means closed, not a guessed Mon-Fri
  // 9-5 default — matches calendar-workspace.tsx, reports.ts, and the
  // server-side isInsideBusinessHours validation in calendar/actions.ts.
  return (
    hours.find((item) => item.weekday === weekday) ?? {
      weekday,
      enabled: false,
      start: "09:00",
      end: "17:00",
    }
  );
}

export function NewAppointmentForm({
  clients,
  staffMembers,
  businessHours,
  ownerName,
  initialClientId,
  initialDate,
  initialStartTime,
  initialAppointment,
}: NewAppointmentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [confirmingAction, setConfirmingAction] = useState<"cancel" | "delete" | null>(null);
  const [clientId, setClientId] = useState(
    initialAppointment?.clientId ?? initialClientId ?? clients[0]?.id ?? ""
  );
  const [staffMemberId, setStaffMemberId] = useState(
    initialAppointment?.staffMemberId ?? staffMembers[0]?.id ?? ""
  );
  const [date, setDate] = useState(initialAppointment?.date ?? initialDate);
  const [startTime, setStartTime] = useState(
    initialAppointment?.startTime ?? initialStartTime ?? "09:00"
  );
  // The booking is one time plus a length; the end time is derived on save.
  const savedDuration = initialAppointment
    ? Math.max(
        15,
        timeToMinutes(initialAppointment.endTime) - timeToMinutes(initialAppointment.startTime)
      )
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
  // A completed visit already happened — offering "Cancelled" here would let
  // someone pick an option the server refuses outright (see
  // saveAppointmentAction's matching guard). Other corrections away from
  // completed stay available. No useMemo: baselineStatus is frozen at mount
  // (no setter), so this can never recompute to a different value anyway.
  const editStatusOptions =
    baselineStatus === "completed"
      ? statusOptions.filter((option) => option !== "cancelled")
      : statusOptions;
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
    ? Array.from(new Set([...timeSlots, startTime]))
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

  // An existing booking always keeps its saved length as an option, even if the
  // clinic's hours later shrank past it — an unrelated edit (notes, status) must
  // not silently shorten it; the server refuses it with a clear message instead.
  const durationOptions = Array.from(
    new Set(savedDuration ? [...fittingDurations, savedDuration] : fittingDurations)
  ).sort((a, b) => a - b);
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
        setError(result.error ?? `We couldn't ${isEditing ? "update" : "create"} this booking.`);
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
        setError(result.error ?? "We couldn't cancel this booking.");
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
        setError(result.error ?? "We couldn't delete this booking.");
        return;
      }

      router.push(`/calendar?date=${initialAppointment.date}`);
    });
  }

  if (clients.length === 0) {
    return (
      <WorkspaceEmptyState
        icon={UsersRound}
        title="Add a client before booking"
        actionHref="/clients/new?next=calendar"
        actionLabel="Add first client"
      />
    );
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <WorkspaceFormSection>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Client" className={isEditing ? undefined : "sm:col-span-2"}>
            <ClientCombobox value={clientId} onChange={setClientId} initialOptions={clients} />
          </FormField>
          {/* Status is only a choice when editing — a new booking is confirmed by
              default and moves to completed/cancelled later from the calendar. */}
          {isEditing ? (
            <FormSelect
              label="Status"
              value={status}
              options={editStatusOptions}
              onChange={(value) => setStatus(value as CalendarAppointmentStatus)}
              selectClassName="capitalize"
            />
          ) : null}
          <FormField label="Service">
            <Input
              name="service"
              required
              defaultValue={initialAppointment?.service}
              className={fieldInputClass}
            />
          </FormField>
          <FormField label="Staff">
            <select
              value={staffMemberId}
              onChange={(event) => setStaffMemberId(event.target.value)}
              className={fieldSelectClass}
            >
              <option value="">{ownerName || "Workspace staff"}</option>
              {staffMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-3">
            <FormField label="Date" className="col-span-2 sm:col-span-1">
              <Input
                type="date"
                value={date}
                onChange={(event) => changeDate(event.target.value)}
                className={fieldInputClass}
              />
            </FormField>
            <FormField label="Time">
              <select
                value={startOptions.includes(startTime) ? startTime : ""}
                onChange={(event) => setStartTime(event.target.value)}
                className={fieldSelectClass}
              >
                <option value="" disabled>
                  Select
                </option>
                {startOptions.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Duration">
              <select
                value={effectiveDuration}
                onChange={(event) => setDuration(Number(event.target.value))}
                className={fieldSelectClass}
              >
                {durationOptions.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDuration(minutes)}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          {selectedHours.enabled ? null : (
            <p className="text-sm text-destructive sm:col-span-2">The clinic is closed on this date.</p>
          )}
          <FormField label="Notes" className="sm:col-span-2">
            <Textarea name="notes" defaultValue={initialAppointment?.notes} className={fieldTextareaClass} />
          </FormField>
        </div>
      </WorkspaceFormSection>

      <FormError message={error} />

      <FormActions
        cancelHref={initialAppointment ? `/calendar?date=${initialAppointment.date}` : "/calendar"}
        submitLabel={isEditing ? "Save" : "Book appointment"}
        isPending={isPending}
      >
        {initialAppointment ? (
          <>
            <DestructiveTextButton
              onClick={() => setConfirmingAction("cancel")}
              disabled={isPending || status === "cancelled" || baselineStatus === "completed"}
            >
              Cancel booking
            </DestructiveTextButton>
            <DestructiveTextButton onClick={() => setConfirmingAction("delete")} disabled={isPending}>
              Delete booking
            </DestructiveTextButton>
          </>
        ) : null}
      </FormActions>

      <ConfirmDeleteDialog
        open={confirmingAction !== null}
        onOpenChange={(open) => setConfirmingAction(open ? confirmingAction : null)}
        title={confirmingAction === "cancel" ? "Cancel this booking?" : "Delete this booking?"}
        description={
          confirmingAction === "cancel"
            ? "The client will need to be rebooked. This can't be undone."
            : "This permanently removes the booking record. This can't be undone."
        }
        confirmLabel={confirmingAction === "cancel" ? "Cancel booking" : "Delete"}
        isPending={isPending}
        onConfirm={confirmingAction === "cancel" ? cancelAppointment : deleteAppointment}
      />
    </form>
  );
}
