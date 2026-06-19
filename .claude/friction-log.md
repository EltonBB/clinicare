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
