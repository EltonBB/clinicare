# Auth Delivery Checklist

This project is now app-side ready for:

- sign-up email confirmation
- resend confirmation
- password recovery email
- reset password
- owner email change confirmation

## External setup still required

For an existing database with `on_auth_user_deleted`, apply
`scripts/sql/restrict-auth-delete-trigger-execute.sql` in the Supabase SQL Editor
after this change is approved. It only removes direct function execution from
`PUBLIC`, `anon`, `authenticated`, and `service_role`; the `auth.users` delete
trigger remains installed. Confirm the trigger still exists and
`has_function_privilege('anon', 'public.handle_auth_user_deleted()', 'EXECUTE')`
and the corresponding `authenticated` check both return false. The setup script
also applies the same restriction whenever it creates/replaces the function.
Do not rerun the full setup script merely to apply this grant change: that script
also removes businesses with no matching Auth user.
If the full setup script is ever needed again, supply `DATABASE_SSL_CA` when the
database uses a private CA; remote database certificates are now verified.

These steps happen in Supabase, not in the repo:

1. Configure a real SMTP provider in Supabase Auth
2. Add the production app URL to Supabase redirect allow-lists
3. Set `APP_URL` in the deployed environment
4. Verify the email sender identity/domain
5. Point each email template's link at the app with `{{ .TokenHash }}` — e.g.
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
   (Reset Password and Confirm signup are done; Change Email Address still
   uses the default `{{ .ConfirmationURL }}`, which verifies at the provider's
   own endpoint — prefetch-vulnerable and it bypasses the app's confirm step)

## Required redirect targets

The app now expects Supabase email links to return to:

- `/auth/confirm?next=/dashboard`
- `/auth/confirm?next=/settings`
- `/auth/confirm?next=/reset-password`

## Production checks

Email links no longer verify on open — each one lands on a confirm screen
whose Continue button does the actual verification (this is deliberate: it
stops email security scanners from burning the single-use token).

- Sign up sends a confirmation email
- Resend confirmation works
- Confirm link opens the "Confirm your email" screen; Continue completes
  verification and lands on login
- Forgot password sends a reset email
- Reset link opens the "Confirm password reset" screen; Continue lands on the
  choose-a-new-password form
- Owner email change triggers a confirmation email
