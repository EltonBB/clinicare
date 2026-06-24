# Vela / Clinicare

A SaaS workspace for clinics and appointment-based businesses — one calm, organized place to run the day: onboarding, branding, staff, clients, appointments, calendar, WhatsApp inbox, reminders, documents, payments surfaces, reports, and AI-assisted insights.

## Documentation

This repo's `README` is intentionally short. The authoritative docs are:

- **[AGENTS.md](AGENTS.md)** — product direction, layout-type system, brand rules, UI/UX boundaries (source of truth for *what* to build).
- **[CLAUDE.md](CLAUDE.md)** — engineering guide: stack, commands, architecture, conventions, data model, security model, integrations (source of truth for *how* it's built).
- **[PROJECT_STATUS.md](PROJECT_STATUS.md)** — running status log: what's done, current flows, next priorities.
- **[docs/](docs/)** — setup guides (Supabase auth delivery, media storage, RLS).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 6 + PostgreSQL (Supabase) · Supabase Auth & Storage · WhatsApp via Baileys (isolated always-on worker) · OpenAI (analytics) · Vercel. Twilio is reserved for SMS/phone (not yet wired).

## Getting started

```bash
cp .env.local.example .env.local   # fill in Supabase + DB values (see CLAUDE.md)
npm install                        # runs prisma generate
npm run db:push                    # apply schema to your database
npm run dev                        # http://localhost:3000
```

## Common commands

```bash
npm run dev          # dev server
npm run build        # prisma generate && next build
npm run lint         # eslint
npm run db:push      # apply Prisma schema to the database
npm run db:generate  # regenerate Prisma client
```

Standard checks before pushing: `npm run lint` then `npm run build`. There is no automated test suite — signed-in browser QA is the manual gate (see PROJECT_STATUS.md).
