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

  function handleSubmit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await saveClientAction({
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        status,
        notes: String(formData.get("notes") ?? ""),
        preferredChannel,
        assignedStaff: String(formData.get("assignedStaff") ?? ""),
        tags: String(formData.get("tags") ?? ""),
      });

      if (!result.ok || !result.client) {
        setError(result.error ?? "We couldn't create this client.");
        return;
      }

      if (nextAfterCreate === "calendar") {
        router.push(`/calendar/new?client=${result.client.id}`);
        return;
      }

      router.push(`/clients?client=${result.client.id}`);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <section className="rounded-[1.15rem] border border-border/80 bg-white/86 p-5 shadow-[0_18px_44px_rgba(20,32,51,0.045)]">
        <h2 className="text-base font-semibold text-foreground">Client profile</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Name</span>
            <Input name="name" required placeholder="Client name" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Phone</span>
            <Input name="phone" required placeholder="+1 555 000 0000" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Email</span>
            <Input name="email" type="email" placeholder="client@example.com" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <SelectField
            name="status"
            label="Status"
            value={status}
            options={["active", "at-risk", "inactive", "archived"]}
            onChange={(value) => setStatus(value as ClientStatus)}
          />
        </div>
      </section>

      <section className="rounded-[1.15rem] border border-border/80 bg-white/86 p-5 shadow-[0_18px_44px_rgba(20,32,51,0.045)]">
        <h2 className="text-base font-semibold text-foreground">Preferences and notes</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <SelectField
            name="preferredChannel"
            label="Preferred channel"
            value={preferredChannel}
            options={["WhatsApp", "Phone", "Email"]}
            onChange={setPreferredChannel}
          />
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Assigned staff</span>
            <Input name="assignedStaff" placeholder="Workspace staff" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-foreground">Tags</span>
            <Input name="tags" placeholder="priority, whatsapp" className="h-11 rounded-[0.9rem] bg-white" />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-foreground">Notes</span>
            <Textarea name="notes" placeholder="Client preferences, care notes, or follow-up context" className="min-h-28 rounded-[0.9rem] bg-white px-3 py-3" />
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
          {isPending ? "Creating..." : "Create client"}
        </Button>
      </div>
    </form>
  );
}
