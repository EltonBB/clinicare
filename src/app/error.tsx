"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";

/**
 * A crash on a public, auth or onboarding page. Kept standalone (brand mark,
 * one message, two ways on) rather than inside the marketing shell, since the
 * shell itself may be what failed.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Report to Sentry (scrubbed in beforeSend). Route error boundaries catch
    // client render errors before they reach global-error.tsx, so without this
    // those failures would never be seen.
    Sentry.captureException(error);
    console.error("Unhandled route error", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col bg-white px-5 py-6 sm:px-10 sm:py-8">
      <BrandMark href="/" includeSubtitle={false} />
      <div className="flex flex-1 items-center">
        <div className="mx-auto w-full max-w-xl">
          <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--brand-ink)]">
            Something went wrong <span className="text-muted-foreground">on our side.</span>
          </h1>
          <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
            Please try again. If it keeps happening, contact support and we&apos;ll look into it.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-12 items-center gap-2 rounded-(--radius-field) bg-[var(--brand-ink)] px-6 text-[15px] font-semibold text-white transition-[background-color,transform] duration-(--duration-base) ease-out-quint hover:bg-[var(--brand-ink)]/90 active:scale-[0.97]"
            >
              <RotateCcw className="size-4" />
              Try again
            </button>
            <Link href="/" className="text-sm font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-[var(--brand-ink)]">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
