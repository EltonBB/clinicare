"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to Sentry (scrubbed in beforeSend). Route error boundaries catch
    // client render errors before they reach global-error.tsx, so without this
    // those failures would never be seen.
    Sentry.captureException(error);
    console.error("Unhandled route error", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-(--radius-card) border border-border/80 bg-white px-6 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
          <TriangleAlert className="size-5" />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            We hit an unexpected problem. Please try again — if it keeps happening,
            contact support.
          </p>
        </div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
