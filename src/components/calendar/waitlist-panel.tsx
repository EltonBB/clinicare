"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";

import {
  addWaitlistEntryAction,
  removeWaitlistEntryAction,
} from "@/app/(workspace)/calendar/waitlist-actions";
import { ClientCombobox } from "@/components/calendar/client-combobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormError, FormField } from "@/components/workspace/form-parts";
import {
  fieldInputClass,
  fieldSelectClass,
  fieldTextareaClass,
  WorkspaceEmptyState,
} from "@/components/workspace/workspace-layout";
import type { CalendarSelectOption } from "@/lib/calendar";
import { isInvalidPreferredWindow, WAITLIST_TIME_RANGE_ERROR } from "@/lib/waitlist";
import type { WaitlistEntryRow } from "@/lib/waitlist-data";

type WaitlistPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: WaitlistEntryRow[];
  /** Bounded recent-clients list — the combobox searches the full table itself as the user types. */
  clients: CalendarSelectOption[];
  staffMembers: CalendarSelectOption[];
};

// Monday=0..Sunday=6, matching BusinessHours.weekday and the matcher's convention.
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type FormState = {
  clientId: string;
  service: string;
  staffMemberId: string;
  earliestDate: string;
  preferredDays: number[];
  preferredFrom: string;
  preferredTo: string;
  notes: string;
};

function emptyForm(): FormState {
  return {
    clientId: "",
    service: "",
    staffMemberId: "",
    earliestDate: "",
    preferredDays: [],
    preferredFrom: "",
    preferredTo: "",
    notes: "",
  };
}

function formatPreferredWindow(entry: WaitlistEntryRow) {
  const parts: string[] = [];

  if (entry.preferredDays.length > 0) {
    parts.push(entry.preferredDays.map((day) => DAY_LABELS[day]).join(", "));
  }

  if (entry.preferredFrom || entry.preferredTo) {
    parts.push(`${entry.preferredFrom ?? "any"}–${entry.preferredTo ?? "any"}`);
  }

  if (entry.earliestDateLabel) {
    parts.push(`from ${entry.earliestDateLabel}`);
  }

  return parts.join(" · ");
}

/**
 * Pro-only waiting-list panel, opened from the Calendar header. Lists who's
 * waiting (WaitlistEntryRow — Task 3) and adds/removes entries through the
 * Task 5 server actions. Both actions re-check the plan server-side, so this
 * component doesn't need to gate anything beyond not being mounted on Basic
 * (see calendar-workspace.tsx's canManageWaitlist).
 */
export function WaitlistPanel({ open, onOpenChange, entries, clients, staffMembers }: WaitlistPanelProps) {
  const router = useRouter();
  const [isAdding, startAdding] = useTransition();
  const [isRemoving, startRemoving] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");

  function toggleDay(day: number) {
    setForm((current) => ({
      ...current,
      preferredDays: current.preferredDays.includes(day)
        ? current.preferredDays.filter((value) => value !== day)
        : [...current.preferredDays, day].sort((a, b) => a - b),
    }));
  }

  function submitAdd() {
    setError("");

    if (!form.clientId || !form.service.trim()) {
      setError("Choose a client and enter a service before adding to the waiting list.");
      return;
    }

    if (isInvalidPreferredWindow(form.preferredFrom, form.preferredTo)) {
      setError(WAITLIST_TIME_RANGE_ERROR);
      return;
    }

    startAdding(async () => {
      let result;
      try {
        result = await addWaitlistEntryAction({
          clientId: form.clientId,
          service: form.service.trim(),
          staffMemberId: form.staffMemberId || undefined,
          earliestDate: form.earliestDate || undefined,
          preferredDays: form.preferredDays.length > 0 ? form.preferredDays : undefined,
          preferredFrom: form.preferredFrom || undefined,
          preferredTo: form.preferredTo || undefined,
          notes: form.notes.trim() || undefined,
        });
      } catch {
        // A rejected server action (network drop, 5xx, deploy skew) must not
        // throw out of the transition — that would swap the whole Calendar
        // for the error page. A plain message instead.
        setError("Something went wrong. Try again.");
        return;
      }

      if (!result.ok) {
        setError(result.error ?? "We couldn't add this entry.");
        return;
      }

      setForm(emptyForm());
      setShowForm(false);
      // addWaitlistEntryAction doesn't return the created row (no client/staff
      // name to render it with locally) — refresh so the list picks up the
      // real row from the server, same as the revalidatePath it already ran.
      router.refresh();
    });
  }

  function submitRemove(id: string) {
    setError("");
    setRemovingId(id);
    startRemoving(async () => {
      let result;
      try {
        result = await removeWaitlistEntryAction(id);
      } catch {
        // Same as submitAdd: never let a rejected action reach the error page.
        setError("Something went wrong. Try again.");
        setRemovingId(null);
        return;
      }

      if (!result.ok) {
        setError(result.error ?? "We couldn't remove this entry.");
        setRemovingId(null);
        return;
      }

      setRemovingId(null);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setShowForm(false);
          setError("");
        }
      }}
    >
      <DialogContent className="max-w-lg p-0 sm:max-w-lg">
        <div className="flex max-h-[calc(100vh-2rem)] min-h-0 flex-col overflow-hidden">
          <DialogHeader className="shrink-0 gap-1 px-5 pb-4 pt-5">
            <DialogTitle>Waiting list</DialogTitle>
            <DialogDescription className="sr-only">
              Clients waiting for the next available slot.
            </DialogDescription>
          </DialogHeader>

          <div className="dialog-scroll-body min-h-0 flex-1 overflow-y-auto px-5 py-1">
            {entries.length === 0 && !showForm ? (
              <WorkspaceEmptyState
                title="Nobody is waiting"
                description="Add a client to be notified when a matching slot opens up."
                compact
              />
            ) : (
              <div className="py-1">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="-mx-2 flex items-start justify-between gap-3 rounded-(--radius-card) px-2 py-2.5 transition-colors duration-(--duration-base) hover:bg-secondary/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{entry.clientName}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[entry.service, entry.staffMemberName, formatPreferredWindow(entry)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {entry.offer ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {entry.offer === "sent" ? "Offer sent" : "Offer pending"}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => submitRemove(entry.id)}
                      disabled={isRemoving && removingId === entry.id}
                      className="shrink-0 text-xs font-semibold text-destructive transition-colors duration-(--duration-base) hover:text-destructive/80 disabled:opacity-60"
                    >
                      {isRemoving && removingId === entry.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showForm ? (
              <div className="mt-2 grid gap-3 pb-1 pt-2 sm:grid-cols-2">
                <FormField label="Client" className="sm:col-span-2">
                  <ClientCombobox
                    value={form.clientId}
                    onChange={(id) => setForm((current) => ({ ...current, clientId: id }))}
                    initialOptions={clients}
                  />
                </FormField>
                <FormField label="Service">
                  <Input
                    value={form.service}
                    onChange={(event) => setForm((current) => ({ ...current, service: event.target.value }))}
                    className={fieldInputClass}
                  />
                </FormField>
                <FormField label="Staff">
                  <select
                    value={form.staffMemberId}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, staffMemberId: event.target.value }))
                    }
                    className={fieldSelectClass}
                  >
                    <option value="">No preference</option>
                    {staffMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Earliest date">
                  <Input
                    type="date"
                    value={form.earliestDate}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, earliestDate: event.target.value }))
                    }
                    className={fieldInputClass}
                  />
                </FormField>
                <FormField label="Preferred days" className="sm:col-span-2">
                  <div className="flex flex-wrap gap-3">
                    {DAY_LABELS.map((label, day) => (
                      <label key={label} className="flex items-center gap-1.5 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={form.preferredDays.includes(day)}
                          onChange={() => toggleDay(day)}
                          className="size-4 accent-[var(--primary)]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </FormField>
                <FormField label="From">
                  <Input
                    type="time"
                    value={form.preferredFrom}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, preferredFrom: event.target.value }))
                    }
                    className={fieldInputClass}
                  />
                </FormField>
                <FormField label="To">
                  <Input
                    type="time"
                    value={form.preferredTo}
                    onChange={(event) => setForm((current) => ({ ...current, preferredTo: event.target.value }))}
                    className={fieldInputClass}
                  />
                </FormField>
                <FormField label="Notes" className="sm:col-span-2">
                  <Textarea
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    className={fieldTextareaClass}
                  />
                </FormField>
              </div>
            ) : null}

            <FormError message={error} />
          </div>

          <DialogFooter>
            {showForm ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setError("");
                }}
                className="rounded-(--radius-tile)"
              >
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(true)}
                className="rounded-(--radius-tile)"
              >
                <Plus className="size-4" />
                Add
              </Button>
            )}
            {showForm ? (
              <Button type="button" onClick={submitAdd} disabled={isAdding} className="rounded-(--radius-tile)">
                {isAdding ? "Adding..." : "Add to waiting list"}
              </Button>
            ) : null}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
