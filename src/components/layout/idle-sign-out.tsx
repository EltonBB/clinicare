"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { LockKeyhole } from "lucide-react";

import { idleLogoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/client";
import { plural } from "@/i18n/format";
import { idleState, LAST_ACTIVITY_KEY, secondsLeft, startingActivity } from "@/lib/idle";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
// Ordinary activity writes the shared timestamp at most this often.
const WRITE_EVERY_MS = 5_000;
// A sign-out that failed (offline) is tried again this often.
const RETRY_MS = 5_000;

function readShared(): number {
  try {
    return Number(window.localStorage.getItem(LAST_ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(at: number) {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // Private mode or blocked storage: this tab still times itself out.
  }
}

/**
 * Signs the owner out after 30 minutes without activity in any open
 * workspace tab, with a one-minute warning first. Activity in one tab keeps
 * the others signed in (the timestamp is shared through localStorage), and a
 * computer that slept past the limit signs out on wake. A tab reopened on a
 * session that already ran out signs out at once instead of starting over,
 * and an expired workspace stays locked until the sign-out goes through.
 */
export function IdleSignOut({ signedInAt }: { signedInAt: number }) {
  const { locale, m } = useI18n();
  const t = m.shell.idle;
  const lastActivity = useRef(0);
  const lastWrite = useRef(0);
  // What the dialog renders from: the time of the last check and the activity it saw.
  const [clock, setClock] = useState({ now: 0, last: 0 });
  const [isPending, startTransition] = useTransition();
  const signingOut = useRef(false);
  const retryAt = useRef(0);
  const expired = useRef(false);

  const markActive = useCallback((force = false) => {
    // Past the limit, activity no longer counts: only signing out ends it.
    if (expired.current) return;
    const at = Date.now();
    lastActivity.current = at;
    if (force || at - lastWrite.current >= WRITE_EVERY_MS) {
      lastWrite.current = at;
      writeShared(at);
    }
    // A deliberate "stay" closes the warning now, not on the next tick.
    if (force) setClock({ now: at, last: at });
  }, []);

  const signOut = useCallback(() => {
    if (signingOut.current || Date.now() < retryAt.current) return;
    signingOut.current = true;
    startTransition(async () => {
      try {
        await idleLogoutAction();
      } catch {
        // Offline or the request failed: stay locked and try again shortly.
        signingOut.current = false;
        retryAt.current = Date.now() + RETRY_MS;
      }
    });
  }, []);

  useEffect(() => {
    const start = Date.now();
    lastActivity.current = startingActivity(start, readShared(), signedInAt);
    if (lastActivity.current === start) writeShared(start);
    const onActivity = () => markActive();
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, { passive: true });
    const tick = () => {
      const current = Date.now();
      lastActivity.current = Math.max(lastActivity.current, readShared());
      setClock({ now: current, last: lastActivity.current });
      if (idleState(current, lastActivity.current) === "expired") {
        expired.current = true;
        signOut();
      }
    };
    const timer = window.setInterval(tick, 1_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [markActive, signOut, signedInAt]);

  const state = clock.now ? idleState(clock.now, clock.last) : "active";

  return (
    <Dialog open={state !== "active"} onOpenChange={(open) => (open || state === "expired" ? undefined : markActive(true))}>
      <DialogContent className="max-w-sm p-5">
        <DialogHeader className="gap-2">
          <span className="flex size-9 items-center justify-center rounded-(--radius-tile) bg-primary/10 text-primary">
            <LockKeyhole className="size-4" />
          </span>
          <DialogTitle className="text-base font-semibold text-foreground">{t.title}</DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {plural(t.body, secondsLeft(clock.now, clock.last), locale)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={signOut} disabled={isPending} className="rounded-(--radius-tile)">
            {t.signOut}
          </Button>
          {state === "expired" ? null : (
            <Button type="button" onClick={() => markActive(true)} disabled={isPending} className="rounded-(--radius-tile)">
              {t.stay}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
