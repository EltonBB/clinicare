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
- 2026-06-19 · workflow · Owner correction: on a reviewer-flagged security bug, fix the CLASS, not the flagged line — grep for parallel/duplicate handlers (a CLIENT twin re-introduced the same auth-intent flaw the server fix missed) and audit the privileged sink BEFORE pushing. Reactive one-line patches just feed the review loop (took 3 rounds before a full audit). [promotion candidate → CLAUDE.md rule]
