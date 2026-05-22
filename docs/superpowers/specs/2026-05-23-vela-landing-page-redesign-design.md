# Vela Landing Page Redesign Design

## Summary

Redesign the public Vela homepage as a premium, product-first SaaS landing page for appointment-based clinics. The selected direction is Approach A: a product command center that explains Vela through realistic interface mockups and clear clinic operations storytelling.

The work focuses on the public marketing homepage and shared marketing components. It must not change authentication logic, database logic, API routes, billing logic, protected workspace functionality, or existing public route availability.

## Product Positioning

Vela is a clinic management workspace for appointment-based clinics. It brings appointments, patients and clients, staff, schedules, WhatsApp conversations, documents and images, payments, reports, and AI-assisted operational insights into one calm workspace.

The homepage should make the product understandable to a first-time visitor. The strongest proof should be app-like product visuals, not broad claims, stock imagery, fake testimonials, or fake customer logos.

Use safe AI language:

- AI-assisted operational insights
- clinic performance insights
- smart recommendations
- operational reports

Avoid medical AI claims such as AI diagnosis, diagnosis automation, clinical recommendations, or patient diagnosis.

## Visual Direction

The visual identity should feel modern, premium, clinical, intelligent, calm, trustworthy, and SaaS-like.

Use:

- Vela primary gradient: `#9676F7` to `#6dc3d5`
- White and soft gray surfaces
- Dark text with muted supporting copy
- Subtle borders and shadows
- Violet and cyan accents
- Clean, spacious layouts
- Integrated Vela logo and icon treatment
- Code-native interface mockups that resemble actual Vela workflows

Avoid:

- Generic green healthcare styling
- Random decorative stock imagery
- Fake testimonials or fake clinic logos
- Loud gradients that overpower the product
- Childish or heavy animation
- Compliance claims that are not implemented

## Page Architecture

### Header

Use a sticky or semi-sticky marketing header. It should include:

- Vela logo on the left
- Navigation links: Product, Pricing, About, Contact
- Right-side links: Log in and Start free

Fix customer-facing copy issues:

- Use `Log in`, not `Login`.
- Use a single CTA label such as `Start free`.
- Do not create duplicate text like `Start Get started`.

### Hero

Hero headline:

`Run your clinic from one calm, intelligent workspace.`

Hero subheadline:

`Vela brings appointments, patients, staff, WhatsApp messages, payments, documents, and reports into one clean system built for modern clinics.`

Hero CTAs:

- Primary: `Start free` linking to `/sign-up`
- Secondary: `View product` linking to `/product`

Hero visual:

Build a large, code-native Vela workspace mockup. It should not be a random decorative image. It should include realistic interface panels for:

- Today's appointments
- Unread WhatsApp messages
- Client profile card
- Staff schedule card
- Report insight card
- Payment or status indicator

The mockup should use layered cards, a subtle interface frame, Vela gradient accents, restrained glass or blur where useful, and enough detail to communicate the actual product.

Animation:

- Hero text fades and slides in softly.
- Main app mockup enters after the copy.
- Small panels animate in with a light stagger.
- The main mockup may float gently.
- Respect reduced-motion preferences.

### Clinic Types

Add a clean section titled:

`Built for clinics that need structure without complexity.`

Show clinic types as premium pills or compact cards:

- Dental clinics
- Aesthetic clinics
- Dermatology clinics
- Physiotherapy clinics
- Wellness clinics
- Private practices

### Problem Section

Explain the current pain clearly:

- Appointments are scattered.
- Patient information is hard to track.
- Staff schedules are unclear.
- WhatsApp messages get lost.
- Reports are hard to understand.
- Payments and documents are disconnected.

Design it as a split section:

- Left: concise problem copy.
- Right: a messy workflow visual that resolves into organized Vela cards.

### Solution Section

Position Vela as the organized clinic operating system:

`Vela gives every clinic a single workspace for daily operations.`

Show four solution cards:

- Manage appointments
- Organize patient records
- Coordinate staff
- Understand performance

Each card should include benefit-focused copy, a small UI preview or Lucide icon, and a subtle hover effect.

### Product Feature Sections

Create five deeper product sections with realistic app visuals.

Dashboard:

- Title: `Know what needs attention today.`
- Show today's appointments, unread messages, recent clients, staff activity, and an AI-assisted insight card.

Calendar:

- Title: `A clearer schedule for every clinic day.`
- Show day or week schedule, appointment status, blocked time, staff assignment, and create appointment CTA.

Patients / Clients:

- Title: `Every patient record in one place.`
- Show patient profile, appointment history, medical notes, documents/images, payments, and messages.

Inbox:

- Title: `Keep clinic conversations organized.`
- Show WhatsApp-style conversation list, unread count, unknown contact conversion, and patient-linked messages.

Reports:

- Title: `Understand performance without spreadsheets.`
- Show appointment trends, completion rate, revenue/payment overview, AI-assisted operational insight, and recommended next action.

### AI Insights

Add a premium AI insights section that is safe and operational.

Core copy:

`Vela helps clinic owners understand what changed, why it matters, and what to improve next.`

Example insight:

`Bookings are strongest on Tuesday and Thursday afternoons. Consider moving more staff availability into these periods.`

The visual card should show:

- Insight summary
- Supporting metrics
- Recommended action
- A confidence or fallback state if AI is unavailable

Do not imply medical diagnosis, treatment recommendation, or clinical decision support.

### Security / Trust

Add a privacy-conscious trust section with restrained claims:

- Private clinic records
- Secure document storage
- Authenticated workspace access
- Customer-safe reporting
- Provider complexity hidden from clinic users
- Built for operational privacy

Use wording:

`Designed with privacy-conscious clinic workflows in mind.`

Do not say HIPAA compliant, GDPR compliant, certified, encrypted end-to-end, or any similar compliance/security claim unless implementation evidence exists.

### Pricing Preview

Add a simple Basic and Pro pricing preview.

Basic should emphasize:

- Appointments
- Clients
- Staff
- Inbox
- Basic reports

Pro should emphasize:

- Advanced reports
- AI-assisted insights
- Deeper operational analytics
- More growth tools

CTA:

`View pricing` linking to `/pricing`

The homepage pricing section should be a teaser, not a full pricing table.

### Final CTA

Final CTA headline:

`Bring your clinic into one organized workspace.`

Subcopy:

`Start with appointments, patients, staff, and reports - then grow into messaging, automation, and deeper insights.`

CTAs:

- `Start free` linking to `/sign-up`
- `Contact us` linking to `/contact`

Use the Vela gradient as a premium accent or contained background. Keep it calm and readable.

### Footer

Footer should include:

- Vela logo
- Short product description
- Product
- Pricing
- About
- Contact
- Terms
- Privacy
- Refund

Use `Vela` as the public product name unless legal text requires `Vela / Clinicare`.

Remove fake contact details such as `hello@vela.app` and `+1 (555) 123-4567`. If contact details are needed, use a real `clinicare-vela.space` email only if already available in project configuration or user instructions; otherwise omit explicit email/phone details.

## Shared Marketing Shell Requirements

The shared shell must continue to work for:

- `/`
- `/product`
- `/pricing`
- `/about`
- `/contact`
- `/checkout`
- `/login`
- `/sign-up`
- `/terms-and-conditions`
- `/privacy`
- `/refund`

The homepage may receive the full redesign first, while the shared header/footer cleanup should improve the other public pages without removing them.

Do not remove existing public pages or break existing links.

## Checkout Copy Cleanup

The public checkout preparation page may keep its current functional behavior, but customer-facing unfinished-development wording should be replaced.

Replace language like:

- `Paddle checkout will be connected here next.`
- `Payment connection pending.`
- `This button is reserved for Paddle checkout.`

Use customer-safe early-access or setup wording such as:

- `Plan activation is currently handled during setup.`
- `Contact us and we will help activate this plan for your workspace.`
- `Online card checkout is being prepared.`

Do not implement real Paddle checkout, webhooks, plan activation, or billing logic in this landing-page task.

## Component Design

Prefer code-native mockups instead of relying on existing generated marketing images. The interface mockups should be composed from reusable local data arrays and small rendering helpers inside the marketing component file unless the implementation plan identifies a focused component split.

Use existing project tools:

- Next.js App Router
- React 19
- Tailwind CSS 4
- Existing Vela CSS variables and utilities
- Lucide icons
- Existing `BrandMark`
- Existing public plans data where helpful

Framer Motion is not installed. Do not add it unless the implementation plan explicitly justifies a dependency. CSS animations are sufficient for the requested motion.

## Content Rules

Use simple, product-focused customer language.

Do not mention:

- Supabase
- Prisma
- Twilio
- Meta
- OpenAI
- Paddle
- database provider details
- API implementation details

Exception: support/debug screens may expose provider states, but this task does not touch those screens.

## Scope Boundaries

Allowed files:

- `src/components/marketing/marketing-site.tsx`
- `src/app/globals.css`
- `src/app/page.tsx` metadata if needed
- `src/app/checkout/page.tsx` customer-facing copy only
- `PROJECT_STATUS.md` after implementation

Potentially allowed if the plan discovers a clear need:

- Small, focused marketing component files under `src/components/marketing/`
- Small shared constants for marketing copy under `src/components/marketing/`

Disallowed:

- Authentication actions or routes
- Supabase helpers
- Prisma schema or queries
- API routes
- Workspace routes and components
- Billing state logic
- Plan resolution logic
- Middleware/proxy route protection
- Public route removals

## Responsive Behavior

Desktop:

- Hero should show a strong large product mockup in the first viewport.
- Header should show full navigation and two right-side actions.
- Feature sections should alternate text and product visuals.

Tablet:

- Hero mockup remains detailed but scales down without clipping.
- Deep feature sections stack or use two-column layout only where enough width exists.

Mobile:

- Header remains compact without text overflow.
- Hero headline wraps cleanly.
- Product mockups stack into readable cards.
- No horizontal overflow.
- Buttons use stable heights and do not wrap awkwardly.

## Accessibility

Use semantic section structure and meaningful headings.

Interactive elements must be links or buttons as appropriate. Mockup controls can be non-interactive visual elements if they are clearly illustrative and not presented as required controls.

Animations must respect `prefers-reduced-motion`.

Text contrast should remain strong on gradient and dark sections.

## Verification Requirements

After implementation:

- Run `npm run lint`.
- Run `npm run build`.
- Browser-check `/` at desktop and mobile widths.
- Smoke-check shared public pages: `/product`, `/pricing`, `/about`, `/contact`, `/checkout`, `/login`, `/sign-up`, `/terms-and-conditions`, `/privacy`, `/refund`.
- Confirm `/dashboard` still redirects unauthenticated users to login.
- Confirm homepage CTAs route to `/sign-up`, `/product`, `/pricing`, and `/contact` as intended.
- Confirm no public-facing fake contact details remain in the shared marketing pages.
- Confirm public checkout no longer mentions Paddle or pending developer implementation language.

## Open Risks

The authenticated workspace visual QA remains outside this task because protected pages require a signed-in Supabase workspace session. This landing-page task should not alter those protected pages.

The checkout page remains a preparation page until real billing is implemented. This task only changes customer-facing wording, not billing behavior.
