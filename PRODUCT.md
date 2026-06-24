# Product

## Register

product

## Users

Clinic owners and front-desk / clinical staff at small appointment-based healthcare
businesses. The pilot cohort is ~50 Kosovo clinics; the scaling target is US clinics.
They are **not technical**. They run the day from this one workspace, in short glances
between patient interactions — often a few seconds at a time, sometimes on a phone at the
front desk.

Their job-to-be-done: see what needs attention today, book and manage appointments, find a
patient record fast, reply to messages, and understand how the clinic is performing —
without learning software or thinking about the technology underneath.

## Product Purpose

Vela is a **clinic operating system**: one calm, organized place to run daily operations —
onboarding, branding, staff, patients, appointments, calendar, WhatsApp inbox, reminders,
documents, payments, reports, and AI-assisted operational insights.

Success is a clinic owner who opens Vela and immediately knows what to do next, never feels
the complexity of the providers underneath, and trusts it with sensitive patient context.
It must read as a premium, privacy-serious product — not an admin panel.

## Brand Personality

**Calm, organized, premium.** The voice is plain and human — never clinical jargon, never
developer-speak, never provider names (Baileys / Twilio / Supabase / OpenAI / Prisma) or internal
codenames leaked to the surface. Insights are framed as "AI-assisted operational guidance,"
never medical advice. The emotional goal is **quiet confidence**: the operator should feel
the software is absorbing the mess so they don't have to.

## Anti-references

- Generic admin dashboards / Bootstrap-y CRUD panels where every entity gets an equal-weight card.
- Cluttered CRMs (Salesforce-style density, tab soup, duplicated stat cards).
- Developer tools / data-grid-first SaaS (raw tables, technical labels, provider internals exposed).
- A "wall of widgets" dashboard — cards added just because data exists.
- Marketing-grade visual variance inside the workspace (heavy gradients, big motion, decorative
  flourishes). The marketing site may be bold; the workspace stays operational.
- Per-field filler text ("Not added", "No notes", "TBD"), mini-card grids with empty cells,
  duplicated KPI furniture, synthetic deltas/trends on point-in-time numbers.

## Design Principles

1. **One screen, one question.** Every page answers a single operator question (Reports:
   _"what changed, why does it matter, and what should I do next?"_). If an element doesn't
   help the user decide, act, or understand context, it doesn't belong on the page.
2. **Calm over clever.** Restraint is the brand: compact, readable, light, low-motion. The
   brand accent (cobalt → light-blue) is reserved for the primary action, the active state,
   and the single most important insight — never spread as decoration.
3. **Hide the machinery.** Customers never see providers, raw errors, storage paths, or
   internal names. Generic, support-friendly language always.
4. **Earned data only.** Never fabricate a metric, a per-row value, or a trend the data can't
   back. A delta always means "vs the previous period"; point-in-time numbers carry no arrow.
5. **Compliance is a feature, shown as trust.** Minimum-necessary patient data everywhere;
   access is structured so audit / role safeguards attach in one place. Privacy reads as
   premium, not as friction.

## Accessibility & Inclusion

Light theme, **WCAG AA as the floor**: body text ≥ 4.5:1, large/secondary text ≥ 3:1.
Status is never color-only — donut/segment colors are always paired with labels and counts,
badges with text. Honor `prefers-reduced-motion` (the workspace degrades reveals and stagger
to a ~200ms fade). All interactive controls are keyboard-reachable with a visible cobalt
focus ring (`--ring`). Tabular numerals on every metric so figures align and don't jitter.
Plain-language copy lowers cognitive load for stressed front-desk users.
