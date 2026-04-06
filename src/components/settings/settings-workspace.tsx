"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowUpRight, Plus, Trash2 } from "lucide-react";

import { saveSettingsAction } from "@/app/(workspace)/settings/actions";
import { businessTypes } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  reminderWindows,
  staffRoles,
  timeOptions,
  weekdayLabels,
  type SettingsState,
  type SettingsStaffMember,
} from "@/lib/settings";
import { weekdayOrder, type WeekdayKey } from "@/lib/onboarding";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UpgradeModalTrigger } from "@/components/upgrade/upgrade-modal-trigger";

type SettingsWorkspaceProps = {
  initialState: SettingsState;
  flashMessage?: string;
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </label>
  );
}

function Toggle({
  checked,
  onPressedChange,
}: {
  checked: boolean;
  onPressedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onPressedChange(!checked)}
      className={cn(
        "relative inline-flex h-7 w-12 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border"
      )}
    >
      <span
        className={cn(
          "absolute top-1 size-5 rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

function NativeSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 w-full rounded-[0.75rem] border border-border bg-card px-3 text-sm outline-none transition-colors focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[0.95rem] border border-border bg-card px-5 py-5">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function SettingsWorkspace({
  initialState,
  flashMessage = "",
}: SettingsWorkspaceProps) {
  const [state, setState] = useState(initialState);
  const [message, setMessage] = useState(flashMessage);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startSaving] = useTransition();

  function updateDay(day: WeekdayKey, patch: Partial<(typeof state.workingHours)[WeekdayKey]>) {
    setState((current) => ({
      ...current,
      workingHours: {
        ...current.workingHours,
        [day]: {
          ...current.workingHours[day],
          ...patch,
        },
      },
    }));
  }

  function updateStaffMember(staffId: string, patch: Partial<SettingsStaffMember>) {
    setState((current) => ({
      ...current,
      staff: current.staff.map((member) =>
        member.id === staffId ? { ...member, ...patch } : member
      ),
    }));
  }

  function addStaffMember() {
    setState((current) => ({
      ...current,
      staff: [
        ...current.staff,
        {
          id: crypto.randomUUID(),
          name: "",
          role: "Specialist",
        },
      ],
    }));
  }

  function removeStaffMember(staffId: string) {
    setState((current) => ({
      ...current,
      staff:
        current.staff.length === 1
          ? current.staff
          : current.staff.filter((member) => member.id !== staffId),
    }));
  }

  function handleSave() {
    startSaving(async () => {
      const cleanedState: SettingsState = {
        ...state,
        staff: state.staff.filter((member) => member.name.trim().length > 0),
      };

      const result = await saveSettingsAction(cleanedState);

      if (!result.ok || !result.state) {
        setErrorMessage(result.error ?? "We couldn't save your settings.");
        setMessage("");
        return;
      }

      setState(result.state);
      setErrorMessage("");
      setMessage("Settings saved.");
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden xl:block">
        <div className="sticky top-24 space-y-2 rounded-[0.95rem] border border-border bg-card p-4">
          {[
            "Business details",
            "Working hours",
            "Staff management",
            "WhatsApp",
            "Reminders",
            "Billing",
          ].map((label) => (
            <div key={label} className="text-sm text-muted-foreground">
              {label}
            </div>
          ))}
        </div>
      </aside>

      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Settings
            </p>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                Business configuration
              </h1>
              <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground">
                Manage workspace identity, hours, staff, WhatsApp behavior,
                reminders, and billing from one MVP control panel.
              </p>
            </div>
          </div>

          <Button
            size="lg"
            className="h-11 rounded-[0.75rem] px-5"
            disabled={isPending}
            onClick={handleSave}
          >
            Save changes
          </Button>
        </div>

        {errorMessage ? (
          <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        {!errorMessage && message ? (
          <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
            {message}
          </div>
        ) : null}

        <SettingsSection
          title="Business details"
          description="Keep your workspace identity current so appointments, messages, and reminders reflect the right business context."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel>Business name</FieldLabel>
              <Input
                value={state.business.businessName}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    business: {
                      ...current.business,
                      businessName: event.target.value,
                    },
                  }))
                }
                className="h-11 rounded-[0.75rem] bg-card"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Business type</FieldLabel>
              <NativeSelect
                value={state.business.businessType}
                options={[...businessTypes]}
                onChange={(value) =>
                  setState((current) => ({
                    ...current,
                    business: {
                      ...current.business,
                      businessType: value as SettingsState["business"]["businessType"],
                    },
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Owner name</FieldLabel>
              <Input
                value={state.business.ownerName}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    business: {
                      ...current.business,
                      ownerName: event.target.value,
                    },
                  }))
                }
                className="h-11 rounded-[0.75rem] bg-card"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Support email</FieldLabel>
              <Input
                value={state.business.supportEmail}
                disabled
                className="h-11 rounded-[0.75rem] bg-card"
              />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Working hours"
          description="These hours drive booking availability and shape the default calendar behavior across the workspace."
        >
          <div className="space-y-3">
            {weekdayOrder.map((day) => {
              const item = state.workingHours[day];

              return (
                <div
                  key={day}
                  className="grid gap-4 rounded-[0.8rem] border border-border bg-background px-4 py-4 md:grid-cols-[1.5fr_1fr]"
                >
                  <div className="flex items-center gap-4">
                    <Toggle
                      checked={item.enabled}
                      onPressedChange={(checked) => updateDay(day, { enabled: checked })}
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {weekdayLabels[day]}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.enabled ? "Open for bookings" : "Closed"}
                      </p>
                    </div>
                  </div>
                  {item.enabled ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <NativeSelect
                        value={item.start}
                        options={timeOptions}
                        onChange={(value) => updateDay(day, { start: value })}
                      />
                      <NativeSelect
                        value={item.end}
                        options={timeOptions}
                        onChange={(value) => updateDay(day, { end: value })}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-start text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground md:justify-end">
                      Closed
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Staff management"
          description="Keep staff management simple for MVP: add or remove people so bookings and messages have an owner."
        >
          <div className="space-y-3">
            {state.staff.map((member) => (
              <div
                key={member.id}
                className="grid gap-3 rounded-[0.8rem] border border-border bg-background px-4 py-4 md:grid-cols-[minmax(0,1fr)_220px_44px]"
              >
                <Input
                  value={member.name}
                  onChange={(event) =>
                    updateStaffMember(member.id, { name: event.target.value })
                  }
                  placeholder="Staff name"
                  className="h-11 rounded-[0.75rem] bg-card"
                />
                <NativeSelect
                  value={member.role}
                  options={[...staffRoles]}
                  onChange={(value) =>
                    updateStaffMember(member.id, { role: value as SettingsStaffMember["role"] })
                  }
                />
                <button
                  type="button"
                  onClick={() => removeStaffMember(member.id)}
                  className="inline-flex h-11 items-center justify-center rounded-[0.75rem] border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary"
                  aria-label="Remove staff member"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            className="mt-4 rounded-[0.75rem]"
            onClick={addStaffMember}
          >
            <Plus className="size-4" />
            Add staff member
          </Button>
        </SettingsSection>

        <SettingsSection
          title="WhatsApp configuration"
          description="Set the number and messaging behavior that the inbox and reminders surfaces use throughout the workspace."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <FieldLabel>WhatsApp number</FieldLabel>
              <Input
                value={state.whatsapp.phoneNumber}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    whatsapp: {
                      ...current.whatsapp,
                      phoneNumber: event.target.value,
                    },
                  }))
                }
                placeholder="+1 555 000 0000"
                className="h-11 rounded-[0.75rem] bg-card"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Reminder timing</FieldLabel>
              <NativeSelect
                value={state.whatsapp.reminderWindow}
                options={reminderWindows}
                onChange={(value) =>
                  setState((current) => ({
                    ...current,
                    whatsapp: {
                      ...current.whatsapp,
                      reminderWindow: value,
                    },
                  }))
                }
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-[0.8rem] border border-border bg-background px-4 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">Send reminders</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Control whether reminders are enabled for WhatsApp messaging.
              </p>
            </div>
            <Toggle
              checked={state.whatsapp.sendReminders}
              onPressedChange={(checked) =>
                setState((current) => ({
                  ...current,
                  whatsapp: {
                    ...current.whatsapp,
                    sendReminders: checked,
                  },
                }))
              }
            />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Reminders"
          description="Define the reminder cadence and shared template that appointments can reuse across the MVP workflow."
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-[0.8rem] border border-border bg-background px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">24-hour reminder</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sent the day before the appointment.
                  </p>
                </div>
                <Toggle
                  checked={state.reminders.twentyFourHour}
                  onPressedChange={(checked) =>
                    setState((current) => ({
                      ...current,
                      reminders: {
                        ...current.reminders,
                        twentyFourHour: checked,
                      },
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between rounded-[0.8rem] border border-border bg-background px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">2-hour reminder</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Final prompt before the visit starts.
                  </p>
                </div>
                <Toggle
                  checked={state.reminders.twoHour}
                  onPressedChange={(checked) =>
                    setState((current) => ({
                      ...current,
                      reminders: {
                        ...current.reminders,
                        twoHour: checked,
                      },
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel>Message template</FieldLabel>
              <Textarea
                value={state.reminders.template}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    reminders: {
                      ...current.reminders,
                      template: event.target.value,
                    },
                    whatsapp: {
                      ...current.whatsapp,
                      template: event.target.value,
                    },
                  }))
                }
                className="min-h-32 rounded-[0.8rem] bg-card px-4 py-3"
              />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Billing"
          description="Keep billing MVP-light: surface the current plan and provide a clear entry point to upgrade."
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-[0.8rem] border border-border bg-background px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {state.billing.planName}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {state.billing.note}
                  </p>
                </div>
                <p className="text-sm font-semibold text-primary">
                  {state.billing.trialLabel}
                </p>
              </div>
            </div>
            <UpgradeModalTrigger
              label="Unlock Pro"
              triggerClassName={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-11 rounded-[0.75rem] px-4 text-foreground"
              )}
            />
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-11 rounded-[0.75rem] px-4"
              )}
            >
              View pricing
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
