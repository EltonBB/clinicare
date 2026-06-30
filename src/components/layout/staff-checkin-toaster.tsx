"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserRoundCheck, X } from "lucide-react";

import { getRecentStaffCheckInsAction, type RecentCheckIn } from "@/app/(workspace)/staff/actions";

const POLL_MS = 25_000;
const DISMISS_MS = 9_000;

/**
 * Mounted in the workspace shell. Polls for staff who checked in from the mobile
 * app and pops a toast so the admin can verify the staff member is present. On
 * first load it baselines the existing check-ins (no toast); only NEW check-ins
 * after that pop.
 */
export function StaffCheckInToaster() {
  const [toasts, setToasts] = useState<RecentCheckIn[]>([]);
  // null until the first poll establishes the baseline of already-present entries.
  const seen = useRef<Set<string> | null>(null);

  const poll = useCallback(async () => {
    let recent: RecentCheckIn[];
    try {
      recent = await getRecentStaffCheckInsAction();
    } catch {
      return;
    }

    if (seen.current === null) {
      seen.current = new Set(recent.map((entry) => entry.entryId));
      return;
    }

    const fresh = recent.filter((entry) => !seen.current!.has(entry.entryId));
    if (fresh.length === 0) {
      return;
    }
    fresh.forEach((entry) => seen.current!.add(entry.entryId));
    setToasts((prev) => [...fresh, ...prev].slice(0, 4));
    fresh.forEach((entry) => {
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.entryId !== entry.entryId));
      }, DISMISS_MS);
    });
  }, []);

  useEffect(() => {
    void poll();
    const interval = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex w-80 max-w-[calc(100vw-2.5rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.entryId}
          className="surface-card flex items-center gap-3 p-3 shadow-lg ring-1 ring-emerald-200"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-tile) bg-emerald-50 text-emerald-600">
            <UserRoundCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {toast.staffName} checked in
            </p>
            <p className="text-xs text-muted-foreground">Checked in at {toast.atLabel}</p>
          </div>
          <Link
            href={`/staff/${toast.staffId}`}
            className="shrink-0 rounded-(--radius-tile) bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            Verify
          </Link>
          <button
            type="button"
            onClick={() => setToasts((prev) => prev.filter((t) => t.entryId !== toast.entryId))}
            aria-label="Dismiss"
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
