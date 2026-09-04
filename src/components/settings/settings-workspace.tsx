"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { m } from "framer-motion";
import {
  ArrowUpRight,
  BellRing,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  ImageUp,
  MessageCircle,
  Palette,
} from "lucide-react";

import { updateOwnerProfileAction } from "@/app/(auth)/actions";
import {
  connectBaileysWhatsAppAction,
  getBaileysPairingStatusAction,
  saveSettingsAction,
} from "@/app/(workspace)/settings/actions";
import { businessTypes } from "@/lib/constants";
import { brandAccentPresets, normalizeBrandHexColor } from "@/lib/branding";
import { cn } from "@/lib/utils";
import { isStorageReference } from "@/lib/media-storage";
import { safeUploadErrorMessage, uploadWorkspaceImage } from "@/lib/media-storage-client";
import {
  timeOptions,
  weekdayLabels,
  type SaveSettingsPayload,
  type SettingsState,
} from "@/lib/settings";
import { weekdayOrder, type WeekdayKey } from "@/lib/onboarding";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/workspace/workspace-layout";
import { LazyMotionProvider } from "@/components/layout/motion-provider";

type SettingsWorkspaceProps = {
  initialState: SettingsState;
  flashMessage?: string;
  /** "page" renders the full route; "dialog" renders inside the settings popup. */
  variant?: "page" | "dialog";
  /** Called after a successful save (the dialog uses this to refresh the app shell). */
  onSaved?: () => void;
  /** Notifies the host (the settings dialog) whenever unsaved edits appear or clear. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Owner account details merged into the Business & account section. */
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  /** Section to open on first render (e.g. a `?section=billing` deep link). */
  initialSection?: string;
};

type SettingsSectionId =
  | "business"
  | "appearance"
  | "hours"
  | "reminders"
  | "whatsapp"
  | "billing";

const settingsNav: Array<{
  id: SettingsSectionId;
  icon: typeof Building2;
  title: string;
  subtitle: string;
}> = [
  { id: "business", icon: Building2, title: "Business & account", subtitle: "Owner, contact, clinic & logo" },
  { id: "appearance", icon: Palette, title: "Appearance", subtitle: "Workspace accent color" },
  { id: "hours", icon: Clock3, title: "Working hours", subtitle: "Booking availability" },
  { id: "reminders", icon: BellRing, title: "Reminders", subtitle: "Send times and message" },
  { id: "whatsapp", icon: MessageCircle, title: "WhatsApp", subtitle: "Pairing and connection" },
  { id: "billing", icon: CreditCard, title: "Billing", subtitle: "Plan and checkout" },
];

const reminderHourOptions = Array.from({ length: 24 }, (_, index) =>
  String(24 - index)
);

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
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
        "relative inline-flex h-6 w-10 shrink-0 rounded-full shadow-[inset_0_1px_3px_rgba(20,32,51,0.12)] transition-colors duration-(--duration-base)",
        checked ? "bg-primary" : "bg-border"
      )}
    >
      <span
        className={cn(
          "absolute top-1 size-4 rounded-full bg-white transition-transform",
          checked ? "translate-x-5" : "translate-x-1"
        )}
      />
    </button>
  );
}

function NativeSelect({
  value,
  options,
  onChange,
  className,
  ariaLabel,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "h-10 w-full rounded-(--radius-card) border border-border/80 bg-white px-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-(--duration-base) focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/40",
        className
      )}
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
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
}) {
  return (
    <select
      value={String(value)}
      aria-label={ariaLabel}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-9 w-[124px] rounded-(--radius-card) border border-border/80 bg-white px-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-(--duration-base) focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      {reminderHourOptions.map((option) => (
        <option key={option} value={option}>
          {option}h before
        </option>
      ))}
    </select>
  );
}

function SectionCard({
  id,
  title,
  description,
  children,
  active = true,
}: {
  id: SettingsSectionId;
  title: string;
  description?: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  if (!active) {
    return null;
  }

  return (
    <section
      id={`section-${id}`}
      className="rounded-(--radius-card) border border-border/80 bg-white p-4 shadow-(--shadow-card)"
    >
      <div className="border-b border-border/60 pb-3">
        <h2 className="text-base font-semibold leading-5 text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function resolveInitialSection(requested: string | undefined): SettingsSectionId {
  return settingsNav.some((section) => section.id === requested)
    ? (requested as SettingsSectionId)
    : "business";
}

export function SettingsWorkspace({
  initialState,
  flashMessage = "",
  variant = "page",
  onSaved,
  onDirtyChange,
  ownerName = "",
  ownerEmail = "",
  ownerPhone = "",
  initialSection,
}: SettingsWorkspaceProps) {
  const inDialog = variant === "dialog";
  const [state, setState] = useState(initialState);
  const [savedState, setSavedState] = useState(initialState);
  // Owner account fields live in their own state — they save through the auth
  // profile action, while the rest of the section saves through settings.
  const [account, setAccount] = useState({
    fullName: ownerName,
    email: ownerEmail,
    phone: ownerPhone,
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savedAccount, setSavedAccount] = useState({
    fullName: ownerName,
    email: ownerEmail,
    phone: ownerPhone,
  });
  // Server-resolved (e.g. checkout's ?section=billing deep link on the
  // standalone /settings page) so the right section is in the very first
  // render — no client-side swap/flash after hydration. The dialog never
  // passes initialSection, so it always starts on "business" as before.
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() =>
    resolveInitialSection(initialSection)
  );
  const [message, setMessage] = useState(flashMessage);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLogoUploading, setIsLogoUploading] = useState(false);
  const [isPending, startSaving] = useTransition();
  const [isConnecting, startConnecting] = useTransition();
  const [pairing, setPairing] = useState<{
    status: "connecting" | "qr" | "connected" | "disconnected";
    qr?: string;
  } | null>(null);
  const visibleAccentPresets = brandAccentPresets.filter(
    (preset) => preset.id !== "emerald"
  );
  const normalizedCustomAccent = normalizeBrandHexColor(
    state.appearance.accentHex
  );
  const previewAccent = normalizedCustomAccent ?? "#0A22FF";
  const customAccentSelected = state.appearance.accentColor === "custom";
  const customAccentInvalid = customAccentSelected && !normalizedCustomAccent;
  const logoDisplayUrl =
    state.business.logoDisplayUrl ||
    (isStorageReference(state.business.logoUrl) ? "" : state.business.logoUrl);
  const whatsappPhase = state.whatsapp.connection.phase;
  const isConnected = whatsappPhase === "CONNECTED";
  const settingsDirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(savedState),
    [state, savedState]
  );
  const accountDirty =
    account.fullName !== savedAccount.fullName ||
    account.email !== savedAccount.email ||
    account.phone !== savedAccount.phone ||
    account.newPassword.length > 0 ||
    account.confirmPassword.length > 0;
  const hasUnsavedChanges = settingsDirty || accountDirty;

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

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

  function handleSave() {
    if (customAccentInvalid) {
      setErrorMessage("Enter a valid HEX color, for example #0A22FF.");
      setMessage("");
      return;
    }

    startSaving(async () => {
      // Owner account (name, login email, phone, password) saves through the
      // auth profile action — only touch it when those fields actually changed
      // so a routine settings save never re-submits credentials.
      let accountMessage = "";
      if (accountDirty) {
        const profileData = new FormData();
        profileData.set("fullName", account.fullName);
        profileData.set("email", account.email);
        profileData.set("phone", account.phone);
        profileData.set("currentPassword", account.currentPassword);
        profileData.set("newPassword", account.newPassword);
        profileData.set("confirmPassword", account.confirmPassword);

        const profileResult = await updateOwnerProfileAction({}, profileData);

        if (profileResult.error) {
          setErrorMessage(profileResult.error);
          setMessage("");
          return;
        }

        accountMessage = profileResult.success ?? "";
      }

      // Submit only the editable subset — derived/display fields stay server-owned.
      const payload: SaveSettingsPayload = {
        business: {
          businessName: state.business.businessName,
          businessType: state.business.businessType,
          ownerName: account.fullName,
          logoUrl: state.business.logoUrl,
        },
        appearance: state.appearance,
        workingHours: state.workingHours,
        whatsapp: {
          phoneNumber: state.whatsapp.phoneNumber,
          sendReminders: state.whatsapp.sendReminders,
          reminderWindow: state.whatsapp.reminderWindow,
        },
        reminders: state.reminders,
      };
      const result = await saveSettingsAction(payload);

      if (!result.ok || !result.state) {
        setErrorMessage(result.error ?? "We couldn't save your settings.");
        setMessage("");
        return;
      }

      setState(result.state);
      setSavedState(result.state);
      setAccount((current) => ({
        ...current,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));
      setSavedAccount({
        fullName: account.fullName,
        email: account.email,
        phone: account.phone,
      });
      setErrorMessage("");
      setMessage(accountDirty && accountMessage ? accountMessage : "Settings saved.");
      onSaved?.();
    });
  }

  function handleDiscard() {
    setState(savedState);
    setAccount({
      fullName: savedAccount.fullName,
      email: savedAccount.email,
      phone: savedAccount.phone,
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setErrorMessage("");
    setMessage("");
  }

  async function handleLogoUpload(file: File | null) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Upload an image file for the clinic logo.");
      setMessage("");
      return;
    }

    if (file.size > 750_000) {
      setErrorMessage("Logo file is too large. Upload an image under 750 KB.");
      setMessage("");
      return;
    }

    setIsLogoUploading(true);

    try {
      const uploadedLogo = await uploadWorkspaceImage(file, {
        folder: "logos",
        maxBytes: 750_000,
      });
      setState((current) => ({
        ...current,
        business: {
          ...current.business,
          logoUrl: uploadedLogo.storageUrl,
          logoDisplayUrl: uploadedLogo.signedUrl,
        },
      }));
      setErrorMessage("");
      setMessage("Logo uploaded. Save changes to keep it.");
    } catch (error) {
      setErrorMessage(safeUploadErrorMessage(error, "We couldn't upload this logo."));
      setMessage("");
    } finally {
      setIsLogoUploading(false);
    }
  }

  // Connection status is server state, not an edit — mirror "connected" into
  // both snapshots so pairing never flips the dirty flag or gets rewound by
  // Discard. Stable (useCallback) so the polling effect doesn't churn.
  const markWhatsAppConnected = useCallback(() => {
    const applyConnected = (current: SettingsState): SettingsState => ({
      ...current,
      whatsapp: {
        ...current.whatsapp,
        connection: {
          ...current.whatsapp.connection,
          phase: "CONNECTED",
          status: "CONNECTED",
          statusLabel: "Connected",
        },
      },
    });
    setState(applyConnected);
    setSavedState(applyConnected);
    // Clear the pairing state so the QR view yields to the connected view.
    setPairing(null);
    setMessage("WhatsApp connected.");
  }, []);

  const pairingPollsRef = useRef(0);

  function handleConnectWhatsApp(options?: { force?: boolean }) {
    startConnecting(async () => {
      // `force` re-pairs a clinic that's already connected ("link a different
      // device") — without it the worker just re-reports the live session and
      // never emits a new QR.
      const result = await connectBaileysWhatsAppAction(
        options?.force ? { force: true } : undefined
      );
      if (!result.ok) {
        setErrorMessage(result.error);
        setMessage("");
        return;
      }
      setErrorMessage("");
      setPairing({ status: result.status, qr: result.qr });
      if (result.status === "connected") {
        markWhatsAppConnected();
      }
    });
  }

  // While a QR is outstanding, poll the worker for the connection state and the
  // (possibly refreshed) QR until it flips to connected — but give up after a
  // bounded window so an unscanned/expired QR or an unreachable worker doesn't
  // poll forever; the user can tap Connect again.
  const isPairing = pairing !== null && pairing.status !== "connected";
  useEffect(() => {
    if (!isPairing) {
      return;
    }
    // Reset the counter at the start of each pairing attempt (covers reconnect,
    // not just the initial Connect click).
    pairingPollsRef.current = 0;
    let active = true;
    const maxPolls = 48; // ~2 minutes at 2.5s
    const id = setInterval(async () => {
      if (!active) {
        return;
      }
      pairingPollsRef.current += 1;
      if (pairingPollsRef.current > maxPolls) {
        setPairing(null);
        setErrorMessage(
          "Pairing timed out. Tap Connect WhatsApp to get a fresh code."
        );
        return;
      }
      const result = await getBaileysPairingStatusAction();
      if (!active || !result.ok) {
        return;
      }
      setPairing((prev) =>
        prev ? { status: result.status, qr: result.qr ?? prev.qr } : prev
      );
      if (result.status === "connected") {
        markWhatsAppConnected();
      }
    }, 2500);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [isPairing, markWhatsAppConnected]);

  const content = (
    <LazyMotionProvider>
      {errorMessage ? (
        <div className="rounded-(--radius-card) border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
      {!errorMessage && message ? (
        <div className="rounded-(--radius-card) border border-primary/20 bg-primary/8 px-3 py-2.5 text-sm text-primary">
          {message}
        </div>
      ) : null}

      <div
        className={cn(
          "grid gap-4",
          inDialog
            ? "items-start md:items-stretch md:grid-cols-[232px_minmax(0,1fr)]"
            : "items-start xl:grid-cols-[290px_minmax(0,1fr)]"
        )}
      >
        <div
          className={cn(
            "flex flex-col rounded-(--radius-card) border border-border/80 bg-white p-2 shadow-(--shadow-card)",
            !inDialog && "xl:sticky xl:top-20"
          )}
        >
          <nav>
            {settingsNav.map((section) => {
              const selected = activeSection === section.id;
              const Icon = section.icon;

              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-(--radius-card) px-2.5 py-2 text-left transition-colors duration-(--duration-base)",
                    selected ? "bg-primary/8" : "hover:bg-secondary/50"
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-(--radius-tile) border bg-white",
                      selected ? "border-primary/30 text-primary" : "border-border/75 text-muted-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm font-semibold",
                        selected ? "text-primary" : "text-foreground"
                      )}
                    >
                      {section.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {section.subtitle}
                    </span>
                  </span>
                  <ChevronRight
                    className={cn(
                      "size-4 shrink-0",
                      selected ? "text-primary" : "text-muted-foreground/50"
                    )}
                  />
                </button>
              );
            })}
          </nav>

          <div className="mt-auto space-y-2 border-t border-border/70 p-2 pt-3">
            <Button
              className="h-10 w-full rounded-(--radius-card)"
              disabled={isPending}
              onClick={handleSave}
            >
              {isPending ? "Saving..." : "Save changes"}
            </Button>
            <Button
              variant="outline"
              className="h-10 w-full rounded-(--radius-card) bg-white"
              onClick={handleDiscard}
              disabled={isPending || !hasUnsavedChanges}
            >
              Discard changes
            </Button>
          </div>
        </div>

        <m.div
          key={activeSection}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="min-w-0"
        >
          <SectionCard
            id="business"
            title="Business & account"
            description="Your account details and your clinic's information in one place."
            active={activeSection === "business"}
          >
            <div className="space-y-4">
              <div className="grid gap-3.5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel>Owner name</FieldLabel>
                  <Input
                    value={account.fullName}
                    onChange={(event) =>
                      setAccount((current) => ({
                        ...current,
                        fullName: event.target.value,
                      }))
                    }
                    className="h-10 rounded-(--radius-card) bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Email</FieldLabel>
                  <Input
                    type="email"
                    value={account.email}
                    onChange={(event) =>
                      setAccount((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    className="h-10 rounded-(--radius-card) bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Phone</FieldLabel>
                  <Input
                    value={account.phone}
                    onChange={(event) =>
                      setAccount((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    className="h-10 rounded-(--radius-card) bg-white"
                  />
                </div>
                <div className="space-y-1.5">
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
                    className="h-10 rounded-(--radius-card) bg-white"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
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
              </div>

              <div className="flex items-center gap-4 border-t border-border/60 pt-4">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-(--radius-tile) border border-border/75 bg-white text-xl font-semibold text-primary">
                  {logoDisplayUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoDisplayUrl}
                      alt={`${state.business.businessName || "Clinic"} logo`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (state.business.businessName || "V").charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-(--radius-card) border border-border/80 bg-white px-3 text-sm font-medium text-foreground transition-[border-color] duration-(--duration-base) hover:border-primary/35">
                    <ImageUp className="size-4 text-primary" />
                    {isLogoUploading ? "Uploading..." : "Upload logo"}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isLogoUploading}
                      className="sr-only"
                      onChange={(event) => handleLogoUpload(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <p className="mt-1.5 text-xs text-muted-foreground">PNG or JPG, up to 750 KB.</p>
                </div>
              </div>

              <div className="space-y-3.5 border-t border-border/60 pt-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">Change password</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Leave the fields blank to keep your current password. Changing it
                    requires your current password.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Current password</FieldLabel>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={account.currentPassword}
                    onChange={(event) =>
                      setAccount((current) => ({
                        ...current,
                        currentPassword: event.target.value,
                      }))
                    }
                    className="h-10 rounded-(--radius-card) bg-white"
                  />
                </div>
                <div className="grid gap-3.5 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <FieldLabel>New password</FieldLabel>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={account.newPassword}
                      onChange={(event) =>
                        setAccount((current) => ({
                          ...current,
                          newPassword: event.target.value,
                        }))
                      }
                      className="h-10 rounded-(--radius-card) bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>Confirm password</FieldLabel>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={account.confirmPassword}
                      onChange={(event) =>
                        setAccount((current) => ({
                          ...current,
                          confirmPassword: event.target.value,
                        }))
                      }
                      className="h-10 rounded-(--radius-card) bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="appearance"
            title="Appearance"
            description="Pick the accent color used for primary actions, active states, and highlights across the workspace."
            active={activeSection === "appearance"}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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
                        "flex w-full items-center gap-2.5 rounded-(--radius-card) border bg-white px-3 py-2.5 text-sm font-medium transition-[border-color,box-shadow] duration-(--duration-base)",
                        selected
                          ? "border-primary/45 text-foreground ring-2 ring-primary/12"
                          : "border-border/80 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      )}
                    >
                      <span
                        className="grid size-6 shrink-0 place-items-center rounded-full"
                        style={{ backgroundColor: preset.value }}
                      >
                        {selected ? <Check className="size-3.5 text-white" /> : null}
                      </span>
                      {preset.name}
                    </button>
                  );
                })}
              </div>

              <div
                className={cn(
                  "flex items-center justify-between gap-3 rounded-(--radius-card) border bg-white px-3 py-2.5 transition-[border-color,box-shadow] duration-(--duration-base)",
                  customAccentSelected
                    ? "border-primary/45 ring-2 ring-primary/12"
                    : "border-border/80",
                  customAccentInvalid && "border-destructive/45 ring-destructive/10"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <label
                    className="relative grid size-6 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full"
                    style={{ backgroundColor: previewAccent }}
                  >
                    {customAccentSelected && !customAccentInvalid ? (
                      <Check className="size-3.5 text-white" />
                    ) : null}
                    <input
                      aria-label="Pick custom accent color"
                      type="color"
                      value={previewAccent}
                      onChange={(event) =>
                        setState((current) => ({
                          ...current,
                          appearance: { accentColor: "custom", accentHex: event.target.value },
                        }))
                      }
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                  <span className="text-sm font-medium text-foreground">Custom color</span>
                </div>
                <Input
                  value={state.appearance.accentHex}
                  onFocus={() =>
                    setState((current) => ({
                      ...current,
                      appearance: { ...current.appearance, accentColor: "custom" },
                    }))
                  }
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      appearance: { accentColor: "custom", accentHex: event.target.value },
                    }))
                  }
                  placeholder="#0A22FF"
                  className="h-9 w-[120px] rounded-(--radius-card) bg-white text-right font-mono text-xs uppercase"
                />
              </div>

              <div className="rounded-(--radius-card) border border-border/70 bg-[#fafbfd] p-3.5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Preview
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span
                    className="inline-flex h-9 items-center rounded-(--radius-card) px-3.5 text-sm font-semibold text-white"
                    style={{ backgroundColor: previewAccent }}
                  >
                    Primary button
                  </span>
                  <span
                    className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ backgroundColor: `${previewAccent}14`, color: previewAccent }}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: previewAccent }}
                    />
                    Active state
                  </span>
                  <span className="text-sm font-semibold" style={{ color: previewAccent }}>
                    Link &amp; highlight
                  </span>
                </div>
              </div>

              <p
                className={cn(
                  "text-xs",
                  customAccentInvalid ? "font-medium text-destructive" : "text-muted-foreground"
                )}
              >
                {customAccentInvalid
                  ? "Use a valid HEX value like #0A22FF."
                  : "Applied to primary actions, active states, and highlights across the workspace."}
              </p>
            </div>
          </SectionCard>

          <SectionCard
            id="hours"
            title="Working hours"
            description="Set the days and times your clinic takes bookings. The calendar and reminders follow these hours."
            active={activeSection === "hours"}
          >
            <div className="divide-y divide-border/65">
              {weekdayOrder.map((day) => {
                const item = state.workingHours[day];

                return (
                  <div
                    key={day}
                    className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <Toggle
                        checked={item.enabled}
                        onPressedChange={(checked) => updateDay(day, { enabled: checked })}
                      />
                      <p className="text-sm font-medium text-foreground">{weekdayLabels[day]}</p>
                    </div>
                    {item.enabled ? (
                      <div className="flex shrink-0 items-center gap-2 pl-[52px] sm:pl-0">
                        <NativeSelect
                          value={item.start}
                          options={timeOptions}
                          onChange={(value) => updateDay(day, { start: value })}
                          className="h-9 w-[104px] px-2.5"
                          ariaLabel={`${weekdayLabels[day]} opening time`}
                        />
                        <span className="text-sm text-muted-foreground">–</span>
                        <NativeSelect
                          value={item.end}
                          options={timeOptions}
                          onChange={(value) => updateDay(day, { end: value })}
                          className="h-9 w-[104px] px-2.5"
                          ariaLabel={`${weekdayLabels[day]} closing time`}
                        />
                      </div>
                    ) : (
                      <span className="pl-[52px] text-sm font-medium text-muted-foreground sm:pl-0">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            id="reminders"
            title="Reminders"
            description="Choose when automatic appointment reminders are sent and what they say."
            active={activeSection === "reminders"}
          >
            <div className="divide-y divide-border/65">
              <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="flex min-w-0 items-center gap-3">
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
                  <p className="text-sm font-medium text-foreground">First reminder</p>
                </div>
                {state.reminders.twentyFourHour ? (
                  <div className="pl-[52px] sm:pl-0">
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
                      ariaLabel="First reminder send time"
                    />
                  </div>
                ) : (
                  <span className="pl-[52px] text-xs text-muted-foreground sm:pl-0">Off</span>
                )}
              </div>

              <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="flex min-w-0 items-center gap-3">
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
                  <p className="text-sm font-medium text-foreground">Second reminder</p>
                </div>
                {state.reminders.twoHour ? (
                  <div className="pl-[52px] sm:pl-0">
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
                      ariaLabel="Second reminder send time"
                    />
                  </div>
                ) : (
                  <span className="pl-[52px] text-xs text-muted-foreground sm:pl-0">Off</span>
                )}
              </div>

              <div className="space-y-1.5 pt-3.5">
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
                    }))
                  }
                  className="min-h-[128px] rounded-(--radius-card) bg-white px-3 py-2"
                />
                <p className="text-xs text-muted-foreground">
                  {"{client_name}"}, {"{time}"}, and {"{date}"} are replaced automatically.
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="whatsapp"
            title="WhatsApp"
            description="Connect your clinic's WhatsApp to send appointment reminders and reply to clients from the Inbox."
            active={activeSection === "whatsapp"}
          >
            <div className="space-y-4">
              <div className="rounded-(--radius-card) border border-border/70 bg-[#fafbfd] p-3.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      whatsappPhase === "CONNECTED"
                        ? "bg-emerald-500"
                        : whatsappPhase === "STARTING"
                          ? "bg-amber-400"
                          : whatsappPhase === "NEEDS_SUPPORT"
                            ? "bg-amber-500"
                            : "bg-muted-foreground/35"
                    )}
                  />
                  {whatsappPhase === "NEEDS_SUPPORT" ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      {state.whatsapp.connection.statusLabel}
                    </span>
                  ) : (
                    <p className="text-sm font-semibold text-foreground">
                      {state.whatsapp.connection.statusLabel}
                    </p>
                  )}
                </div>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">
                  {whatsappPhase === "CONNECTED"
                    ? "Your clinic's WhatsApp is linked. Reminders and Inbox replies are active."
                    : whatsappPhase === "STARTING"
                      ? "Finishing the connection — this should only take a moment."
                      : whatsappPhase === "NEEDS_SUPPORT"
                        ? "We had trouble sending a recent WhatsApp message. This usually resolves on its own — reconnect below if it keeps happening, or contact support."
                        : "Link your clinic's WhatsApp by scanning a QR code with the clinic phone — no number setup needed."}
                </p>
              </div>

              {pairing?.qr ? (
                <div className="flex flex-col items-center gap-3 rounded-(--radius-card) border border-border/70 bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pairing.qr}
                    alt="WhatsApp pairing QR code"
                    width={200}
                    height={200}
                    className="rounded-lg"
                  />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">
                      Scan to connect
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      On the clinic phone, open WhatsApp → Settings → Linked
                      devices → Link a device, then scan this code.
                    </p>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                      <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                      Waiting for the scan…
                    </p>
                  </div>
                </div>
              ) : pairing ? (
                <div className="rounded-(--radius-card) border border-border/70 bg-white p-4 text-center text-sm text-muted-foreground">
                  Preparing your QR code…
                </div>
              ) : isConnected ? (
                <button
                  type="button"
                  onClick={() => handleConnectWhatsApp({ force: true })}
                  disabled={isConnecting}
                  className="text-xs font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-foreground disabled:opacity-60"
                >
                  {isConnecting ? "Starting…" : "Link a different device"}
                </button>
              ) : (
                <Button
                  className="h-10 w-full rounded-(--radius-card)"
                  onClick={() => handleConnectWhatsApp()}
                  disabled={isConnecting}
                >
                  {isConnecting
                    ? "Starting…"
                    : whatsappPhase === "NEEDS_SUPPORT"
                      ? "Reconnect WhatsApp"
                      : "Connect WhatsApp"}
                </Button>
              )}

              <ul className="space-y-2 border-t border-border/60 pt-3.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  Send appointment reminders to clients automatically.
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  Reply to incoming client messages from the Inbox.
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  Messages only ever include a name and appointment time — never clinical details.
                </li>
              </ul>
            </div>
          </SectionCard>

          <SectionCard
            id="billing"
            title="Billing"
            description="Your workspace plan and what's included."
            active={activeSection === "billing"}
          >
            <div className="space-y-4">
              <div className="rounded-(--radius-card) border border-border/70 bg-[#fafbfd] p-3.5">
                <div className="flex items-center gap-2.5">
                  <p className="text-lg font-semibold leading-6 text-foreground">
                    Vela {state.billing.planName}
                  </p>
                  <span className="rounded-full bg-primary/8 px-2 py-0.5 text-xs font-semibold text-primary">
                    {state.billing.statusLabel}
                  </span>
                </div>
                {state.billing.note ? (
                  <p className="mt-1.5 text-sm leading-5 text-muted-foreground">
                    {state.billing.note}
                  </p>
                ) : null}
              </div>

              {state.billing.lockedFeatures.length > 0 ? (
                <div className="space-y-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {state.billing.planName === "Pro" ? "Included in your plan" : "Unlock with Pro"}
                  </p>
                  <ul className="space-y-2">
                    {state.billing.lockedFeatures.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground">
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                          <Check className="size-3" />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 rounded-(--radius-card) border border-emerald-200/70 bg-emerald-50/60 px-3.5 py-2.5 text-sm text-emerald-700">
                  <Check className="mt-0.5 size-4 shrink-0" />
                  You&apos;re on Pro — every analytics and automation feature is included.
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3.5">
                <p className="text-sm text-muted-foreground">{state.billing.nextStep}</p>
                <Link
                  href={state.billing.checkoutHref}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "h-9 w-fit rounded-(--radius-card) bg-white"
                  )}
                >
                  {state.billing.ctaLabel}
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </SectionCard>
        </m.div>
      </div>
    </LazyMotionProvider>
  );

  if (inDialog) {
    return (
      <div className="dialog-scroll-body min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {content}
      </div>
    );
  }

  return (
    <WorkspacePage>
      <WorkspaceHeader
        title="Settings"
        description="Configure how the workspace runs."
      />
      {content}
    </WorkspacePage>
  );
}
