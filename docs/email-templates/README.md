# Auth email templates

Branded versions of the three emails Supabase Auth sends for Vela. They live in
the Supabase dashboard, not in the app, so this folder is the source copy:
change them here, then paste them in.

| File | Supabase template | Subject |
|---|---|---|
| `confirm-signup.html` | Confirm signup | Confirm your email for Vela |
| `reset-password.html` | Reset Password | Reset your Vela password |
| `change-email.html` | Change Email Address | Confirm your new email for Vela |

Magic Link and Invite aren't used by the app today, so they have no template here.

## How to apply

1. Supabase dashboard › Authentication › Email Templates.
2. Open each template above, set the subject from the table, and paste the
   whole file into the message body (the HTML comment at the top is harmless,
   but it can be left out).
3. Save, then run the checks in `docs/auth-delivery-checklist.md`
   (sign up, forgot password, owner email change), using a real inbox.

## The one rule: keep the `{{ .TokenHash }}` links

Every button links to the app's own confirm route, built from the redirect the
app passes with each request:

```
{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=<type>
```

The app always sends `RedirectTo` as `<APP_URL>/auth/confirm?next=<page>`
(`buildAuthRedirectUrl` in `src/lib/app-url.ts`), so the link lands on the
deployment that sent it (production, staging or a preview), not on whatever
the Site URL says. Don't swap in `{{ .SiteURL }}`.

On this token-hash path the confirm route doesn't use `next`: each `type` has a
fixed landing page, set in `confirmEmailLinkAction` and the recovery action.

| Template | `type` | Lands on |
|---|---|---|
| Confirm signup | `signup` | `/login?verified=1` |
| Reset Password | `recovery` | the choose-a-new-password form |
| Change Email Address | `email_change` | `/settings?email_updated=1` |

Sign-up's `next` (`/login?ticket=...`) is therefore dropped. The sign-up
receipt is still marked confirmed by email, so the "check your email" page
notices the confirmation; only the login page's ticket-based clean-up doesn't
run on this path (an app-side follow-up, not a template issue).

Supabase only keeps a `RedirectTo` it allows (Authentication › URL
Configuration); otherwise it swaps in the bare Site URL and the link breaks.
It checks the whole URL, query included (`?next=...`, with sign-up's changing
ticket), so allow-list a pattern, not a path:

- Production, on the same host as the Site URL: allowed already, nothing to add.
- Any other deployment (staging, a custom preview domain): add
  `https://<host>/auth/confirm**`. A double `**` matches the rest of the URL,
  `?` and `/` included; a single `*` stops at `.` and `/`.
- Vercel previews: `https://*-<team-slug>.vercel.app/auth/confirm**`.

Never switch a link back to Supabase's default `{{ .ConfirmationURL }}`. That
link verifies on Supabase's own endpoint, so the single-use token is spent
before the app's "Continue" confirm screen runs, and email scanners that open
links automatically spend it too. That is exactly what made every password
reset say "expired" in July 2026. The app confirm route only accepts the types
above (`CONFIRMABLE_EMAIL_OTP_TYPES` in `src/lib/app-url-policy.ts`, plus its
own path for `recovery`).

Applying `change-email.html` also closes the one open item in the delivery
checklist: Change Email Address was still on `{{ .ConfirmationURL }}`.

## Style

Plain table layout with inline styles (email clients ignore stylesheets),
the Vela wordmark as plain text with no symbol (SVG logos don't render in
Gmail, and there is no raster copy of the mark yet), ink buttons, and
short copy: no clinical or provider names, no compliance jargon, no em-dashes.
