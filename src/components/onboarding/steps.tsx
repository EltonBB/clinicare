"use client";

import type { CSSProperties } from "react";
import { Check, ImagePlus, Loader2 } from "lucide-react";

import { authFieldClassName } from "@/components/auth/field-styles";
import { Input } from "@/components/ui/input";
import { brandAccentPresets, normalizeBrandHexColor } from "@/lib/branding";
import { businessTypes } from "@/lib/constants";
import {
  hoursBetweenTimes,
  onboardingSteps,
  weekdayOrder,
  type DaySchedule,
  type OnboardingState,
  type WeekdayKey,
} from "@/lib/onboarding";
import { cn, firstDisplayName, getInitials } from "@/lib/utils";

import { FieldLabel, NativeSelect, Toggle } from "./form-parts";

const dayLabel = (day: WeekdayKey) => day[0].toUpperCase() + day.slice(1);

const timeOptions = [
  "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00",
];

const staffRoles = ["Specialist", "Manager", "Reception"];

const stepDetails: Record<(typeof onboardingSteps)[number]["id"], string> = {
  clinic: "Name, logo and brand color",
  hours: "When patients can book",
  team: "Who works day one",
};

// Emerald reads as a status color next to the workspace's green "completed" tone.
const visibleAccentPresets = brandAccentPresets.filter((preset) => preset.id !== "emerald");

export function WelcomeStep({ firstName }: { firstName: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-primary">Welcome to Vela</p>
      <h1 className="mt-3 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
        Let&apos;s set up your clinic, <span className="text-muted-foreground">{firstName}.</span>
      </h1>
      <ol className="mt-8 space-y-1">
        {onboardingSteps.map((item, index) => (
          <li key={item.id} className="flex items-center gap-4 rounded-(--radius-field) px-1 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-tile) border border-border text-xs font-semibold text-[var(--brand-ink)] tabular-nums">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{item.shortLabel}</span>
              <span className="block text-sm text-muted-foreground">{stepDetails[item.id]}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-sm text-muted-foreground">About three minutes. You can change any of it later.</p>
    </div>
  );
}

export function ClinicStep({
  state,
  placeholderName,
  logoDisplayUrl,
  isLogoUploading,
  onClinicChange,
  onOwnerChange,
  onLogoUpload,
  onLogoRemove,
}: {
  state: OnboardingState;
  placeholderName: string;
  logoDisplayUrl: string;
  isLogoUploading: boolean;
  onClinicChange: (patch: Partial<OnboardingState["clinic"]>) => void;
  onOwnerChange: (name: string) => void;
  onLogoUpload: (file: File | null) => void;
  onLogoRemove: () => void;
}) {
  const normalizedCustomAccent = normalizeBrandHexColor(state.clinic.accentHex);
  const customActive = state.clinic.accentColor === "custom";
  const customInvalid = customActive && !normalizedCustomAccent;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <FieldLabel htmlFor="clinic-name">Clinic name</FieldLabel>
        <Input
          id="clinic-name"
          value={state.clinic.name}
          onChange={(event) => onClinicChange({ name: event.target.value })}
          placeholder={placeholderName}
          autoComplete="organization"
          className={authFieldClassName}
        />
      </div>

      <div className="space-y-2">
        <FieldLabel htmlFor="owner-name">Your name</FieldLabel>
        <Input
          id="owner-name"
          value={state.owner.name}
          onChange={(event) => onOwnerChange(event.target.value)}
          autoComplete="name"
          className={authFieldClassName}
        />
      </div>

      <div className="space-y-2.5">
        <p className="text-sm font-semibold text-foreground">Clinic type</p>
        <div className="flex flex-wrap gap-2">
          {businessTypes.map((type) => {
            const active = state.clinic.type === type;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={active}
                onClick={() => onClinicChange({ type })}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color] duration-(--duration-base) focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 active:scale-[0.97]",
                  active
                    ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white"
                    : "border-border bg-white text-muted-foreground hover:border-[var(--brand-ink)]/30 hover:text-foreground"
                )}
              >
                {type}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2.5">
        <p className="text-sm font-semibold text-foreground">Logo</p>
        <div className="flex items-center gap-3">
          <input
            id="clinic-logo-upload"
            type="file"
            accept="image/*"
            disabled={isLogoUploading}
            onChange={(event) => {
              onLogoUpload(event.currentTarget.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
            className="peer sr-only"
          />
          <label
            htmlFor="clinic-logo-upload"
            aria-label={logoDisplayUrl ? "Replace logo" : "Upload logo"}
            className="flex size-12 cursor-pointer items-center justify-center overflow-hidden rounded-(--radius-tile) border border-dashed border-border bg-white text-muted-foreground transition-colors duration-(--duration-base) hover:border-[var(--brand-ink)]/40 hover:text-[var(--brand-ink)] peer-focus-visible:ring-4 peer-focus-visible:ring-primary/15"
          >
            {isLogoUploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : logoDisplayUrl ? (
              <span aria-hidden className="size-full bg-cover bg-center" style={{ backgroundImage: `url("${logoDisplayUrl}")` }} />
            ) : (
              <ImagePlus className="size-4" />
            )}
          </label>
          {state.clinic.logoUrl ? (
            <button type="button" className="text-sm font-medium text-muted-foreground hover:text-destructive" onClick={onLogoRemove}>
              Remove
            </button>
          ) : (
            <span className="text-sm text-muted-foreground">Optional</span>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        <p className="text-sm font-semibold text-foreground">Brand color</p>
        <div className="flex flex-wrap items-center gap-2.5">
          {visibleAccentPresets.map((preset) => {
            const active = state.clinic.accentColor === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-label={preset.name}
                aria-pressed={active}
                onClick={() => onClinicChange({ accentColor: preset.id, accentHex: preset.value })}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full transition-transform duration-(--duration-base) ease-out-quint hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 active:scale-95",
                  active && "ring-2 ring-offset-2"
                )}
                style={{ backgroundColor: preset.value, "--tw-ring-color": preset.value } as CSSProperties}
              >
                {active ? <Check className="size-4 text-white" /> : null}
              </button>
            );
          })}
          <label
            className={cn(
              "flex h-8 items-center gap-2 rounded-full border px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-(--duration-base)",
              customActive ? "border-[var(--brand-ink)]/40" : "border-border",
              customInvalid && "border-destructive/50"
            )}
          >
            <input
              type="color"
              aria-label="Custom color"
              value={normalizedCustomAccent ?? "#3142d8"}
              onChange={(event) => onClinicChange({ accentColor: "custom", accentHex: event.target.value })}
              className="size-4 cursor-pointer rounded-full border-0 bg-transparent p-0"
            />
            <input
              aria-label="Custom color hex"
              value={customActive ? state.clinic.accentHex : ""}
              onFocus={() => onClinicChange({ accentColor: "custom" })}
              onChange={(event) => onClinicChange({ accentColor: "custom", accentHex: event.target.value })}
              placeholder="Custom"
              className="w-16 bg-transparent font-mono uppercase outline-none placeholder:font-sans placeholder:normal-case"
            />
          </label>
        </div>
      </div>
    </div>
  );
}

export function HoursStep({
  workingHours,
  onDayChange,
}: {
  workingHours: OnboardingState["workingHours"];
  onDayChange: (day: WeekdayKey, patch: Partial<DaySchedule>) => void;
}) {
  return (
    <ul className="space-y-1">
      {weekdayOrder.map((day) => {
        const item = workingHours[day];
        const invalid = item.enabled && hoursBetweenTimes(item.start, item.end) <= 0;
        return (
          <li
            key={day}
            className="flex h-12 items-center justify-between gap-2 px-1 sm:gap-3"
          >
            <div className="flex items-center gap-3">
              <Toggle
                checked={item.enabled}
                onPressedChange={(checked) => onDayChange(day, { enabled: checked })}
                ariaLabel={`Open on ${dayLabel(day)}`}
              />
              <span className={cn("text-sm font-medium", item.enabled ? "text-foreground" : "text-muted-foreground")}>
                <span className="sm:hidden">{dayLabel(day).slice(0, 3)}</span>
                <span className="hidden sm:inline">{dayLabel(day)}</span>
              </span>
            </div>
            {item.enabled ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <NativeSelect
                  value={item.start}
                  onChange={(value) => onDayChange(day, { start: value })}
                  options={timeOptions}
                  ariaLabel={`${dayLabel(day)} opens`}
                  className={cn("w-[4.75rem] px-2.5 sm:w-[5.5rem] sm:px-3", invalid && "border-destructive/50")}
                />
                <span aria-hidden className="text-muted-foreground">
                  to
                </span>
                <NativeSelect
                  value={item.end}
                  onChange={(value) => onDayChange(day, { end: value })}
                  options={timeOptions}
                  ariaLabel={`${dayLabel(day)} closes`}
                  className={cn("w-[4.75rem] px-2.5 sm:w-[5.5rem] sm:px-3", invalid && "border-destructive/50")}
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Closed</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function TeamStep({
  ownerName,
  solo,
  staffMember,
  onChooseSolo,
  onStaffChange,
}: {
  ownerName: string;
  solo: boolean;
  staffMember: OnboardingState["staffMember"];
  onChooseSolo: () => void;
  onStaffChange: (patch: Partial<OnboardingState["staffMember"]>) => void;
}) {
  return (
    <div className="space-y-6">
      <button
        type="button"
        aria-pressed={solo}
        onClick={onChooseSolo}
        className={cn(
          "flex w-full items-center gap-3.5 rounded-(--radius-field) border px-4 py-3.5 text-left transition-[border-color,background-color] duration-(--duration-base) focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 active:scale-[0.99]",
          solo ? "border-[var(--brand-ink)] bg-[var(--brand-wash)]/50" : "border-border hover:border-[var(--brand-ink)]/30"
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-tile) border border-border bg-white text-sm font-semibold text-primary">
          {getInitials(ownerName || "Me")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">It&apos;s just me for now</span>
          <span className="block truncate text-sm text-muted-foreground">
            {firstDisplayName(ownerName || "You")} takes every appointment
          </span>
        </span>
        <span
          aria-hidden
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-(--duration-base)",
            solo ? "border-[var(--brand-ink)] bg-[var(--brand-ink)] text-white" : "border-border"
          )}
        >
          {solo ? <Check className="size-3" /> : null}
        </span>
      </button>

      <div className="space-y-2">
        <FieldLabel htmlFor="staff-name">Or add your first team member</FieldLabel>
        <div className="flex gap-2.5">
          <Input
            id="staff-name"
            value={staffMember.name}
            onChange={(event) => onStaffChange({ name: event.target.value })}
            placeholder="Full name"
            className={cn(authFieldClassName, "flex-1")}
          />
          <NativeSelect
            value={staffMember.role}
            onChange={(role) => onStaffChange({ role })}
            options={staffRoles}
            ariaLabel="Role"
            className="h-12 w-36 px-3.5 text-[15px]"
          />
        </div>
        <p className="pt-1 text-sm text-muted-foreground">Add the rest of the team anytime from Staff.</p>
      </div>
    </div>
  );
}
