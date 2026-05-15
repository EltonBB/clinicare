"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, CalendarClock, Save, Trash2, UserRoundPlus } from "lucide-react";

import { deleteStaffAction, saveStaffAction } from "@/app/(workspace)/staff/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { staffRoles, staffStatuses, type StaffRecord, type StaffStatus } from "@/lib/staff";
import { cn } from "@/lib/utils";

type NewStaffFormProps = {
  staff?: StaffRecord;
};

type ScheduleDraft = {
  date: string;
  day: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

function buildInitialSchedule(staff?: StaffRecord): ScheduleDraft[] {
  const existingByDate = new Map(staff?.schedule.map((shift) => [shift.date, shift]) ?? []);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    const dateKey = date.toISOString().slice(0, 10);
    const existing = existingByDate.get(dateKey);

    return {
      date: dateKey,
      day: date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      enabled: Boolean(existing),
      startTime: existing?.startTime ?? "09:00",
      endTime: existing?.endTime ?? "17:00",
    };
  });
}

function SelectField({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <select
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-[0.9rem] border border-border/80 bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/35"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NewStaffForm({ staff }: NewStaffFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [role, setRole] = useState(staff?.role ?? "Specialist");
  const [status, setStatus] = useState<StaffStatus>(staff?.status ?? "ACTIVE");
  const [schedule, setSchedule] = useState<ScheduleDraft[]>(() => buildInitialSchedule(staff));
  const isEditing = Boolean(staff);

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
        setError(result.error ?? `We couldn't ${isEditing ? "update" : "create"} this staff member.`);
        return;
      }

      router.push(`/staff/${result.staff.id}`);
    });
  }

  function deleteStaff() {
    if (!staff || !window.confirm("Delete this staff member permanently?")) {
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await deleteStaffAction(staff.id);

      if (!result.ok) {
        setError(result.error ?? "We couldn't delete this staff member.");
        return;
      }

      router.push("/staff");
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <section className="rounded-[1.15rem] border border-border/80 bg-white/86 p-5 shadow-[0_18px_44px_rgba(20,32,51,0.045)]">
        <h2 className="text-base font-semibold text-foreground">Staff profile</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Name</span>
            <Input name="name" required defaultValue={staff?.name} placeholder="Staff member name" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <SelectField
            name="role"
            label="Role"
            value={role}
            options={staffRoles}
            onChange={setRole}
          />
          <SelectField
            name="status"
            label="Status"
            value={status}
            options={staffStatuses}
            onChange={(value) => setStatus(value as StaffStatus)}
          />
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Phone</span>
            <Input name="phone" defaultValue={staff?.phone} placeholder="+1 555 000 0000" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-foreground">Email</span>
            <Input name="email" type="email" defaultValue={staff?.email} placeholder="staff@example.com" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
        </div>
      </section>

      <section className="rounded-[1.15rem] border border-border/80 bg-white/86 p-5 shadow-[0_18px_44px_rgba(20,32,51,0.045)]">
        <h2 className="text-base font-semibold text-foreground">Operational note</h2>
        <label className="mt-5 block space-y-2">
          <span className="text-sm font-semibold text-foreground">Profile note</span>
          <Textarea
            name="profileNote"
            defaultValue={staff?.profileNote}
            placeholder="Working preferences, specialties, or scheduling notes"
            className="min-h-32 rounded-[0.9rem] bg-white px-3 py-3"
          />
        </label>
      </section>

      <section className="rounded-[1.15rem] border border-border/80 bg-white/86 p-5 shadow-[0_18px_44px_rgba(20,32,51,0.045)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="inline-flex items-center gap-2 text-base font-semibold text-foreground">
              <CalendarClock className="size-4 text-primary" />
              Weekly schedule
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Set the staff member&apos;s working shifts for the next seven days. Check-in is allowed only during the scheduled shift window.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setSchedule((current) =>
                current.map((item) => ({
                  ...item,
                  enabled: true,
                  startTime: item.startTime || "09:00",
                  endTime: item.endTime || "17:00",
                }))
              )
            }
            className="text-sm font-semibold text-primary"
          >
            Use 9-5 all week
          </button>
        </div>
        <div className="mt-5 overflow-hidden rounded-[0.9rem] border border-border/75">
          <div className="hidden grid-cols-[minmax(120px,1fr)_110px_110px_110px] bg-secondary/35 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground sm:grid">
            <span>Day</span>
            <span>Start</span>
            <span>End</span>
            <span>Status</span>
          </div>
          <div className="divide-y divide-border/70">
            {schedule.map((item, index) => (
              <div
                key={item.date}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(120px,1fr)_110px_110px_110px] sm:items-center"
              >
                <label className="flex items-center gap-3 text-sm font-semibold text-foreground">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(event) => updateSchedule(index, { enabled: event.target.checked })}
                    className="size-4 rounded border-border text-primary"
                  />
                  <span>{item.day}</span>
                </label>
                <Input
                  type="time"
                  value={item.startTime}
                  disabled={!item.enabled}
                  onChange={(event) => updateSchedule(index, { startTime: event.target.value })}
                  className="h-9 rounded-[0.65rem] bg-white"
                  aria-label={`${item.day} shift start`}
                />
                <Input
                  type="time"
                  value={item.endTime}
                  disabled={!item.enabled}
                  onChange={(event) => updateSchedule(index, { endTime: event.target.value })}
                  className="h-9 rounded-[0.65rem] bg-white"
                  aria-label={`${item.day} shift end`}
                />
                <span className={cn("text-sm font-medium", item.enabled ? "text-emerald-700" : "text-muted-foreground")}>
                  {item.enabled ? "Scheduled" : "Off"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {staff ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-[0.9rem] border-destructive/25 bg-white text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={deleteStaff}
            disabled={isPending}
          >
            <Trash2 className="size-4" />
            Delete staff member
          </Button>
        ) : (
          <span />
        )}
        <div className="flex justify-end gap-3">
        <Link
          href={staff ? `/staff/${staff.id}` : "/staff"}
          className={cn(buttonVariants({ variant: "outline" }), "rounded-[0.9rem] bg-white")}
        >
          <ArrowLeft className="size-4" />
          Cancel
        </Link>
        <Button type="submit" className="rounded-[0.9rem]" disabled={isPending}>
          {isEditing ? <Save className="size-4" /> : <UserRoundPlus className="size-4" />}
          {isPending ? "Saving..." : isEditing ? "Save staff" : "Create staff"}
        </Button>
        </div>
      </div>
    </form>
  );
}
