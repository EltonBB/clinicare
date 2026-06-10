// Vela / Clinicare — full multi-agent codebase review.
// Re-run later with: Workflow({ scriptPath: ".claude/workflows/caresuite-full-review.mjs" })
// Designed: report-first (no edits). 10 subsystem slices reviewed across 4 dimensions
// (security/correctness/performance/quality), then EVERY finding adversarially verified.
// Estimated cost ~1.5–2.5M tokens. Cheaper variants: drop the Verify phase (~-45%),
// run review agents on a cheaper model, or scope to security+correctness only.

export const meta = {
  name: 'caresuite-full-review',
  description: 'Deep multi-agent review of the Vela/Clinicare codebase: security, correctness, performance, quality — with adversarial verification of every finding',
  phases: [
    { title: 'Review', detail: 'one agent per subsystem slice, all four dimensions' },
    { title: 'Verify', detail: 'adversarial skeptic re-reads code to confirm or refute each finding' },
  ],
}

const CONTEXT = `
PROJECT: Vela / Clinicare — a multi-tenant SaaS clinic operating system.
STACK: Next.js 16 (App Router, React 19, MODIFIED fork with breaking changes), TypeScript strict, Prisma 6 over PostgreSQL (pg driver adapter) hosted on Supabase, Supabase Auth (@supabase/ssr), Zod 4, Twilio WhatsApp, OpenAI analytics.
SECURITY MODEL (important — judge findings against this):
- Tenant isolation is enforced SERVER-SIDE via Prisma + workspace-context helpers. Every record is scoped to a Business (tenant).
- Supabase public tables have RLS ENABLED with NO public policies BY DESIGN — the browser anon API cannot read/write app data. So "table has no RLS policy" is EXPECTED, not a bug. The real risk is server-side code that fails to scope a query by businessId/workspace, allowing cross-tenant data access.
- Auth/workspace helpers (REUSE these, request-deduped): requireCurrentUser()/getCurrentUser (lib/auth.ts); requireCurrentWorkspace()/getCurrentWorkspaceContext() (lib/business.ts); requireCurrentBusiness() (settings); getAuthedBusiness() (calendar/inbox actions).
- src/proxy.ts protects all (workspace) routes and sets security headers. Cron routes (/api/cron/*) and the Twilio webhook are guarded by secret checks — flag if a guard is missing or weak.
- Media lives in a PRIVATE Supabase Storage bucket; never expose raw storage paths — signed URLs via lib/media-storage*.ts.
- Customer-facing copy must NEVER leak provider internals (Twilio/Supabase/Prisma/OpenAI) or raw errors.
CONVENTIONS: server actions in actions.ts return typed result objects and validate with Zod. View-model builders in lib/<feature>.ts shape Prisma records for presentational components.

REVIEW DIMENSIONS (cover ALL FOUR for every file in your slice):
1. SECURITY & TENANT ISOLATION — missing businessId/workspace scoping on Prisma queries (CROSS-TENANT LEAK = critical), missing/weak auth gates, broken cron/webhook secret checks, injection, unsafe redirects/SSRF, secrets in client bundles, provider/error leakage to UI, IDOR (acting on a record by id without verifying it belongs to the caller's workspace).
2. CORRECTNESS & LOGIC — unhandled promise rejections, missing await, wrong error handling, Zod validation gaps, off-by-one / timezone / date bugs, null/undefined handling, incorrect view-model shaping, race conditions, wrong status transitions.
3. PERFORMANCE & CACHING — N+1 Prisma queries (queries in loops), missing pagination, over-fetching, missing/incorrect Next.js caching or revalidation (revalidatePath/revalidateTag, fetch cache, "use cache"), redundant auth lookups instead of the deduped helpers, heavy work in render.
4. QUALITY & SIMPLIFICATION — duplicated logic, dead code, bespoke JSX that should use shared workspace primitives, missing reuse of cn()/helpers, naming, type-safety holes (any, unchecked casts).

RULES:
- READ each file in your slice fully. This is a line-by-line review. Do NOT edit anything.
- Cite exact file path and line number for every finding. Include a short code-evidence snippet.
- Be precise about severity. critical = exploitable cross-tenant leak / auth bypass / data loss. high = real bug hit on common paths or a serious vuln needing context. medium = bug on edge paths or meaningful perf/quality issue. low = minor.
- Prefer FEWER, well-evidenced findings over speculation. If unsure something is real, mark confidence "low" and say what would confirm it.
- It is fine to return an empty findings array if the slice is clean.
`

const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['slice', 'findings'],
  properties: {
    slice: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'dimension', 'severity', 'file', 'line', 'description', 'evidence', 'suggestedFix', 'confidence'],
        properties: {
          title: { type: 'string' },
          dimension: { type: 'string', enum: ['security', 'correctness', 'performance', 'quality'] },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          file: { type: 'string' },
          line: { type: 'string' },
          description: { type: 'string' },
          evidence: { type: 'string' },
          suggestedFix: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'reasoning', 'adjustedSeverity'],
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'false_positive', 'uncertain'] },
    reasoning: { type: 'string' },
    adjustedSeverity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'none'] },
  },
}

const SLICES = [
  { key: 'auth-gate-tenant-isolation', label: 'Auth gate & tenant isolation',
    files: ['src/proxy.ts', 'src/utils/supabase/client.ts', 'src/utils/supabase/server.ts', 'src/utils/supabase/middleware.ts', 'src/lib/auth.ts', 'src/lib/auth-metadata.ts', 'src/lib/business.ts', 'src/lib/prisma.ts', 'src/lib/env.ts', 'src/lib/app-url-policy.ts', 'src/lib/app-url.ts', 'src/lib/safe-url.ts'] },
  { key: 'auth-flows', label: 'Auth flows (login/signup/reset/verify)',
    files: ['src/app/(auth)/actions.ts', 'src/app/(auth)/login/page.tsx', 'src/app/(auth)/sign-up/page.tsx', 'src/app/(auth)/forgot-password/page.tsx', 'src/app/(auth)/reset-password/page.tsx', 'src/app/(auth)/confirm-email/page.tsx', 'src/app/(auth)/layout.tsx', 'src/app/auth/confirm/page.tsx', 'src/lib/email-verification-receipts.ts', 'src/app/api/auth/email-verification-status/route.ts', 'src/components/auth/login-form.tsx', 'src/components/auth/sign-up-form.tsx', 'src/components/auth/forgot-password-form.tsx', 'src/components/auth/reset-password-form.tsx', 'src/components/auth/resend-confirmation-form.tsx', 'src/components/auth/email-verification-watcher.tsx', 'src/components/auth/auth-confirmation-bridge.tsx', 'src/components/auth/auth-confirm-screen.tsx', 'src/components/auth/submit-button.tsx', 'src/components/auth/logout-button.tsx'] },
  { key: 'clients', label: 'Clients feature',
    files: ['src/app/(workspace)/clients/page.tsx', 'src/app/(workspace)/clients/actions.ts', 'src/app/(workspace)/clients/new/page.tsx', 'src/app/(workspace)/clients/[clientId]/page.tsx', 'src/app/(workspace)/clients/[clientId]/edit/page.tsx', 'src/lib/clients.ts', 'src/components/clients/clients-workspace.tsx', 'src/components/clients/client-details-page.tsx', 'src/components/clients/new-client-form.tsx', 'src/components/clients/edit-client-form.tsx'] },
  { key: 'staff', label: 'Staff feature',
    files: ['src/app/(workspace)/staff/page.tsx', 'src/app/(workspace)/staff/actions.ts', 'src/app/(workspace)/staff/new/page.tsx', 'src/app/(workspace)/staff/[staffId]/page.tsx', 'src/app/(workspace)/staff/[staffId]/edit/page.tsx', 'src/lib/staff.ts', 'src/components/staff/staff-workspace.tsx', 'src/components/staff/staff-details-page.tsx', 'src/components/staff/new-staff-form.tsx'] },
  { key: 'calendar-appointments', label: 'Calendar & appointments',
    files: ['src/app/(workspace)/calendar/page.tsx', 'src/app/(workspace)/calendar/actions.ts', 'src/app/(workspace)/calendar/new/page.tsx', 'src/app/(workspace)/calendar/[appointmentId]/edit/page.tsx', 'src/lib/calendar.ts', 'src/lib/appointments.ts', 'src/lib/time-zone.ts', 'src/components/calendar/calendar-workspace.tsx', 'src/components/calendar/new-appointment-form.tsx'] },
  { key: 'dashboard-reports', label: 'Dashboard & reports',
    files: ['src/app/(workspace)/dashboard/page.tsx', 'src/app/(workspace)/dashboard/actions.ts', 'src/app/(workspace)/reports/page.tsx', 'src/app/(workspace)/reports/actions.ts', 'src/app/(workspace)/page.tsx', 'src/app/(workspace)/actions.ts', 'src/lib/dashboard.ts', 'src/lib/reports.ts', 'src/lib/report-data.ts', 'src/lib/analytics-ai.ts', 'src/lib/billing.ts', 'src/lib/public-plans.ts', 'src/components/dashboard/dashboard-overview.tsx', 'src/components/dashboard/dashboard-unread-card.tsx', 'src/components/reports/reports-overview.tsx', 'src/components/billing/pro-feature-lock.tsx'] },
  { key: 'inbox-whatsapp-cron', label: 'Inbox, WhatsApp & cron',
    files: ['src/app/(workspace)/inbox/page.tsx', 'src/app/(workspace)/inbox/actions.ts', 'src/lib/inbox.ts', 'src/lib/inbox-server.ts', 'src/lib/whatsapp.ts', 'src/lib/whatsapp-connection.ts', 'src/lib/reminders.ts', 'src/app/api/webhooks/twilio/whatsapp/route.ts', 'src/app/api/cron/reminders/route.ts', 'src/app/api/cron/analytics/route.ts', 'src/components/inbox/inbox-workspace.tsx'] },
  { key: 'settings-onboarding', label: 'Settings & onboarding',
    files: ['src/app/(workspace)/settings/page.tsx', 'src/app/(workspace)/settings/actions.ts', 'src/lib/settings.ts', 'src/lib/branding.ts', 'src/app/onboarding/page.tsx', 'src/app/onboarding/actions.ts', 'src/app/onboarding/complete/page.tsx', 'src/lib/onboarding.ts', 'src/components/settings/settings-workspace.tsx', 'src/components/onboarding/onboarding-flow.tsx'] },
  { key: 'media-search', label: 'Media, search & navigation',
    files: ['src/lib/media-storage.ts', 'src/lib/media-storage-client.ts', 'src/lib/media-storage-server.ts', 'src/app/api/search/route.ts', 'src/lib/navigation.ts', 'src/lib/constants.ts'] },
  { key: 'shared-layout-primitives', label: 'Shared layout & workspace primitives',
    files: ['src/components/layout/app-shell.tsx', 'src/components/layout/global-search.tsx', 'src/components/layout/notifications-menu.tsx', 'src/components/layout/owner-account-dialog.tsx', 'src/components/layout/workspace-tour.tsx', 'src/components/layout/workspace-placeholder.tsx', 'src/components/workspace/workspace-layout.tsx', 'src/components/workspace/create-page-shell.tsx', 'src/app/(workspace)/layout.tsx', 'src/lib/utils.ts'] },
]

phase('Review')

const results = await pipeline(
  SLICES,
  (slice) => agent(
    `${CONTEXT}\n\nYou are reviewing the "${slice.label}" slice of the codebase. Read and review EVERY one of these files fully, line by line:\n${slice.files.map((f) => '- ' + f).join('\n')}\n\nReturn structured findings across all four dimensions. Set "slice" to "${slice.key}".`,
    { label: `review:${slice.key}`, phase: 'Review', schema: FINDING_SCHEMA }
  ),
  (review, slice) => {
    if (!review || !review.findings || review.findings.length === 0) return []
    const tasks = review.findings.map((f) => () =>
      agent(
        `${CONTEXT}\n\nYou are an ADVERSARIAL VERIFIER. A prior reviewer reported the finding below. Your job is to REFUTE it if you can. Open the actual file and read the relevant code and its surrounding context carefully before judging. Consider: does the tenant-scoping/auth actually happen elsewhere (a helper, the proxy, or a parent call)? Is the "bug" actually correct given the conventions? Is the severity inflated?\n\nFINDING:\n- title: ${f.title}\n- dimension: ${f.dimension}\n- claimed severity: ${f.severity}\n- file: ${f.file}\n- line: ${f.line}\n- description: ${f.description}\n- evidence: ${f.evidence}\n\nReturn your verdict. Default toward "false_positive" if the code is actually safe/correct; "confirmed" only if you verified the problem is real in context; "uncertain" if you genuinely cannot tell. adjustedSeverity is your honest severity after re-reading (use "none" for false positives).`,
        { label: `verify:${slice.key}`, phase: 'Verify', schema: VERDICT_SCHEMA }
      ).then((v) => ({ title: f.title, dimension: f.dimension, severity: f.severity, file: f.file, line: f.line, description: f.description, evidence: f.evidence, suggestedFix: f.suggestedFix, confidence: f.confidence, slice: slice.key, verdict: v }))
    )
    return parallel(tasks)
  }
)

const verified = results.flat().filter(Boolean)
const confirmed = verified.filter((f) => f.verdict && (f.verdict.verdict === 'confirmed' || f.verdict.verdict === 'uncertain'))
const falsePositives = verified.filter((f) => f.verdict && f.verdict.verdict === 'false_positive')

const order = { critical: 0, high: 1, medium: 2, low: 3, none: 4 }
function rank(sev) { const r = order[sev]; return r === undefined ? 9 : r }
confirmed.sort((a, b) => rank(a.verdict.adjustedSeverity) - rank(b.verdict.adjustedSeverity))

log(`Review complete: ${confirmed.length} confirmed/uncertain findings, ${falsePositives.length} refuted`)

return {
  summary: {
    totalRaw: verified.length,
    confirmed: confirmed.length,
    falsePositives: falsePositives.length,
    bySeverity: confirmed.reduce((acc, f) => { const s = f.verdict.adjustedSeverity; acc[s] = (acc[s] || 0) + 1; return acc }, {}),
    byDimension: confirmed.reduce((acc, f) => { acc[f.dimension] = (acc[f.dimension] || 0) + 1; return acc }, {}),
  },
  confirmed: confirmed.map((f) => ({
    title: f.title, dimension: f.dimension, severity: f.verdict.adjustedSeverity, originalSeverity: f.severity,
    file: f.file, line: f.line, description: f.description, evidence: f.evidence, suggestedFix: f.suggestedFix,
    confidence: f.confidence, verdict: f.verdict.verdict, verifierReasoning: f.verdict.reasoning, slice: f.slice,
  })),
  falsePositives: falsePositives.map((f) => ({ title: f.title, file: f.file, line: f.line, why: f.verdict.reasoning })),
}
