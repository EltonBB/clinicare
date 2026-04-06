"use client";

import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { startTransition, useMemo, useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
} from "lucide-react";

import {
  cancelAppointmentAction,
  deleteAppointmentAction,
  saveAppointmentAction,
} from "@/app/(workspace)/calendar/actions";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  CalendarAppointment,
  CalendarSelectOption,
  CalendarViewModel,
} from "@/lib/calendar";

type CalendarView = "day" | "week" | "month";

type CalendarWorkspaceProps = {
  initialView: CalendarViewModel;
  ownerName: string;
};

type AppointmentDraft = {
  id?: string;
  clientId: string;
  service: string;
  staffMemberId: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  status: CalendarAppointment["status"];
};

const views: CalendarView[] = ["day", "week", "month"];
const slotHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

const toneClasses: Record<CalendarAppointment["tone"], string> = {
  primary: "border-primary/20 bg-primary text-primary-foreground",
  secondary: "border-[#cfc9ff] bg-[#e9e5ff] text-[#5046c7]",
  muted: "border-[#d28b83] bg-[#c86d62] text-white",
};

const statusOptions: CalendarAppointment["status"][] = [
  "confirmed",
  "pending",
  "cancelled",
];

function emptyDraft(
  date: string,
  clients: CalendarSelectOption[],
  staffMembers: CalendarSelectOption[]
): AppointmentDraft {
  return {
    clientId: clients[0]?.id ?? "",
    service: "",
    staffMemberId: staffMembers[0]?.id ?? "",
    date,
    startTime: "09:00",
    endTime: "10:00",
    notes: "",
    status: "confirmed",
  };
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function weekDays(activeDate: Date) {
  const start = startOfWeek(activeDate, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function monthDays(activeDate: Date) {
  const monthStart = startOfMonth(activeDate);
  const monthEnd = endOfMonth(activeDate);

  return eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
    end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
  });
}

function appointmentHeight(startTime: string, endTime: string) {
  const duration = Math.max(timeToMinutes(endTime) - timeToMinutes(startTime), 30);
  return `${Math.max((duration / 60) * 72, 46)}px`;
}

function appointmentOffset(startTime: string) {
  const firstMinute = slotHours[0] * 60;
  const startMinute = timeToMinutes(startTime);
  return `${Math.max(((startMinute - firstMinute) / 60) * 72, 0)}px`;
}

function AppointmentCard({
  appointment,
  onSelect,
}: {
  appointment: CalendarAppointment;
  onSelect: (appointment: CalendarAppointment) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(appointment)}
      className={cn(
        "absolute inset-x-2 overflow-hidden rounded-[0.85rem] border px-3 py-2 text-left shadow-none",
        toneClasses[appointment.tone]
      )}
      style={{
        top: appointmentOffset(appointment.startTime),
        height: appointmentHeight(appointment.startTime, appointment.endTime),
      }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-90">
        {appointment.startTime} - {appointment.endTime}
      </p>
      <p className="mt-1 text-[15px] font-semibold leading-5">
        {appointment.service}
      </p>
      <p className="mt-2 text-xs leading-5 opacity-90">
        Client: {appointment.clientName}
      </p>
    </button>
  );
}

function NativeSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-[0.75rem] border border-border bg-card px-3 text-sm outline-none transition-colors focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function CalendarWorkspace({
  initialView,
  ownerName,
}: CalendarWorkspaceProps) {
  const [view, setView] = useState<CalendarView>("week");
  const [activeDate, setActiveDate] = useState(() => parseISO(initialView.initialDate));
  const [appointments, setAppointments] = useState(initialView.appointments);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isPending, startSaving] = useTransition();
  const [draft, setDraft] = useState<AppointmentDraft>(() =>
    emptyDraft(initialView.initialDate, initialView.clients, initialView.staffMembers)
  );

  const currentWeek = useMemo(() => weekDays(activeDate), [activeDate]);
  const currentMonth = useMemo(() => monthDays(activeDate), [activeDate]);
  const selectedDateKey = format(activeDate, "yyyy-MM-dd");

  const visibleAppointments = useMemo(() => {
    if (view === "day") {
      return appointments.filter((appointment) => appointment.date === selectedDateKey);
    }

    if (view === "week") {
      const visibleKeys = new Set(currentWeek.map((day) => format(day, "yyyy-MM-dd")));
      return appointments.filter((appointment) => visibleKeys.has(appointment.date));
    }

    const visibleKeys = new Set(currentMonth.map((day) => format(day, "yyyy-MM-dd")));
    return appointments.filter((appointment) => visibleKeys.has(appointment.date));
  }, [appointments, currentMonth, currentWeek, selectedDateKey, view]);

  const clientLookup = useMemo(
    () => new Map(initialView.clients.map((client) => [client.id, client.name])),
    [initialView.clients]
  );
  const staffLookup = useMemo(
    () => new Map(initialView.staffMembers.map((member) => [member.id, member.name])),
    [initialView.staffMembers]
  );

  function openNewBooking(date = selectedDateKey) {
    setDraft(emptyDraft(date, initialView.clients, initialView.staffMembers));
    setErrorMessage("");
    setDrawerOpen(true);
  }

  function openExistingBooking(appointment: CalendarAppointment) {
    setDraft({
      id: appointment.id,
      clientId: appointment.clientId,
      service: appointment.service,
      staffMemberId: appointment.staffMemberId ?? "",
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      notes: appointment.notes,
      status: appointment.status,
    });
    setErrorMessage("");
    setDrawerOpen(true);
  }

  function shiftRange(direction: "prev" | "next") {
    startTransition(() => {
      setActiveDate((current) => {
        if (view === "day") {
          return addDays(current, direction === "next" ? 1 : -1);
        }

        if (view === "week") {
          return direction === "next" ? addWeeks(current, 1) : subWeeks(current, 1);
        }

        return direction === "next" ? addMonths(current, 1) : subMonths(current, 1);
      });
    });
  }

  function saveDraft() {
    startSaving(async () => {
      const result = await saveAppointmentAction({
        id: draft.id,
        clientId: draft.clientId,
        service: draft.service,
        staffMemberId: draft.staffMemberId || undefined,
        date: draft.date,
        startTime: draft.startTime,
        endTime: draft.endTime,
        notes: draft.notes,
        status: draft.status,
      });

      if (!result.ok || !result.appointment) {
        setErrorMessage(result.error ?? "We couldn't save the appointment.");
        setStatusMessage("");
        return;
      }

      setAppointments((current) => {
        const index = current.findIndex((item) => item.id === result.appointment!.id);

        if (index === -1) {
          return [...current, result.appointment!].sort((left, right) => {
            return `${left.date}${left.startTime}`.localeCompare(`${right.date}${right.startTime}`);
          });
        }

        const clone = [...current];
        clone[index] = result.appointment!;
        return clone.sort((left, right) => {
          return `${left.date}${left.startTime}`.localeCompare(`${right.date}${right.startTime}`);
        });
      });

      setDrawerOpen(false);
      setErrorMessage("");
      setStatusMessage(draft.id ? "Appointment updated." : "Appointment created.");
    });
  }

  function cancelAppointment() {
    if (!draft.id) {
      setDrawerOpen(false);
      return;
    }

    startSaving(async () => {
      const result = await cancelAppointmentAction(draft.id!);

      if (!result.ok) {
        setErrorMessage(result.error ?? "We couldn't cancel the appointment.");
        setStatusMessage("");
        return;
      }

      setAppointments((current) =>
        current.map((appointment) =>
          appointment.id === draft.id
            ? { ...appointment, status: "cancelled", tone: "muted" }
            : appointment
        )
      );
      setDrawerOpen(false);
      setErrorMessage("");
      setStatusMessage("Appointment cancelled.");
    });
  }

  function deleteAppointment() {
    if (!draft.id) {
      return;
    }

    if (!window.confirm("Delete this appointment permanently?")) {
      return;
    }

    startSaving(async () => {
      const result = await deleteAppointmentAction(draft.id!);

      if (!result.ok) {
        setErrorMessage(result.error ?? "We couldn't delete the appointment.");
        setStatusMessage("");
        return;
      }

      setAppointments((current) =>
        current.filter((appointment) => appointment.id !== draft.id)
      );
      setDrawerOpen(false);
      setErrorMessage("");
      setStatusMessage("Appointment deleted.");
    });
  }

  const dayLabel =
    view === "month"
      ? format(activeDate, "MMMM yyyy")
      : `${format(currentWeek[0], "MMMM yyyy")}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {dayLabel}
          </h1>
          <div className="inline-flex rounded-[0.75rem] border border-border bg-card p-1">
            {views.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => startTransition(() => setView(option))}
                className={cn(
                  "rounded-[0.6rem] px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground transition-colors",
                  view === option && "bg-secondary text-foreground"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center rounded-[0.75rem] border border-border bg-card">
            <button
              type="button"
              onClick={() => shiftRange("prev")}
              className="px-3 py-2 text-muted-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveDate(parseISO(initialView.initialDate))}
              className="border-x border-border px-4 py-2 text-sm font-medium text-foreground"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftRange("next")}
              className="px-3 py-2 text-muted-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <Button
            size="lg"
            className="h-11 rounded-[0.75rem] px-4"
            onClick={() => openNewBooking()}
          >
            <Plus className="size-4" />
            New appointment
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      {!errorMessage && statusMessage ? (
        <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
          {statusMessage}
        </div>
      ) : null}

      {view === "month" ? (
        <div className="rounded-[0.9rem] border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
              <div key={label} className="px-4 py-3">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {currentMonth.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const items = appointments.filter((appointment) => appointment.date === key);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setActiveDate(day);
                    startTransition(() => setView("day"));
                  }}
                  className={cn(
                    "min-h-32 border-b border-r border-border px-3 py-3 text-left transition-colors",
                    !isSameMonth(day, activeDate) && "bg-muted/35 text-muted-foreground"
                  )}
                >
                  <p className="text-sm font-medium">{format(day, "d")}</p>
                  <div className="mt-3 space-y-2">
                    {items.slice(0, 2).map((appointment) => (
                      <div
                        key={appointment.id}
                        className={cn(
                          "truncate rounded-[0.55rem] px-2 py-1 text-xs font-medium",
                          appointment.tone === "primary" && "bg-primary/12 text-primary",
                          appointment.tone === "secondary" && "bg-[#ece8ff] text-[#5146c7]",
                          appointment.tone === "muted" && "bg-destructive/10 text-destructive"
                        )}
                      >
                        {appointment.startTime} {appointment.service}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[0.9rem] border border-border bg-card">
          <div className="overflow-x-auto">
            <div className="min-w-[940px]">
              <div className={cn("grid border-b border-border", view === "day" ? "grid-cols-[76px_1fr]" : "grid-cols-[76px_repeat(7,minmax(0,1fr))]")}>
                <div className="px-3 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  GMT+2
                </div>
                {(view === "day" ? [activeDate] : currentWeek).map((day) => (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => setActiveDate(day)}
                    className={cn(
                      "border-l border-border px-4 py-3 text-left",
                      isSameDay(day, activeDate) && "bg-secondary/70"
                    )}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      {format(day, "EEE")}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                      {format(day, "d")}
                    </p>
                  </button>
                ))}
              </div>

              <div className={cn("grid", view === "day" ? "grid-cols-[76px_1fr]" : "grid-cols-[76px_repeat(7,minmax(0,1fr))]")}>
                <div>
                  {slotHours.map((hour) => (
                    <div
                      key={hour}
                      className="flex h-[72px] items-start justify-end pr-3 pt-2 text-xs text-muted-foreground"
                    >
                      {format(new Date(2026, 3, 3, hour), "h a")}
                    </div>
                  ))}
                </div>

                {(view === "day" ? [activeDate] : currentWeek).map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const items = visibleAppointments.filter((appointment) => appointment.date === key);

                  return (
                    <div
                      key={key}
                      className={cn(
                        "relative border-l border-border",
                        isSameDay(day, activeDate) && "bg-secondary/35"
                      )}
                    >
                      {slotHours.map((hour) => (
                        <div
                          key={hour}
                          className="h-[72px] border-b border-border/80"
                        />
                      ))}
                      {items.map((appointment) => (
                        <AppointmentCard
                          key={appointment.id}
                          appointment={appointment}
                          onSelect={openExistingBooking}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="rounded-[0.9rem] border border-border bg-card px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Selected day</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {format(activeDate, "EEEE, MMMM d")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-[0.7rem]"
              onClick={() => openNewBooking(selectedDateKey)}
            >
              <Plus className="size-4" />
              Add booking
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {appointments
              .filter((appointment) => appointment.date === selectedDateKey)
              .sort((left, right) => left.startTime.localeCompare(right.startTime))
              .map((appointment) => (
                <button
                  key={appointment.id}
                  type="button"
                  onClick={() => openExistingBooking(appointment)}
                  className="flex w-full items-start justify-between rounded-[0.8rem] border border-border px-4 py-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {appointment.clientName}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {appointment.service} - {appointment.startTime}
                    </p>
                  </div>
                  <MoreHorizontal className="mt-0.5 size-4 text-muted-foreground" />
                </button>
              ))}
            {appointments.filter((appointment) => appointment.date === selectedDateKey).length === 0 ? (
              <div className="rounded-[0.8rem] border border-border px-4 py-4 text-sm text-muted-foreground">
                No bookings for the selected day yet.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[0.9rem] border border-border bg-card px-4 py-4">
          <p className="text-sm font-semibold text-foreground">Team assignment</p>
          <div className="mt-4 space-y-3">
            {(initialView.staffMembers.length > 0
              ? initialView.staffMembers
              : [{ id: "owner-fallback", name: ownerName }]
            ).map((member, index) => (
              <div key={member.name} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "size-2.5 rounded-full",
                    index % 3 === 0 && "bg-primary",
                    index % 3 === 1 && "bg-[#6e63d9]",
                    index % 3 === 2 && "bg-[#b75d52]"
                  )}
                />
                <span className="text-muted-foreground">{member.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full max-w-[460px] bg-card p-0 sm:max-w-[460px]">
          <SheetHeader className="border-b border-border px-5 py-5">
            <SheetTitle>
              {draft.id ? "Edit booking" : "New booking"}
            </SheetTitle>
            <SheetDescription>
              Create, reschedule, or cancel appointments from one place.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-5 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Client
                </label>
                <NativeSelect
                  value={draft.clientId}
                  options={initialView.clients.map((client) => ({
                    value: client.id,
                    label: client.name,
                  }))}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, clientId: value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {clientLookup.get(draft.clientId) ?? "Select a client"}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Staff
                </label>
                <NativeSelect
                  value={draft.staffMemberId}
                  options={initialView.staffMembers.map((member) => ({
                    value: member.id,
                    label: member.name,
                  }))}
                  onChange={(value) =>
                    setDraft((current) => ({ ...current, staffMemberId: value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {staffLookup.get(draft.staffMemberId) ?? ownerName}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Service
              </label>
              <Input
                value={draft.service}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, service: event.target.value }))
                }
                className="h-11 rounded-[0.75rem] bg-card"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-1">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Date
                </label>
                <Input
                  type="date"
                  value={draft.date}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, date: event.target.value }))
                  }
                  className="h-11 rounded-[0.75rem] bg-card"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Start
                </label>
                <Input
                  type="time"
                  value={draft.startTime}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, startTime: event.target.value }))
                  }
                  className="h-11 rounded-[0.75rem] bg-card"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  End
                </label>
                <Input
                  type="time"
                  value={draft.endTime}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, endTime: event.target.value }))
                  }
                  className="h-11 rounded-[0.75rem] bg-card"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Status
                </label>
                <NativeSelect
                  value={draft.status}
                  options={statusOptions.map((status) => ({
                    value: status,
                    label: status,
                  }))}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      status: value as CalendarAppointment["status"],
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Notes
              </label>
              <Textarea
                value={draft.notes}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, notes: event.target.value }))
                }
                className="min-h-28 rounded-[0.75rem] bg-card px-3 py-3"
              />
            </div>
          </div>

          <SheetFooter className="border-t border-border bg-muted/30 px-5 py-4">
            {draft.id ? (
              <>
                <Button
                  variant="destructive"
                  className="rounded-[0.75rem]"
                  onClick={cancelAppointment}
                  disabled={isPending}
                >
                  Cancel appointment
                </Button>
                <Button
                  variant="outline"
                  className="rounded-[0.75rem] border-destructive/25 text-destructive hover:bg-destructive/5 hover:text-destructive"
                  onClick={deleteAppointment}
                  disabled={isPending}
                >
                  Delete appointment
                </Button>
              </>
            ) : null}
            <Button
              variant="outline"
              className="rounded-[0.75rem]"
              onClick={() => setDrawerOpen(false)}
              disabled={isPending}
            >
              Close
            </Button>
            <Button className="rounded-[0.75rem]" onClick={saveDraft} disabled={isPending}>
              {isPending ? "Saving..." : draft.id ? "Save changes" : "Create booking"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
