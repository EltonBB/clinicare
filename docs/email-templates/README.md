# Auth email templates

Branded versions of the three emails Supabase Auth sends for Vela. They live in
the Supabase dashboard, not in the app, so this folder is the source copy:
change them here, then paste them in.

| File | Supabase template | Subject (English / Albanian) |
|---|---|---|
| `confirm-signup.html` | Confirm signup | Confirm your email for Vela / Konfirmoni email-in tuaj për Vela |
| `reset-password.html` | Reset Password | Reset your Vela password / Rivendosni fjalëkalimin tuaj në Vela |
| `change-email.html` | Change Email Address | Confirm your new email for Vela / Konfirmoni email-in tuaj të ri për Vela |

Magic Link and Invite aren't used by the app today, so they have no template here.

## How to apply

1. Supabase dashboard › Authentication › Email Templates.
2. Open each template above, set the subject from the table, and paste the
   whole file into the message body (the HTML comment at the top is harmless,
   but it can be left out).
3. Save, then run the checks in `docs/auth-delivery-checklist.md`
   (sign up, forgot password, owner email change), using a real inbox, once
   with the site in English and once in Albanian (the language switcher in
   the header, before signing up).

## Two languages

Each email is written in English and Albanian. The app saves the reader's
language on the account (`locale` in the user metadata) when they sign up and
whenever they save their profile in Settings, and Supabase hands that metadata
to the templates as `.Data`. The first template line picks the language:

```
{{ $sq := false }}{{ with .Data.locale }}{{ if eq . "sq" }}{{ $sq = true }}{{ end }}{{ end }}
```

Every sentence is then `{{ if $sq }}Albanian{{ else }}English{{ end }}`. An
account with no saved language (anyone who signed up before this) gets English.
A password reset uses the language saved on the account, not the page the
reset was asked from, since the person isn't signed in then.

For the subject, paste the same choice into the Subject field, for example:

```
{{ $sq := false }}{{ with .Data.locale }}{{ if eq . "sq" }}{{ $sq = true }}{{ end }}{{ end }}{{ if $sq }}Konfirmoni email-in tuaj për Vela{{ else }}Confirm your email for Vela{{ end }}
```

If a test email arrives with the braces showing in its subject, the Subject
field isn't templated on this Supabase project: use both subjects from the
table instead, joined with " / ".

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

On this token-hash path each `type` has a fixed landing page, set in
`confirmEmailLinkAction` and the recovery action. The only `next` the app uses
is sign-up's:

| Template | `type` | Lands on |
|---|---|---|
| Confirm signup | `signup` | `/login?verified=1&ticket=<ticket>` |
| Reset Password | `recovery` | the choose-a-new-password form |
| Change Email Address | `email_change` | `/settings?email_updated=1` |

Sign-up's `next` (`/login?ticket=...`) is carried from the confirm route
through the "Continue" page to the action, which keeps it only when it's a
same-origin `/login` path with a well-formed ticket (`confirmedSignupLoginPath`
in `src/lib/app-url-policy.ts`) and otherwise falls back to `/login?verified=1`.
The login page then uses the ticket to clean up that account's sign-up data.
Every other `next` is ignored, so a link can't send anyone off the site.

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
