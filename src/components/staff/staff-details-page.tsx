"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useState, useTransition } from "react";
import { ArrowLeft, CalendarCheck2, Clock3, Mail, Phone, UserRoundPen } from "lucide-react";

import { checkInStaffAction, checkOutStaffAction } from "@/app/(workspace)/staff/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StaffRecord } from "@/lib/staff";

type StaffDetailsPageProps = {
  initialStaff: StaffRecord;
};

function staffInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

function statusDot(status: StaffRecord["status"]) {
  return cn(
    "inline-block size-2 rounded-full",
    status === "ACTIVE" && "bg-primary",
    status === "AWAY" && "bg-amber-500",
    status === "INACTIVE" && "bg-border"
  );
}

export function StaffDetailsPage({ initialStaff }: StaffDetailsPageProps) {
  const [staff, setStaff] = useState(initialStaff);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggleClock() {
    startTransition(async () => {
      const result = staff.isCheckedIn
        ? await checkOutStaffAction(staff.id)
        : await checkInStaffAction(staff.id);

      if (!result.ok || !result.staff) {
        setError(result.error ?? "We couldn't update staff time.");
        setMessage("");
        return;
      }

      setStaff(result.staff);
      setError("");
      setMessage(staff.isCheckedIn ? "Staff checked out." : "Staff checked in.");
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/staff"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Staff
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="rounded-[0.85rem]"
            variant={staff.isCheckedIn ? "outline" : "default"}
            onClick={toggleClock}
            disabled={isPending}
          >
            <Clock3 className="size-4" />
            {staff.isCheckedIn ? "Check out" : "Check in"}
          </Button>
          <Link
            href={`/staff/${staff.id}/edit`}
            className={cn(buttonVariants({ variant: "outline" }), "rounded-[0.85rem]")}
          >
            <UserRoundPen className="size-4" />
            Edit
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {!error && message ? (
        <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
          {message}
        </div>
      ) : null}

      <section className="rounded-[1.2rem] border border-border/80 bg-white/78 px-5 py-5 shadow-[0_24px_52px_rgba(20,32,51,0.05)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar size="lg" className="size-14">
              <AvatarFallback>{staffInitials(staff.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                {staff.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>{staff.role}</span>
                <span className="flex items-center gap-2">
                  <span className={statusDot(staff.status)} />
                  <span className="capitalize">{staff.status.toLowerCase()}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="This week" value={`${staff.weeklyHours}h`} />
            <Summary label="This month" value={staff.completedThisMonth} />
            <Summary label="Clock" value={staff.isCheckedIn ? "Checked in" : "Checked out"} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
          <h2 className="text-lg font-semibold text-foreground">Staff information</h2>
          <dl className="mt-5 space-y-3">
            <Detail label="Name" value={staff.name} />
            <Detail label="Role" value={staff.role} />
            <Detail label="Status" value={staff.status.toLowerCase()} />
            <Detail icon={Phone} label="Phone" value={staff.phone || "No phone saved."} />
            <Detail icon={Mail} label="Email" value={staff.email || "No email saved."} />
          </dl>
        </section>

        <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
          <h2 className="text-lg font-semibold text-foreground">Operational note</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            {staff.profileNote || "No staff note yet."}
          </p>
        </section>
      </div>

      <section className="rounded-[1.15rem] border border-border/80 bg-white/74 p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-[0.9rem] bg-primary/10 text-primary">
            <CalendarCheck2 className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Recent completed appointments</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Last completed work connected to this staff member.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {staff.recentAppointments.length > 0 ? (
            staff.recentAppointments.map((appointment) => (
              <div key={appointment.id} className="rounded-[0.95rem] border border-border/80 bg-white/78 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-foreground">{appointment.title}</p>
                  <p className="text-xs text-muted-foreground">{appointment.date}</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {appointment.time} - {appointment.clientName}
                </p>
              </div>
            ))
          ) : (
            <div className="rounded-[1rem] border border-dashed border-border/90 bg-white/54 px-5 py-8 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              No completed appointments yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-[130px] rounded-[0.95rem] border border-border/80 bg-white/68 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold text-primary">{value}</p>
    </div>
  );
}

function Detail({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center justify-end gap-2 text-right font-medium text-foreground">
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
        <span className="min-w-0 break-words">{value}</span>
      </dd>
    </div>
  );
}
