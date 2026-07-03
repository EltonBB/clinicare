"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { format } from "date-fns";
import { ArrowLeft, CalendarClock, Save, Trash2, UserRoundPlus } from "lucide-react";

import { deleteStaffAction, saveStaffAction } from "@/app/(workspace)/staff/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/clients/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  fieldInputClass,
  fieldSelectClass,
  WorkspaceFormSection,
} from "@/components/workspace/workspace-layout";
import { staffRoles, staffStatuses, type StaffRecord, type StaffStatus } from "@/lib/staff";
import { cn } from "@/lib/utils";

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

  return {
    weekday,
    isOpen: weekday < 5,
    startTime: "09:00",
    endTime: "17:00",
  };
}

function buildInitialSchedule(
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
      day: date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      clinicStart: clinicHours.startTime,
      clinicEnd: clinicHours.endTime,
      enabled: Boolean(existing),
      startTime: existing?.startTime ?? clinicHours.startTime,
      endTime: existing?.endTime ?? clinicHours.endTime,
    };
  }).filter((item): item is ScheduleDraft => Boolean(item));
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
        className={fieldSelectClass}
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

export function NewStaffForm({ staff, businessHours = [] }: NewStaffFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [role, setRole] = useState(staff?.role ?? "Specialist");
  const [status, setStatus] = useState<StaffStatus>(staff?.status ?? "ACTIVE");
  const [schedule, setSchedule] = useState<ScheduleDraft[]>(() =>
    buildInitialSchedule(staff, businessHours)
  );
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
    if (!staff) {
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await deleteStaffAction(staff.id);

      if (!result.ok) {
        setConfirmingDelete(false);
        setError(result.error ?? "We couldn't delete this staff member.");
        return;
      }

      router.push("/staff");
    });
  }

  return (
    <form action={handleSubmit} className="space-y-3.5">
      <WorkspaceFormSection title="Staff profile">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Name</span>
            <Input name="name" required defaultValue={staff?.name} placeholder="Staff member name" className={fieldInputClass} />
          </label>
          <SelectField
            name="role"
            label="Role"
            value={role}
            options={staffRoles}
            onChange={setRole}
          />
          {/* A new staff member is active by default; status (Away / Inactive) is
              only set later, so it's an edit-only control. */}
          {isEditing ? (
            <SelectField
              name="status"
              label="Status"
              value={status}
              options={staffStatuses}
              onChange={(value) => setStatus(value as StaffStatus)}
            />
          ) : null}
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Phone</span>
            <Input name="phone" defaultValue={staff?.phone} placeholder="+1 555 000 0000" className={fieldInputClass} />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-foreground">Email</span>
            <Input name="email" type="email" defaultValue={staff?.email} placeholder="staff@example.com" className={fieldInputClass} />
          </label>
        </div>
      </WorkspaceFormSection>

      <WorkspaceFormSection title="Operational note">
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-foreground">Profile note</span>
          <Textarea
            name="profileNote"
            defaultValue={staff?.profileNote}
            placeholder="Working preferences, specialties, or scheduling notes"
            className="min-h-24 rounded-(--radius-card) bg-white px-3 py-3"
          />
        </label>
      </WorkspaceFormSection>

      <WorkspaceFormSection
        title={
          <span className="inline-flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            Weekly schedule
          </span>
        }
        description="Set the staff member's shifts only on clinic working days. Check-in is allowed only during the scheduled shift window."
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span className="text-sm text-muted-foreground">Next seven clinic days</span>
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
            className="text-sm font-semibold text-primary"
          >
            Use clinic hours
          </button>
        </div>
        {schedule.length === 0 ? (
          <p className="mt-3.5 rounded-[0.72rem] border border-border/75 bg-secondary/30 px-3.5 py-3 text-sm text-muted-foreground">
            No clinic working days are configured for the next seven days.
          </p>
        ) : (
        <div className="mt-3.5 overflow-hidden rounded-[0.72rem] border border-border/75">
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
        )}
      </WorkspaceFormSection>

      {error ? (
        <div className="rounded-(--radius-card) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {staff ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-(--radius-card) border-destructive/25 bg-white text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={() => setConfirmingDelete(true)}
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
          className={cn(buttonVariants({ variant: "outline" }), "rounded-(--radius-card) bg-white")}
        >
          <ArrowLeft className="size-4" />
          Cancel
        </Link>
        <Button type="submit" className="rounded-(--radius-card)" disabled={isPending}>
          {isEditing ? <Save className="size-4" /> : <UserRoundPlus className="size-4" />}
          {isPending ? "Saving..." : isEditing ? "Save staff" : "Create staff"}
        </Button>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this staff member?"
        description="This permanently removes their profile, schedule, and time records. This can't be undone."
        isPending={isPending}
        onConfirm={deleteStaff}
      />
    </form>
  );
}
