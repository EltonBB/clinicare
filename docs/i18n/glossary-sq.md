# Albanian glossary (sq)

The terminology and tone every Albanian string in Vela follows: the website, the clinic workspace, patient messages and the Vela Staff app. Add a term here before using it in a dictionary. Marked *(review)* = a judgment call the owner should confirm.

## Tone and grammar

- **Standard Albanian** (gjuha standarde), as written in Kosovo. No dialect forms (no *me shku*, *qe*, *kqyr*).
- **Formal *ju*** when addressing the reader: *Ruani ndryshimet?*, *Shkruani email-in tuaj*. Lowercase *ju/juaj* mid-sentence.
- **Buttons and menu items use the short imperative**, as Albanian software does: *Ruaj*, *Fshi*, *Shto*, *Anulo*, *Vazhdo*.
- **Sentence case** everywhere, like the English UI. Days and months are lowercase (*e hënë*, *tetor*).
- **Always ë and ç**, never *e* / *c* as substitutes.
- **Quotes:** „…“ in prose; none in labels.
- **Numbers:** `12 345,50 €` (space between thousands, comma for decimals, four-digit numbers whole: `1234`), time `9:30` / `14:30` (24-hour), date `31 tetor 2026`. Always through `src/i18n/format.ts`, which matches the standard (CLDR) Albanian data and is tested against it.
- **No em-dashes** in visible copy (as in English); use a comma, colon or a new sentence.
- **Provider names never appear** (Baileys, Twilio, Supabase, OpenAI…), same as English.
- **Brand and plan names stay as they are:** Vela, Vela Staff, Basic, Pro, WhatsApp, Paddle (only where English shows it).

## Navigation

| English | Albanian |
|---|---|
| Dashboard | Paneli |
| Calendar | Kalendari |
| Clients | Pacientët *(review: "Klientët" if non-clinic businesses matter more)* |
| Staff | Stafi |
| Inbox | Mesazhet |
| Automations | Automatizimet |
| Reports | Raportet |
| Settings | Cilësimet |
| Search | Kërko |
| Notifications | Njoftimet |
| Log out | Dil |

## Core nouns

| English | Albanian | Notes |
|---|---|---|
| appointment / booking | termin (terminet) | "booking" also *termin*; *rezervim* only where the English stresses the act of booking |
| visit | vizitë (vizitat) | |
| client / patient | pacient (pacientët) | *(review)* |
| new patient | pacient i ri | |
| patient record | kartela e pacientit | |
| staff member | anëtar i stafit | plural *anëtarët e stafit* |
| provider (the person who sees the patient) | mjeku / specialisti | prefer *anëtar i stafit* when the role is unknown |
| shift | ndërrim (ndërrimet) | |
| working hours / opening hours | orari i punës | |
| clinic | klinikë (klinika) | |
| workspace | hapësira e punës | rarely visible; prefer *klinika* |
| owner | pronari | |
| service | shërbim | |
| reminder | kujtesë (kujtesat) | |
| message | mesazh (mesazhet) | |
| conversation | bisedë (bisedat) | |
| waiting list | lista e pritjes | |
| slot (free time) | orar i lirë | |
| no-show | mosparaqitje | "Mark as no-show": *Shëno si mosparaqitje* |
| payment | pagesë (pagesat) | |
| balance | bilanci | |
| invoice | faturë | |
| receipt | dëftesë | |
| amount | shuma | |
| plan | plan (Basic / Pro) | |
| free trial | provë falas | "14-day free trial": *provë falas 14-ditore* |
| subscription | abonim | |
| document | dokument | |
| medication | medikament (medikamentet) | |
| allergy / health alert | alergji / alarm shëndetësor | |
| treatment plan | plani i trajtimit | |
| provider note | shënim i mjekut | |
| follow-up | vazhdim / kontroll pasues | "follow-up reminder": *kujtesë për kontroll* |
| check-up | kontroll | |
| report | raport | |
| insight | vlerësim / sugjerim | "AI-assisted insights": *vlerësime me ndihmën e AI* |
| completion rate | shkalla e përfundimit | |
| utilization | shfrytëzimi | "Estimated utilization": *Shfrytëzimi i vlerësuar* |
| revenue | të ardhurat | |
| account | llogari | |
| password | fjalëkalim | |
| email | email | *email-i*, *email-in* when declined |
| phone | telefon | |
| access code (staff app) | kodi i qasjes | |
| device | pajisje | |

## Statuses (badges, standalone)

| English | Albanian |
|---|---|
| Confirmed | Konfirmuar |
| Pending | Në pritje |
| Completed | Përfunduar |
| Cancelled | Anuluar |
| No-show | Mosparaqitje |
| Active | Aktiv |
| Away | Mungon (filter: *Mungojnë*) |
| Inactive | Joaktiv |
| Checked in now | Në punë tani |
| At risk / Attention | Kërkon vëmendje |
| Connected / Not connected | E lidhur / Jo e lidhur (WhatsApp is feminine: *lidhja*) |
| Paid / Unpaid | Paguar / Pa paguar |
| Sent / Delivered / Read / Failed | Dërguar / Dorëzuar / Lexuar / Dështoi |
| Automatic / Review first / Off | Automatike / Rishiko së pari / Joaktive |

## Common actions

| English | Albanian |
|---|---|
| Save / Save changes | Ruaj / Ruaj ndryshimet |
| Discard changes | Hidh poshtë ndryshimet |
| Cancel (abort) | Anulo |
| Cancel booking | Anulo terminin |
| Delete | Fshi |
| Edit | Ndrysho |
| Edit profile | Ndrysho profilin |
| Add / + Add | Shto / + Shto |
| Book appointment | Cakto termin |
| New appointment | Termin i ri |
| Send / Send message | Dërgo / Dërgo mesazh |
| Skip | Kapërce |
| Confirm | Konfirmo |
| Close | Mbyll |
| Back | Kthehu |
| Continue / Next | Vazhdo |
| Finish | Përfundo |
| Upload | Ngarko |
| Download | Shkarko |
| View profile / Details | Shiko profilin / Detajet |
| Try again | Provo përsëri |
| Refresh | Rifresko |
| Today | Sot |
| Log in / Sign up | Hyr / Regjistrohu |
| Forgot password? | Keni harruar fjalëkalimin? |
| Upgrade to Pro | Kalo në Pro |
| Compare plans | Krahaso planet |
| Start free trial | Fillo provën falas |
| Check in / Check out | Regjistro hyrjen / Regjistro daljen (done: *Hyrja u regjistrua*) |
| Revoke access | Hiq qasjen |
| Mark as attended | Shëno si të paraqitur |

## Time words

Sot, dje, nesër; *në 3 ditë*, *para 2 orësh*, *këtë javë*, *muajin e kaluar*. Day names: e hënë, e martë, e mërkurë, e enjte, e premte, e shtunë, e diel. Short: hën, mar, mër, enj, pre, sht, die. Periods: *ditore*, *javore*, *mujore*, *periudhë e zgjedhur*.

## Patient messages

Short, warm, formal *ju*, name and time only (never clinical detail), the clinic's name at the end. Example: *Përshëndetje Maya, ju kujtojmë terminin tuaj nesër në orën 14:30. Përgjigjuni me PO për ta konfirmuar ose JO për ta anuluar. Klinika Vela Dent.*
