# Friction log

> Tier-1 scratch for the capability advisor (see CLAUDE.md). One line per **real,
> behavior-changing** friction noticed at task wrap-up — workflow, the owner's
> prompting, code structure, or token waste. Most tasks add nothing; silence is
> correct. When the same line recurs ~2–3×, I suggest promoting it to a `feedback`
> memory or a CLAUDE.md rule — that promotion waits for the owner's green light.

Format: `YYYY-MM-DD · <category> · <one line> [×N]`
Categories: `workflow` · `prompt` · `code` · `tokens`

---

- 2026-06-19 · workflow · Screenshot tool times out on continuous-WebGL pages (hero orb / mesh-drift) — verify those structurally (DOM / preview_eval); screenshot only non-WebGL pages.
- 2026-06-19 · workflow · Turbopack serves stale CSS/routes after edits — stop dev server, `rm -rf .next`, restart.
- 2026-06-19 · workflow · Media-query-gated UI (`prefers-reduced-motion` / `pointer: coarse`) can't be emulated via preview tools — verify the default path + the conditional's logic, hand the gated branch to the owner's OS toggle / a real phone.
- 2026-06-19 · workflow · `preview_screenshot` scales wide/desktop split-screens down too far to judge proportions — confirm layout with `getBoundingClientRect` / computed `gridTemplateColumns`, not by eyeballing the image.
- 2026-06-19 · workflow · Auth/signup failures show only the app's generic masked error — debug via Supabase MCP `get_logs(auth)` to see the real GoTrue cause (this one: SMTP `550` "Error sending confirmation email", i.e. a dashboard SMTP config issue, not a code bug).
- 2026-06-19 · workflow · This repo's Codex reviewer auto-reviews on PR open — wait for its pass before declaring "ready to merge". It caught a P1 (auth account-takeover) my own multi-agent pre-merge review missed.
- 2026-06-19 · code · Auth-callback review heuristic: `verifyOtp`/`exchangeCodeForSession` mint a session for ANY OTP type, so a caller-controlled redirect param can steer a signup link into the password-reset flow → takeover. Check session-minting + redirect-target together; open-redirect-to-`next` is not the only risk.
- 2026-06-21 · code · SSR-safe client-only flags in marketing go through `useSyncExternalStore` (server snapshot `false`), like the `useMediaQuery` helper in smooth-scroll-provider — the naive `useEffect`+`setState` trips the `react-hooks/set-state-in-effect` lint rule. Used it for the new WebGL-availability probe.
- 2026-06-21 · code · Any R3F `<Canvas>` mount must be gated on a WebGL feature-probe AND wrapped in an error boundary — Three.js throws "Error creating WebGL context" (uncaught → Sentry) when the GPU process is unavailable (hardware accel off / blocklisted). reduced-motion + coarse-pointer guards don't cover this.
- 2026-06-19 · workflow · Owner correction: on a reviewer-flagged security bug, fix the CLASS, not the flagged line — grep for parallel/duplicate handlers (a CLIENT twin re-introduced the same auth-intent flaw the server fix missed) and audit the privileged sink BEFORE pushing. Reactive one-line patches just feed the review loop (took 3 rounds before a full audit). [promotion candidate → CLAUDE.md rule]
- 2026-06-23 · workflow · To QA auth-gated client UI (onboarding, etc.) without logging in, drop a throwaway `src/app/<name>/page.tsx` harness that renders the component with mock initialState (+ a temporary `previewMode` prop to advance steps locally past the auth-gated server action), screenshot via Playwright→localhost (file:// is blocked), then STRIP the route + previewMode before commit. Two gotchas: a `__`-prefixed route folder is a private (non-routable → 404) Next folder; and after deleting a route you must `rm -rf .next` or the build fails on stale generated `.next/types` referencing the gone page.
- 2026-06-23 · workflow · Audit-and-fix loop: land the verification baseline (tests) FIRST, not mid-loop. I added Vitest in iteration 2; the parity-critical fixes (atomic appointment save, payment ledger, reports aggregation) all wanted characterization tests to exist before touching them. On a no-test-suite repo, "establish a test baseline" is genuinely finding #1 — do it before the risky fixes, not after. Also: the owner's "4/10" self-estimate was pessimistic — the audit found tenant isolation/auth were uniformly correct (no IDOR/injection); the real debt was scaling cliffs (unbounded queries, JS aggregation) + no tests + a few money/tz bugs. Audit before believing a severity estimate.
- 2026-06-23 · code · Ambient animated backgrounds (parallax orbs) perf checklist: cache `innerWidth/innerHeight` outside the `pointermove` handler (per-event layout read otherwise), gate the listener on coarse pointer + reduced-motion, and don't stack `backdrop-blur` cards under big `blur-3xl` orbs (the backdrop re-sample is the real per-frame cost). Put the CSS drift animation and the framer `x/y` parallax on DIFFERENT elements (wrapper vs inner) so the transforms don't fight.
