"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
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
      <div className="flex max-w-md flex-col items-center gap-4 rounded-(--radius-card) border border-border/80 bg-white px-6 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
          <TriangleAlert className="size-5" />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We hit an unexpected problem loading this page. Please try again — if it
            keeps happening, contact support.
          </p>
        </div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
