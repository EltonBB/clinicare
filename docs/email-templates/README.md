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

Every button links to the app's own confirm route:

```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next=<page>
```

| Template | `type` | `next` |
|---|---|---|
| Confirm signup | `signup` | `/dashboard` |
| Reset Password | `recovery` | `/reset-password` |
| Change Email Address | `email_change` | `/settings` |

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
the Vela wordmark as text (SVG logos don't render in Gmail), ink buttons, and
short copy: no clinical or provider names, no compliance jargon, no em-dashes.
