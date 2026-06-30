"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, UserRoundCheck, X } from "lucide-react";

import {
  getRecentStaffCheckInsAction,
  getRecentStaffMessagesAction,
} from "@/app/(workspace)/staff/actions";

const POLL_MS = 25_000;
const DISMISS_MS = 9_000;

type Toast = {
  id: string;
  kind: "checkin" | "message";
  staffId: string;
  staffName: string;
  atLabel: string;
};

/**
 * Mounted in the workspace shell. Polls for two real-time signals from the mobile
 * app and pops a toast for the dashboard operator (the receptionist running it):
 *
 *  - a staff member checking in (verify they're present), and
 *  - a staff member sending a message (a doctor needs a reply).
 *
 * Each stream baselines on first load (no toast for what already happened); only
 * NEW events after that pop. One bottom-right stack for both. Generic copy only —
 * no message body (the operator opens the staff page to read/act).
 */
export function WorkspaceToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // null until the first poll establishes each stream's baseline.
  const seenCheckins = useRef<Set<string> | null>(null);
  const seenMessages = useRef<Set<string> | null>(null);

  const pushFresh = useCallback((fresh: Toast[]) => {
    if (fresh.length === 0) {
      return;
    }
    setToasts((prev) => [...fresh, ...prev].slice(0, 4));
    fresh.forEach((toast) => {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, DISMISS_MS);
    });
  }, []);

  const poll = useCallback(async () => {
    try {
      const recent = await getRecentStaffCheckInsAction();
      if (seenCheckins.current === null) {
        seenCheckins.current = new Set(recent.map((entry) => entry.entryId));
      } else {
        const fresh = recent.filter((entry) => !seenCheckins.current!.has(entry.entryId));
        fresh.forEach((entry) => seenCheckins.current!.add(entry.entryId));
        pushFresh(
          fresh.map((entry) => ({
            id: `checkin:${entry.entryId}`,
            kind: "checkin" as const,
            staffId: entry.staffId,
            staffName: entry.staffName,
            atLabel: entry.atLabel,
          }))
        );
      }
    } catch {
      // ignore a failed poll — the next tick retries
    }

    try {
      const recent = await getRecentStaffMessagesAction();
      if (seenMessages.current === null) {
        seenMessages.current = new Set(recent.map((message) => message.messageId));
      } else {
        const fresh = recent.filter((message) => !seenMessages.current!.has(message.messageId));
        fresh.forEach((message) => seenMessages.current!.add(message.messageId));
        pushFresh(
          fresh.map((message) => ({
            id: `message:${message.messageId}`,
            kind: "message" as const,
            staffId: message.staffId,
            staffName: message.staffName,
            atLabel: message.atLabel,
          }))
        );
      }
    } catch {
      // ignore a failed poll — the next tick retries
    }
  }, [pushFresh]);

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
      {toasts.map((toast) => {
        const isCheckin = toast.kind === "checkin";
        return (
          <div
            key={toast.id}
            className={`surface-card flex items-center gap-3 p-3 shadow-lg ring-1 ${
              isCheckin ? "ring-emerald-200" : "ring-primary/25"
            }`}
          >
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-(--radius-tile) ${
                isCheckin ? "bg-emerald-50 text-emerald-600" : "bg-primary/10 text-primary"
              }`}
            >
              {isCheckin ? (
                <UserRoundCheck className="size-5" />
              ) : (
                <MessageSquare className="size-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {isCheckin
                  ? `${toast.staffName} checked in`
                  : `${toast.staffName} sent a message`}
              </p>
              <p className="text-xs text-muted-foreground">
                {isCheckin ? `Checked in at ${toast.atLabel}` : `Sent at ${toast.atLabel}`}
              </p>
            </div>
            <Link
              href={`/staff/${toast.staffId}`}
              className="shrink-0 rounded-(--radius-tile) bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
            >
              {isCheckin ? "Verify" : "Reply"}
            </Link>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              aria-label="Dismiss"
              className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
