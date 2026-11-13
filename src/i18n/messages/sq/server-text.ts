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

  // Calendar, bookings and the waiting list
  "A cancelled appointment can't be marked as a no-show.": "Një termin i anuluar nuk mund të shënohet si mosparaqitje.",
  "Appointment not found in this clinic workspace.": "Termini nuk u gjet në këtë klinikë.",
  "Appointment not found.": "Termini nuk u gjet.",
  "Check the appointment details and try again.": "Kontrolloni të dhënat e terminit dhe provoni përsëri.",
  "Choose a From time earlier than the To time.": "Zgjidhni një orë „Nga” më të hershme se ora „Deri”.",
  "Choose a client and enter a valid service before saving.": "Zgjidhni një pacient dhe shkruani një shërbim të vlefshëm para se të ruani.",
  "Choose a client and valid start/end time before saving.": "Zgjidhni një pacient dhe një orë të vlefshme fillimi dhe mbarimi para se të ruani.",
  "Choose a valid earliest date.": "Zgjidhni një datë më të hershme të vlefshme.",
  "Choose a valid month.": "Zgjidhni një muaj të vlefshëm.",
  "Choose an active client. Archived and inactive clients can't join the waiting list.":
    "Zgjidhni një pacient aktiv. Pacientët e arkivuar dhe joaktivë nuk mund të shtohen në listën e pritjes.",
  "Choose an active staff member. Inactive staff can't be requested on the waiting list.":
    "Zgjidhni një anëtar aktiv të stafit. Stafi joaktiv nuk mund të kërkohet në listën e pritjes.",
  "Couldn't remove this entry. Try again.": "Nuk mundëm ta hiqnim këtë hyrje. Provoni përsëri.",
  "No-show tracking is part of the Pro plan.": "Ndjekja e mosparaqitjeve është pjesë e planit Pro.",
  "The selected client does not belong to this clinic workspace.": "Pacienti i zgjedhur nuk i përket kësaj klinike.",
  "The selected client or staff member no longer exists. Refresh and try again.":
    "Pacienti ose anëtari i stafit i zgjedhur nuk ekziston më. Rifreskoni faqen dhe provoni përsëri.",
  "The selected staff member does not belong to this clinic workspace.": "Anëtari i zgjedhur i stafit nuk i përket kësaj klinike.",
  "The waiting list is full. Remove an entry before adding another.": "Lista e pritjes është plot. Hiqni një hyrje para se të shtoni një tjetër.",
  "This appointment is outside your operating hours. Choose a time inside the clinic schedule.":
    "Ky termin është jashtë orarit të punës. Zgjidhni një orë brenda orarit të klinikës.",
  "This appointment was changed elsewhere. Refresh and try again.": "Ky termin u ndryshua diku tjetër. Rifreskoni faqen dhe provoni përsëri.",
  "This time is already booked or blocked. Choose a different time.": "Kjo orë është e zënë ose e bllokuar. Zgjidhni një orë tjetër.",
  "This visit is already completed and can't be cancelled.": "Kjo vizitë ka përfunduar tashmë dhe nuk mund të anulohet.",
  "This visit is recorded as a no-show and can't be cancelled. Mark it as attended first if the client came.":
    "Kjo vizitë është shënuar si mosparaqitje dhe nuk mund të anulohet. Nëse pacienti erdhi, shënojeni më parë si të paraqitur.",
  "This waiting-list entry was already removed.": "Kjo hyrje në listën e pritjes është hequr tashmë.",
  "Waiting list is part of the Pro plan.": "Lista e pritjes është pjesë e planit Pro.",
  "We couldn't save the appointment.": "Nuk mundëm ta ruanim terminin.",
  "You can only mark an appointment as a no-show after it has started.": "Një termin mund të shënohet si mosparaqitje vetëm pasi të ketë filluar.",
  "Your session expired. Log in again to manage appointments.": "Sesioni juaj skadoi. Hyni përsëri për të menaxhuar terminet.",
  "Your session expired. Log in again to manage the waiting list.": "Sesioni juaj skadoi. Hyni përsëri për të menaxhuar listën e pritjes.",
  "Your session expired. Log in again to view the calendar.": "Sesioni juaj skadoi. Hyni përsëri për të parë kalendarin.",

  // Clients (patient records)
  "We couldn't save this record. Check the details and try again.":
    "Nuk mundëm ta ruanim këtë të dhënë. Kontrolloni të dhënat dhe provoni përsëri.",
  "Your session expired. Log in again to manage clients.": "Sesioni juaj skadoi. Hyni përsëri për të menaxhuar pacientët.",
  "Patient not found in this clinic workspace.": "Pacienti nuk u gjet në këtë klinikë.",
  "Client not found in this clinic workspace.": "Pacienti nuk u gjet në këtë klinikë.",
  "Choose a photo before adding it to the gallery.": "Zgjidhni një foto para se ta shtoni në galeri.",
  "Upload the photo again before adding it to the gallery.": "Ngarkojeni foton përsëri para se ta shtoni në galeri.",
  "Client name and phone number are required.": "Emri dhe numri i telefonit të pacientit janë të detyrueshëm.",
  "Check the client details and try again.": "Kontrolloni të dhënat e pacientit dhe provoni përsëri.",
  "We couldn't save the client record.": "Nuk mundëm ta ruanim kartelën e pacientit.",
  "Medication name is required.": "Emri i medikamentit është i detyrueshëm.",
  "File name is required.": "Emri i skedarit është i detyrueshëm.",
  "Use a safe HTTPS link or upload the document again.": "Përdorni një lidhje të sigurt HTTPS ose ngarkojeni dokumentin përsëri.",
  "Use a file from this clinic or upload it again.": "Përdorni një skedar nga kjo klinikë ose ngarkojeni përsëri.",
  "Use a safe HTTPS receipt link.": "Përdorni një lidhje të sigurt HTTPS për dëftesën.",
  "Enter a valid payment amount.": "Shkruani një shumë të vlefshme pagese.",
  "Health item label is required.": "Emërtimi i të dhënës shëndetësore është i detyrueshëm.",
  "Care note text is required.": "Teksti i shënimit është i detyrueshëm.",
  "Treatment plan item title is required.": "Titulli i hapit të planit të trajtimit është i detyrueshëm.",
  "Reminder title and date are required.": "Titulli dhe data e kujtesës janë të detyrueshme.",
  "This record was not found in the patient file.": "Kjo e dhënë nuk u gjet në kartelën e pacientit.",

  // Staff
  "Staff member not found in this workspace.": "Anëtari i stafit nuk u gjet në këtë klinikë.",
  "Staff member not found.": "Anëtari i stafit nuk u gjet.",
  "Your session expired. Log in again to manage staff.": "Sesioni juaj skadoi. Hyni përsëri për të menaxhuar stafin.",
  "Check the staff details and try again.": "Kontrolloni të dhënat e stafit dhe provoni përsëri.",
  "Staff name is required.": "Emri i anëtarit të stafit është i detyrueshëm.",
  "A shift has to end after it starts.": "Ndërrimi duhet të mbarojë pasi fillon.",
  "We couldn't save the staff member.": "Nuk mundëm ta ruanim anëtarin e stafit.",
  "Inactive staff cannot check in.": "Stafi joaktiv nuk mund të regjistrojë hyrjen.",
  "This staff member is not inside a scheduled shift window.": "Ky anëtar i stafit nuk është brenda orarit të një ndërrimi të planifikuar.",
  "This staff member is not checked in.": "Ky anëtar i stafit nuk e ka regjistruar hyrjen.",
  "Mobile access can't be issued to an inactive staff member.": "Qasja nga telefoni nuk mund t'i jepet një anëtari joaktiv të stafit.",
  "We couldn't generate a code. Please try again.": "Nuk mundëm të gjeneronim një kod. Ju lutemi provoni përsëri.",
  "We couldn't update mobile access. Please try again.": "Nuk mundëm ta përditësonim qasjen nga telefoni. Ju lutemi provoni përsëri.",
  "Message can't be empty.": "Mesazhi nuk mund të jetë bosh.",
  "Message is too long.": "Mesazhi është shumë i gjatë.",
  "We couldn't send your message. Please try again.": "Nuk mundëm ta dërgonim mesazhin tuaj. Ju lutemi provoni përsëri.",
  "Invalid message selection.": "Përzgjedhje e pavlefshme mesazhesh.",
  "Something went wrong.": "Diçka shkoi keq.",

  // Inbox and WhatsApp sending
  "Conversation not found in this clinic workspace.": "Biseda nuk u gjet në këtë klinikë.",
  "We couldn't confirm this message was delivered. It may have reached the patient, so check the WhatsApp chat before sending it again.":
    "Nuk mundëm ta konfirmonim që mesazhi u dorëzua. Mund t'i ketë arritur pacientit, prandaj kontrolloni bisedën në WhatsApp para se ta dërgoni përsëri.",
  "Your session expired. Log in again to manage the inbox.": "Sesioni juaj skadoi. Hyni përsëri për të menaxhuar mesazhet.",
  "Write a message before sending.": "Shkruani një mesazh para se ta dërgoni.",
  "WhatsApp is not connected for this clinic yet. Complete the clinic connection in Settings first.":
    "WhatsApp nuk është lidhur ende për këtë klinikë. Përfundoni lidhjen te Cilësimet fillimisht.",
  "We couldn't send the WhatsApp message.": "Nuk mundëm ta dërgonim mesazhin në WhatsApp.",
  "Enter a valid name (and email, if provided) to convert this thread.":
    "Shkruani një emër të vlefshëm (dhe email, nëse e jepni) për ta ruajtur këtë kontakt si pacient.",
  "Client name is required to convert this thread.": "Emri i pacientit është i detyrueshëm për ta ruajtur këtë kontakt.",
  "Messages can be up to 8,000 characters.": "Mesazhet mund të kenë deri në 8000 karaktere.",
  "The message is too long to send.": "Mesazhi është shumë i gjatë për t'u dërguar.",
  "You've sent a lot of messages in a short time. Wait a minute, then send again.":
    "Keni dërguar shumë mesazhe brenda një kohe të shkurtër. Prisni një minutë, pastaj dërgoni përsëri.",
  "You've sent a lot of messages in a short time. Wait about {minutes} minutes, then send again.":
    "Keni dërguar shumë mesazhe brenda një kohe të shkurtër. Prisni rreth {minutes} minuta, pastaj dërgoni përsëri.",

  // Automations and To review
  "Automations beyond the first reminder and thank-you are part of Pro.":
    "Automatizimet përtej kujtesës së parë dhe falënderimit janë pjesë e planit Pro.",
  "Something went wrong. Try again.": "Diçka shkoi keq. Provoni përsëri.",
  "Write a message before saving.": "Shkruani një mesazh para se ta ruani.",
  "Choose one of the listed times.": "Zgjidhni një nga oraret e listuara.",
  "Your session expired. Log in again to change automations.": "Sesioni juaj skadoi. Hyni përsëri për të ndryshuar automatizimet.",
  "Your session expired. Log in again to manage follow-ups.": "Sesioni juaj skadoi. Hyni përsëri për të menaxhuar mesazhet për t'u shqyrtuar.",
  "This follow-up was already handled.": "Ky mesazh është trajtuar tashmë.",
  "This slot offer is no longer available.": "Kjo ofertë orari nuk është më e disponueshme.",
  "The staff member for this slot is no longer available. Book it manually from Calendar instead.":
    "Anëtari i stafit për këtë orar nuk është më i disponueshëm. Caktojeni manualisht nga Kalendari.",
  "This slot is outside your working hours now. Update your working hours in Settings, or skip or decline the offer.":
    "Ky orar tani është jashtë orarit tuaj të punës. Përditësoni orarin e punës te Cilësimet, ose kapërceni ose refuzoni ofertën.",
  "We couldn't confirm a follow-up was delivered, so it was marked as sent. Check the patient's WhatsApp chat before contacting them again.":
    "Nuk mundëm ta konfirmonim që mesazhi u dorëzua, prandaj u shënua si i dërguar. Kontrolloni bisedën e pacientit në WhatsApp para se ta kontaktoni përsëri.",
  "Couldn't send this message. Try again.": "Mesazhi nuk u dërgua. Provoni përsëri.",

  // Settings
  "Currency can't be changed once payments are on record — it would misstate past amounts.":
    "Monedha nuk mund të ndryshohet pasi të ketë pagesa të regjistruara, sepse do t'i paraqiste gabim shumat e mëparshme.",
  "Choose one of the listed currencies.": "Zgjidhni një nga monedhat e listuara.",
  "Reminder template is too long.": "Teksti i kujtesës është shumë i gjatë.",
  "Your session expired. Log in again to update settings.": "Sesioni juaj skadoi. Hyni përsëri për të ndryshuar cilësimet.",
  "Enter a valid HEX color, for example #0A22FF.": "Shkruani një ngjyrë HEX të vlefshme, për shembull #0A22FF.",
  "Upload the clinic logo again, or use a safe HTTPS link.": "Ngarkoni përsëri logon e klinikës, ose përdorni një lidhje të sigurt HTTPS.",
  "Settings saved, but we couldn't update your account name. Try again from Settings.":
    "Cilësimet u ruajtën, por nuk mundëm ta përditësonim emrin e llogarisë. Provoni përsëri nga Cilësimet.",
  "Some workflow settings aren't valid.": "Disa cilësime të automatizimeve nuk janë të vlefshme.",
  "Your session expired. Log in again to connect WhatsApp.": "Sesioni juaj skadoi. Hyni përsëri për të lidhur WhatsApp-in.",
  "Wait a minute before trying to connect WhatsApp again.": "Prisni një minutë para se të provoni ta lidhni përsëri WhatsApp-in.",
  "WhatsApp connection isn't available yet. Please contact support.":
    "Lidhja me WhatsApp ende nuk është e disponueshme. Ju lutemi kontaktoni mbështetjen.",
  "We couldn't start the WhatsApp connection. Please try again.": "Nuk mundëm ta nisnim lidhjen me WhatsApp. Ju lutemi provoni përsëri.",
  "Your session expired. Log in again to check WhatsApp.": "Sesioni juaj skadoi. Hyni përsëri për të kontrolluar WhatsApp-in.",
  "We couldn't reach the WhatsApp connection. Please try again.": "Nuk mundëm ta arrinim lidhjen me WhatsApp. Ju lutemi provoni përsëri.",

  // Settings › Billing
  "Your session expired. Log in again to manage billing.": "Sesioni juaj skadoi. Hyni përsëri për të menaxhuar faturimin.",
  "Billing isn't available right now. Please try again later.": "Faturimi nuk është i disponueshëm tani. Ju lutemi provoni më vonë.",
  "We couldn't load your billing details right now.": "Nuk mundëm t'i ngarkonim të dhënat e faturimit tani.",
  "Some details are too long. Shorten them and try again.": "Disa të dhëna janë shumë të gjata. Shkurtojini dhe provoni përsëri.",
  "Add the company name that goes with the VAT number.": "Shtoni emrin e kompanisë që i përket numrit të TVSH-së.",
  "We couldn't save the address. Write to us and we'll add it.": "Nuk mundëm ta ruanim adresën. Na shkruani dhe do ta shtojmë ne.",
  "That VAT number isn't valid. Check it, or leave it empty.": "Ky numër TVSH-je nuk është i vlefshëm. Kontrollojeni, ose lëreni bosh.",
  "We couldn't save your billing details. Please try again.": "Nuk mundëm t'i ruanim të dhënat e faturimit. Ju lutemi provoni përsëri.",
  "That plan isn't available.": "Ky plan nuk është i disponueshëm.",
  "Choose a plan to start a new subscription instead.": "Zgjidhni një plan për të nisur një abonim të ri.",
  "Your plan is set to end. Resume it first.": "Plani juaj do të përfundojë. Rifillojeni së pari.",
  "Your last payment didn't go through. Update your card first.": "Pagesa juaj e fundit nuk kaloi. Përditësoni së pari kartën.",
  "Upgrade to Pro from checkout, where you see what's due today.": "Kaloni në Pro nga pagesa, ku shihni sa paguani sot.",
  "An upgrade is already in progress. Wait a moment, then refresh this page.": "Një kalim në Pro është duke u kryer. Prisni pak, pastaj rifreskoni faqen.",
  "The amount due has changed. Check the new amount, then pay.": "Shuma për t'u paguar ndryshoi. Shikoni shumën e re, pastaj paguani.",
  "Another change to your plan is in progress. Wait a moment, then refresh this page.": "Një ndryshim tjetër i planit është duke u kryer. Prisni pak, pastaj rifreskoni faqen.",
  "Your plan has just changed. Refresh this page to see it.": "Plani juaj sapo ndryshoi. Rifreskoni faqen për ta parë.",
  "Your clinic is already on Pro.": "Klinika juaj është tashmë në Pro.",
  "The upgrade didn't go through. Check your card in Settings › Billing and try again.": "Kalimi në Pro nuk u krye. Kontrolloni kartën te Cilësimet › Faturimi dhe provoni përsëri.",
  "We couldn't change your plan. Please try again.": "Nuk mundëm ta ndryshonim planin. Ju lutemi provoni përsëri.",
  "We couldn't load your invoices right now.": "Nuk mundëm t'i ngarkonim faturat tani.",
  "That invoice isn't available.": "Kjo faturë nuk është e disponueshme.",
  "We couldn't open that invoice. Please try again.": "Nuk mundëm ta hapnim këtë faturë. Ju lutemi provoni përsëri.",
  "There's no running plan to change.": "Nuk ka asnjë plan aktiv për t'u ndryshuar.",
  "We couldn't cancel your plan. Please try again.": "Nuk mundëm ta anulonim planin. Ju lutemi provoni përsëri.",
  "We couldn't resume your plan. Please try again.": "Nuk mundëm ta rifillonim planin. Ju lutemi provoni përsëri.",
  "We couldn't open the card form. Please try again.": "Nuk mundëm ta hapnim formularin e kartës. Ju lutemi provoni përsëri.",
  "This offer isn't available any more.": "Kjo ofertë nuk është më e disponueshme.",
  "Your Pro trial has already ended.": "Prova juaj e Pro ka përfunduar tashmë.",
  "We couldn't switch you to Pro. Please try again.": "Nuk mundëm t'ju kalonim në Pro. Ju lutemi provoni përsëri.",

  // Shared: read-only workspaces and sending (lib/billing-access, lib/messaging)
  "This workspace is read-only because its plan has ended. Renew it in Settings › Billing to keep working.":
    "Kjo hapësirë pune është vetëm për lexim sepse plani i saj ka përfunduar. Rinovojeni te Cilësimet › Faturimi për të vazhduar punën.",
  "This messaging channel isn't connected yet.": "Ky kanal mesazhesh ende nuk është i lidhur.",
  "The recipient address looks invalid.": "Adresa e marrësit duket e pavlefshme.",
  "The reminder message is empty.": "Mesazhi i kujtesës është bosh.",
  "The message is empty.": "Mesazhi është bosh.",
  "We couldn't confirm the message was delivered. It may have reached the recipient.":
    "Nuk mundëm ta konfirmonim që mesazhi u dorëzua. Mund t'i ketë arritur marrësit.",
  "We couldn't send the message. Please try again.": "Nuk mundëm ta dërgonim mesazhin. Ju lutemi provoni përsëri.",

  // Vela Staff app (mobile API errors, and notices stored in English)
  "Invalid date offset.": "Data e zgjedhur nuk është e vlefshme.",
  "That code is invalid or has expired. Ask your clinic admin for a new one.":
    "Ky kod është i pavlefshëm ose ka skaduar. Kërkojini administratës së klinikës një kod të ri.",
  "Too many attempts. Please wait a moment and try again.": "Shumë përpjekje. Prisni pak dhe provoni përsëri.",
  "Invalid request.": "Kërkesë e pavlefshme.",
  "Request is too large.": "Kërkesa është shumë e madhe.",
  "We couldn't sign you in right now. Please try again.": "Hyrja nuk funksionoi tani. Ju lutemi provoni përsëri.",
  "Account unavailable.": "Llogaria nuk është e disponueshme.",
  "Unauthorized.": "Nuk keni qasje.",
  "Too many requests. Please slow down for a moment.": "Shumë kërkesa. Ju lutemi prisni pak.",
  "Conversation not found.": "Biseda nuk u gjet.",
  "Your account isn't active. Contact your clinic admin.": "Llogaria juaj nuk është aktive. Kontaktoni administratën e klinikës.",
  "You can only check in during a scheduled shift. Check with your clinic admin if your schedule looks wrong.":
    "Hyrjen mund ta regjistroni vetëm gjatë një ndërrimi të planifikuar. Pyetni administratën e klinikës nëse orari juaj duket i gabuar.",
  "New appointment": "Termin i ri",
  "Schedule updated": "Orari u përditësua",
  "Your clinic booked a new appointment for you.": "Klinika juaj ju caktoi një termin të ri.",
  "Your clinic changed one of your appointments.": "Klinika juaj ndryshoi një nga terminet tuaja.",
  "New message": "Mesazh i ri",
  "You have a new message from your clinic.": "Keni një mesazh të ri nga klinika juaj.",
  "Cancellation sent": "Anulimi u dërgua",
  "Your clinic admin has been notified so they can reschedule.": "Administrata e klinikës u njoftua që ta riplanifikojë.",
  "Cancelled the {time} appointment with {name} — please reschedule.":
    "Anuloi terminin e orës {time} me {name}. Ju lutemi riplanifikojeni.",

  // Reports refresh (lib/analytics-ai.ts)
  "AI is unavailable right now, so reports are using rule-based insights.":
    "AI nuk është i disponueshëm tani, prandaj raportet po përdorin vlerësime sipas rregullave.",
  "AI insight generated.": "Vlerësimi me AI u krijua.",
  "AI refresh did not return a result for this timeframe.": "Rifreskimi me AI nuk dha rezultat për këtë periudhë.",

  // Owner page
  "Not found.": "Nuk u gjet.",
  "That choice isn't valid.": "Kjo zgjedhje nuk është e vlefshme.",
  "That clinic no longer exists.": "Kjo klinikë nuk ekziston më.",
  "This clinic is paying through its subscription. Cancel that first, then make it free.":
    "Kjo klinikë paguan përmes abonimit të saj. Anulojeni atë së pari, pastaj bëjeni falas.",
  "That clinic isn't valid.": "Kjo klinikë nuk është e vlefshme.",
  "Only a clinic paying for Basic, never offered before, can get a Pro trial.":
    "Provën e Pro mund ta marrë vetëm një klinikë që paguan për Basic dhe që nuk e ka marrë më parë këtë ofertë.",

  // No-show risk reasons (lib/no-show-risk.ts)
  "Missed a recent appointment": "Ka humbur një termin së fundmi",
  "Cancelled last-minute recently": "Ka anuluar në minutën e fundit së fundmi",
  "Hasn't confirmed the reminder": "Nuk e ka konfirmuar kujtesën",
  "Booked far in advance": "Caktuar shumë herët",
  "Not enough visit history yet": "Ende pa historik të mjaftueshëm vizitash",
};
