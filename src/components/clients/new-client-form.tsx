"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, UserPlus } from "lucide-react";

import { saveClientAction } from "@/app/(workspace)/clients/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ClientStatus } from "@/lib/clients";
import { cn } from "@/lib/utils";

type NewClientFormProps = {
  nextAfterCreate?: "calendar";
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
  options: string[];
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

export function NewClientForm({ nextAfterCreate }: NewClientFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [status, setStatus] = useState<ClientStatus>("active");
  const [preferredChannel, setPreferredChannel] = useState("WhatsApp");
  const [patientType, setPatientType] = useState("New Patient");

  function handleSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await saveClientAction({
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        gender: String(formData.get("gender") ?? ""),
        dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
        address: String(formData.get("address") ?? ""),
        patientType,
        clinicType: String(formData.get("clinicType") ?? ""),
        status,
        notes: String(formData.get("notes") ?? ""),
        preferredChannel,
        assignedStaff: String(formData.get("assignedStaff") ?? ""),
        tags: patientType,
      });

      if (!result.ok || !result.client) {
        setError(result.error ?? "We couldn't create this patient.");
        return;
      }

      if (nextAfterCreate === "calendar") {
        router.push(`/calendar/new?client=${result.client.id}`);
        return;
      }

      router.push(`/clients/${result.client.id}`);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <section className="rounded-[1.15rem] border border-border/80 bg-white/86 p-4 shadow-[0_18px_44px_rgba(20,32,51,0.045)]">
        <h2 className="text-base font-semibold text-foreground">Basic information</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Full name</span>
            <Input name="name" required placeholder="Patient name" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Phone number</span>
            <Input name="phone" required placeholder="+1 555 000 0000" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Email</span>
            <Input name="email" type="email" placeholder="client@example.com" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Gender</span>
            <Input name="gender" placeholder="Female, male, other..." className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Date of birth</span>
            <Input name="dateOfBirth" type="date" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-foreground">Address</span>
            <Input name="address" placeholder="Patient address" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <SelectField
            name="patientType"
            label="Patient type"
            value={patientType}
            options={["New Patient", "Returning Patient", "VIP / Important"]}
            onChange={setPatientType}
          />
          <SelectField
            name="status"
            label="Status"
            value={status}
            options={["active", "inactive", "at-risk", "archived"]}
            onChange={(value) => setStatus(value as ClientStatus)}
          />
        </div>
      </section>

      <section className="rounded-[1.15rem] border border-border/80 bg-white/86 p-4 shadow-[0_18px_44px_rgba(20,32,51,0.045)]">
        <h2 className="text-base font-semibold text-foreground">Clinic information</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Clinic type</span>
            <Input name="clinicType" placeholder="Dental, aesthetic, medical..." className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <SelectField
            name="preferredChannel"
            label="Preferred contact method"
            value={preferredChannel}
            options={["WhatsApp", "Phone Call", "Email"]}
            onChange={setPreferredChannel}
          />
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Assigned doctor / staff member</span>
            <Input name="assignedStaff" placeholder="Workspace staff" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-foreground">Patient notes</span>
            <Textarea name="notes" placeholder="Registration notes, communication preferences, or immediate booking context" className="min-h-24 rounded-[0.9rem] bg-white px-3 py-3" />
          </label>
        </div>
      </section>

      {error ? (
        <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-3">
        <Link
          href="/clients"
          className={cn(buttonVariants({ variant: "outline" }), "rounded-[0.9rem] bg-white")}
        >
          <ArrowLeft className="size-4" />
          Cancel
        </Link>
        <Button type="submit" className="rounded-[0.9rem]" disabled={isPending}>
          <UserPlus className="size-4" />
          {isPending ? "Creating..." : "Create patient"}
        </Button>
      </div>
    </form>
  );
}
