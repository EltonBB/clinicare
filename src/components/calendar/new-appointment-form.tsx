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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function businessHoursForDate(date: string, hours: CalendarBusinessHours[]) {
  const parsed = new Date(`${date}T00:00:00`);
  const weekday = Number.isNaN(parsed.getTime()) ? 0 : (parsed.getDay() + 6) % 7;

  return (
    hours.find((item) => item.weekday === weekday) ?? {
      weekday,
      enabled: weekday < 5,
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
  initialAppointment,
}: NewAppointmentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [clientId, setClientId] = useState(
    initialAppointment?.clientId ?? initialClientId ?? clients[0]?.id ?? ""
  );
  const [staffMemberId, setStaffMemberId] = useState(
    initialAppointment?.staffMemberId ?? staffMembers[0]?.id ?? ""
  );
  const [date, setDate] = useState(initialAppointment?.date ?? initialDate);
  const [startTime, setStartTime] = useState(initialAppointment?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(initialAppointment?.endTime ?? "10:00");
  const [status, setStatus] = useState<CalendarAppointmentStatus>(
    initialAppointment?.status ?? "confirmed"
  );
  const [paymentStatus, setPaymentStatus] = useState("Unpaid");
  const isEditing = Boolean(initialAppointment);
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
        paymentAmount: String(formData.get("paymentAmount") ?? ""),
        paymentStatus,
        paymentDescription: String(formData.get("paymentDescription") ?? ""),
        paymentReceiptUrl: String(formData.get("paymentReceiptUrl") ?? ""),
        paymentPaidAt: String(formData.get("paymentPaidAt") ?? ""),
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
        setError(result.error ?? "We couldn't cancel this booking.");
        return;
      }

      router.push(`/calendar?date=${initialAppointment.date}`);
    });
  }

  function deleteAppointment() {
    if (!initialAppointment || !window.confirm("Delete this booking permanently?")) {
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await deleteAppointmentAction(initialAppointment.id);

      if (!result.ok) {
        setError(result.error ?? "We couldn't delete this booking.");
        return;
      }

      router.push(`/calendar?date=${initialAppointment.date}`);
    });
  }

  if (clients.length === 0) {
    return (
      <section className="rounded-[1.15rem] border border-dashed border-primary/25 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),var(--primary-soft))] p-8 text-center shadow-[0_18px_44px_rgba(20,32,51,0.045)]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-[1.05rem] bg-primary/12 text-primary">
          <UsersRound className="size-5" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-foreground">Add a client before booking</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">
          Bookings need a client record so reminders, inbox threads, and visit history stay attached.
        </p>
        <Link
          href="/clients/new?next=calendar"
          className={cn(buttonVariants(), "mt-6 rounded-[0.95rem]")}
        >
          Add first client
        </Link>
      </section>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <section className="rounded-[1.15rem] border border-border/80 bg-white/86 p-5 shadow-[0_18px_44px_rgba(20,32,51,0.045)]">
        <h2 className="text-base font-semibold text-foreground">Client</h2>
        <label className="mt-5 block space-y-2">
          <span className="text-sm font-semibold text-foreground">Client</span>
          <select
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            className="h-11 w-full rounded-[0.9rem] border border-border/80 bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/35"
          >
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
                {client.phone ? ` - ${client.phone}` : ""}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="rounded-[1.15rem] border border-border/80 bg-white/86 p-5 shadow-[0_18px_44px_rgba(20,32,51,0.045)]">
        <h2 className="text-base font-semibold text-foreground">Service and schedule</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Service</span>
            <Input
              name="service"
              required
              defaultValue={initialAppointment?.service}
              placeholder="Consultation, follow-up, treatment"
              className="h-11 rounded-[0.9rem] bg-white"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Staff</span>
            <select
              value={staffMemberId}
              onChange={(event) => setStaffMemberId(event.target.value)}
              className="h-11 w-full rounded-[0.9rem] border border-border/80 bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/35"
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
              className="h-11 rounded-[0.9rem] bg-white"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-foreground">Start</span>
              <select
                value={startOptions.includes(startTime) ? startTime : ""}
                onChange={(event) => handleStartChange(event.target.value)}
                className="h-11 w-full rounded-[0.9rem] border border-border/80 bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/35"
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
                className="h-11 w-full rounded-[0.9rem] border border-border/80 bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/35"
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
              className="h-11 w-full rounded-[0.9rem] border border-border/80 bg-white px-3 text-sm capitalize outline-none transition-[border-color,box-shadow] focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/35"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-foreground">Notes</span>
            <Textarea name="notes" defaultValue={initialAppointment?.notes} placeholder="Reason, preparation notes, or appointment context" className="min-h-28 rounded-[0.9rem] bg-white px-3 py-3" />
          </label>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {selectedHours.enabled
            ? `Operating hours for this day: ${selectedHours.start} - ${selectedHours.end}.`
            : "This clinic is closed on the selected date. Choose an open day before booking."}
        </p>
      </section>

      {!isEditing ? (
      <section className="rounded-[1.15rem] border border-border/80 bg-white/86 p-5 shadow-[0_18px_44px_rgba(20,32,51,0.045)]">
        <h2 className="text-base font-semibold text-foreground">Payment</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Add the expected or collected payment for this booked service. Leave amount blank if payment will be handled later.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Service amount</span>
            <Input name="paymentAmount" inputMode="decimal" placeholder="0.00" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Payment status</span>
            <select
              value={paymentStatus}
              onChange={(event) => setPaymentStatus(event.target.value)}
              className="h-11 w-full rounded-[0.9rem] border border-border/80 bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/35"
            >
              {["Unpaid", "Paid", "Partially Paid"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Paid date</span>
            <Input name="paymentPaidAt" type="date" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Invoice / receipt URL</span>
            <Input name="paymentReceiptUrl" placeholder="Optional" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-foreground">Payment note</span>
            <Textarea name="paymentDescription" placeholder="Deposit, full service payment, balance due..." className="min-h-24 rounded-[0.9rem] bg-white px-3 py-3" />
          </label>
        </div>
      </section>
      ) : null}

      {error ? (
        <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {initialAppointment ? (
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="destructive"
              className="rounded-[0.9rem]"
              onClick={cancelAppointment}
              disabled={isPending || status === "cancelled"}
            >
              <XCircle className="size-4" />
              Cancel booking
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-[0.9rem] border-destructive/25 bg-white text-destructive hover:bg-destructive/5 hover:text-destructive"
              onClick={deleteAppointment}
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
          className={cn(buttonVariants({ variant: "outline" }), "rounded-[0.9rem] bg-white")}
        >
          <ArrowLeft className="size-4" />
          Cancel
        </Link>
        <Button type="submit" className="rounded-[0.9rem]" disabled={isPending}>
          {isEditing ? <Save className="size-4" /> : <CalendarPlus2 className="size-4" />}
          {isPending ? "Saving..." : isEditing ? "Save booking" : "Book appointment"}
        </Button>
        </div>
      </div>
    </form>
  );
}
