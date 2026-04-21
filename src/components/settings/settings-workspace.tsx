"use client";

import Link from "next/link";
import { useState, useTransition, type CSSProperties } from "react";
import { ArrowUpRight, Plus, Trash2 } from "lucide-react";

import {
  prepareWhatsAppLiveConnectionAction,
  refreshWhatsAppLiveConnectionAction,
  saveSettingsAction,
  submitWhatsAppVerificationCodeAction,
} from "@/app/(workspace)/settings/actions";
import { businessTypes } from "@/lib/constants";
import { brandAccentPresets, normalizeBrandHexColor } from "@/lib/branding";
import { cn } from "@/lib/utils";
import {
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

const reminderHourOptions = Array.from({ length: 24 }, (_, index) =>
  String(24 - index)
);

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
  tourTarget,
  children,
}: {
  id: string;
  title: string;
  description: string;
  tourTarget?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-tour={tourTarget}
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

function connectionStatusTone(phase: SettingsState["whatsapp"]["connection"]["phase"]) {
  if (phase === "CONNECTED") {
    return "bg-primary/10 text-primary";
  }

  if (phase === "NEEDS_SUPPORT") {
    return "bg-destructive/10 text-destructive";
  }

  return "bg-white text-muted-foreground ring-1 ring-border/70";
}

export function SettingsWorkspace({
  initialState,
  flashMessage = "",
}: SettingsWorkspaceProps) {
  const sectionLinks = [
    { href: "#business-details", label: "Business details" },
    { href: "#appearance", label: "Appearance" },
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
  const [connectionStatus, setConnectionStatus] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [isPreparingConnection, startPreparingConnection] = useTransition();
  const [verificationCode, setVerificationCode] = useState("");
  const [isRefreshingConnection, startRefreshingConnection] = useTransition();
  const [isSubmittingVerificationCode, startSubmittingVerificationCode] =
    useTransition();
  const visibleAccentPresets = brandAccentPresets.filter(
    (preset) => preset.id !== "emerald"
  );
  const normalizedCustomAccent = normalizeBrandHexColor(
    state.appearance.accentHex
  );
  const previewAccent = normalizedCustomAccent ?? "#268987";
  const customAccentSelected = state.appearance.accentColor === "custom";
  const customAccentInvalid = customAccentSelected && !normalizedCustomAccent;

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
    if (customAccentInvalid) {
      setErrorMessage("Enter a valid HEX color, for example #268987.");
      setMessage("");
      return;
    }

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

  function handlePrepareLiveConnection() {
    startPreparingConnection(async () => {
      const result = await prepareWhatsAppLiveConnectionAction();

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
        setConnectionError(
          result.error ?? "We couldn't start WhatsApp setup for this clinic number."
        );
        setConnectionStatus("");
        return;
      }

      setConnectionError("");
      setConnectionStatus(result.message ?? "WhatsApp setup started.");
    });
  }

  function handleRefreshLiveConnection() {
    startRefreshingConnection(async () => {
      const result = await refreshWhatsAppLiveConnectionAction();

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
        setConnectionError(
          result.error ?? "We couldn't refresh the clinic number status."
        );
        setConnectionStatus("");
        return;
      }

      setConnectionError("");
      setConnectionStatus(result.message ?? "Latest WhatsApp status loaded.");
    });
  }

  function handleSubmitVerificationCode() {
    startSubmittingVerificationCode(async () => {
      const result = await submitWhatsAppVerificationCodeAction(verificationCode);

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
        setConnectionError(
          result.error ?? "We couldn't submit the verification code."
        );
        setConnectionStatus("");
        return;
      }

      setVerificationCode("");
      setConnectionError("");
      setConnectionStatus(
        result.message ?? "Verification code submitted."
      );
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
          id="appearance"
          title="Appearance"
          description="Choose the accent color used for primary actions, active states, highlights, and workspace feedback."
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {visibleAccentPresets.map((preset) => {
                const selected = state.appearance.accentColor === preset.id;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      setState((current) => ({
                        ...current,
                        appearance: {
                          accentColor: preset.id,
                          accentHex: preset.value,
                        },
                      }))
                    }
                    className={cn(
                      "group rounded-[1rem] border bg-white/84 p-3 text-left transition-[border-color,box-shadow,transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_16px_34px_rgba(20,32,51,0.055)]",
                      selected
                        ? "border-primary/55 shadow-[0_18px_38px_rgba(20,32,51,0.07)] ring-2 ring-primary/15"
                        : "border-border/80"
                    )}
                  >
                    <span
                      className="block h-14 rounded-[0.85rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                      style={{ backgroundColor: preset.value }}
                    />
                    <span className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {preset.name}
                      </span>
                      <span
                        className={cn(
                          "size-2.5 rounded-full transition-transform duration-200",
                          selected ? "scale-100 bg-primary" : "scale-75 bg-border"
                        )}
                      />
                    </span>
                  </button>
                );
              })}

              <div
                className={cn(
                  "group rounded-[1rem] border bg-white/84 p-3 text-left transition-[border-color,box-shadow,transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_16px_34px_rgba(20,32,51,0.055)]",
                  customAccentSelected
                    ? "border-primary/55 shadow-[0_18px_38px_rgba(20,32,51,0.07)] ring-2 ring-primary/15"
                    : "border-border/80",
                  customAccentInvalid && "border-destructive/45 ring-destructive/10"
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    setState((current) => ({
                      ...current,
                      appearance: {
                        ...current.appearance,
                        accentColor: "custom",
                      },
                    }))
                  }
                  className="block w-full text-left"
                >
                  <span
                    className="block h-14 rounded-[0.85rem] border border-border/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                    style={{ backgroundColor: previewAccent }}
                  />
                  <span className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      Custom HEX
                    </span>
                    <span
                      className={cn(
                        "size-2.5 rounded-full transition-transform duration-200",
                        customAccentSelected
                          ? "scale-100 bg-primary"
                          : "scale-75 bg-border"
                      )}
                    />
                  </span>
                </button>
                <div className="mt-3 grid grid-cols-[44px_minmax(0,1fr)] gap-2">
                  <input
                    aria-label="Pick custom accent color"
                    type="color"
                    value={previewAccent}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        appearance: {
                          accentColor: "custom",
                          accentHex: event.target.value,
                        },
                      }))
                    }
                    className="h-10 w-full cursor-pointer rounded-[0.75rem] border border-border/80 bg-white p-1"
                  />
                  <Input
                    value={state.appearance.accentHex}
                    onFocus={() =>
                      setState((current) => ({
                        ...current,
                        appearance: {
                          ...current.appearance,
                          accentColor: "custom",
                        },
                      }))
                    }
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        appearance: {
                          accentColor: "custom",
                          accentHex: event.target.value,
                        },
                      }))
                    }
                    placeholder="#268987"
                    className={cn(
                      "h-10 rounded-[0.75rem] bg-white/88 font-mono text-xs uppercase tracking-[0.08em]",
                      customAccentInvalid &&
                        "border-destructive/45 focus-visible:ring-destructive/20"
                    )}
                  />
                </div>
                <p
                  className={cn(
                    "mt-2 text-xs leading-5 text-muted-foreground",
                    customAccentInvalid && "text-destructive"
                  )}
                >
                  {customAccentInvalid
                    ? "Use a valid HEX value like #2f6fbd."
                    : "Use your own brand color if it is not listed."}
                </p>
              </div>
            </div>

            <div
              className="rounded-[1.05rem] border border-border/80 bg-white/88 p-4 shadow-[0_16px_34px_rgba(20,32,51,0.04)]"
              style={
                {
                  "--preview-accent": previewAccent,
                } as CSSProperties
              }
            >
              <FieldLabel>Live preview</FieldLabel>
              <div className="mt-4 space-y-3">
                <div className="rounded-[0.95rem] bg-[var(--preview-accent)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(20,32,51,0.08)]">
                  Primary action
                </div>
                <div
                  className="rounded-[0.95rem] border bg-white px-4 py-3"
                  style={{ borderColor: previewAccent }}
                >
                  <p className="text-sm font-semibold text-foreground">
                    Active navigation
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The selected accent is applied across the workspace after saving.
                  </p>
                </div>
              </div>
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
          description="Connect the clinic's WhatsApp number, keep reminders tied to the right inbox, and manage the setup from one place."
          tourTarget="settings-whatsapp"
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
          <div className="mt-4 rounded-[1rem] border border-primary/12 bg-[linear-gradient(135deg,var(--primary-soft),rgba(255,255,255,0.92))] px-5 py-5 shadow-[0_18px_40px_rgba(20,32,51,0.04)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                    WhatsApp
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em]",
                      connectionStatusTone(state.whatsapp.connection.phase)
                    )}
                  >
                    {state.whatsapp.connection.phaseLabel}
                  </span>
                </div>
                <div className="space-y-1">
                  <FieldLabel>Connection status</FieldLabel>
                  <p className="text-lg font-semibold text-foreground">
                    {state.whatsapp.connection.headline}
                  </p>
                  <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                    {state.whatsapp.connection.detail}
                  </p>
                  <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
                    {state.whatsapp.connection.nextStep}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="default"
                  className="h-11 rounded-[0.95rem] px-5"
                  onClick={handlePrepareLiveConnection}
                  disabled={isPreparingConnection}
                >
                  {isPreparingConnection
                    ? "Starting..."
                    : state.whatsapp.connection.primaryActionLabel}
                </Button>
                <Button
                  variant="outline"
                  className="h-11 rounded-[0.95rem] bg-white/84 px-5"
                  onClick={handleRefreshLiveConnection}
                  disabled={isRefreshingConnection}
                >
                  {isRefreshingConnection ? "Refreshing..." : "Refresh status"}
                </Button>
              </div>
            </div>

            {connectionError ? (
              <div className="mt-4 rounded-[0.9rem] border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {connectionError}
              </div>
            ) : null}
            {!connectionError && connectionStatus ? (
              <div className="mt-4 rounded-[0.9rem] border border-primary/20 bg-primary/8 px-3 py-2 text-sm text-primary">
                {connectionStatus}
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[0.9rem] border border-border/80 bg-white/88 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Requested clinic number
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {state.whatsapp.connection.requestedPhoneNumber || "Not set"}
                </p>
              </div>
              <div className="rounded-[0.9rem] border border-border/80 bg-white/88 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {state.whatsapp.connection.alternatePhoneNumber &&
                  !state.whatsapp.connection.senderPhoneNumber
                    ? "Current active number"
                    : "Active sender"}
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {state.whatsapp.connection.senderPhoneNumber ||
                    state.whatsapp.connection.alternatePhoneNumber ||
                    "Not connected yet"}
                </p>
              </div>
              <div className="rounded-[0.9rem] border border-border/80 bg-white/88 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Setup step
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {state.whatsapp.connection.phaseLabel}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Verification {state.whatsapp.connection.verificationLabel}
                </p>
              </div>
              <div className="rounded-[0.9rem] border border-border/80 bg-white/88 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Last update
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {state.whatsapp.connection.lastSyncedLabel || "Not synced yet"}
                </p>
              </div>
            </div>

            {(state.whatsapp.connection.onboardingStartedAtLabel ||
              state.whatsapp.connection.connectedAtLabel ||
              state.whatsapp.connection.lastSyncedLabel ||
              state.whatsapp.connection.lastError) ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {state.whatsapp.connection.onboardingStartedAtLabel ? (
                  <div className="rounded-[0.9rem] border border-border/80 bg-white/76 px-4 py-3 text-sm text-muted-foreground">
                    Onboarding started{" "}
                    <span className="font-medium text-foreground">
                      {state.whatsapp.connection.onboardingStartedAtLabel}
                    </span>
                  </div>
                ) : null}
                {state.whatsapp.connection.connectedAtLabel ? (
                  <div className="rounded-[0.9rem] border border-border/80 bg-white/76 px-4 py-3 text-sm text-muted-foreground">
                    Connected{" "}
                    <span className="font-medium text-foreground">
                      {state.whatsapp.connection.connectedAtLabel}
                    </span>
                  </div>
                ) : null}
                {state.whatsapp.connection.lastSyncedLabel ? (
                  <div className="rounded-[0.9rem] border border-border/80 bg-white/76 px-4 py-3 text-sm text-muted-foreground">
                    Last sync{" "}
                    <span className="font-medium text-foreground">
                      {state.whatsapp.connection.lastSyncedLabel}
                    </span>
                  </div>
                ) : null}
                {state.whatsapp.connection.lastError ? (
                  <div className="rounded-[0.9rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {state.whatsapp.connection.lastError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </SettingsSection>

        <SettingsSection
          id="reminders"
          title="Reminders"
          description="Define the reminder cadence and shared template that appointments can reuse across the MVP workflow."
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[0.95rem] border border-border/80 bg-muted/45 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      First reminder
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Send before the appointment starts.
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
                <div className="mt-4 space-y-2">
                  <FieldLabel>Send time</FieldLabel>
                  <NativeSelect
                    value={String(state.reminders.firstReminderHours)}
                    options={reminderHourOptions}
                    onChange={(value) =>
                      setState((current) => ({
                        ...current,
                        reminders: {
                          ...current.reminders,
                          firstReminderHours: Number(value),
                        },
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {state.reminders.firstReminderHours} hours before the appointment.
                  </p>
                </div>
              </div>

              <div className="rounded-[0.95rem] border border-border/80 bg-muted/45 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Second reminder
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Optional final prompt closer to the visit.
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
                <div className="mt-4 space-y-2">
                  <FieldLabel>Send time</FieldLabel>
                  <NativeSelect
                    value={String(state.reminders.secondReminderHours)}
                    options={reminderHourOptions}
                    onChange={(value) =>
                      setState((current) => ({
                        ...current,
                        reminders: {
                          ...current.reminders,
                          secondReminderHours: Number(value),
                        },
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {state.reminders.secondReminderHours} hours before the appointment.
                  </p>
                </div>
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

            {state.whatsapp.connection.mode === "LIVE" &&
            state.whatsapp.connection.showVerificationInput ? (
              <div className="mt-5 rounded-[0.95rem] border border-border/80 bg-white/84 px-4 py-4">
                <p className="text-sm font-medium text-foreground">
                  Verification code
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  If the clinic number receives a verification code, paste it
                  here and submit it.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <Input
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value)}
                    placeholder="Enter code"
                    className="h-11 rounded-[0.9rem] bg-white/84"
                  />
                  <Button
                    variant="outline"
                    className="h-11 rounded-[0.9rem] bg-white/84 px-5"
                    onClick={handleSubmitVerificationCode}
                    disabled={isSubmittingVerificationCode}
                  >
                    {isSubmittingVerificationCode
                      ? "Submitting..."
                      : "Submit code"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </SettingsSection>

        <SettingsSection
          id="billing"
          title="Billing"
          description="Review the current plan, see what is locked, and use the prepared upgrade path while live payments are still pending."
        >
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[1rem] border border-primary/12 bg-[linear-gradient(135deg,var(--primary-soft),rgba(255,255,255,0.92))] shadow-[0_18px_40px_rgba(20,32,51,0.04)]">
              <div className="space-y-5 px-5 py-5">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Billing plan
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
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                  {state.billing.note}
                </p>
              </div>
            </div>

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

            <div className="rounded-[1rem] border border-border/80 bg-white/88 px-5 py-5 shadow-[0_16px_34px_rgba(20,32,51,0.04)]">
              <FieldLabel>Plan upgrade</FieldLabel>
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
            </div>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
