"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, CalendarPlus2, Save, Trash2, UsersRound, XCircle } from "lucide-react";

import {
  cancelAppointmentAction,
  deleteAppointmentAction,
  saveAppointmentAction,
} from "@/app/(workspace)/calendar/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/clients/record-form-dialog";
import { ClientCombobox } from "@/components/calendar/client-combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  fieldInputClass,
  fieldSelectClass,
  WorkspaceEmptyState,
  WorkspaceFormSection,
} from "@/components/workspace/workspace-layout";
import { cn } from "@/lib/utils";
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

const timeSlots = Array.from({ length: 96 }, (_, index) => {
  const minutes = index * 15;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
});

const statusOptions: CalendarAppointmentStatus[] = [
  "confirmed",
  "pending",
  "cancelled",
  "completed",
];

// At creation a booking is only confirmed or pending; it becomes completed or
// cancelled later via the calendar, never at the moment it's booked.
const createStatusOptions: CalendarAppointmentStatus[] = ["confirmed", "pending"];

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function minutesToTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
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
  const [endTime, setEndTime] = useState(
    initialAppointment?.endTime ??
      (initialStartTime
        ? minutesToTime(Math.min(timeToMinutes(initialStartTime) + 60, 23 * 60 + 45))
        : "10:00")
  );
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
  const startOptions = selectedHours.enabled
    ? timeSlots.filter((time) => {
        const minutes = timeToMinutes(time);
        return minutes >= timeToMinutes(selectedHours.start) && minutes < timeToMinutes(selectedHours.end);
      })
    : [];
  const endOptions = selectedHours.enabled
    ? timeSlots.filter((time) => {
        const minutes = timeToMinutes(time);
        return minutes > timeToMinutes(startTime) && minutes <= timeToMinutes(selectedHours.end);
      })
    : [];

  function handleStartChange(value: string) {
    setStartTime(value);
    if (timeToMinutes(endTime) <= timeToMinutes(value)) {
      const nextEnd = timeSlots.find(
        (time) =>
          timeToMinutes(time) > timeToMinutes(value) &&
          timeToMinutes(time) <= timeToMinutes(selectedHours.end)
      );
      setEndTime(nextEnd ?? endTime);
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
        endTime,
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
        description="Bookings need a client record so reminders, inbox threads, and visit history stay attached."
        actionHref="/clients/new?next=calendar"
        actionLabel="Add first client"
      />
    );
  }

  return (
    <form action={handleSubmit} className="space-y-3.5">
      <WorkspaceFormSection title="Client">
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-foreground">Client</span>
          <ClientCombobox
            value={clientId}
            onChange={setClientId}
            initialOptions={clients}
          />
        </label>
      </WorkspaceFormSection>

      <WorkspaceFormSection title="Service and schedule">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Service</span>
            <Input
              name="service"
              required
              defaultValue={initialAppointment?.service}
              placeholder="Consultation, follow-up, treatment"
              className={fieldInputClass}
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Staff</span>
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
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Date</span>
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={fieldInputClass}
            />
          </label>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-foreground">Start</span>
              <select
                value={startOptions.includes(startTime) ? startTime : ""}
                onChange={(event) => handleStartChange(event.target.value)}
                className={fieldSelectClass}
              >
                <option value="" disabled>
                  Choose time
                </option>
                {startOptions.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-foreground">End</span>
              <select
                value={endOptions.includes(endTime) ? endTime : ""}
                onChange={(event) => setEndTime(event.target.value)}
                className={fieldSelectClass}
              >
                <option value="" disabled>
                  Choose time
                </option>
                {endOptions.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as CalendarAppointmentStatus)}
              className={cn(fieldSelectClass, "capitalize")}
            >
              {/* A new booking can only be confirmed or pending; completed/cancelled
                  are reached later from the calendar, not at creation. */}
              {(isEditing ? editStatusOptions : createStatusOptions).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-foreground">Notes</span>
            <Textarea name="notes" defaultValue={initialAppointment?.notes} placeholder="Reason, preparation notes, or appointment context" className="min-h-24 rounded-(--radius-card) bg-white px-3 py-3" />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {selectedHours.enabled
            ? `Operating hours for this day: ${selectedHours.start} - ${selectedHours.end}.`
            : "This clinic is closed on the selected date. Choose an open day before booking."}
        </p>
      </WorkspaceFormSection>

      {error ? (
        <div className="rounded-(--radius-card) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {initialAppointment ? (
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="destructive"
              className="rounded-(--radius-card)"
              onClick={() => setConfirmingAction("cancel")}
              disabled={isPending || status === "cancelled" || baselineStatus === "completed"}
            >
              <XCircle className="size-4" />
              Cancel booking
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-(--radius-card) border-destructive/25 bg-white text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={() => setConfirmingAction("delete")}
              disabled={isPending}
            >
              <Trash2 className="size-4" />
              Delete booking
            </Button>
          </div>
        ) : (
          <span />
        )}
        <div className="flex justify-end gap-3">
        <Link
          href="/calendar"
          className={cn(buttonVariants({ variant: "outline" }), "rounded-(--radius-card) bg-white")}
        >
          <ArrowLeft className="size-4" />
          Cancel
        </Link>
        <Button type="submit" className="rounded-(--radius-card)" disabled={isPending}>
          {isEditing ? <Save className="size-4" /> : <CalendarPlus2 className="size-4" />}
          {isPending ? "Saving..." : isEditing ? "Save booking" : "Book appointment"}
        </Button>
        </div>
      </div>

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
