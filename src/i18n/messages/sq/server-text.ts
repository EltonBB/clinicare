// English server-action messages and their Albanian. Keys are the exact English
// text (a `{placeholder}` stands for a value filled in at runtime); see
// `src/i18n/server-text.ts`. `server-text.test.ts` fails when an action's
// literal message is missing here.
export const serverText: Record<string, string> = {
  // Shared
  "Too many requests right now. Wait a moment and try again.": "Shumë kërkesa për momentin. Prisni pak dhe provoni përsëri.",
  "Check the highlighted fields and try again.": "Kontrolloni fushat e theksuara dhe provoni përsëri.",

  // Auth
  "Enter a valid email address.": "Shkruani një adresë email të vlefshme.",
  "Password must be at least 8 characters.": "Fjalëkalimi duhet të ketë të paktën 8 karaktere.",
  "Enter your password.": "Shkruani fjalëkalimin.",
  "Enter your name.": "Shkruani emrin tuaj.",
  "Passwords do not match.": "Fjalëkalimet nuk përputhen.",
  "Enter your current password to set a new one.": "Shkruani fjalëkalimin aktual për të vendosur një të ri.",
  "We're sending a lot of emails right now. Please wait a minute and try again.":
    "Po dërgojmë shumë email-e tani. Ju lutemi prisni një minutë dhe provoni përsëri.",
  "Too many attempts right now. Please wait a moment and try again.":
    "Shumë përpjekje për momentin. Ju lutemi prisni pak dhe provoni përsëri.",
  "We couldn't create the account. Check the details and try again.":
    "Nuk mundëm ta krijonim llogarinë. Kontrolloni të dhënat dhe provoni përsëri.",
  "Enter a valid email and password.": "Shkruani një email dhe një fjalëkalim të vlefshëm.",
  "We couldn't log you in with those credentials.": "Nuk mund të hyni me këto të dhëna.",
  "Enter a valid email address to resend the verification email.":
    "Shkruani një adresë email të vlefshme për të ridërguar email-in e verifikimit.",
  "We couldn't resend the verification email right now.": "Nuk mundëm ta ridërgonim email-in e verifikimit tani.",
  "A fresh verification email was sent to {email}.": "U dërgua një email i ri verifikimi te {email}.",
  "Enter a valid email address to continue.": "Shkruani një adresë email të vlefshme për të vazhduar.",
  "A password reset link was sent to {email}.": "U dërgua një lidhje për rivendosjen e fjalëkalimit te {email}.",
  "Choose a valid new password and try again.": "Zgjidhni një fjalëkalim të ri të vlefshëm dhe provoni përsëri.",
  "The recovery link expired. Request a fresh password reset email.":
    "Lidhja e rikuperimit ka skaduar. Kërkoni një email të ri për rivendosjen e fjalëkalimit.",
  "We couldn't update the password. Request a fresh recovery link and try again.":
    "Nuk mundëm ta përditësonim fjalëkalimin. Kërkoni një lidhje të re rikuperimi dhe provoni përsëri.",
  "Your session expired. Log in again to update your account.": "Sesioni juaj skadoi. Hyni përsëri për të përditësuar llogarinë.",
  "That current password is incorrect.": "Fjalëkalimi aktual është i pasaktë.",
  "We couldn't update the account profile right now.": "Nuk mundëm ta përditësonim profilin e llogarisë tani.",
  "We couldn't update the password right now.": "Nuk mundëm ta përditësonim fjalëkalimin tani.",
  "Account updated.": "Llogaria u përditësua.",
  "Account updated. Check your inbox to confirm the new email address.":
    "Llogaria u përditësua. Kontrolloni email-in për të konfirmuar adresën e re.",
  "Profile updated. Check your inbox to confirm the new email address.":
    "Profili u përditësua. Kontrolloni email-in për të konfirmuar adresën e re.",
  "Profile updated. Your password has been changed.": "Profili u përditësua. Fjalëkalimi juaj u ndryshua.",

  // Onboarding
  "That name is too long — please shorten it.": "Ky emër është shumë i gjatë. Ju lutemi shkurtojeni.",
  "Please set valid opening hours (24-hour HH:MM) for every open day.":
    "Ju lutemi vendosni orar të vlefshëm (në formatin 24-orësh HH:MM) për çdo ditë të hapur.",
  "Your session expired. Log in again to continue onboarding.": "Sesioni juaj skadoi. Hyni përsëri për të vazhduar konfigurimin.",
  "Upload the clinic logo again before completing onboarding.": "Ngarkojeni përsëri logon e klinikës para se të përfundoni konfigurimin.",
  "We couldn't create your clinic workspace. Try again.": "Nuk mundëm ta krijonim hapësirën e punës së klinikës. Provoni përsëri.",
  "We couldn't save onboarding right now. Try again.": "Nuk mundëm ta ruanim konfigurimin tani. Provoni përsëri.",

  // Uploads (images and files)
  "Upload a JPG, PNG, WebP, or GIF image.": "Ngarkoni një imazh JPG, PNG, WebP ose GIF.",
  "This image is too large.": "Ky imazh është shumë i madh.",
  "Your session expired. Log in again to upload images.": "Sesioni juaj skadoi. Hyni përsëri për të ngarkuar imazhe.",
  "We couldn't upload this image. Try again.": "Nuk mundëm ta ngarkonim këtë imazh. Provoni përsëri.",
  "We couldn't prepare this image for preview. Try again.": "Nuk mundëm ta përgatitnim këtë imazh për shikim. Provoni përsëri.",
  "We couldn't load this image. Try again.": "Nuk mundëm ta hapnim këtë imazh. Provoni përsëri.",
  "Upload a PDF, JPG, PNG, WebP, or GIF file.": "Ngarkoni një skedar PDF, JPG, PNG, WebP ose GIF.",
  "This file is too large.": "Ky skedar është shumë i madh.",
  "Your session expired. Log in again to upload files.": "Sesioni juaj skadoi. Hyni përsëri për të ngarkuar skedarë.",
  "We couldn't upload this file. Try again.": "Nuk mundëm ta ngarkonim këtë skedar. Provoni përsëri.",
  "We couldn't prepare this file for preview. Try again.": "Nuk mundëm ta përgatitnim këtë skedar për shikim. Provoni përsëri.",
};
