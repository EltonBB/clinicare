# 003 — Booking client search (kill the unbounded client load)

**Base commit:** `fcd3eb9` · **Category:** performance / scaling · **Effort:** M ·
**Risk:** MED (UX change) · **Depends on:** nothing.

## Why this matters — the #1 scaling risk

Two of the highest-traffic surfaces load the **entire** client table into the
browser to populate a `<select>`:

- `src/app/(workspace)/calendar/new/page.tsx:~32` —
  `prisma.client.findMany({ where: { businessId, isArchived: false } })`, no `take`.
- `src/app/(workspace)/calendar/page.tsx:~85` — same unbounded `findMany`, passed
  into `CalendarWorkspace` for the "New appointment" dropdown.

At 5k clients every calendar visit and every "New booking" page serializes ~5k
rows (id/name/phone) into the RSC/HTML payload and renders a 5k-option native
`<select>` — hundreds of KB and a sluggish control, growing linearly forever.
This is exactly the pattern the Clients **directory** was deliberately built to
avoid (URL-backed server pagination); the booking surfaces violate it.

There is already a scoped search endpoint to reuse: `src/app/api/search/route.ts`
does tenant-scoped `contains` lookups.

## The fix — async typeahead combobox

1. **Initial render:** replace the unbounded `findMany` with a bounded recent
   list — e.g. `take: 25, orderBy: { updatedAt: "desc" }, select: { id, name, phone }` —
   so the control has sensible defaults without shipping the whole table.
2. **Preselect support:** the booking form accepts `?client=<id>` deep links. When
   present, fetch that single client by id (`findFirst({ where: { id, businessId } })`)
   and seed it as the selected option, regardless of whether it's in the recent 25.
3. **Search:** build (or extend `/api/search`) a small authenticated endpoint
   `GET /api/clients/search?q=` that returns `take: 20` clients matching name/phone
   (`contains`, scoped by `businessId`, using the `(businessId, phone)` index for
   phone-prefix matches). Debounce input ~200ms.
4. **UI:** swap the native `<select>` for a combobox built on the existing Base UI
   primitives in `src/components/ui/` (there is a Select/Combobox primitive
   pattern already; match it — do not introduce a new dependency). Square identity
   tiles per AGENTS.md if the option rows show avatars.

## Verification

- `npm run typecheck && npm run lint && npm run build` green.
- `preview_*` (dev server) on `/calendar/new`: confirm the page payload no longer
  contains the full client list (inspect the RSC/network), the combobox searches,
  and a `?client=<id>` deep link preselects correctly.
- Manual: book an appointment for (a) a recent client, (b) a client found via
  search, (c) a deep-linked client.

## Out of scope

- Don't paginate the calendar grid itself.
- Don't change the appointment data model.
- Bundle the **PERF-02** convert-to-client indexed lookup here only if you add the
  normalized-phone column (same normalization the search endpoint needs); otherwise
  leave PERF-02 to its own backlog item.
