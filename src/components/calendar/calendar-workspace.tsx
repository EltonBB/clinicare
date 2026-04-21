"use client";

import Link from "next/link";
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
  CalendarPlus2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  UsersRound,
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
  initialCreateOpen?: boolean;
  initialClientId?: string;
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
  primary:
    "border-primary/20 bg-[linear-gradient(135deg,rgba(92,143,212,0.95),rgba(38,137,135,0.92))] text-primary-foreground shadow-[0_18px_32px_rgba(38,137,135,0.18)]",
  secondary:
    "border-[#cfddf4] bg-[linear-gradient(135deg,rgba(240,245,255,0.95),rgba(224,238,255,0.98))] text-[#36588f]",
  muted:
    "border-[#efcfc8] bg-[linear-gradient(135deg,rgba(255,244,241,0.96),rgba(253,236,232,0.98))] text-[#b15f56]",
};

const statusOptions: CalendarAppointment["status"][] = [
  "confirmed",
  "pending",
  "cancelled",
];

function emptyDraft(
  date: string,
  clients: CalendarSelectOption[],
  staffMembers: CalendarSelectOption[],
  preferredClientId?: string
): AppointmentDraft {
  const preferredClient = clients.find((client) => client.id === preferredClientId);

  return {
    clientId: preferredClient?.id ?? clients[0]?.id ?? "",
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
        "interactive-lift absolute inset-x-2 overflow-hidden rounded-[0.95rem] border px-3 py-2 text-left transition-[box-shadow,transform] duration-200",
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
      className="h-11 w-full rounded-[0.9rem] border border-border/80 bg-white/84 px-3 text-sm outline-none transition-[border-color,background-color,box-shadow] duration-200 focus:border-ring focus:bg-white focus-visible:ring-3 focus-visible:ring-ring/40"
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
  initialCreateOpen = false,
  initialClientId,
}: CalendarWorkspaceProps) {
  const initialHasClients = initialView.clients.length > 0;
  const [view, setView] = useState<CalendarView>("week");
  const [activeDate, setActiveDate] = useState(() => parseISO(initialView.initialDate));
  const [appointments, setAppointments] = useState(initialView.appointments);
  const [drawerOpen, setDrawerOpen] = useState(initialCreateOpen && initialHasClients);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [savedAppointmentClientId, setSavedAppointmentClientId] = useState("");
  const [isPending, startSaving] = useTransition();
  const [draft, setDraft] = useState<AppointmentDraft>(() =>
    emptyDraft(
      initialView.initialDate,
      initialView.clients,
      initialView.staffMembers,
      initialClientId
    )
  );
  const hasClients = initialHasClients;

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

  function replaceCalendarUrl() {
    window.history.replaceState(null, "", "/calendar");
  }

  function openNewBooking(date = selectedDateKey, preferredClientId = initialClientId) {
    if (!hasClients) {
      setErrorMessage("Add a client before booking an appointment.");
      setStatusMessage("");
      return;
    }

    setDraft(emptyDraft(date, initialView.clients, initialView.staffMembers, preferredClientId));
    setErrorMessage("");
    setSavedAppointmentClientId("");
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
    setSavedAppointmentClientId("");
    setDrawerOpen(true);
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open && initialCreateOpen) {
      replaceCalendarUrl();
    }
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
      setActiveDate(parseISO(result.appointment.date));
      setSavedAppointmentClientId(result.appointment.clientId);
      replaceCalendarUrl();
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
        <div className="section-reveal space-y-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Booking timeline
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-[2.4rem]">
              {dayLabel}
            </h1>
            <div className="inline-flex rounded-[1rem] border border-border/80 bg-white/70 p-1 shadow-[0_16px_32px_rgba(20,32,51,0.05)]">
            {views.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => startTransition(() => setView(option))}
                className={cn(
                  "rounded-[0.8rem] px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground transition-[background-color,color,transform] duration-200 hover:text-foreground",
                  view === option &&
                    "bg-white text-foreground shadow-[0_12px_28px_rgba(20,32,51,0.06)]"
                )}
              >
                {option}
              </button>
            ))}
            </div>
          </div>
        </div>

        <div className="section-reveal-delayed flex items-center gap-3">
          <div className="inline-flex items-center rounded-[1rem] border border-border/80 bg-white/72 shadow-[0_16px_32px_rgba(20,32,51,0.05)]">
            <button
              type="button"
              onClick={() => shiftRange("prev")}
              className="px-3 py-2 text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setActiveDate(parseISO(initialView.initialDate))}
              className="border-x border-border/80 px-4 py-2 text-sm font-medium text-foreground"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftRange("next")}
              className="px-3 py-2 text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {hasClients ? (
            <Button
              size="lg"
              className="h-11 rounded-[0.9rem] px-4"
              onClick={() => openNewBooking()}
              data-tour="calendar-create"
            >
              <Plus className="size-4" />
              New appointment
            </Button>
          ) : (
            <Link
              href="/clients?new=1&next=calendar"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[0.9rem] bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_10px_30px_rgba(20,32,51,0.04)] transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(38,137,135,0.24)]"
              data-tour="calendar-create"
            >
              <UsersRound className="size-4" />
              Add first client
            </Link>
          )}
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      {!errorMessage && statusMessage ? (
        <div className="flex flex-col gap-3 rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary sm:flex-row sm:items-center sm:justify-between">
          <span>{statusMessage}</span>
          {savedAppointmentClientId ? (
            <Link
              href={`/inbox?client=${savedAppointmentClientId}`}
              className="inline-flex items-center gap-2 font-semibold text-primary transition-transform duration-200 hover:translate-x-0.5"
            >
              Open inbox
              <CalendarPlus2 className="size-4" />
            </Link>
          ) : null}
        </div>
      ) : null}

      {!hasClients ? (
        <section className="section-reveal overflow-hidden rounded-[1.25rem] border border-dashed border-primary/25 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(232,244,242,0.72))] p-8 shadow-[0_18px_44px_rgba(20,32,51,0.055)]">
          <div className="mx-auto max-w-xl space-y-5 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-[1.05rem] bg-primary/12 text-primary">
              <UsersRound className="size-5" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Add a client before booking
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                Appointments need a client record so reminders, inbox threads,
                and visit history stay attached to the right person.
              </p>
            </div>
            <Link
              href="/clients?new=1&next=calendar"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[0.95rem] bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[0_10px_30px_rgba(20,32,51,0.04)] transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(38,137,135,0.24)]"
            >
              <Plus className="size-4" />
              Add first client
            </Link>
          </div>
        </section>
      ) : view === "month" ? (
        <div className="section-reveal overflow-hidden rounded-[1.15rem] border border-border/80 bg-white/94 shadow-[0_10px_24px_rgba(20,32,51,0.032)]">
          <div className="grid grid-cols-7 border-b border-border/80 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
                    "min-h-32 border-b border-r border-border/80 px-3 py-3 text-left transition-[background-color,color] duration-200",
                    !isSameMonth(day, activeDate) && "bg-muted/35 text-muted-foreground",
                    isSameDay(day, activeDate) && "bg-secondary/38"
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
                          appointment.tone === "secondary" && "bg-[#e8eefc] text-[#36588f]",
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
        <div className="section-reveal overflow-hidden rounded-[1.15rem] border border-border/80 bg-white/94 shadow-[0_10px_24px_rgba(20,32,51,0.032)]">
          <div className="overflow-x-auto">
            <div className="min-w-[940px]">
              <div className={cn("grid border-b border-border/80", view === "day" ? "grid-cols-[76px_1fr]" : "grid-cols-[76px_repeat(7,minmax(0,1fr))]")}>
                <div className="px-3 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  GMT+2
                </div>
                {(view === "day" ? [activeDate] : currentWeek).map((day) => (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => setActiveDate(day)}
                    className={cn(
                      "border-l border-border/80 px-4 py-4 text-left transition-colors duration-200",
                      isSameDay(day, activeDate) && "bg-secondary/65"
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
                        "relative border-l border-border/80",
                        isSameDay(day, activeDate) && "bg-secondary/28"
                      )}
                    >
                      {slotHours.map((hour) => (
                        <div
                          key={hour}
                          className="h-[72px] border-b border-border/75"
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

      {hasClients ? (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="section-reveal rounded-[1.05rem] border border-border/80 bg-white/94 px-4 py-4 shadow-[0_10px_24px_rgba(20,32,51,0.032)]">
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
              className="rounded-[0.85rem] bg-white/72"
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
                  className="interactive-lift flex w-full items-start justify-between rounded-[0.95rem] border border-border/80 bg-white px-4 py-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-200 hover:border-border hover:bg-white hover:shadow-[0_16px_30px_rgba(20,32,51,0.05)]"
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
              <div className="rounded-[0.95rem] border border-dashed border-border/90 bg-white/54 px-4 py-4 text-sm text-muted-foreground">
                No bookings for the selected day yet.
              </div>
            ) : null}
          </div>
        </div>

        <div className="section-reveal-delayed rounded-[1.05rem] border border-border/80 bg-white/94 px-4 py-4 shadow-[0_10px_24px_rgba(20,32,51,0.032)]">
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
      ) : null}

      <Sheet open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
        <SheetContent
          side="right"
          className="flex h-full w-full max-w-[460px] flex-col p-0 sm:max-w-[460px]"
          data-tour="calendar-form"
        >
          <SheetHeader className="glass-divider rounded-t-[1.2rem] px-5 py-5">
            <SheetTitle>
              {draft.id ? "Edit booking" : "New booking"}
            </SheetTitle>
            <SheetDescription>
              Create, reschedule, or cancel appointments from one place.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="space-y-5 pb-2">
              <div className="surface-soft grid gap-4 rounded-[1.05rem] p-4 sm:grid-cols-2">
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

              <div className="surface-soft space-y-2 rounded-[1.05rem] p-4">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Service
                </label>
                <Input
                  value={draft.service}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, service: event.target.value }))
                  }
                  className="h-11 rounded-[0.9rem] bg-white/84"
                />
              </div>

              <div className="surface-soft grid gap-4 rounded-[1.05rem] p-4 sm:grid-cols-3">
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
                    className="h-11 rounded-[0.9rem] bg-white/84"
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
                    className="h-11 rounded-[0.9rem] bg-white/84"
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
                    className="h-11 rounded-[0.9rem] bg-white/84"
                  />
                </div>
              </div>

              <div className="surface-soft grid gap-4 rounded-[1.05rem] p-4 sm:grid-cols-2">
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

              <div className="surface-soft space-y-2 rounded-[1.05rem] p-4">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Notes
                </label>
                <Textarea
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, notes: event.target.value }))
                  }
                  className="min-h-28 rounded-[0.9rem] bg-white/84 px-3 py-3"
                />
              </div>
            </div>
          </div>

          <SheetFooter className="glass-divider mt-0 shrink-0 rounded-b-[1.2rem] px-5 py-4">
            {draft.id ? (
              <>
                <Button
                  variant="destructive"
                  className="rounded-[0.9rem]"
                  onClick={cancelAppointment}
                  disabled={isPending}
                >
                  Cancel appointment
                </Button>
                <Button
                  variant="outline"
                  className="rounded-[0.9rem] border-destructive/25 bg-white/70 text-destructive hover:bg-destructive/5 hover:text-destructive"
                  onClick={deleteAppointment}
                  disabled={isPending}
                >
                  Delete appointment
                </Button>
              </>
            ) : null}
            <Button
              variant="outline"
              className="rounded-[0.9rem] bg-white/70"
              onClick={() => setDrawerOpen(false)}
              disabled={isPending}
            >
              Close
            </Button>
            <Button className="rounded-[0.9rem]" onClick={saveDraft} disabled={isPending}>
              {isPending ? "Saving..." : draft.id ? "Save changes" : "Create booking"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
