// Shared loading-skeleton primitives for route-level loading.tsx files —
// one shape per Layout Type (AGENTS.md) so a page's skeleton actually
// resembles what's about to render, instead of every route sharing one
// generic shape.

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`motion-safe:animate-pulse rounded-[0.82rem] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(242,244,255,0.72))] shadow-[0_8px_20px_rgba(20,21,47,0.026)] ${className}`}
    />
  );
}

// Real Directory/Inbox headers (WorkspaceHeader) render a title and, for
// Directory, one action button — no eyebrow line and no description, unlike
// Form pages' CreatePageShell (which has its own header block below).
function SkeletonHeader({ actionWidth = "w-36", showAction = true }: { actionWidth?: string; showAction?: boolean }) {
  return (
    <div className="flex flex-col gap-3.5 lg:flex-row lg:items-end lg:justify-between">
      <SkeletonBlock className="h-10 w-72 max-w-full" />
      {showAction ? <SkeletonBlock className={`h-11 ${actionWidth}`} /> : null}
    </div>
  );
}

// Dashboard: header (no subtitle, per AGENTS.md rule 5) → 5-tile KPI row →
// Visits/Today's-schedule row → 3-card secondary row. Also covers the
// (workspace) group-root loading.tsx, since /dashboard is what that redirect
// resolves to.
export function DashboardPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1520px] space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SkeletonBlock className="h-8 w-40" />
        <SkeletonBlock className="h-10 w-44" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 items-stretch gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <SkeletonBlock className="h-72" />
        <SkeletonBlock className="h-72" />
      </div>
      <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-48" />
        ))}
      </div>
    </div>
  );
}

// Clients / Staff directories: header (no KPI band, per AGENTS.md) → toolbar → table.
// filterCount matches the loaded route's real, fixed chip count (6 for
// Clients — All/Active/Inactive/Archived/Attention/No visits; 5 for Staff —
// All/Active/Away/Inactive/Checked in) — a shared fixed count wrapped one
// fewer/more chip onto an extra row at common mobile widths than the real
// set does, pushing the table down once it resolves (Codex).
export function DirectoryPageSkeleton({ filterCount }: { filterCount: number }) {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-3">
      <SkeletonHeader />
      <div className="surface-card flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <SkeletonBlock className="h-10 w-full max-w-xs" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: filterCount }).map((_, index) => (
            <SkeletonBlock key={index} className="h-8 w-20" />
          ))}
        </div>
      </div>
      {/* This is new code (not yet-unmigrated WorkspaceTable markup), so it
          follows the current no-divider rule directly — background contrast
          and spacing, not a border-b/divide-y hairline (Codex). */}
      <div className="overflow-hidden rounded-(--radius-card) border border-border/80 bg-white shadow-(--shadow-card)">
        <div className="flex min-h-[40px] items-center bg-[#f8fafc] px-3.5 py-2">
          <SkeletonBlock className="h-3 w-24" />
        </div>
        {/* 4 rows, not a "typical" 7-10 — a brand-new workspace with no
            records yet resolves to a compact empty state here (same pattern
            as Calendar's own skeleton below), and over-committing to a full
            row count collapsed several hundred pixels of placeholder at once
            once that state loaded (Codex). */}
        <div className="space-y-2 p-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 px-1.5 py-2">
              <SkeletonBlock className="size-9 shrink-0 rounded-(--radius-tile)" />
              <SkeletonBlock className="h-3.5 w-1/4" />
              <SkeletonBlock className="ml-auto h-3.5 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Client / Staff detail: back link → header (identity tile, stat strip, actions) → tabs → rail + main.
// tabCount matches the loaded route's real tab count (5 for Client Detail,
// 3 for Staff Detail) — a fixed 4 added or removed an underline placeholder
// on every detail navigation (Codex).
export function DetailPageSkeleton({ tabCount }: { tabCount: number }) {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-3">
      <SkeletonBlock className="h-4 w-40" />
      {/* No shared card border — the real header is an open split at xl+
          (identity left, a 560px stat/actions block right), only stacking
          into a single column below that (Codex: matching the split avoids
          the loaded page abruptly shortening/reflowing out of a bordered
          card that never existed there). */}
      <div className="flex flex-col gap-3.5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <SkeletonBlock className="size-20 shrink-0 rounded-(--radius-tile)" />
          {/* min-w-0 lets this shrink inside the flex row; without it a
              fixed-width child block sets the div's min-content size and
              the row overflows a narrow (320px) viewport instead of
              matching the real header's own shrinkable identity content
              (Codex). */}
          <div className="min-w-0 space-y-2 pt-1">
            <SkeletonBlock className="h-7 w-48 max-w-full" />
            <SkeletonBlock className="h-4 w-64 max-w-full" />
          </div>
        </div>
        <div className="w-full space-y-3 xl:w-[560px]">
          <SkeletonBlock className="h-16 w-full" />
          <div className="flex flex-wrap justify-end gap-2.5">
            <SkeletonBlock className="h-10 w-36" />
            <SkeletonBlock className="h-10 w-36" />
          </div>
        </div>
      </div>
      <div className="flex gap-5 overflow-x-auto pb-px">
        {Array.from({ length: tabCount }).map((_, index) => (
          <SkeletonBlock key={index} className="h-7 w-20 shrink-0" />
        ))}
      </div>
      {/* xl only, not lg — both loaded Overview tabs (client-details-page.tsx,
          staff-details-page.tsx) stay single-column until xl too, so
          splitting a breakpoint earlier here would replace a two-column
          placeholder with two stacked sections once real data resolves
          (Codex). */}
      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-3">
          <SkeletonBlock className="h-40" />
          <SkeletonBlock className="h-28" />
        </div>
        <div className="space-y-3">
          <SkeletonBlock className="h-48" />
          <SkeletonBlock className="h-64" />
        </div>
      </div>
    </div>
  );
}

// Calendar: header → flat toolbar (view pills + date range). The content
// area below stays neutral rather than grid-shaped — see the comment there.
export function CalendarPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1520px] space-y-3">
      {/* Title-only header — New appointment lives in the toolbar row below,
          next to the date-range label and date-jump popover, not in the
          header's own action area (Codex); matching that avoids a layout
          jump once data resolves. */}
      <SkeletonBlock className="h-8 w-40" />
      <div className="flex flex-wrap items-center gap-2">
        <SkeletonBlock className="h-8 w-40" />
        <SkeletonBlock className="h-8 w-14" />
        <div className="ml-auto flex items-center gap-3">
          <SkeletonBlock className="h-6 w-32" />
          <SkeletonBlock className="size-8" />
          <SkeletonBlock className="h-9 w-40" />
        </div>
      </div>
      {/* Deliberately neutral, not shaped to the full-height week grid — a
          brand-new workspace with no clients yet resolves to the compact
          "Add a client before booking" empty state instead of the grid
          (calendar-workspace.tsx), so committing to the tall grid shape
          here collapsed most of the viewport once that state loaded
          (Codex). */}
      <SkeletonBlock className="h-64 w-full" />
    </div>
  );
}

// Inbox: two-pane — 320px conversation list beside the active thread.
export function InboxPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1520px] space-y-3">
      <SkeletonHeader showAction={false} />
      <div className="surface-card min-h-[640px] overflow-hidden p-0 lg:h-[calc(100vh-174px)]">
        <div className="grid h-full grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-3 border-b border-border/70 p-3 lg:border-b-0 lg:border-r">
            <SkeletonBlock className="h-10 w-full" />
            <div className="flex gap-2">
              <SkeletonBlock className="h-7 w-16" />
              <SkeletonBlock className="h-7 w-20" />
            </div>
            {/* The loaded list inserts a one-line connection-status row
                (connectionLine, inbox-workspace.tsx) between the filter
                chips and the first conversation row — omitting it shifts
                every row down once data resolves (Codex). */}
            <SkeletonBlock className="h-3 w-40" />
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-2.5 py-1">
                <SkeletonBlock className="size-10 shrink-0 rounded-(--radius-tile)" />
                <div className="flex-1 space-y-1.5">
                  <SkeletonBlock className="h-3 w-2/3" />
                  <SkeletonBlock className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
          <div className="flex h-full flex-col">
            <div className="flex-1 space-y-3 p-4">
              <SkeletonBlock className="mb-1 h-14 w-full" />
              <SkeletonBlock className="h-14 w-2/3" />
              <SkeletonBlock className="ml-auto h-14 w-2/3" />
              <SkeletonBlock className="h-14 w-1/2" />
            </div>
            {/* The loaded thread always ends in a composer row (border-t,
                inbox-workspace.tsx) — without it, the message area
                contracts and its contents shift up once data resolves
                (Codex). */}
            <div className="border-t border-border/70 px-4 py-3">
              <SkeletonBlock className="h-14 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reports: deliberately neutral, not shaped to the full 4-2-1-3 Pro layout —
// this route resolves to one of two structurally incompatible pages (Pro's
// full analytics stack, or Basic's completely different ProFeatureLock
// upgrade page) depending on plan, which isn't known until the page's own
// data fetch resolves. Committing to either shape here means the other
// plan tier sees a jarring collapse into something else entirely (Codex).
export function ReportsPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-3">
      <SkeletonBlock className="h-8 w-40" />
      <SkeletonBlock className="h-64 w-full" />
    </div>
  );
}

// Settings deep-link fallback (/settings): master nav list beside the active section.
export function SettingsPageSkeleton() {
  return (
    // 1440px, matching WorkspacePage's default size — the standalone route
    // isn't wrapped in the "wide" frame, and this fallback previously capped
    // at 1000px, so the whole grid widened by hundreds of pixels once data
    // resolved (Codex).
    <div className="mx-auto w-full max-w-[1440px] space-y-3">
      <SkeletonBlock className="h-8 w-40" />
      {/* The real WorkspaceHeader here always renders a description line
          ("Configure how the workspace runs.") below the title — omitting
          it shifts the whole nav/detail grid down once data resolves
          (Codex). */}
      <SkeletonBlock className="h-4 w-72 max-w-full" />
      {/* xl, not lg — the standalone (non-dialog) SettingsWorkspace only
          switches to two columns at xl, so matching lg here would show the
          detail pane beside the nav during loading and then move it below
          once data resolves (Codex). */}
      <div className="grid gap-3.5 xl:grid-cols-[290px_minmax(0,1fr)]">
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-14 w-full" />
          ))}
        </div>
        <SkeletonBlock className="h-[28rem]" />
      </div>
    </div>
  );
}

// New/edit forms: back link → title → sectioned form cards.
export function FormPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[860px] space-y-3 px-1 py-2 sm:py-3">
      <SkeletonBlock className="h-4 w-28" />
      {/* Every CreatePageShell caller passes both eyebrow and description, so
          WorkspaceHeader always renders all 4 rows here (breadcrumb, eyebrow,
          title, description) — 2 placeholders let the real header insert 2
          more lines and push the form down once it resolves (Codex). */}
      <div className="space-y-1.5">
        <SkeletonBlock className="h-3 w-32" />
        <SkeletonBlock className="h-8 w-56" />
        <SkeletonBlock className="h-4 w-full max-w-md" />
      </div>
      <div className="surface-card space-y-4 p-3.5">
        <SkeletonBlock className="h-4 w-40" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-10" />
          ))}
        </div>
      </div>
      <div className="surface-card space-y-4 p-3.5">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-24" />
      </div>
    </div>
  );
}
