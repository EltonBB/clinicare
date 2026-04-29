<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may differ from older Next.js versions. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Vela / Clinicare Agent Instructions

## Mandatory Startup Workflow

At the start of every new chat in this project:

1. Read this `AGENTS.md` file first.
2. Read `PROJECT_STATUS.md` immediately after.
3. Inspect the repo enough to validate the status file against the actual code before planning or coding.
4. Reply with a short project summary covering:
   - what Vela / Clinicare is
   - what has been completed
   - where the project currently stands
   - the next recommended task
5. Continue from that context without requiring the old conversation history.

If `PROJECT_STATUS.md` is missing, create a plan to restore it before doing feature work.

## Project Identity

Vela / Clinicare is a SaaS workspace for clinics and appointment-based businesses. It is being built to manage onboarding, clinic branding, staff, clients, bookings, WhatsApp inbox communication, reminders, reports, and AI-assisted performance insights.

The product goal is a clean clinic operating system where a customer can sign up, configure the workspace, manage daily appointments, communicate with clients, and understand performance without needing to know the underlying providers.

## Working Rules

- Treat `PROJECT_STATUS.md` as the living project memory, but verify important claims against the repo before editing.
- Keep customer-facing language simple and product-focused.
- Hide provider implementation detail from customers unless a support/debug screen explicitly needs it.
- Do not expose or commit secrets, API keys, database URLs, tokens, Twilio credentials, Supabase service keys, or customer private data.
- Preserve the existing visual direction unless the task is explicitly a redesign.
- Prefer concise, practical changes that keep the app stable and easy to test.
- When modifying React or Next.js behavior, check the current Next.js 16 documentation in `node_modules/next/dist/docs/` if the change touches routing, server/client components, caching, middleware, or data fetching.

## Status File Maintenance

After every meaningful completed task, update `PROJECT_STATUS.md` before committing.

A meaningful task includes:

- feature work
- bug fixes
- schema or data-flow changes
- integration changes
- deployment or environment changes
- important product decisions
- major UI/UX changes

Each update should record:

- what changed
- what was verified
- any new known issue or blocker
- what should happen next

Only update this `AGENTS.md` file when permanent project rules, architecture direction, or workflow expectations change.
