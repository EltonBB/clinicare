"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { SendHorizontal } from "lucide-react";

import { markStaffThreadReadAction, sendStaffMessageAction } from "@/app/(workspace)/staff/actions";
import { Button } from "@/components/ui/button";
import { cn, firstDisplayName } from "@/lib/utils";
import type { AdminThreadMessage, AdminThreadView } from "@/lib/mobile/admin-inbox";

type StaffMessagesTabProps = {
  staffId: string;
  staffName: string;
  initial: AdminThreadView;
  onUnreadCountChange: (count: number) => void;
};

export function StaffMessagesTab({ staffId, staffName, initial, onUnreadCountChange }: StaffMessagesTabProps) {
  const [messages, setMessages] = useState<AdminThreadMessage[]>(initial.messages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [unreadCount, setUnreadCount] = useState(initial.unreadForAdmin);
  const [isPending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const receiptVersion = useRef(0);

  useEffect(() => {
    // Acknowledge the rendered snapshot; a later arrival must stay unread.
    let active = true;
    const version = ++receiptVersion.current;
    void markStaffThreadReadAction(staffId, initial.messages.map((message) => message.id)).then((result) => {
      if (!active || receiptVersion.current !== version) return;
      if (result.ok && result.unreadCount !== undefined) {
        setUnreadCount(result.unreadCount);
        onUnreadCountChange(result.unreadCount);
      } else setError(result.error ?? "Could not update read status. Reopen messages to retry.");
    }).catch(() => {
      if (active && receiptVersion.current === version) setError("Could not update read status. Reopen messages to retry.");
    });
    return () => {
      active = false;
      // A delayed Mark all response must not update the parent after tab removal.
      ++receiptVersion.current;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function markAllRead() {
    const version = ++receiptVersion.current;
    setError("");
    startTransition(async () => {
      try {
        const result = await markStaffThreadReadAction(staffId);
        if (receiptVersion.current !== version) return;
        if (!result.ok || result.unreadCount === undefined) {
          setError(result.error ?? "Could not update read status. Please try again.");
          return;
        }
        setUnreadCount(result.unreadCount);
        onUnreadCountChange(result.unreadCount);
      } catch {
        if (receiptVersion.current === version) setError("Could not update read status. Please try again.");
      }
    });
  }

  function send() {
    const body = draft.trim();
    if (!body || isPending) return;
    setError("");
    setDraft("");
    const optimistic: AdminThreadMessage = {
      id: `local-${Date.now()}`,
      mine: true,
      system: false,
      body,
      timeLabel: "now",
      dayLabel: "Today",
    };
    setMessages((prev) => [...prev, optimistic]);
    startTransition(async () => {
      const result = await sendStaffMessageAction(staffId, body);
      if (!result.ok) {
        setError(result.error ?? "We couldn't send your message.");
        setMessages((prev) => prev.filter((message) => message.id !== optimistic.id));
        setDraft(body);
      }
    });
  }

  return (
    <section className="surface-card flex h-[540px] flex-col p-0">
      <div className="shrink-0 border-b border-border/70 px-4 py-3">
        <h2 className="text-[15px] font-semibold leading-5 text-foreground">
          Messages with {staffName}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Private chat with this staff member in the Vela Staff app
        </p>
        {unreadCount > 0 ? (
          <Button variant="ghost" size="sm" className="mt-1 h-8" disabled={isPending} onClick={markAllRead}>
            Mark all read
          </Button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="m-auto max-w-xs text-center text-sm text-muted-foreground">
            No messages yet. Send {firstDisplayName(staffName)} a message — it appears in their Vela
            Staff app.
          </p>
        ) : (
          messages.map((message) =>
            message.system ? (
              <p key={message.id} className="my-1 text-center text-xs text-muted-foreground">
                {message.body}
              </p>
            ) : (
              <div
                key={message.id}
                className={cn("flex flex-col", message.mine ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "max-w-[82%] rounded-2xl px-3.5 py-2 text-sm leading-5",
                    message.mine
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md border border-border bg-white text-foreground"
                  )}
                >
                  {message.body}
                </div>
                <span className="mt-1 px-1 text-[11px] text-muted-foreground tabular-nums">
                  {message.timeLabel}
                </span>
              </div>
            )
          )
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-border/70 p-3">
        {error ? <p className="mb-2 px-1 text-xs font-medium text-destructive">{error}</p> : null}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Write a message…"
            className="max-h-28 min-h-10 flex-1 resize-none rounded-(--radius-card) border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <Button size="sm" onClick={send} disabled={isPending || !draft.trim()} className="h-10">
            <SendHorizontal className="size-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
