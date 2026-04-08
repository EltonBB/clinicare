"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type EmailVerificationWatcherProps = {
  ticket: string;
};

export function EmailVerificationWatcher({
  ticket,
}: EmailVerificationWatcherProps) {
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (!ticket || hasRedirected.current) {
      return;
    }

    const interval = window.setInterval(async () => {
      const response = await fetch(
        `/api/auth/email-verification-status?ticket=${encodeURIComponent(ticket)}`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { verified?: boolean };

      if (!payload.verified || hasRedirected.current) {
        return;
      }

      hasRedirected.current = true;
      router.replace("/login?verified=1");
    }, 2500);

    return () => window.clearInterval(interval);
  }, [router, ticket]);

  return null;
}
