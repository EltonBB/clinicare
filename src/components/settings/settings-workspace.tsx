"use client";

import Link from "next/link";
import { useState, useTransition, type CSSProperties } from "react";
import { ArrowUpRight, Plus, Trash2 } from "lucide-react";

import {
  checkInStaffAction,
  checkOutStaffAction,
  prepareWhatsAppLiveConnectionAction,
  refreshWhatsAppLiveConnectionAction,
  saveSettingsAction,
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

type SettingsWorkspaceProps = {
  initialState: SettingsState;
  flashMessage?: string;
};

const reminderHourOptions = Array.from({ length: 24 }, (_, index) =>
  String(24 - index)
);
const staffStatusOptions: SettingsStaffMember["status"][] = [
  "ACTIVE",
  "AWAY",
  "INACTIVE",
];

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

function HourSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <select
      value={String(value)}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-11 w-full rounded-[0.9rem] border border-border/80 bg-white/84 px-3 text-sm outline-none transition-[border-color,background-color,box-shadow] duration-200 focus:border-ring focus:bg-white focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      {reminderHourOptions.map((option) => (
        <option key={option} value={option}>
          {option}h
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
        {description ? (
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
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
  const [, setConnectionStatus] = useState("");
  const [, setConnectionError] = useState("");
  const [isPreparingConnection, startPreparingConnection] = useTransition();
  const [isRefreshingConnection, startRefreshingConnection] = useTransition();
  const visibleAccentPresets = brandAccentPresets.filter(
    (preset) => preset.id !== "emerald"
  );
  const normalizedCustomAccent = normalizeBrandHexColor(
    state.appearance.accentHex
  );
  const previewAccent = normalizedCustomAccent ?? "#3b82f6";
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
          email: "",
          phone: "",
          profileNote: "",
          status: "ACTIVE",
          isCheckedIn: false,
          weeklyHours: 0,
          completedThisMonth: 0,
          recentAppointments: [],
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
      setErrorMessage("Enter a valid HEX color, for example #3b82f6.");
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

  function handleStaffClock(member: SettingsStaffMember) {
    startSaving(async () => {
      const result = member.isCheckedIn
        ? await checkOutStaffAction(member.id)
        : await checkInStaffAction(member.id);

      if (!result.ok) {
        setErrorMessage(result.error ?? "We couldn't update staff time.");
        setMessage("");
        return;
      }

      updateStaffMember(member.id, { isCheckedIn: !member.isCheckedIn });
      setErrorMessage("");
      setMessage(member.isCheckedIn ? "Staff checked out." : "Staff checked in.");
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
                    placeholder="#3b82f6"
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
          description="Manage staff profiles, availability status, time tracking, and recent completed work."
        >
          <div className="space-y-4">
            {state.staff.map((member) => (
              <div
                key={member.id}
                className="rounded-[1rem] border border-border/80 bg-muted/35 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                    <NativeSelect
                      value={member.status}
                      options={[...staffStatusOptions]}
                      onChange={(value) =>
                        updateStaffMember(member.id, {
                          status: value as SettingsStaffMember["status"],
                        })
                      }
                    />
                    <Input
                      value={member.phone}
                      onChange={(event) =>
                        updateStaffMember(member.id, { phone: event.target.value })
                      }
                      placeholder="Phone"
                      className="h-11 rounded-[0.9rem] bg-white/84"
                    />
                    <Input
                      value={member.email}
                      onChange={(event) =>
                        updateStaffMember(member.id, { email: event.target.value })
                      }
                      placeholder="Email"
                      className="h-11 rounded-[0.9rem] bg-white/84"
                    />
                    <Input
                      value={member.profileNote}
                      onChange={(event) =>
                        updateStaffMember(member.id, { profileNote: event.target.value })
                      }
                      placeholder="Profile note"
                      className="h-11 rounded-[0.9rem] bg-white/84 md:col-span-2 xl:col-span-3"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={member.isCheckedIn ? "outline" : "default"}
                      className="h-11 rounded-[0.9rem]"
                      onClick={() => handleStaffClock(member)}
                      disabled={member.id.startsWith("staff-seed") || isPending}
                    >
                      {member.isCheckedIn ? "Check out" : "Check in"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => removeStaffMember(member.id)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-[0.9rem] border border-border/80 bg-white/84 text-muted-foreground transition-colors hover:bg-white"
                      aria-label="Remove staff member"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[0.9rem] bg-white/78 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      This week
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-primary">
                      {member.weeklyHours}h
                    </p>
                  </div>
                  <div className="rounded-[0.9rem] bg-white/78 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Completed this month
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-primary">
                      {member.completedThisMonth}
                    </p>
                  </div>
                  <div className="rounded-[0.9rem] bg-white/78 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Last 5 completed
                    </p>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {member.recentAppointments.length > 0 ? (
                        member.recentAppointments.map((appointment) => (
                          <p key={appointment.id} className="truncate">
                            {appointment.date} - {appointment.clientName}
                          </p>
                        ))
                      ) : (
                        <p>No completed appointments yet.</p>
                      )}
                    </div>
                  </div>
                </div>
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
          description="Connect the clinic WhatsApp number used for inbox messages and reminders."
          tourTarget="settings-whatsapp"
        >
          <div className="rounded-[1rem] border border-border/80 bg-muted/35 p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
              <div className="space-y-2 lg:pb-0">
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
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="default"
                    className="h-11 rounded-[0.95rem] px-5"
                    onClick={handlePrepareLiveConnection}
                    disabled={isPreparingConnection}
                  >
                    {isPreparingConnection ? "Connecting..." : "Connect"}
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
                <div className="rounded-[0.95rem] border border-border/80 bg-white/88 px-4 py-3 shadow-[0_10px_24px_rgba(20,32,51,0.035)]">
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel>Status</FieldLabel>
                    <span
                      className={cn(
                        "size-2.5 rounded-full",
                        state.whatsapp.connection.phase === "CONNECTED"
                          ? "bg-primary"
                          : "bg-muted-foreground/35"
                      )}
                    />
                  </div>
                  <p
                    className={cn(
                      "mt-2 text-base font-semibold",
                      state.whatsapp.connection.phase === "CONNECTED"
                        ? "text-primary"
                        : "text-foreground"
                    )}
                  >
                    {state.whatsapp.connection.phase === "CONNECTED"
                      ? "Connected"
                      : "Not connected"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          id="reminders"
          title="Reminders"
          description=""
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[0.95rem] border border-border/80 bg-muted/45 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      First reminder
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
                  <HourSelect
                    value={state.reminders.firstReminderHours}
                    onChange={(value) =>
                      setState((current) => ({
                        ...current,
                        reminders: {
                          ...current.reminders,
                          firstReminderHours: value,
                        },
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {state.reminders.firstReminderHours}h before the appointment.
                  </p>
                </div>
              </div>

              <div className="rounded-[0.95rem] border border-border/80 bg-muted/45 px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Second reminder
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
                  <HourSelect
                    value={state.reminders.secondReminderHours}
                    onChange={(value) =>
                      setState((current) => ({
                        ...current,
                        reminders: {
                          ...current.reminders,
                          secondReminderHours: value,
                        },
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {state.reminders.secondReminderHours}h before the appointment.
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
          </div>
        </SettingsSection>

        <SettingsSection
          id="billing"
          title="Billing"
          description="Review the current plan and open pricing if you want to upgrade."
        >
          <div className="flex flex-col gap-4 rounded-[1rem] border border-border/80 bg-white/88 px-5 py-5 shadow-[0_16px_34px_rgba(20,32,51,0.04)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              <FieldLabel>Current plan</FieldLabel>
              <div className="mt-2 flex items-center gap-3">
                <p className="text-2xl font-semibold text-foreground">
                  Vela {state.billing.planName}
                </p>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                  {state.billing.statusLabel}
                </span>
              </div>
            </div>
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-11 rounded-[0.95rem] justify-center bg-white/76 px-5"
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
