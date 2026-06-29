"use client";

import { useEffect, useState } from "react";

import { whenHeroReady } from "./hero-ready-signal";

// A brief, intentional brand moment so the splash never sub-perceptually flashes
// on a warm load, capped by a hard ceiling so the page always reveals even if
// the hero never signals ready (WebGL error, stalled chunk).
const MIN_VISIBLE_MS = 450;
const MAX_VISIBLE_MS = 2800;
const FADE_MS = 520;

// Show the splash only on a genuine first document load. Client-side returns to
// "/" are not server-rendered, so a splash there would be a pure flash — and the
// assets are already cached, so there is nothing to wait for. This module flag
// flips false after the first mount this session.
let firstLoad = true;

/**
 * First-paint splash over the landing hero. Rendered in the SSR HTML so the
 * dark brand background + Vela mark paint instantly, masking the 3D hero logo
 * while its lazy WebGL chunk loads. Lifts as soon as the hero is visually final
 * (see hero-ready-signal). Home page only.
 */
export function LandingLoader() {
  // `active` is read once, matching the server render (true) so hydration agrees;
  // on later client navigations a fresh instance reads firstLoad=false → null.
  const [active] = useState(() => firstLoad);
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active) return;
    firstLoad = false;

    const mountedAt = performance.now();
    let dismissed = false;
    let leaveTimer = 0;
    let removeTimer = 0;

    const beginLeave = () => {
      if (dismissed) return;
      dismissed = true;
      // Monotonic clock so an NTP/wall-clock jump can't skew the minimum.
      const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - mountedAt));
      leaveTimer = window.setTimeout(() => {
        setLeaving(true);
        removeTimer = window.setTimeout(() => setDone(true), FADE_MS);
      }, wait);
    };

    const unsubscribe = whenHeroReady(beginLeave);
    const ceiling = window.setTimeout(beginLeave, MAX_VISIBLE_MS);

    return () => {
      unsubscribe();
      window.clearTimeout(ceiling);
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
    };
  }, [active]);

  if (!active || done) return null;

  return (
    <div className="vela-landing-loader" data-leaving={leaving ? "" : undefined} aria-hidden="true">
      {/* Same living background as the hero so the reveal is a seamless continuation. */}
      <div className="vela-mesh absolute inset-0" />
      <div className="vela-grid-texture absolute inset-0 opacity-40" />

      <div className="vela-landing-loader__inner">
        <div className="vela-landing-loader__mark">
          {/* Inlined from public/brand/vela-icon.svg — no extra request, paints with the HTML. */}
          <svg viewBox="0 0 612 612" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Vela">
            <defs>
              <linearGradient
                id="vela-loader-grad"
                x1="249.28"
                y1="234.46"
                x2="431.79"
                y2="450.65"
                gradientUnits="userSpaceOnUse"
              >
                {/* Bright sky→white (matches the hero headline) so the mark reads
                    clearly on the dark mesh instead of sinking into the cobalt. */}
                <stop offset="0" stopColor="#9ec3ff" />
                <stop offset="0.62" stopColor="#ffffff" />
              </linearGradient>
            </defs>
            <path
              fill="url(#vela-loader-grad)"
              d="M257.43,309.34c-2.53,15.34,6.46,25.34,19.6,31.79,5.84,2.87,11.73,4.88,17.97,6.82,19.28,6,37.58,14.14,48.88,31.63,7.55,11.69,11.4,25.34,11.14,39.27-.15,8.22-2.85,15.72-8.17,21.85-5.69,6.55-13.68,11.06-22.55,11.06h-34.09c-15.3,0-29.42-14.88-29.46-30.19l-.18-60.93c-.02-6.41-5.27-10.54-11.41-10.56l-54.17-.12c-17.01-.04-30.32-15.08-30.36-31.7l-.08-31.43c-.5-17.38,12.62-32.92,30.47-33.43l55.66-.29c5.33-.03,9.83-4.62,9.85-9.77l.24-53.69c.07-15.67,13.43-28.85,28.99-29.34l32.27-.05c15.43-.02,28.73,12.71,29.39,28.41l.3,54.05c.03,5.19,3.86,10.32,9.47,10.35l55.7.31c15.74.09,29.48,13.38,30.36,29.16l.22,34.95c.11,16.69-12.86,31.72-29.84,32.43l-40.66.13c-16.96.05-31.18-15.39-31.18-33.05v-99.53s0-.72,0-.72c0-.14-.37.37-.43.5-5.64,12.56-17.53,23.39-28.91,31.14-6.3,4.29-12.63,7.71-19.36,11.26-8.87,4.68-16.97,10.26-23.7,17.68-8.26,9.11-13.94,19.94-15.94,32.03Z"
            />
          </svg>
        </div>
        <div className="vela-landing-loader__bar" />
      </div>

      {/* Without JS the splash can't dismiss itself — reveal the page immediately. */}
      <noscript
        dangerouslySetInnerHTML={{ __html: "<style>.vela-landing-loader{display:none!important}</style>" }}
      />
    </div>
  );
}
