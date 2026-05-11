"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Save, Trash2, UserRoundPlus } from "lucide-react";

import { deleteStaffAction, saveStaffAction } from "@/app/(workspace)/staff/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { staffRoles, staffStatuses, type StaffRecord, type StaffStatus } from "@/lib/staff";
import { cn } from "@/lib/utils";

type NewStaffFormProps = {
  staff?: StaffRecord;
};

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
  const isEditing = Boolean(staff);

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
