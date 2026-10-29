"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, Download, LoaderCircle } from "lucide-react";

import {
  cancelPlanAction,
  changeBillingPlanAction,
  endProTrialAction,
  getBillingDetailsAction,
  getBillingHistoryAction,
  keepProAction,
  resumePlanAction,
  saveBillingDetailsAction,
  startCardUpdateAction,
  startProTrialAction,
  type BillingActionResult,
  type BillingDetails,
} from "@/app/(workspace)/settings/billing-actions";
import { onPaddleEvent, usePaddle } from "@/components/billing/use-paddle";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { WorkspaceEmptyState } from "@/components/workspace/workspace-layout";
import type { BillingHistory } from "@/lib/billing-history";
import type { BillingSummary } from "@/lib/billing-summary";
import { cn } from "@/lib/utils";

type Plan = "BASIC" | "PRO";
type Interval = "MONTH" | "YEAR";
type Run = (action: () => Promise<BillingActionResult>, done: string, after?: () => void) => void;

const PLAN_NAME: Record<Plan, string> = { BASIC: "Basic", PRO: "Pro" };
const CARD_FRAME = "paddle-card-frame";
const smallButton = "h-8 rounded-(--radius-card)";

/**
 * Settings › Billing, all inside Vela: where the plan stands, switching plan or
 * billing period (confirmed with what it costs), the card and who invoices are
 * billed to, invoices, and cancelling or resuming. Paddle's own portal is never
 * needed (its receipt emails still link to it).
 */
export function BillingControls({
  billing,
  active,
  onChanged,
}: {
  billing: BillingSummary;
  /** Billing is the open section: only then is anything read from Paddle. */
  active: boolean;
  /** Reloads the popup's own copy of the plan, which router.refresh() doesn't reach. */
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "error" | "done"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [history, setHistory] = useState<BillingHistory | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyVersion, setHistoryVersion] = useState(0);
  const showHistory = billing.canManage && (billing.kind === "subscribed" || billing.kind === "locked");
  const fetchHistory = showHistory && active;
  const loadHistory = useCallback(() => setHistoryVersion((version) => version + 1), []);

  useEffect(() => {
    if (!fetchHistory) return;
    let cancelled = false;
    void getBillingHistoryAction().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setHistory(result.history);
        setHistoryError("");
      } else {
        setHistoryError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchHistory, historyVersion]);

  function run(action: () => Promise<BillingActionResult>, done: string, after?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setMessage({ tone: "done", text: done });
        after?.();
        router.refresh();
        await onChanged();
      } else {
        setMessage({ tone: "error", text: result.error });
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) bg-[#fafbfd] p-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <p className="text-lg font-semibold leading-6 text-foreground">Vela {billing.planName}</p>
            <span className="rounded-full bg-primary/8 px-2 py-0.5 text-xs font-semibold text-primary">{billing.statusLabel}</span>
          </div>
          {billing.note ? <p className="mt-1 text-sm text-muted-foreground">{billing.note}</p> : null}
        </div>
        {billing.kind === "needs_plan" || billing.kind === "locked" ? (
          <Link href="/checkout" className={cn(buttonVariants({ size: "sm" }), "h-9 rounded-(--radius-card)")}>
            {billing.kind === "locked" ? "Renew plan" : "Choose a plan"}
          </Link>
        ) : billing.canResume ? (
          <Button
            type="button"
            size="sm"
            onClick={() => run(resumePlanAction, "Your plan will renew as before.")}
            disabled={pending}
            className="h-9 rounded-(--radius-card)"
          >
            Resume plan
          </Button>
        ) : null}
      </div>

      {billing.proTrial ? <ProTrial billing={billing} pending={pending} run={run} /> : null}

      {billing.current && billing.changeOptions.length > 0 ? (
        // Keyed by the current plan: a finished switch starts the picker from the new one.
        <ChangePlan key={`${billing.current.plan}-${billing.current.interval}`} billing={billing} pending={pending} run={run} />
      ) : null}

      {billing.canUpdateCard && active ? (
        <Payment
          billing={billing}
          history={history}
          historyFailed={Boolean(historyError)}
          onCardUpdated={() => {
            setMessage({ tone: "done", text: "Card updated." });
            loadHistory();
            // Paddle can list the card change a moment after the form reports it done.
            window.setTimeout(loadHistory, 2500);
            router.refresh();
            void onChanged();
          }}
          onDetailsSaved={() => setMessage({ tone: "done", text: "Billing details saved." })}
        />
      ) : null}

      {showHistory ? <Invoices history={history} error={historyError} /> : null}

      {message ? (
        <p role="status" className={cn("text-sm", message.tone === "error" ? "text-destructive" : "text-emerald-700")}>
          {message.text}
        </p>
      ) : null}

      <CancelPlan billing={billing} pending={pending} run={run} />
    </div>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
      {action}
    </div>
  );
}

function ProTrial({ billing, pending, run }: { billing: BillingSummary; pending: boolean; run: Run }) {
  if (!billing.proTrial) return null;
  const offered = billing.proTrial.state === "offered";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) bg-primary/6 p-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">
          {offered ? "Try Pro free for 14 days" : `Pro trial until ${billing.proTrial.state === "active" ? billing.proTrial.endsOn : ""}`}
        </p>
        <p className="text-sm text-muted-foreground">
          {offered ? "Your plan and billing stay the same." : "Then back to Basic, unless you keep Pro."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {offered ? (
          <Button
            type="button"
            size="sm"
            onClick={() => run(startProTrialAction, "Your Pro trial has started.")}
            disabled={pending}
            className="h-9 rounded-(--radius-card)"
          >
            Start trial
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => run(keepProAction, "You're on Pro now.")}
              disabled={pending || !billing.canManage}
              className="h-9 rounded-(--radius-card)"
            >
              Keep Pro
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => run(endProTrialAction, "You're back on Basic.")}
              disabled={pending}
              className="h-9 rounded-(--radius-card)"
            >
              Back to Basic
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Basic or Pro, monthly or yearly; a different choice shows what it costs before it's confirmed. */
function ChangePlan({ billing, pending, run }: { billing: BillingSummary; pending: boolean; run: Run }) {
  const current = billing.current!;
  const [interval, setBillingInterval] = useState<Interval>(current.interval);
  const [plan, setPlan] = useState<Plan>(current.plan);
  const option = billing.changeOptions.find((item) => item.plan === plan && item.interval === interval) ?? null;

  return (
    <section className="space-y-2">
      <SectionTitle
        action={
          <div className="flex items-center gap-1">
            {(["MONTH", "YEAR"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={interval === value}
                onClick={() => setBillingInterval(value)}
                disabled={pending}
                className={cn(
                  "h-8 rounded-(--radius-tile) px-2.5 text-sm font-medium transition-[background-color,color,transform] duration-(--duration-base) ease-(--ease-out-quint) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:scale-[0.97]",
                  interval === value ? "bg-primary/8 text-primary" : "text-muted-foreground hover:bg-secondary"
                )}
              >
                {value === "MONTH" ? "Monthly" : "Yearly"}
              </button>
            ))}
          </div>
        }
      >
        Plan
      </SectionTitle>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Plan">
        {(["BASIC", "PRO"] as const).map((value) => {
          const selected = plan === value;
          const isCurrent = current.plan === value && current.interval === interval;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPlan(value)}
              disabled={pending}
              className={cn(
                "flex h-11 items-center gap-2.5 rounded-(--radius-card) border px-3 text-left transition-[border-color,background-color] duration-(--duration-base) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                selected ? "border-primary bg-primary/5" : "border-border bg-white hover:border-primary/40"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-full border",
                  selected ? "border-primary bg-primary text-white" : "border-border"
                )}
              >
                {selected ? <Check className="size-2.5" strokeWidth={3.5} /> : null}
              </span>
              <span className="text-sm font-semibold text-foreground">{PLAN_NAME[value]}</span>
              {isCurrent ? <span className="ml-auto text-xs text-muted-foreground">Current</span> : null}
            </button>
          );
        })}
      </div>

      {option ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) bg-[#fafbfd] px-3 py-2.5">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{option.effect}</p>
          <Button
            type="button"
            size="sm"
            onClick={() =>
              run(() => changeBillingPlanAction({ plan: option.plan, interval: option.interval }), `You're now on ${option.label}.`)
            }
            disabled={pending}
            className={smallButton}
          >
            Switch
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The card and who invoices are billed to, as two rows; either opens in place:
 * Paddle's embedded card form, or the billing details form.
 */
function Payment({
  billing,
  history,
  historyFailed,
  onCardUpdated,
  onDetailsSaved,
}: {
  billing: BillingSummary;
  history: BillingHistory | null;
  historyFailed: boolean;
  onCardUpdated: () => void;
  onDetailsSaved: () => void;
}) {
  const [open, setOpen] = useState<"card" | "details" | null>(null);
  const [details, setDetails] = useState<BillingDetails | null>(null);
  const [detailsError, setDetailsError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getBillingDetailsAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setDetails(result.details);
      else setDetailsError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const card = history?.card;
  const billedTo = details
    ? [details.companyName, details.city, countryName(details.countryCode)].filter(Boolean).join(", ")
    : detailsError;

  return (
    <section className="space-y-2">
      <SectionTitle>Payment</SectionTitle>
      <div className="rounded-(--radius-card) border border-border">
        <Row
          label="Card"
          value={card ? `${card.brand} ending ${card.last4} · ${card.expires}` : history || historyFailed ? "Card on file" : "Loading"}
          action={
            open === "card" ? null : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen("card")} className={smallButton}>
                Update
              </Button>
            )
          }
        />
        {open === "card" && billing.paddle ? (
          <CardUpdate
            paddle={billing.paddle}
            onDone={() => {
              setOpen(null);
              onCardUpdated();
            }}
            onCancel={() => setOpen(null)}
          />
        ) : null}
        <Row
          label="Billed to"
          value={billedTo || "Add company details"}
          muted={!billedTo || Boolean(detailsError)}
          action={
            open === "details" || !details ? null : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen("details")} className={smallButton}>
                Edit
              </Button>
            )
          }
        />
        {open === "details" && details ? (
          <DetailsForm
            details={details}
            onSaved={(saved) => {
              setDetails(saved);
              setOpen(null);
              onDetailsSaved();
            }}
            onCancel={() => setOpen(null)}
          />
        ) : null}
      </div>
    </section>
  );
}

function Row({ label, value, muted, action }: { label: string; value: string; muted?: boolean; action: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-3 py-1.5">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 flex-1 truncate text-right text-sm", muted ? "text-muted-foreground" : "text-foreground")}>
        {value}
      </span>
      {action}
    </div>
  );
}

function Invoices({ history, error }: { history: BillingHistory | null; error: string }) {
  const [showAll, setShowAll] = useState(false);
  const rows = history ? (showAll ? history.rows : history.rows.slice(0, 4)) : [];

  return (
    <section className="space-y-1">
      <SectionTitle>Invoices</SectionTitle>
      {error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : !history ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          Loading
        </p>
      ) : history.rows.length === 0 ? (
        <WorkspaceEmptyState compact title="No invoices yet" />
      ) : (
        <ul className="-mx-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex h-10 items-center gap-3 rounded-(--radius-tile) px-2 text-sm transition-colors hover:bg-secondary/60"
            >
              <span className="min-w-0 flex-1 truncate text-foreground">{row.date}</span>
              {row.status === "Paid" ? null : (
                <span className={cn("text-xs", row.status === "Payment failed" ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {row.status}
                </span>
              )}
              <span className="w-24 text-right font-medium tabular-nums text-foreground">{row.amount}</span>
              {/* Paddle has a PDF only for a completed charge: not a free trial's
                  zero-value one, nor a failed payment. The slot keeps amounts aligned. */}
              {row.status === "Paid" ? (
                <a
                  href={`/api/billing/invoices/${encodeURIComponent(row.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Download the invoice of ${row.date}`}
                  className="grid size-8 place-items-center rounded-(--radius-tile) text-muted-foreground transition-colors hover:bg-white hover:text-foreground"
                >
                  <Download className="size-3.5" aria-hidden />
                </a>
              ) : (
                <span className="size-8" aria-hidden />
              )}
            </li>
          ))}
        </ul>
      )}
      {history && history.rows.length > 4 && !showAll ? (
        <button type="button" onClick={() => setShowAll(true)} className="text-sm font-medium text-primary hover:underline">
          Show all {history.rows.length}
        </button>
      ) : null}
    </section>
  );
}

/** Paddle's card form, embedded under the card row, for the subscription's card-update transaction. */
function CardUpdate({
  paddle: paddleConfig,
  onDone,
  onCancel,
}: {
  paddle: NonNullable<BillingSummary["paddle"]>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { paddle, failed } = usePaddle(paddleConfig);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(
    () =>
      onPaddleEvent((event) => {
        if (event.name === "checkout.loaded") setLoaded(true);
        if (event.name === "checkout.completed") onDone();
      }),
    [onDone]
  );

  useEffect(() => {
    if (!paddle) return;
    let cancelled = false;
    void startCardUpdateAction().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      paddle.Checkout.open({
        transactionId: result.transactionId,
        settings: {
          displayMode: "inline",
          frameTarget: CARD_FRAME,
          frameInitialHeight: 450,
          frameStyle: "width: 100%; min-width: 280px; background-color: transparent; border: none;",
          variant: "one-page",
          allowLogout: false,
          theme: "light",
          locale: "en",
        },
      });
    });
    return () => {
      cancelled = true;
      window.Paddle?.Checkout.close();
    };
  }, [paddle]);

  return (
    <div className="px-3 pb-3">
      {failed || error ? (
        <p role="alert" className="py-2 text-sm text-destructive">
          {error || "The card form didn't load. Turn off any content blocker for this page, then try again."}
        </p>
      ) : (
        <div className="relative min-h-[450px]">
          {loaded ? null : (
            <p className="absolute inset-x-0 top-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              Opening the card form
            </p>
          )}
          <div className={CARD_FRAME} />
        </div>
      )}
      <button type="button" onClick={onCancel} className="text-sm font-medium text-muted-foreground hover:text-foreground">
        Cancel
      </button>
    </div>
  );
}

const DETAIL_FIELDS: Array<{ key: keyof Omit<BillingDetails, "countryCode">; label: string; autoComplete: string; wide?: boolean }> = [
  { key: "companyName", label: "Company name", autoComplete: "organization" },
  { key: "taxNumber", label: "VAT number", autoComplete: "off" },
  { key: "street", label: "Street address", autoComplete: "street-address", wide: true },
  { key: "city", label: "City", autoComplete: "address-level2" },
  { key: "postalCode", label: "Postal code", autoComplete: "postal-code" },
];

function countryName(code: string): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Company, VAT number and address for invoices, saved on the Paddle subscription.
 * The country isn't edited here: it sets the tax, so a change goes through support.
 */
function DetailsForm({
  details,
  onSaved,
  onCancel,
}: {
  details: BillingDetails;
  onSaved: (saved: BillingDetails) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(details);
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();

  function save() {
    setError("");
    startSaving(async () => {
      const result = await saveBillingDetailsAction(draft);
      if (result.ok) {
        // As the server stored them.
        const trimmed = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]));
        onSaved(trimmed as BillingDetails);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-3 px-3 pb-3 pt-1">
      <div className="grid gap-3 sm:grid-cols-2">
        {DETAIL_FIELDS.map((field) => (
          <label key={field.key} htmlFor={`billing-${field.key}`} className={cn("space-y-1.5", field.wide ? "sm:col-span-2" : "")}>
            <span className="text-sm font-medium text-foreground">{field.label}</span>
            <Input
              id={`billing-${field.key}`}
              value={draft[field.key]}
              onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
              autoComplete={field.autoComplete}
              disabled={saving}
              className="h-9"
            />
          </label>
        ))}
      </div>
      {details.countryCode ? (
        <p className="text-xs text-muted-foreground">Country: {countryName(details.countryCode)}. Write to us to change it.</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={saving} className="h-9 rounded-(--radius-card)">
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving} className="h-9 rounded-(--radius-card)">
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Cancelling: confirmed first, and nothing changes until the period ends. */
function CancelPlan({ billing, pending, run }: { billing: BillingSummary; pending: boolean; run: Run }) {
  const [confirming, setConfirming] = useState(false);
  if (!billing.canCancel) return null;

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-destructive"
      >
        Cancel plan
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) bg-[#fafbfd] p-3.5">
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        Everything keeps working until this period ends, then the workspace becomes read-only. You can resume before then.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => run(cancelPlanAction, "Your plan is set to end.", () => setConfirming(false))}
          disabled={pending}
          className="h-9 rounded-(--radius-card)"
        >
          Cancel plan
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="h-9 rounded-(--radius-card)"
        >
          Keep it
        </Button>
      </div>
    </div>
  );
}
