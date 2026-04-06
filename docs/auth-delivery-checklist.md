# Auth Delivery Checklist

This project is now app-side ready for:

- sign-up email confirmation
- resend confirmation
- password recovery email
- reset password
- owner email change confirmation

## External setup still required

These steps happen in Supabase, not in the repo:

1. Configure a real SMTP provider in Supabase Auth
2. Add the production app URL to Supabase redirect allow-lists
3. Set `APP_URL` in the deployed environment
4. Verify the email sender identity/domain

## Required redirect targets

The app now expects Supabase email links to return to:

- `/auth/confirm?next=/dashboard`
- `/auth/confirm?next=/settings`
- `/auth/confirm?next=/reset-password`

## Production checks

- Sign up sends a confirmation email
- Resend confirmation works
- Confirm link lands in the app successfully
- Forgot password sends a reset email
- Reset link opens the reset password page
- Owner email change triggers a confirmation email
