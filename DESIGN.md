# Design

> Visual system for the Vela clinic operating system. Captured from the live token set
> (`src/app/globals.css`) and motion vocabulary (`src/lib/motion.ts`). The workspace is the
> calm/operational register; marketing surfaces may run bolder variants of the same brand.

## Theme

Calm, premium, light clinical SaaS. Soft blue-gray canvas, white floating cards with hairline
borders and barely-there shadows, one confident cobalt accent. The feeling is an organized desk
under even daylight — never dark "because tools look cool," never decorative. Depth comes from
elevation and spacing, not from color washes. Identity tiles are **flat white bordered squares**,
never gradient-filled blue chips (those were deliberately removed).

## Color

OKLCH-friendly hex tokens. Single saturated brand color on a tinted-neutral canvas — a
**restrained** strategy (accent ≤ ~10% of any surface).

### Brand

| Token | Value | Use |
| --- | --- | --- |
| `--brand-start` / `--primary` | `#0A22FF` | Cobalt. Primary actions, active nav, key data series, the one insight that matters. |
| `--brand-end` | `#64B6FF` | Light blue. Gradient terminus; second chart series; never a fill for UI chrome. |
| `--brand-ink` | `#14152F` | Near-black ink for display headings. |
| `--brand-wash` | `#F2F4FF` | Faint cobalt tint for selected/active backgrounds. |

The gradient `cobalt → light-blue` (`135deg`) is a **marketing / hero** device (`.vela-gradient`).
Inside the workspace, use the solid `--primary` and flat tiles.

### Neutrals & surface

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#EEF2F7` (canvas gradient to `#E9EEF6`) | App canvas behind cards. |
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

| Token | Value | Use |
| --- | --- | --- |
| `--radius-tile` | `0.65rem` | Icon tiles, chips, inputs. |
| `--radius-card` | `0.72rem` | Cards / sections (the workspace default — cards stay 12–16px, never over-rounded). |
| `--radius-field` | `0.95rem` | Search / large fields. |
| `--radius-modal` | `1.35rem` | Dialogs. |

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
- **Tables** — bordered card, `#F8FAFC` uppercase header row, `divide-y` body, row hover.
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
  zero buckets show the track, never a tiny stub) and **gradient sparklines** with an end dot.
- Performance chart: **monotone-cubic** smooth curves (no overshoot below baseline), gradient area
  fill, left y-axis aligned to gridlines, both series on **one shared scale**, hover guide line +
  tooltip (no permanent dots).
- Status donut: **SVG arc segments** (butt caps, small gaps), interactive from segment and legend;
  legend shows **all** statuses including zeros (zeros muted). Total centered.
- Charts are interactive (per-bucket / per-segment hover) and never invent values the model can't back.
