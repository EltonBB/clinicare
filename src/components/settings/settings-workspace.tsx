"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowUpRight, Plus, Trash2 } from "lucide-react";

import {
  saveSettingsAction,
  sendWhatsAppTestAction,
} from "@/app/(workspace)/settings/actions";
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
  testRecipientDefault?: string;
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
        "relative inline-flex h-7 w-12 rounded-full shadow-[inset_0_1px_3px_rgba(20,32,51,0.12)] transition-colors",
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
      className="h-11 w-full rounded-[0.9rem] border border-border/80 bg-white/84 px-3 text-sm outline-none transition-[border-color,background-color,box-shadow] duration-200 focus:border-ring focus:bg-white focus-visible:ring-3 focus-visible:ring-ring/40"
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
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-[1.05rem] border border-border/80 bg-white/94 px-5 py-5 shadow-[0_10px_24px_rgba(20,32,51,0.032)]"
    >
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

function connectionStatusTone(status: SettingsState["whatsapp"]["connection"]["status"]) {
  if (status === "CONNECTED") {
    return "bg-primary/10 text-primary";
  }

  if (status === "ERRORED") {
    return "bg-destructive/10 text-destructive";
  }

  return "bg-white text-muted-foreground ring-1 ring-border/70";
}

export function SettingsWorkspace({
  initialState,
  flashMessage = "",
  testRecipientDefault = "",
}: SettingsWorkspaceProps) {
  const sectionLinks = [
    { href: "#business-details", label: "Business details" },
    { href: "#working-hours", label: "Working hours" },
    { href: "#staff-management", label: "Staff management" },
    { href: "#whatsapp-configuration", label: "WhatsApp" },
    { href: "#reminders", label: "Reminders" },
    { href: "#billing", label: "Billing" },
  ] as const;

  const [state, setState] = useState(initialState);
  const [message, setMessage] = useState(flashMessage);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startSaving] = useTransition();
  const [testRecipient, setTestRecipient] = useState(testRecipientDefault);
  const [testStatus, setTestStatus] = useState("");
  const [testError, setTestError] = useState("");
  const [isSendingTest, startSendingTest] = useTransition();

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

  function handleSendWhatsAppTest() {
    startSendingTest(async () => {
      const result = await sendWhatsAppTestAction(testRecipient);

      if (result.connection) {
        setState((current) => ({
          ...current,
          whatsapp: {
            ...current.whatsapp,
            connection: result.connection!,
          },
        }));
      }

      if (!result.ok) {
        setTestError(result.error ?? "We couldn't send the WhatsApp test.");
        setTestStatus("");
        return;
      }

      setTestError("");
      setTestStatus(result.message ?? "Sandbox test sent.");
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden xl:block">
        <div className="sticky top-24 space-y-2 rounded-[1.05rem] border border-border/80 bg-white/94 p-4 shadow-[0_10px_22px_rgba(20,32,51,0.03)]">
          {sectionLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-[0.85rem] px-3 py-2.5 text-sm text-muted-foreground transition-[background-color,color,transform] duration-200 hover:bg-muted/55 hover:text-foreground motion-safe:hover:translate-x-0.5"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </aside>

      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="section-reveal space-y-2">
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
            className="section-reveal-delayed h-11 rounded-[0.9rem] px-5"
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
          id="business-details"
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
                className="h-11 rounded-[0.9rem] bg-white/84"
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
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel>Support email</FieldLabel>
              <Input
                value={state.business.supportEmail}
                disabled
                className="h-11 rounded-[0.75rem] bg-white/92"
              />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          id="working-hours"
          title="Working hours"
          description="These hours drive booking availability and shape the default calendar behavior across the workspace."
        >
          <div className="space-y-3">
            {weekdayOrder.map((day) => {
              const item = state.workingHours[day];

              return (
                <div
                  key={day}
                  className="grid gap-4 rounded-[0.95rem] border border-border/80 bg-muted/45 px-4 py-4 md:grid-cols-[1.5fr_1fr]"
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
          id="staff-management"
          title="Staff management"
          description="Keep staff management simple for MVP: add or remove people so bookings and messages have an owner."
        >
          <div className="space-y-3">
            {state.staff.map((member) => (
              <div
                key={member.id}
                className="grid gap-3 rounded-[0.95rem] border border-border/80 bg-muted/45 px-4 py-4 md:grid-cols-[minmax(0,1fr)_220px_44px]"
              >
                <Input
                  value={member.name}
                  onChange={(event) =>
                    updateStaffMember(member.id, { name: event.target.value })
                  }
                  placeholder="Staff name"
                  className="h-11 rounded-[0.9rem] bg-white/84"
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
                  className="inline-flex h-11 items-center justify-center rounded-[0.9rem] border border-border/80 bg-white/84 text-muted-foreground transition-colors hover:bg-white"
                  aria-label="Remove staff member"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            className="mt-4 rounded-[0.9rem] bg-white/76"
            onClick={addStaffMember}
          >
            <Plus className="size-4" />
            Add staff member
          </Button>
        </SettingsSection>

        <SettingsSection
          id="whatsapp-configuration"
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
                className="h-11 rounded-[0.9rem] bg-white/84"
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
          <div className="mt-4 flex items-center justify-between rounded-[0.95rem] border border-border/80 bg-muted/45 px-4 py-4">
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
          <div className="mt-4 grid gap-4 rounded-[0.95rem] border border-border/80 bg-muted/45 px-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <FieldLabel>Connection status</FieldLabel>
              <div className="rounded-[0.9rem] border border-border/80 bg-white/88 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                    {state.whatsapp.connection.provider}
                  </span>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                    {state.whatsapp.connection.modeLabel}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em]",
                      connectionStatusTone(state.whatsapp.connection.status)
                    )}
                  >
                    {state.whatsapp.connection.statusLabel}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-foreground">
                  {state.whatsapp.connection.readinessLabel}
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {state.whatsapp.connection.detail}
                </p>
                {(state.whatsapp.connection.connectedAtLabel ||
                  state.whatsapp.connection.lastSyncedLabel) ? (
                  <div className="mt-3 space-y-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    {state.whatsapp.connection.connectedAtLabel ? (
                      <p>Connected {state.whatsapp.connection.connectedAtLabel}</p>
                    ) : null}
                    {state.whatsapp.connection.lastSyncedLabel ? (
                      <p>Last sync {state.whatsapp.connection.lastSyncedLabel}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel>Active sender</FieldLabel>
              <div className="rounded-[0.9rem] border border-border/80 bg-white/88 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {state.whatsapp.connection.senderLabel}
                </p>
                <p className="text-sm font-medium text-foreground">
                  {state.whatsapp.connection.senderPhoneNumber || "No provider sender connected yet"}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Requested clinic number:{" "}
                  {state.whatsapp.connection.requestedPhoneNumber || "Not set"}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-[0.95rem] border border-primary/15 bg-primary/5 px-4 py-4">
            <p className="text-sm font-medium text-foreground">Sandbox workflow</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              In test mode, messages send from the Twilio sandbox sender and replies flow back into
              the Vela inbox while your ngrok tunnel and Twilio webhook stay active.
            </p>
          </div>
          <div className="mt-4 rounded-[0.95rem] border border-border/80 bg-muted/45 px-4 py-4">
            <div className="space-y-2">
              <FieldLabel>Sandbox test recipient</FieldLabel>
              <Input
                value={testRecipient}
                onChange={(event) => setTestRecipient(event.target.value)}
                placeholder="+383 44 000 000"
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
              <p className="text-sm leading-6 text-muted-foreground">
                Use a phone number that has already joined the Twilio WhatsApp sandbox. Tests send
                from {state.whatsapp.connection.senderPhoneNumber || "the configured sandbox sender"}.
              </p>
            </div>
            {testError ? (
              <div className="mt-4 rounded-[0.9rem] border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {testError}
              </div>
            ) : null}
            {!testError && testStatus ? (
              <div className="mt-4 rounded-[0.9rem] border border-primary/20 bg-primary/8 px-3 py-2 text-sm text-primary">
                {testStatus}
              </div>
            ) : null}
            <Button
              variant="outline"
              className="mt-4 rounded-[0.9rem] bg-white/84"
              onClick={handleSendWhatsAppTest}
              disabled={isSendingTest}
            >
              {isSendingTest ? "Sending test..." : "Send sandbox test"}
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection
          id="reminders"
          title="Reminders"
          description="Define the reminder cadence and shared template that appointments can reuse across the MVP workflow."
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-[0.95rem] border border-border/80 bg-muted/45 px-4 py-4">
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

              <div className="flex items-center justify-between rounded-[0.95rem] border border-border/80 bg-muted/45 px-4 py-4">
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
                className="min-h-32 rounded-[0.95rem] bg-white/84 px-4 py-3"
              />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          id="billing"
          title="Billing"
          description="Review the current plan, see what is locked, and use the prepared upgrade path while live payments are still pending."
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="space-y-4">
              <div className="overflow-hidden rounded-[1rem] border border-primary/12 bg-[linear-gradient(135deg,rgba(38,137,135,0.08),rgba(92,143,212,0.03)_48%,rgba(255,255,255,0.92))] shadow-[0_18px_40px_rgba(20,32,51,0.04)]">
                <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Current plan
                      </p>
                      <div className="flex items-center gap-3">
                        <p className="text-2xl font-semibold text-foreground">
                          {state.billing.planName}
                        </p>
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                          {state.billing.statusLabel}
                        </span>
                      </div>
                    </div>
                    <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                      {state.billing.note}
                    </p>
                  </div>

                  <div className="min-w-[220px] rounded-[0.95rem] border border-white/70 bg-white/84 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Next step
                    </p>
                    <p className="mt-2 text-sm leading-6 text-foreground/84">
                      {state.billing.nextStep}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
                <div className="rounded-[0.95rem] border border-border/80 bg-white/88 px-4 py-4">
                  <FieldLabel>Locked on Basic</FieldLabel>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {state.billing.lockedFeatures.map((feature) => (
                      <span
                        key={feature}
                        className="rounded-full border border-border/80 bg-muted/35 px-3 py-1 text-xs font-medium text-muted-foreground"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-[0.95rem] border border-border/80 bg-muted/35 px-4 py-4">
                  <FieldLabel>Billing rollout</FieldLabel>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Payment method collection, invoices, and self-serve subscription
                    management will be added when the live billing provider is
                    connected.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1rem] border border-border/80 bg-white/88 px-5 py-5 shadow-[0_16px_34px_rgba(20,32,51,0.04)]">
              <FieldLabel>Billing actions</FieldLabel>
              <div className="mt-4 space-y-3">
                <UpgradeModalTrigger
                  label={state.billing.ctaLabel}
                  triggerClassName={cn(
                    buttonVariants({ variant: "default", size: "lg" }),
                    "h-12 w-full rounded-[0.95rem] justify-center"
                  )}
                />
                <Link
                  href="/pricing"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-12 w-full rounded-[0.95rem] justify-center bg-white/76 px-4"
                  )}
                >
                  View pricing
                  <ArrowUpRight className="size-4" />
                </Link>
              </div>
              <div className="mt-5 rounded-[0.95rem] border border-border/80 bg-muted/30 px-4 py-4">
                <p className="text-sm font-medium text-foreground">Before live payments</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Use this path to prepare the workspace for Pro access, review what
                  unlocks, and keep the billing structure ready for checkout later.
                </p>
              </div>
            </div>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
