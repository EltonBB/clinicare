"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Catches errors in the root layout / React render that the route-level
// error.tsx boundaries can't reach, and reports them to Sentry. It replaces
// the root layout, so none of the app's CSS is loaded here: the page carries
// its own inline styles (brand ink and white, system font).
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      {/* The root layout's metadata is gone on this path, so the tab title is set here. */}
      <head>
        <title>Something went wrong | Vela</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#ffffff",
          color: "#14152f",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <main style={{ maxWidth: 440 }}>
          <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.1, fontWeight: 600, letterSpacing: "-0.02em" }}>
            Vela couldn&apos;t load.
          </h1>
          <p style={{ margin: "16px 0 0", fontSize: 15, lineHeight: 1.7, color: "#5b6980" }}>
            Please try again. If it keeps happening, contact support and we&apos;ll look into it.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 28,
              height: 44,
              padding: "0 22px",
              border: 0,
              borderRadius: 8,
              background: "#14152f",
              color: "#ffffff",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
