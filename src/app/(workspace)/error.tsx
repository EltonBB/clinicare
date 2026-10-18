"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** A page inside the workspace failed to render; the app shell around it stays usable. */
export default function WorkspaceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Report to Sentry (scrubbed in beforeSend) and surface in platform logs
    // without exposing details to the user. This boundary catches client render
    // errors before they reach global-error.tsx, so it must report too.
    Sentry.captureException(error);
    console.error("Workspace route error", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-foreground">This page didn&apos;t load</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Please try again. If it keeps happening, contact support.
        </p>
        <div className="mt-5 flex items-center justify-center gap-4">
          <Button size="sm" className="rounded-(--radius-tile)" onClick={() => retry()}>
            Try again
          </Button>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-foreground"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
