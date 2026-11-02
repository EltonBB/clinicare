# Albanian translation — plan

**Goal:** every word a visitor, clinic owner, staff member or patient sees in Vela is available in Albanian (`sq`), next to English (`en`): the marketing site, the auth and onboarding flow, the clinic workspace, the messages patients receive, and the Vela Staff phone app.

**Glossary:** `docs/i18n/glossary-sq.md` is the single source of truth for terminology and tone. Every batch is translated against it; a new term is added there before it is used.

## How it is built (calls made for this plan)

- **No new dependency.** Dictionaries are plain TypeScript objects (`src/i18n/messages/en/*.ts` is the source, `src/i18n/messages/sq/*.ts` mirrors it). The Albanian files are typed against the English shape, so a missing or extra key is a type error, not a runtime blank.
- **Language lives in a cookie, not the URL** (`vela_locale`). Every page already renders per request (the nonce CSP), so the server reads the cookie on each render. No route moves under `app/[lang]`, no change to the proxy's protected-route lists. First visit: the browser's `Accept-Language` decides (`sq` first → Albanian), else English. A language switcher sets the cookie (marketing header/footer, auth pages, the workspace account menu, onboarding).
- **Access by namespace, not string keys.** Server code calls `getI18n()` and reads `m.marketing.hero.title`; client code calls `useMessages()`. Plain property access is fully typed and costs the type checker nothing. `fmt(text, { name })` fills `{name}` placeholders; `plural(forms, n)` picks `one`/`other` with `Intl.PluralRules`.
- **Only the namespaces a surface needs reach the browser.** The root layout provides `common`; the marketing shell adds `marketing`, the auth layout `auth`, onboarding `onboarding`, the workspace layout `app`. A nested provider merges into its parent.
- **Dates, times, numbers and money** go through `src/i18n/format.ts`: English via Intl `en-US`; Albanian written out there (month/day names, `12.345,50 €`, 24-hour time), because browsers with trimmed locale data don't carry `sq` and server and browser renders must match.
- **View-model builders in `src/lib`** that produce visible text receive the messages (or locale) as a parameter; no builder reads the cookie itself.
- **Patient messages** (reminders and every automation) follow a per-clinic messages language, separate from the operator's UI language: a clinic can run the app in English and message patients in Albanian. Needs one additive `Business` column (asks the owner before `db push`).
- **Legal pages** are translated, but marked as needing a lawyer's read in Albanian before they are relied on, like the English ones.

## Quality controls (to minimise mistakes)

1. Type parity: `sq` must have exactly the keys of `en` (compile time).
2. `src/i18n/messages.test.ts`: every `{placeholder}` in an English string appears in its Albanian twin and vice versa; no Albanian value is empty; no Albanian value equals its English one except an allowlist (brand names, "Email", "Pro"…), which catches untranslated copy.
3. `scripts/find-untranslated.mjs`: lists JSX text and string-literal props in components that bypass the dictionaries, run after every phase until the surface is clean.
4. Every batch is re-read against the glossary before commit: standard Albanian (as written in Kosovo), correct ë/ç, formal *ju*, consistent terms, no literal calques.
5. Signed-in browser QA in Albanian at desktop and phone widths for each surface (Albanian runs ~20–30% longer: truncation, wrapping, button widths).
6. A native speaker (the owner) reviews the glossary first, then each surface's PR.

## Phases (one small PR each, merged in order)

| # | Surface | Notes |
|---|---|---|
| 0 | Foundation: config, cookie/Accept-Language resolution, dictionaries, providers, `fmt`/`plural`/format helpers, switcher, `<html lang>`, parity tests, glossary | No visible change except the switcher |
| 1 | Marketing shell + home | header, footer, CTA, metadata |
| 2 | Product, pricing (plan copy in `lib/public-plans.ts`), about, contact | |
| 3 | Checkout | |
| 4 | Legal pages | flagged for a lawyer |
| 5 | Auth pages + auth action messages, error/not-found pages | |
| 6 | Onboarding + plan choice | |
| 7 | Workspace shell: sidebar, topbar, search, notifications, tour, banners, toasts, shared workspace/ui primitives | |
| 8 | Dashboard | |
| 9 | Calendar + booking forms | |
| 10 | Clients: directory, record tabs, dialogs, forms | |
| 11 | Staff: directory, detail, forms | |
| 12 | Inbox | |
| 13 | Automations UI | |
| 14 | Patient messages: per-clinic messages language, Albanian default wording for every automation, reply-intent keywords (po / jo / konfirmo / anulo) | schema column |
| 15 | Reports: UI, rule-based insights, AI insight language | |
| 16 | Settings + billing | |
| 17 | Server-action error messages left after the surfaces above | sweep with the script |
| 18 | Auth emails (Supabase templates, pasted by the owner) | `docs/email-templates` |
| 19 | Staff app: i18n core (device language, then the clinic's) | `vela-mobile-app` |
| 20 | Staff app: every screen | |
| 21 | Final sweep: script clean, full Albanian QA pass, docs | |

The owner page (`/owner`) is internal and stays English.
