# Vela Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public Vela homepage with a premium product-command-center SaaS landing page while preserving auth, database, API, billing, workspace functionality, and all existing public routes.

**Architecture:** Keep the redesign centered in the existing shared marketing component so `/`, `/product`, `/pricing`, `/about`, and `/contact` continue using one shell. Build homepage product visuals as code-native React/Tailwind mockups with local data arrays, add only reusable CSS animation utilities, and update `/checkout` copy without changing checkout state or billing logic.

**Tech Stack:** Next.js 16.2.6 App Router, React 19, TypeScript, Tailwind CSS 4, existing Vela CSS variables, Lucide icons, existing `BrandMark`, existing `publicPlans`.

---

## File Structure

- Modify `src/components/marketing/marketing-site.tsx`: primary redesign surface; update imports/data, shared header/footer, homepage section order, code-native product mockups, public page copy safety, contact page fake details, and reusable homepage helpers.
- Modify `src/app/globals.css`: add landing-page-only animation and mockup utilities, preserving existing Vela tokens and workspace styles.
- Modify `src/app/page.tsx`: update homepage metadata to match the new product positioning if needed.
- Modify `src/app/checkout/page.tsx`: copy-only cleanup of public checkout preparation language; do not alter `getCurrentUser`, `getCurrentBusiness`, selected plan resolution, plan state resolution, or route behavior.
- Modify `PROJECT_STATUS.md`: record the completed landing-page redesign and verification results after implementation.
- Do not modify auth routes, API routes, Prisma schema, Supabase helpers, workspace routes, billing plan state logic, or middleware/proxy protection.

## Task 1: Safety Baseline And Current Route Inventory

**Files:**
- Read: `AGENTS.md`
- Read: `PROJECT_STATUS.md`
- Read: `src/components/marketing/marketing-site.tsx`
- Read: `src/app/checkout/page.tsx`
- Read: `src/app/page.tsx`
- Read: `src/app/globals.css`
- No code changes in this task.

- [ ] **Step 1: Confirm branch and clean workspace**

Run:

```powershell
git branch --show-current
git status --short
```

Expected:

```text
codex/vela-landing-redesign
```

`git status --short` should be empty before editing. If it is not empty, inspect the changed files and preserve user work.

- [ ] **Step 2: Confirm the relevant public files still exist**

Run:

```powershell
Test-Path src\app\page.tsx
Test-Path src\app\product\page.tsx
Test-Path src\app\pricing\page.tsx
Test-Path src\app\about\page.tsx
Test-Path src\app\contact\page.tsx
Test-Path src\app\checkout\page.tsx
Test-Path src\app\terms-and-conditions\page.tsx
Test-Path src\app\privacy\page.tsx
Test-Path src\app\refund\page.tsx
```

Expected: every command prints `True`.

- [ ] **Step 3: Record current risky copy targets**

Run:

```powershell
Select-String -Path src\components\marketing\marketing-site.tsx,src\app\checkout\page.tsx -Pattern 'diagnosis|hello@vela\.app|\+1 \(555\)|Paddle|Payment connection pending|Login|Get started' -CaseSensitive:$false
```

Expected before implementation: matches in the current files. These should be removed or changed in later tasks except safe CTA text that intentionally remains.

## Task 2: Shared Marketing Shell Copy And Navigation

**Files:**
- Modify: `src/components/marketing/marketing-site.tsx`

- [ ] **Step 1: Update marketing imports**

Replace the Lucide import block in `src/components/marketing/marketing-site.tsx` with a broader icon set used by the new homepage mockups:

```tsx
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  CreditCard,
  FileImage,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
  UserRound,
  UsersRound,
} from "lucide-react";
```

Remove `Mail` and `Phone` from this file because public fake contact details are being removed.

- [ ] **Step 2: Replace top-level marketing data with safe product-first copy**

Replace `productPillars`, `workflowSteps`, and `comparisonRows` with these values. Keep `navItems`, `footerLinks`, and `marketingImages` unless later steps remove image usage from the homepage.

```tsx
const clinicTypes = [
  "Dental clinics",
  "Aesthetic clinics",
  "Dermatology clinics",
  "Physiotherapy clinics",
  "Wellness clinics",
  "Private practices",
];

const productPillars = [
  {
    icon: CalendarDays,
    title: "Manage appointments",
    copy: "Keep the day visible with clear bookings, status, staff ownership, and blocked time.",
  },
  {
    icon: UserRound,
    title: "Organize patient records",
    copy: "Attach visits, notes, images, documents, messages, and payments to one patient profile.",
  },
  {
    icon: UsersRound,
    title: "Coordinate staff",
    copy: "See who is available, what is assigned, and where the clinic needs more coverage.",
  },
  {
    icon: BarChart3,
    title: "Understand performance",
    copy: "Turn daily activity into operational reports, trends, and recommended next actions.",
  },
];

const workflowSteps = [
  "Scattered calendars and notes",
  "Unclear staff availability",
  "Lost WhatsApp follow-ups",
  "Disconnected documents and payments",
  "Reports that take too long to read",
];

const comparisonRows = [
  ["Appointments and calendar", "Included", "Included"],
  ["Patient record timeline", "Included", "Included"],
  ["Documents, scans, and images", "Included", "Included"],
  ["WhatsApp-ready inbox", "Included", "Included"],
  ["Operational reports", "Basic", "Advanced"],
  ["AI-assisted insights", "Limited", "Full"],
  ["Setup support", "Standard", "Priority"],
];
```

- [ ] **Step 3: Update `MarketingHeader` CTA labels**

In `MarketingHeader`, change the login link text from `Login` to `Log in`, and simplify the sign-up CTA to one label:

```tsx
<Link
  href="/login"
  className="hidden h-10 items-center rounded-[0.75rem] border border-border/80 bg-white px-4 text-sm font-semibold text-foreground shadow-[0_10px_24px_rgba(20,21,47,0.04)] transition hover:border-primary/40 hover:text-primary sm:inline-flex"
>
  Log in
</Link>
<Link
  href="/sign-up"
  className="vela-gradient inline-flex h-10 items-center rounded-[0.75rem] px-4 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(150,118,247,0.26)] transition hover:-translate-y-0.5"
>
  Start free
</Link>
```

- [ ] **Step 4: Update footer copy and copyright encoding**

Replace the footer description and copyright line with:

```tsx
<p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
  Vela brings appointments, patient records, staff, messaging, payments, and reports into one calm clinic workspace.
</p>
```

```tsx
<div className="mx-auto mt-8 max-w-7xl text-xs font-semibold text-muted-foreground">
  © 2026 Vela. All rights reserved.
</div>
```

- [ ] **Step 5: Remove fake contact details from `ContactPage`**

Replace the contact methods block with operational, non-fake contact methods:

```tsx
<div className="mt-8 grid gap-4">
  <ContactMethod icon={CalendarDays} title="Book a demo" copy="Walk through scheduling, records, inbox, and reports." />
  <ContactMethod icon={MessageCircle} title="Setup questions" copy="Ask about moving clinic workflows into Vela." />
  <ContactMethod icon={ShieldCheck} title="Privacy-conscious workflows" copy="Discuss records, documents, workspace access, and reporting expectations." />
  <ContactMethod icon={Sparkles} title="Early access" copy="Share what your clinic needs before online checkout is fully available." />
</div>
```

- [ ] **Step 6: Run lint for early copy/import errors**

Run:

```powershell
npm run lint
```

Expected: no ESLint errors. If unused import errors appear, remove the unused imports before continuing.

## Task 3: Homepage Section Order And Hero Command Center

**Files:**
- Modify: `src/components/marketing/marketing-site.tsx`

- [ ] **Step 1: Replace `HomePage` section order**

Replace the `HomePage` function with:

```tsx
export function HomePage() {
  return (
    <MarketingShell>
      <HeroSection />
      <ClinicTypesSection />
      <ProblemSection />
      <SolutionSection />
      <ProductDeepDive />
      <AiInsightsSection />
      <TrustSection />
      <PricingPreviewSection />
      <FinalCtaSection />
    </MarketingShell>
  );
}
```

- [ ] **Step 2: Replace `HeroSection`**

Replace the existing `HeroSection` implementation with:

```tsx
function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(150,118,247,0.16),transparent_34%),radial-gradient(circle_at_82%_16%,rgba(109,195,213,0.16),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f8faff_54%,#ffffff_100%)]" />
      <div className="landing-gradient-glow absolute left-1/2 top-20 h-48 w-[36rem] -translate-x-1/2 rounded-full opacity-70 blur-3xl" />
      <div className="relative mx-auto max-w-7xl">
        <div className="mx-auto max-w-5xl text-center section-reveal">
          <h1 className="mx-auto max-w-5xl text-[3rem] font-semibold leading-[0.94] text-[var(--brand-ink)] sm:text-7xl lg:text-[5.85rem]">
            Run your clinic from one calm, intelligent workspace.
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
            Vela brings appointments, patients, staff, WhatsApp messages, payments, documents, and reports into one clean system built for modern clinics.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/sign-up"
              className="vela-gradient inline-flex h-12 items-center justify-center gap-2 rounded-[0.85rem] px-6 text-sm font-bold text-white shadow-[0_18px_44px_rgba(150,118,247,0.28)] transition hover:-translate-y-0.5"
            >
              Start free
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/product"
              className="inline-flex h-12 items-center justify-center rounded-[0.85rem] border border-border/80 bg-white px-6 text-sm font-bold text-foreground shadow-[0_14px_36px_rgba(20,21,47,0.05)] transition hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary"
            >
              View product
            </Link>
          </div>
        </div>
        <div className="landing-command-stage mx-auto mt-12 max-w-6xl section-reveal-delayed">
          <CommandCenterMockup />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add `CommandCenterMockup` below `HeroSection`**

Add this component below `HeroSection`:

```tsx
function CommandCenterMockup() {
  return (
    <div className="landing-card-pop relative overflow-hidden rounded-[1.65rem] border border-white/80 bg-white/92 p-3 shadow-[0_34px_110px_rgba(54,65,112,0.18)] backdrop-blur-xl sm:p-4 lg:p-5">
      <div className="grid gap-3 rounded-[1.25rem] border border-border/70 bg-[#fbfdff] p-3 sm:grid-cols-[1.08fr_0.92fr] sm:p-4 lg:grid-cols-[1.18fr_0.82fr]">
        <div className="min-w-0 rounded-[1rem] border border-border/70 bg-white p-4 shadow-[0_18px_48px_rgba(20,21,47,0.055)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Today</p>
              <h3 className="mt-1 text-xl font-semibold text-[var(--brand-ink)]">Clinic dashboard</h3>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">7 appointments</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <MiniMetric label="Completion" value="84%" icon={CheckCircle2} />
            <MiniMetric label="Unread" value="12" icon={MessageCircle} />
            <MiniMetric label="Collected" value="$2.4k" icon={CreditCard} />
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_0.82fr]">
            <AppointmentsPanel />
            <InsightMiniPanel />
          </div>
        </div>
        <div className="grid min-w-0 gap-3">
          <PatientProfilePanel />
          <StaffSchedulePanel />
          <InboxPreviewPanel />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add hero mockup helper components**

Add these helper components below `CommandCenterMockup`:

```tsx
function MiniMetric({ label, value, icon: Icon }: { label: string; value: string; icon: ElementType }) {
  return (
    <div className="rounded-[0.9rem] border border-border/70 bg-[var(--brand-wash)]/45 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-2 text-2xl font-semibold text-[var(--brand-ink)]">{value}</p>
    </div>
  );
}

function AppointmentsPanel() {
  const appointments = [
    ["09:30", "Maya N.", "Dental cleaning", "Checked in"],
    ["11:00", "Daniel K.", "Skin consultation", "Confirmed"],
    ["14:30", "Anna R.", "Physiotherapy", "Payment due"],
  ];

  return (
    <div className="rounded-[0.95rem] border border-border/70 bg-white p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-[var(--brand-ink)]">Today's appointments</h4>
        <CalendarDays className="size-4 text-primary" />
      </div>
      <div className="mt-4 grid gap-3">
        {appointments.map(([time, name, service, status]) => (
          <div key={`${time}-${name}`} className="grid grid-cols-[3.5rem_1fr] gap-3 rounded-[0.75rem] bg-[var(--brand-wash)]/45 p-3">
            <span className="text-sm font-bold text-primary">{time}</span>
            <span>
              <span className="block text-sm font-bold text-[var(--brand-ink)]">{name}</span>
              <span className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
                <span>{service}</span>
                <span>•</span>
                <span>{status}</span>
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightMiniPanel() {
  return (
    <div className="rounded-[0.95rem] border border-primary/20 bg-gradient-to-br from-primary/10 to-[#6dc3d5]/10 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-primary">
        <Sparkles className="size-4" />
        Operational insight
      </div>
      <p className="mt-4 text-sm font-semibold leading-6 text-[var(--brand-ink)]">
        Afternoon bookings are filling fastest this week. Add one more staff block on Thursday to protect wait times.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-muted-foreground">
        <span className="rounded-full bg-white/80 px-3 py-1">Demand +18%</span>
        <span className="rounded-full bg-white/80 px-3 py-1">Confidence 82%</span>
      </div>
    </div>
  );
}

function PatientProfilePanel() {
  return (
    <div className="landing-card-delay rounded-[1rem] border border-border/70 bg-white p-4 shadow-[0_18px_52px_rgba(20,21,47,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex size-11 items-center justify-center rounded-[0.9rem] bg-primary/10 text-sm font-bold text-primary">MN</span>
          <div>
            <h4 className="text-sm font-bold text-[var(--brand-ink)]">Maya Novak</h4>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">Last visit 14 days ago</p>
          </div>
        </div>
        <span className="rounded-full bg-[#6dc3d5]/12 px-3 py-1 text-xs font-bold text-[#297f91]">Profile linked</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-bold text-muted-foreground">
        <span className="rounded-[0.75rem] bg-[var(--brand-wash)] p-2">6 visits</span>
        <span className="rounded-[0.75rem] bg-[var(--brand-wash)] p-2">4 files</span>
        <span className="rounded-[0.75rem] bg-[var(--brand-wash)] p-2">$420 paid</span>
      </div>
    </div>
  );
}

function StaffSchedulePanel() {
  return (
    <div className="landing-card-delay-2 rounded-[1rem] border border-border/70 bg-white p-4 shadow-[0_18px_52px_rgba(20,21,47,0.06)]">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-[var(--brand-ink)]">Staff schedule</h4>
        <Clock3 className="size-4 text-primary" />
      </div>
      <div className="mt-4 grid gap-2">
        {["Dr. Kim • Room 2 • 09:00-15:00", "Nora Bell • Front desk • 10:00-18:00"].map((row) => (
          <div key={row} className="rounded-[0.75rem] border border-border/60 bg-[var(--brand-wash)]/45 px-3 py-2 text-xs font-semibold text-muted-foreground">
            {row}
          </div>
        ))}
      </div>
    </div>
  );
}

function InboxPreviewPanel() {
  return (
    <div className="rounded-[1rem] border border-border/70 bg-white p-4 shadow-[0_18px_52px_rgba(20,21,47,0.06)]">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-[var(--brand-ink)]">WhatsApp inbox</h4>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">12 unread</span>
      </div>
      <p className="mt-3 rounded-[0.75rem] bg-[#effafc] p-3 text-xs font-semibold leading-5 text-muted-foreground">
        Unknown number matched to Maya Novak after appointment confirmation.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Run lint**

Run:

```powershell
npm run lint
```

Expected: no ESLint errors.

## Task 4: Homepage Story Sections

**Files:**
- Modify: `src/components/marketing/marketing-site.tsx`

- [ ] **Step 1: Add clinic types section**

Add this component below the hero helpers:

```tsx
function ClinicTypesSection() {
  return (
    <section className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[1.25rem] border border-border/80 bg-white/88 p-5 shadow-[0_24px_70px_rgba(20,21,47,0.055)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="max-w-xl text-2xl font-semibold leading-tight text-[var(--brand-ink)] sm:text-3xl">
            Built for clinics that need structure without complexity.
          </h2>
          <div className="flex flex-wrap gap-2">
            {clinicTypes.map((type) => (
              <span key={type} className="rounded-full border border-border/80 bg-[var(--brand-wash)]/60 px-4 py-2 text-sm font-bold text-foreground">
                {type}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add problem section**

Add this component:

```tsx
function ProblemSection() {
  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">The daily friction</p>
          <h2 className="mt-4 text-4xl font-semibold leading-[0.98] text-[var(--brand-ink)] sm:text-6xl">
            Clinic work breaks down when every task lives somewhere else.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground">
            Appointments, staff, patient context, messages, documents, payments, and reports should not require six disconnected tools.
          </p>
        </div>
        <div className="rounded-[1.35rem] border border-border/80 bg-white p-4 shadow-[0_24px_80px_rgba(20,21,47,0.07)]">
          <div className="grid gap-3 md:grid-cols-2">
            {workflowSteps.map((step, index) => (
              <div key={step} className="rounded-[0.95rem] border border-border/70 bg-[var(--brand-wash)]/45 p-4">
                <span className="flex size-8 items-center justify-center rounded-[0.7rem] bg-white text-sm font-bold text-primary shadow-[0_10px_24px_rgba(20,21,47,0.05)]">
                  {index + 1}
                </span>
                <p className="mt-4 text-sm font-bold text-[var(--brand-ink)]">{step}</p>
              </div>
            ))}
            <div className="rounded-[0.95rem] border border-primary/30 bg-gradient-to-br from-primary/12 to-[#6dc3d5]/12 p-4 md:col-span-2">
              <p className="text-sm font-bold text-primary">Vela organizes the same work into one operating view.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add solution section**

Add this component:

```tsx
function SolutionSection() {
  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <h2 className="text-4xl font-semibold leading-[0.98] text-[var(--brand-ink)] sm:text-6xl">
            Vela gives every clinic a single workspace for daily operations.
          </h2>
          <p className="mt-5 text-base leading-8 text-muted-foreground">
            The product is organized around the way a clinic actually runs: schedule the day, serve patients, coordinate staff, follow up, and read performance clearly.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {productPillars.map((pillar) => (
            <PillarCard key={pillar.title} {...pillar} />
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run lint**

Run:

```powershell
npm run lint
```

Expected: no ESLint errors.

## Task 5: Product Deep-Dive Sections And Mockup Variants

**Files:**
- Modify: `src/components/marketing/marketing-site.tsx`

- [ ] **Step 1: Add product feature data**

Add this array near the other top-level constants:

```tsx
const productFeatures = [
  {
    title: "Know what needs attention today.",
    copy: "Open Vela and see the clinic day: today's appointments, unread messages, recent clients, staff activity, and the operational insight that needs attention.",
    visual: "dashboard",
  },
  {
    title: "A clearer schedule for every clinic day.",
    copy: "Plan by day or week, protect blocked time, assign staff, and keep appointment statuses visible without leaving the calendar.",
    visual: "calendar",
  },
  {
    title: "Every patient record in one place.",
    copy: "Keep profile details, appointment history, notes, documents, images, payments, and messages connected to the same patient record.",
    visual: "patients",
  },
  {
    title: "Keep clinic conversations organized.",
    copy: "Manage WhatsApp-style conversations, unread messages, unknown contacts, and patient-linked replies without losing context.",
    visual: "inbox",
  },
  {
    title: "Understand performance without spreadsheets.",
    copy: "Review trends, completion rate, revenue and payment context, AI-assisted operational insights, and recommended next actions.",
    visual: "reports",
  },
] satisfies Array<{
  title: string;
  copy: string;
  visual: "dashboard" | "calendar" | "patients" | "inbox" | "reports";
}>;
```

- [ ] **Step 2: Add `ProductDeepDive` and visual dispatcher**

Add:

```tsx
function ProductDeepDive() {
  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8">
        {productFeatures.map((feature, index) => (
          <div
            key={feature.title}
            className="grid gap-8 rounded-[1.45rem] border border-border/80 bg-white p-5 shadow-[0_24px_84px_rgba(20,21,47,0.06)] lg:grid-cols-[0.78fr_1.22fr] lg:items-center lg:p-7"
          >
            <div className={index % 2 === 1 ? "lg:order-2" : ""}>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">Product</p>
              <h2 className="mt-4 text-4xl font-semibold leading-[0.98] text-[var(--brand-ink)] sm:text-5xl">
                {feature.title}
              </h2>
              <p className="mt-5 max-w-xl text-base leading-8 text-muted-foreground">{feature.copy}</p>
            </div>
            <div className={index % 2 === 1 ? "lg:order-1" : ""}>
              <FeatureMockup visual={feature.visual} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatureMockup({ visual }: { visual: "dashboard" | "calendar" | "patients" | "inbox" | "reports" }) {
  if (visual === "calendar") return <CalendarMockup />;
  if (visual === "patients") return <PatientsMockup />;
  if (visual === "inbox") return <InboxMockup />;
  if (visual === "reports") return <ReportsMockup />;
  return <DashboardMockup />;
}
```

- [ ] **Step 3: Add compact mockup components**

Add these components. Keep them code-native and illustrative:

```tsx
function DashboardMockup() {
  return (
    <div className="mockup-frame">
      <div className="grid gap-3 md:grid-cols-3">
        <MiniMetric label="Appointments" value="7" icon={CalendarDays} />
        <MiniMetric label="Unread" value="12" icon={MessageCircle} />
        <MiniMetric label="Staff active" value="5" icon={UsersRound} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
        <AppointmentsPanel />
        <InsightMiniPanel />
      </div>
    </div>
  );
}

function CalendarMockup() {
  const rows = [
    ["09:00", "Blocked prep", "Room 1"],
    ["10:30", "Consultation", "Dr. Kim"],
    ["13:00", "Follow-up", "Nora Bell"],
    ["15:30", "New booking", "Open slot"],
  ];
  return (
    <div className="mockup-frame">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[var(--brand-ink)]">Thursday schedule</h3>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">Create appointment</span>
      </div>
      <div className="mt-4 grid gap-2">
        {rows.map(([time, event, staff]) => (
          <div key={`${time}-${event}`} className="grid grid-cols-[4rem_1fr_auto] gap-3 rounded-[0.85rem] border border-border/70 bg-white p-3 text-sm">
            <span className="font-bold text-primary">{time}</span>
            <span className="font-bold text-[var(--brand-ink)]">{event}</span>
            <span className="text-xs font-semibold text-muted-foreground">{staff}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PatientsMockup() {
  return (
    <div className="mockup-frame">
      <PatientProfilePanel />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {["Appointment history", "Medical notes", "Documents and images", "Payments and messages"].map((item) => (
          <div key={item} className="rounded-[0.85rem] border border-border/70 bg-white p-3 text-sm font-bold text-[var(--brand-ink)]">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function InboxMockup() {
  const conversations = [
    ["Maya Novak", "Can I move my appointment to 11:00?", "2 unread"],
    ["Unknown contact", "I would like to book a first visit.", "New"],
    ["Daniel Kiss", "Thanks, see you Thursday.", "Linked"],
  ];
  return (
    <div className="mockup-frame">
      <div className="grid gap-3">
        {conversations.map(([name, message, status]) => (
          <div key={name} className="rounded-[0.9rem] border border-border/70 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-bold text-[var(--brand-ink)]">{name}</h4>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{status}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportsMockup() {
  return (
    <div className="mockup-frame">
      <div className="grid gap-3 md:grid-cols-3">
        <MiniMetric label="Completion" value="84%" icon={CheckCircle2} />
        <MiniMetric label="Revenue" value="$12.8k" icon={CreditCard} />
        <MiniMetric label="Growth" value="+18%" icon={TrendingUp} />
      </div>
      <div className="mt-4 rounded-[0.95rem] border border-primary/20 bg-gradient-to-br from-primary/10 to-[#6dc3d5]/10 p-4">
        <p className="text-sm font-bold text-primary">Recommended next action</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--brand-ink)]">
          Bookings are strongest on Tuesday and Thursday afternoons. Consider moving more staff availability into these periods.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run lint**

Run:

```powershell
npm run lint
```

Expected: no ESLint errors.

## Task 6: AI, Trust, Pricing Preview, And Final CTA

**Files:**
- Modify: `src/components/marketing/marketing-site.tsx`

- [ ] **Step 1: Add AI insights section**

Add:

```tsx
function AiInsightsSection() {
  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 rounded-[1.6rem] bg-[var(--brand-ink)] p-6 text-white shadow-[0_30px_100px_rgba(20,21,47,0.22)] sm:p-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:p-10">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-white/55">AI-assisted operations</p>
          <h2 className="mt-4 text-4xl font-semibold leading-[0.98] sm:text-6xl">
            Understand what changed, why it matters, and what to improve next.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-8 text-white/72">
            Vela keeps insights operational: demand patterns, completion rate, payment context, staff coverage, and next actions.
          </p>
        </div>
        <div className="rounded-[1.25rem] border border-white/12 bg-white/[0.07] p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Sparkles className="size-5 text-[#6dc3d5]" />
            Insight summary
          </div>
          <p className="mt-5 text-xl font-semibold leading-8">
            Bookings are strongest on Tuesday and Thursday afternoons. Consider moving more staff availability into these periods.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <DarkMetric label="Demand lift" value="+18%" />
            <DarkMetric label="Completion" value="84%" />
            <DarkMetric label="Fallback ready" value="Rules" />
          </div>
        </div>
      </div>
    </section>
  );
}

function DarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[0.9rem] border border-white/10 bg-white/[0.06] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/52">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
```

- [ ] **Step 2: Add trust section**

Add:

```tsx
function TrustSection() {
  const trustItems = [
    ["Private clinic records", LockKeyhole],
    ["Secure document storage", FileImage],
    ["Authenticated workspace access", ShieldCheck],
    ["Customer-safe reporting", ClipboardList],
    ["Provider complexity hidden", Stethoscope],
    ["Operational privacy in mind", Activity],
  ] satisfies Array<[string, ElementType]>;

  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <h2 className="text-4xl font-semibold leading-[0.98] text-[var(--brand-ink)] sm:text-6xl">
            Designed with privacy-conscious clinic workflows in mind.
          </h2>
          <p className="mt-5 text-base leading-8 text-muted-foreground">
            Vela keeps the clinic experience focused on safe access, organized records, readable reporting, and simple product language.
          </p>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trustItems.map(([label, Icon]) => (
            <div key={label} className="rounded-[1rem] border border-border/80 bg-white p-4 shadow-[0_16px_44px_rgba(20,21,47,0.045)]">
              <Icon className="size-5 text-primary" />
              <p className="mt-4 text-sm font-bold text-[var(--brand-ink)]">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add pricing preview and final CTA**

Add:

```tsx
function PricingPreviewSection() {
  const previewPlans = [
    {
      name: "Basic",
      copy: "Core clinic operations for teams getting organized.",
      features: ["Appointments", "Clients", "Staff", "Inbox", "Basic reports"],
    },
    {
      name: "Pro",
      copy: "Deeper reporting and operational insight for growing clinics.",
      features: ["Advanced reports", "AI-assisted insights", "Operational analytics", "Growth tools"],
    },
  ];

  return (
    <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-4xl font-semibold leading-[0.98] text-[var(--brand-ink)] sm:text-6xl">
              Start simple. Grow into deeper insight.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground">
              The homepage gives a quick plan preview. The pricing page keeps the full comparison.
            </p>
          </div>
          <Link href="/pricing" className="inline-flex h-11 items-center justify-center gap-2 rounded-[0.85rem] border border-border/80 bg-white px-5 text-sm font-bold text-primary shadow-[0_14px_34px_rgba(20,21,47,0.05)] transition hover:-translate-y-0.5 hover:border-primary/40">
            View pricing
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {previewPlans.map((plan) => (
            <article key={plan.name} className="rounded-[1.25rem] border border-border/80 bg-white p-6 shadow-[0_24px_80px_rgba(20,21,47,0.06)]">
              <h3 className="text-2xl font-semibold text-[var(--brand-ink)]">{plan.name}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.copy}</p>
              <div className="mt-6 grid gap-3">
                {plan.features.map((feature) => (
                  <CheckLine key={feature}>{feature}</CheckLine>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section className="px-4 pb-14 sm:px-6 lg:px-8">
      <div className="vela-gradient mx-auto flex max-w-7xl flex-col gap-5 rounded-[1.5rem] p-6 text-white shadow-[0_24px_80px_rgba(150,118,247,0.24)] sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-semibold sm:text-5xl">Bring your clinic into one organized workspace.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/82">
            Start with appointments, patients, staff, and reports - then grow into messaging, automation, and deeper insights.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/sign-up" className="inline-flex h-11 items-center justify-center rounded-[0.85rem] bg-white px-5 text-sm font-bold text-primary transition hover:bg-white/90">
            Start free
          </Link>
          <Link href="/contact" className="inline-flex h-11 items-center justify-center rounded-[0.85rem] border border-white/40 px-5 text-sm font-bold text-white transition hover:bg-white/10">
            Contact us
          </Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Decide what to do with old homepage-only helpers**

After adding the new homepage sections, remove or keep old helpers based on usage:

Remove if unused:

```text
LogoStrip
WorkflowSection
FeatureImageSection
PlatformSection
CtaBand
```

Keep `CtaBand`, `WorkflowSection`, `ProductShowcase`, `ImageCard`, `PlanCard`, `PricingTable`, `LegalPanel`, `ContactMethod`, `FormField`, `MetricPill`, and `CheckLine` only if still referenced by Product, Pricing, About, or Contact pages. Run lint to find unused functions/imports and remove safely.

- [ ] **Step 5: Run lint**

Run:

```powershell
npm run lint
```

Expected: no ESLint errors.

## Task 7: Landing CSS Utilities

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add landing utility classes**

Inside the existing `@layer utilities` block, add these classes near the existing landing utilities:

```css
  .landing-gradient-glow {
    background:
      radial-gradient(circle, rgba(150, 118, 247, 0.28), transparent 62%),
      radial-gradient(circle at 72% 42%, rgba(109, 195, 213, 0.24), transparent 58%);
  }

  .landing-command-stage {
    perspective: 1200px;
  }

  .mockup-frame {
    min-width: 0;
    overflow: hidden;
    border-radius: 1.15rem;
    border: 1px solid rgba(92, 102, 132, 0.16);
    background:
      radial-gradient(circle at 18% 0%, rgba(150, 118, 247, 0.09), transparent 16rem),
      radial-gradient(circle at 88% 4%, rgba(109, 195, 213, 0.1), transparent 16rem),
      rgba(248, 250, 255, 0.96);
    padding: 1rem;
    box-shadow:
      0 24px 72px rgba(20, 21, 47, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.78);
  }
```

- [ ] **Step 2: Add reduced-motion coverage for the new stage if needed**

In both existing `prefers-reduced-motion` blocks, include any new animation class only if the implementation adds animation to it. With the CSS above, no extra reduced-motion class is required because `landing-gradient-glow`, `landing-command-stage`, and `mockup-frame` do not animate.

- [ ] **Step 3: Run lint**

Run:

```powershell
npm run lint
```

Expected: no ESLint errors.

## Task 8: Checkout Public Copy Cleanup

**Files:**
- Modify: `src/app/checkout/page.tsx`

- [ ] **Step 1: Update checkout metadata**

Change metadata description to:

```tsx
export const metadata: Metadata = {
  title: "Checkout | Vela",
  description: "Review your selected Vela plan and activation options.",
};
```

- [ ] **Step 2: Replace trust card copy**

In the top trust cards, replace:

```tsx
<TrustCard icon={ShieldCheck} title="Secure billing" copy="Payment provider integration ready." />
<TrustCard icon={CalendarDays} title="Monthly plan" copy="Start with predictable billing." />
<TrustCard icon={MessageCircle} title="Clinic support" copy="Help available during setup." />
```

with:

```tsx
<TrustCard icon={ShieldCheck} title="Plan review" copy="Confirm the plan that fits your clinic." />
<TrustCard icon={CalendarDays} title="Monthly plan" copy="Start with predictable monthly pricing." />
<TrustCard icon={MessageCircle} title="Setup support" copy="We can help activate the right workspace plan." />
```

- [ ] **Step 3: Replace disabled button title and helper text**

Replace:

```tsx
title="Paddle checkout will be connected here next."
```

with:

```tsx
title="Online card checkout is being prepared."
```

Replace the paragraph below the disabled button with:

```tsx
<p className="mt-3 text-center text-xs font-semibold text-muted-foreground">
  Online card checkout is being prepared. Plan activation is currently handled during setup.
</p>
```

- [ ] **Step 4: Replace what-happens-next copy**

Replace the paragraph under `What happens next` with:

```tsx
<p className="mt-1 text-sm leading-6 text-muted-foreground">
  Contact us and we will help activate this plan for your workspace. The selected plan and account context are already reflected in this review.
</p>
```

- [ ] **Step 5: Verify no public checkout provider wording remains**

Run:

```powershell
Select-String -Path src\app\checkout\page.tsx -Pattern 'Paddle|Payment connection pending|reserved for Paddle|provider integration ready' -CaseSensitive:$false
```

Expected: no matches.

- [ ] **Step 6: Run lint**

Run:

```powershell
npm run lint
```

Expected: no ESLint errors.

## Task 9: Homepage Metadata And Public Copy Audit

**Files:**
- Modify: `src/app/page.tsx`
- Read/possibly modify: `src/components/marketing/marketing-site.tsx`

- [ ] **Step 1: Update homepage metadata**

In `src/app/page.tsx`, replace metadata with:

```tsx
export const metadata: Metadata = {
  title: "Vela | Clinic management workspace",
  description:
    "Run appointments, patients, staff, WhatsApp messages, payments, documents, reports, and AI-assisted operational insights from one calm clinic workspace.",
};
```

- [ ] **Step 2: Audit unsafe or fake marketing language**

Run:

```powershell
Select-String -Path src\components\marketing\marketing-site.tsx,src\app\page.tsx,src\app\checkout\page.tsx -Pattern 'diagnosis|hello@vela\.app|\+1 \(555\)|Paddle|Payment connection pending|reserved for Paddle|HIPAA|GDPR|OpenAI|Supabase|Twilio|Prisma' -CaseSensitive:$false
```

Expected: no matches in public-facing copy. If `Paddle` appears only in comments, remove the comment. If `diagnosis` appears in Product/Pricing copy, replace it with `operational insight`, `operational reports`, or `performance insights`.

- [ ] **Step 3: Run lint**

Run:

```powershell
npm run lint
```

Expected: no ESLint errors.

## Task 10: Build And Browser Verification

**Files:**
- No intended code edits unless verification reveals defects.

- [ ] **Step 1: Run production build**

Run:

```powershell
npm run build
```

Expected: build completes successfully.

- [ ] **Step 2: Start local dev server**

Run:

```powershell
npm run dev
```

Keep the server running for browser checks. If port 3000 is busy, use the URL printed by Next.js.

- [ ] **Step 3: Browser-check public routes**

Open these routes in the browser:

```text
/
/product
/pricing
/about
/contact
/checkout?plan=basic
/checkout?plan=pro
/login
/sign-up
/terms-and-conditions
/privacy
/refund
```

Expected:

- `/` loads the redesigned homepage.
- Shared header/footer render on marketing pages.
- `/checkout?plan=basic` and `/checkout?plan=pro` load without provider-pending copy.
- `/login` and `/sign-up` still load auth pages.
- Legal pages load without authentication.
- No route is removed.

- [ ] **Step 4: Browser-check unauthenticated route protection**

Open:

```text
/dashboard
```

Expected: redirects to `/login?next=%2Fdashboard` or the app's existing login redirect shape.

- [ ] **Step 5: Responsive visual check**

Check `/` at:

```text
Desktop: 1440x1000
Tablet-ish: 900x900
Mobile: 390x844
```

Expected:

- No horizontal overflow.
- Header does not wrap awkwardly.
- Hero headline and CTAs fit.
- Code-native product mockup remains readable and does not clip.
- Deep product cards stack cleanly on mobile.
- Gradient/dark sections maintain contrast.
- Motion is subtle; no jarring layout shifts.

- [ ] **Step 6: Fix verification issues**

If any visual or route issue appears, edit only the relevant allowed files:

```text
src/components/marketing/marketing-site.tsx
src/app/globals.css
src/app/page.tsx
src/app/checkout/page.tsx
```

After fixes, rerun:

```powershell
npm run lint
npm run build
```

Expected: both pass.

## Task 11: Project Status Update

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Update `Last updated`**

Set:

```markdown
Last updated: 2026-05-23
```

- [ ] **Step 2: Add completed task bullet**

Add this bullet under `Completed Features`:

```markdown
- Public homepage redesign completed as a product-command-center landing page for Vela. The new homepage uses code-native Vela workspace mockups, clearer clinic workflow storytelling, clinic-type targeting, problem/solution sections, five product deep dives, safe AI-assisted operational insight copy, privacy-conscious trust messaging, pricing preview, stronger CTAs, shared marketing shell copy cleanup, and customer-safe checkout preparation wording without changing auth, database, API, billing, or protected workspace behavior.
```

- [ ] **Step 3: Update last completed task**

Replace the `Last Completed Task` paragraph with:

```markdown
- Completed the public Vela landing page redesign. The homepage now presents Vela as a premium clinic management workspace through code-native product mockups and clearer conversion sections, while shared marketing copy was cleaned up and checkout preparation wording was made customer-safe. Verified with `npm run lint`, `npm run build`, and browser checks for the public marketing/auth/legal/checkout routes plus unauthenticated workspace redirect behavior.
```

- [ ] **Step 4: Add any new known issue only if verification found one**

If browser verification finds a real residual issue that cannot be fixed in this task, add a concise Known Issues bullet. If no new issue remains, do not add a new Known Issues bullet.

- [ ] **Step 5: Run final status diff check**

Run:

```powershell
git diff -- PROJECT_STATUS.md
```

Expected: only the landing-page redesign status update and date/last-task changes appear.

## Task 12: Final Verification And Review Prep

**Files:**
- No intended code edits unless final verification reveals defects.

- [ ] **Step 1: Run final lint and build**

Run:

```powershell
npm run lint
npm run build
```

Expected: both pass.

- [ ] **Step 2: Final copy audit**

Run:

```powershell
Select-String -Path src\components\marketing\marketing-site.tsx,src\app\page.tsx,src\app\checkout\page.tsx -Pattern 'diagnosis|hello@vela\.app|\+1 \(555\)|Paddle|Payment connection pending|reserved for Paddle|HIPAA|GDPR|OpenAI|Supabase|Twilio|Prisma' -CaseSensitive:$false
```

Expected: no matches.

- [ ] **Step 3: Review changed files**

Run:

```powershell
git status --short
git diff --stat
git diff -- src\components\marketing\marketing-site.tsx src\app\globals.css src\app\page.tsx src\app\checkout\page.tsx PROJECT_STATUS.md
```

Expected changed files:

```text
src/components/marketing/marketing-site.tsx
src/app/globals.css
src/app/page.tsx
src/app/checkout/page.tsx
PROJECT_STATUS.md
```

The spec and plan docs may also be present from the planning workflow. No auth, API, Prisma, Supabase, billing logic, or workspace files should be changed.

- [ ] **Step 4: Commit implementation**

Run:

```powershell
git add src\components\marketing\marketing-site.tsx src\app\globals.css src\app\page.tsx src\app\checkout\page.tsx PROJECT_STATUS.md
git commit -m "feat: redesign Vela landing page"
```

Expected: commit succeeds.

- [ ] **Step 5: Prepare final summary**

Final response should include:

- Changed files.
- What improved visually.
- What improved from a conversion perspective.
- Verification results for `npm run lint`, `npm run build`, and browser checks.
- Confirmation that auth, database, API routes, billing logic, workspace functionality, and public routes were not intentionally changed.

## Self-Review

Spec coverage:

- Header/navigation cleanup: Task 2.
- Hero command center: Task 3.
- Clinic types, problem, solution: Task 4.
- Five product sections: Task 5.
- AI, trust, pricing preview, final CTA: Task 6.
- Motion and CSS utilities: Task 7.
- Checkout public copy cleanup: Task 8.
- Metadata and unsafe copy audit: Task 9.
- Verification and responsive route checks: Task 10.
- Project memory update: Task 11.
- Final verification and commit prep: Task 12.

Placeholder scan:

- No `TBD`, `TODO`, or incomplete task remains.
- "If" clauses only describe bounded verification handling or residual issue recording.

Scope check:

- The plan stays inside marketing, CSS, homepage metadata, checkout copy, and project status.
- It does not change auth, database, API routes, billing state logic, workspace pages, or route protection.
