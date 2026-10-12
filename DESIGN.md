# Design

> Visual system for the Vela clinic operating system. Captured from the live token set
> (`src/app/globals.css`) and motion vocabulary (`src/lib/motion.ts`). The workspace is the
> calm/operational register; marketing surfaces may run bolder variants of the same brand.

## Theme

Calm, premium, light clinical SaaS. Soft blue-gray canvas, white floating cards with hairline
borders and barely-there shadows, one confident (but muted, 2026-09-16) indigo-blue accent. The
feeling is an organized desk under even daylight — never dark "because tools look cool," never
decorative. Depth comes from elevation and spacing, not from color washes. Corners run tighter
than a typical SaaS (squared up 2026-09-16) so chrome reads as structured rather than pill-soft.
Identity tiles are **flat white bordered squares**, never gradient-filled blue chips (those were
deliberately removed) — borders otherwise appear only where they carry real structure (a card's
own outline, a table/calendar grid, a form control, an alert) and are omitted everywhere a
background tint already does the grouping.

## Color

OKLCH-friendly hex tokens. Single saturated brand color on a tinted-neutral canvas — a
**restrained** strategy (accent ≤ ~10% of any surface).

### Brand

| Token | Value | Use |
| --- | --- | --- |
| `--primary` (workspace) | `#3142D8` | Muted indigo-blue (2026-09-16 owner decision). Primary actions, active nav, key data series, focus rings — everywhere inside the authenticated workspace. |
| `--brand-start` / `--primary` (CSS `:root` default) | `#0A22FF` | The original vivid cobalt. Still the `:root` fallback and marketing's own accent — marketing/auth pages are never wrapped by the workspace shell, so they keep this value untouched. |
| `--brand-end` | `#64B6FF` | Light blue. Marketing gradient terminus; never a fill for UI chrome. |
| `--brand-ink` | `#14152F` | Near-black ink for display headings. |
| `--brand-wash` | `#F2F4FF` | Faint cobalt tint for selected/active backgrounds. |

**Workspace vs. marketing accent (2026-09-16):** the workspace's live accent isn't read from
`:root` — `app-shell.tsx` injects `--primary`/`--ring`/`--sidebar-primary`/etc. from
`brandAccentPresets[0]` (`src/lib/branding.ts`, the "Vela" preset) as inline CSS vars on the shell
wrapper and mirrors them onto `<html>` for portaled dialogs/dropdowns, resetting on unmount. That
preset now points at the muted `#3142D8` instead of `#0A22FF`. Changing it there — not in
`globals.css` — is what keeps the change scoped to the workspace: marketing/auth pages, which
render outside the shell, keep reading the original vivid `:root` value automatically.

The gradient `cobalt → light-blue` (`135deg`) is a **marketing / hero** device (`.vela-gradient`)
and stays vivid/gradient there. **Inside the workspace there is no gradient color anywhere**
(2026-09-16 owner decision) — solid `--primary` fills, flat tiles, and a single flat translucent
tint in place of every fade (chart area fill, skeleton shimmer, dialog scrollbar thumb, the Staff
directory completion bar). The one exception is `ScoreGauge` (Reports AI card): it draws a
percentage ring with the `conic-gradient()` function, but the two regions are flat, hard-edged
color blocks (like a pie chart), not a color blend — kept as the AGENTS.md-locked visual, not
treated as a decorative gradient.

### Neutrals & surface

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#FEFFFF` (flat — no gradient) | App canvas behind cards. |
| `--foreground` | `#111827` | Body ink. |
| white `#FFFFFF` | — | Card / surface fill. |
| `--secondary` / `--muted` | `#F2F4FB` / `#F2F5FB` | Quiet fills, ghost tracks, hover. |
| `--muted-foreground` | `#5B6980` | Secondary text. Meets ≥4.5:1 on white — keep secondary text at this token, do not lighten further. |
| `--border` | `rgba(92,102,132,0.18)` | Hairline borders (the workspace signature). |

### Semantic / status

| Role | Value |
| --- | --- |
| Success / strong | `#10B981` |
| Warning / watch / pending | `#F59E0B` |
| Danger / destructive / cancelled | `#E05261` (UI) · `#EF4444` (data viz) |
| Confirmed (status mix) | `#5B57D6` |
| Chart ramp | `#0A22FF → #64B6FF → #8FA3FF → #D9E7FF → #EEF3FF` |

**Contrast rule:** body ≥ 4.5:1, large/secondary ≥ 3:1. Status is never color-only — always pair
with a label, count, or badge text.

## Typography

One family in multiple weights — no clashing pairing.

- **Family:** `"Metal Reg-2"` → Metal family → `Plus Jakarta` → system sans fallback. Mono:
  `SFMono / Consolas`.
- **Display** (`.display-1/2/3`): weight 600, `clamp()` scales, letter-spacing `-0.025 → -0.015em`
  (within the −0.04em floor; never tighter). Marketing heroes only.
- **Workspace headings:** page title ~24–27px / 600; card titles `15px` / 600.
- **Body:** 14px / `--muted-foreground` for secondary, `--foreground` for primary.
- **Numerals:** `.tabular` (`font-variant-numeric: tabular-nums`) on **every** metric, KPI, and
  table figure so values align and don't jitter on hover/refresh.
- `text-wrap: balance` on h1–h4; `text-wrap: pretty` on prose. Font features `cv02/03/04/11` on.

## Spacing & Layout

- **Rhythm:** 3-unit gap system — cards sit on `gap-3` (12px) grids; card padding `p-4`
  (compact surfaces `p-3 / p-3.5`). Workspace pages target a single 1440×900 viewport with **no
  scroll** where the content allows; compact paddings are deliberate — do not re-inflate.
- **Page frame:** `WorkspacePage` centers content at `max-w-[1440px]` with `space-y-3`. The app
  shell `<main>` carries the outer padding (`lg:px-6 lg:py-4`).
- **Layout types:** Overview (KPI row + sections), Directory (toolbar → table → compact summaries),
  Detail (profile sidebar + content), Operational (calendar/inbox panes), Form (centered), Settings
  (scrollspy nav + sections).
- Flexbox for 1-D, Grid for 2-D. KPI/section grids use explicit `md:`/`xl:` column counts.

## Radii & Elevation

Squared up 2026-09-16 (owner decision) — same scale, noticeably tighter corners so buttons/cards/
tiles read as structured chrome rather than pill-rounded. Shared tokens (not workspace-scoped),
so marketing picked up the same tightening; `--radius-hero` (marketing hero cards only) is
untouched.

| Token | Value | Use |
| --- | --- | --- |
| `--radius-tile` | `0.375rem` | Icon tiles, chips, inputs. |
| `--radius-card` | `0.5rem` | Cards / sections (the workspace default). |
| `--radius-field` | `0.55rem` | Buttons, search / large fields. |
| `--radius-panel` | `0.75rem` | Overlay panels (global search, notifications). |
| `--radius-modal` | `0.85rem` | Dialogs. |

- `--shadow-card`: `0 3px 9px rgba(20,21,47,0.018)` + inset top highlight — almost imperceptible;
  elevation is carried by the hairline border, not a heavy drop shadow. **Do not pair a 1px border
  with a wide (≥16px) drop shadow** ("ghost card"); the card surface is border-led.
- `--shadow-pop` / `--shadow-modal` for popovers and dialogs only.

## Components

- **`.surface-card`** — white, hairline border, `--shadow-card`, `--radius-card`. The base of every
  panel.
- **Identity / icon tile** — flat white square, hairline border, `--radius-tile`, primary-colored
  glyph or initials. **Square** for people/entities; circles reserved for status dots, count
  badges, pills.
- **KPI tile** — icon tile + label + large tabular value + optional delta pill. Tiny uppercase
  labels allowed _only_ here.
- **Delta pill** — `up` emerald, `down` red, `flat` gray; arrow glyph + value. Only on
  period-over-period numbers.
- **Tables** — bordered card (outer border only, 2026-09-16), `#F8FAFC` uppercase header row (no
  rule under it — the tint alone separates it), rows separated by padding and hover state, not a
  `divide-y` hairline (removed 2026-09-16, matching the sub-record-row convention below).
- **Badges / chips** — sentence case, rounded-full, tinted by tone.
- **Empty states** — one quiet dashed-border state per section; never per-field placeholder text.

## Motion

Calm, sub-200ms, strong ease-out, **no bounce / no elastic**. Motion is functional, not decorative.

- **Easing:** `--ease-out-quart (0.25,1,0.5,1)`, `--ease-out-quint (0.23,1,0.32,1)`,
  `--ease-out-expo (0.16,1,0.3,1)`. Never `ease-in` for entrances.
- **Durations:** `--duration-fast 140ms`, `--duration-base 190ms`, `--duration-slow 240ms`,
  entrance `480ms`.
- **Vocabulary** (`motion.ts`): `fadeUp` (8px, 0.18s), `fadeIn` (0.16s), `staggerChildren` (0.04s
  stagger) / `staggerItem`. Page/section reveals via `.section-reveal`; KPI grids stagger subtly.
- **Press feedback:** interactive surfaces lift (`-2px`) on hover and settle on active; buttons
  should scale `0.97` on press.
- **Reduced motion:** every animation has a `prefers-reduced-motion` fallback (reveals → none,
  staggers → 200ms fade). Non-negotiable.

## Iconography

Lucide, `size-4` default in tiles. Line weight matches the calm tone; icons are primary-colored
inside white tiles, muted inline. No filled/duotone icon sets.

## Data Visualization

- KPI mini-charts: **track-style bars** (full-height ghost track, value fills from the bottom —
  zero buckets show the track, never a tiny stub), flat `--primary` fill, no gradient.
- Performance chart: **monotone-cubic** smooth curves (no overshoot below baseline), flat
  low-opacity `--primary` area fill (no gradient, 2026-09-16), left y-axis aligned to gridlines,
  both series on **one shared scale**, hover guide line + tooltip (no permanent dots).
- Status donut: **SVG arc segments** (butt caps, small gaps), interactive from segment and legend;
  legend shows **all** statuses including zeros (zeros muted). Total centered.
- Charts are interactive (per-bucket / per-segment hover) and never invent values the model can't back.
