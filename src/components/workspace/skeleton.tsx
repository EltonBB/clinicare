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

function SkeletonToolbar() {
  return (
    <div className="surface-card flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
      <SkeletonBlock className="h-10 w-full max-w-xs" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-8 w-20" />
        ))}
      </div>
    </div>
  );
}

function SkeletonTable({ rows = 7 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-(--radius-card) border border-border/80 bg-white shadow-(--shadow-card)">
      {/* This is new code (not yet-unmigrated WorkspaceTable markup), so it
          follows the current no-divider rule directly — background contrast
          and spacing, not a border-b/divide-y hairline (Codex). */}
      <div className="flex min-h-[40px] items-center bg-[#f8fafc] px-3.5 py-2">
        <SkeletonBlock className="h-3 w-24" />
      </div>
      <div className="space-y-2 p-2">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-1.5 py-2">
            <SkeletonBlock className="size-9 shrink-0 rounded-(--radius-tile)" />
            <SkeletonBlock className="h-3.5 w-1/4" />
            <SkeletonBlock className="ml-auto h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Clients / Staff directories: header (no KPI band, per AGENTS.md) → toolbar → table.
export function DirectoryPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-3">
      <SkeletonHeader />
      <SkeletonToolbar />
      <SkeletonTable />
    </div>
  );
}

// Client / Staff detail: back link → header (identity tile, stat strip, actions) → tabs → rail + main.
export function DetailPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-3">
      <SkeletonBlock className="h-4 w-40" />
      <div className="surface-card space-y-3.5 p-3.5">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="size-14 shrink-0 rounded-(--radius-tile)" />
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-48" />
            <SkeletonBlock className="h-3.5 w-32" />
          </div>
        </div>
        <SkeletonBlock className="h-16 w-full" />
        <div className="flex gap-2">
          <SkeletonBlock className="h-9 w-28" />
          <SkeletonBlock className="h-9 w-28" />
        </div>
      </div>
      <div className="flex gap-5">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-7 w-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
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

// Calendar: header → flat toolbar (view pills + date range) → filled grid.
// Shaped for the week view — CalendarWorkspace defaults to "week", not
// month, so 7 pill-listing day columns resemble the real first paint more
// closely than a 35-cell month grid would.
export function CalendarPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1520px] space-y-3">
      {/* Two rows, not one — the real page keeps New appointment in the
          header and the view/Today/date-range controls in their own
          toolbar row below it (Codex); matching that avoids a layout jump
          once data resolves. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SkeletonBlock className="h-8 w-40" />
        <SkeletonBlock className="h-9 w-40" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SkeletonBlock className="h-8 w-40" />
        <SkeletonBlock className="h-8 w-14" />
        <SkeletonBlock className="ml-auto h-8 w-44" />
      </div>
      <div className="overflow-x-auto lg:h-[calc(100vh-230px)]">
        {/* Matches the loaded week view's own min-w-[720px] (CalendarWorkspace)
            so a narrow viewport doesn't crush 7 columns during loading and
            then jump width the instant the real, horizontally-scrollable
            grid mounts (Codex). */}
        <div className="grid min-w-[720px] grid-cols-7 gap-2 lg:h-full">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <SkeletonBlock className="h-5" />
              {Array.from({ length: 3 }).map((_, pillIndex) => (
                <SkeletonBlock key={pillIndex} className="h-9" />
              ))}
            </div>
          ))}
        </div>
      </div>
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
          <div className="flex flex-col p-4">
            <SkeletonBlock className="mb-4 h-14 w-full" />
            <div className="flex-1 space-y-3">
              <SkeletonBlock className="h-14 w-2/3" />
              <SkeletonBlock className="ml-auto h-14 w-2/3" />
              <SkeletonBlock className="h-14 w-1/2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reports: header w/ period pills → KPI row(4) → chart+insight row → staff row → 3-card row.
export function ReportsPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <SkeletonBlock className="h-8 w-40" />
        <div className="flex gap-2">
          <SkeletonBlock className="h-10 w-64" />
          <SkeletonBlock className="h-10 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-24" />
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <SkeletonBlock className="h-72" />
        <SkeletonBlock className="h-72" />
      </div>
      <SkeletonBlock className="h-56" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-64" />
        ))}
      </div>
    </div>
  );
}

// Settings deep-link fallback (/settings): master nav list beside the active section.
export function SettingsPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-3">
      <SkeletonBlock className="h-8 w-40" />
      <div className="grid gap-3.5 lg:grid-cols-[280px_minmax(0,1fr)]">
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
      <SkeletonBlock className="h-8 w-56" />
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
