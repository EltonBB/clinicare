import type { legal as en } from "../en/legal";
import type { Translation } from "../types";

// Translated for convenience; the English version governs (see `chrome.translationNote`).
export const legal: Translation<typeof en> = {
  chrome: {
    policiesNav: "Politikat",
    policies: { terms: "Kushtet", privacy: "Privatësia", refund: "Rimbursimet" },
    lastUpdated: "Përditësuar më {date}",
    translationNote: "Ky është një përkthim për lehtësi. Nëse versioni shqip ndryshon nga versioni anglisht, vlen versioni anglisht.",
    questions: "Keni pyetje për këtë politikë?",
    questionsCopy: "Për kërkesa që lidhen me llogarinë, privatësinë, faturimin ose të dhënat, na shkruani drejtpërdrejt.",
    onThisPage: "Në këtë faqe",
    minRead: "{minutes} min lexim",
  },
  merchantNotice: "Procesi ynë i porosive kryhet nga rishitësi ynë online Paddle.com. Paddle.com është tregtari zyrtar (Merchant of Record) për të gjitha porositë tona.",
  terms: {
    metaTitle: "Kushtet e Shërbimit | Vela",
    metaDescription: "Kushtet e Shërbimit për programin e Vela për menaxhimin e klinikave.",
    title: "Kushtet e Shërbimit",
    description: "Këto kushte shpjegojnë si mund ta përdorin klinikat Vela, çfarë ofron produkti dhe përgjegjësitë që vijnë me menaxhimin e kartelave të pacientëve, termineve, mesazheve, skedarëve, raporteve dhe vlerësimeve operative me ndihmën e AI.",
    sections: [
      {
        title: "1. Pranimi i këtyre kushteve",
        body: [
          "Vela ofrohet nga {entity}, {address} („ne”). Kur përdorni Vela, marrëveshja juaj është me ne.",
          "Këto Kushte të Shërbimit rregullojnë qasjen në Vela dhe përdorimin e saj, përfshirë aplikacionin në ueb, aplikacionin celular Vela Staff, konfigurimin fillestar, hapësirën e punës së klinikës, mjetet e termineve, kartelat e pacientëve, mjetet e stafit, mesazhet, kujtesat, raportet dhe shërbimet e lidhura me to.",
          "Duke krijuar një llogari, duke përdorur shërbimin ose duke e përdorur atë në emër të një klinike apo biznesi, ju konfirmoni se mund ta lidhni këtë marrëveshje dhe se e detyroni atë klinikë apo biznes t'i zbatojë këto kushte. Vazhdimi i përdorimit të Vela do të thotë se i pranoni këto kushte.",
        ],
      },
      {
        title: "2. Çfarë ofron Vela",
        body: [
          "Vela është program për menaxhimin e punës së klinikave. Ndihmon klinikat të menaxhojnë pacientët, terminet, stafin, pamjen e klinikës, mesazhet, kujtesat, skedarët dhe raportet e performancës nga një hapësirë pune e vetme.",
          "Vela nuk është pajisje mjekësore, shërbim urgjence, mjet për mbështetjen e vendimeve klinike, shërbim ligjor, shërbim kontabiliteti apo zëvendësim i gjykimit profesional. Klinikat janë përgjegjëse për shërbimet që u ofrojnë pacientëve të tyre.",
        ],
      },
      {
        title: "3. Llogaritë dhe përgjegjësitë e klinikës",
        body: [
          "Jeni përgjegjës për ta mbajtur të sigurt qasjen në llogari, për të ftuar vetëm stafin e autorizuar, për të përdorur të dhëna të sakta të klinikës dhe për ta hequr menjëherë qasjen e stafit kur nuk nevojitet më.",
          "Jeni përgjegjës për marrjen e çdo leje, pëlqimi, njoftimi dhe baze ligjore që kërkohet për të mbledhur, ruajtur, dërguar mesazhe, ngarkuar ose përpunuar ndryshe të dhënat e pacientëve përmes Vela.",
        ],
      },
      {
        title: "4. Të dhënat e pacientëve, skedarët dhe mesazhet",
        body: [
          "Klinikat mund të ngarkojnë ose të shënojnë të dhëna kontakti të pacientëve, historikun e termineve, shënime, mesazhe, imazhe, logo dhe dokumente të tjera pune. Klinika mbetet përgjegjëse për përmbajtjen dhe saktësinë e këtyre të dhënave.",
          "Mjetet e mesazheve dhe të kujtesave varen nga konfigurimi i klinikës, rrjetet e mesazheve të palëve të treta, disponueshmëria e telefonit dhe lejet e marrësve. Koha e dorëzimit, trajtimi nga operatori dhe sjellja e marrësit nuk mund të garantohen.",
        ],
      },
      {
        title: "5. AI dhe raportet",
        body: [
          "Raportet mund të përfshijnë analiza me ndihmën e AI dhe vlerësime të bazuara në rregulla, mbi të dhënat e disponueshme për terminet, pacientët, stafin, mesazhet dhe orarin e punës. Këto vlerësime janë vetëm udhëzime operative.",
          "Rezultatet e AI mund të jenë të paplota, të padisponueshme, të vonuara ose të pasakta. Klinikat duhet t'i rishikojnë të gjitha rekomandimet para se të veprojnë dhe nuk duhet t'i marrin raportet e Vela si këshillë mjekësore, ligjore, financiare apo rregullatore.",
        ],
      },
      {
        title: "6. Përdorimi i lejuar",
        body: [
          "Nuk lejohet ta përdorni Vela për të shkelur ligjin, për mashtrim, për të dërguar mesazhe të padëshiruara ose të paligjshme, për të cenuar privatësinë e pacientëve, për të shkelur pronën intelektuale të dikujt, për të ngarkuar skedarë dashakeqës, për ta zbërthyer shërbimin, për të provuar ose ndërhyrë në sigurinë e platformës, për të nxjerrë automatikisht të dhëna nga shërbimi ose për të hyrë pa autorizim në hapësirën e punës së një klinike tjetër.",
          "Mund ta pezullojmë ose ta kufizojmë qasjen nëse kemi arsye të besojmë se një llogari krijon rrezik sigurie, privatësie, mashtrimi, pagese, abuzimi ose ligjor, ose pas shkeljeve të përsëritura apo të rënda të këtyre kushteve.",
        ],
      },
      {
        title: "7. Planet, provat falas, faturimi dhe anulimi",
        body: [
          "{mor} Paddle merret me pagesën, faturat dhe tatimin mbi shitjet, dhe kushtet e tij për blerësit vlejnë gjithashtu për blerjen tuaj.",
          "Vela ofrohet me planet Basic dhe Pro, me faturim mujor ose vjetor. Çmimi, monedha dhe periudha e faturimit shfaqen para se të paguani, dhe çmimet përfshijnë TVSH-në ose tatimin mbi shitjet që vlen aty ku jeni.",
          "Plani Basic fillon me një provë falas 14-ditore, një herë për klinikë; plani Pro faturohet që nga dita kur fillon. Për ta nisur kërkohet një kartë pagese dhe gjatë provës nuk tarifohet asgjë. Nëse nuk anuloni para se të mbarojë prova, abonimi juaj fillon dhe karta tarifohet automatikisht. Para se të mbarojë prova, do t'ju kujtojmë me email.",
          "Abonimet rinovohen automatikisht në fund të çdo periudhe faturimi derisa të anulohen. Mund të anuloni në çdo kohë te Cilësimet › Faturimi; anulimi hyn në fuqi në fund të periudhës ose të provës aktuale dhe deri atëherë e ruani qasjen e plotë.",
          "Mund ta ndryshoni planin ose periudhën e faturimit te Cilësimet › Faturimi, dhe ndryshimi hyn në fuqi menjëherë. Kalimi në një plan më të lartë tarifohet për pjesën e mbetur të periudhës aktuale, ndërsa kalimi në një plan më të ulët kreditohet në faturën tuaj të ardhshme. Kalimi mes faturimit mujor dhe vjetor nis një periudhë të re faturimi po atë ditë: e paguani atëherë, duke zbritur pjesën e papërdorur të periudhës së vjetër. Gjatë provës falas nuk tarifohet asgjë deri në mbarimin e saj.",
          "Nëse një pagesë dështon, ajo provohet përsëri për një kohë dhe mund ta përditësoni kartën te Cilësimet › Faturimi. Nëse pagesa nuk kryhet, abonimi përfundon.",
        ],
      },
      {
        title: "8. Ndryshimet dhe disponueshmëria e shërbimit",
        body: [
          "Mund të përmirësojmë, ndryshojmë, shtojmë ose heqim veçori ndërsa produkti zhvillohet. Synojmë t'i mbajmë të qëndrueshme proceset kryesore të klinikës, por asnjë shërbim në re nuk mund të garantojë disponueshmëri të pandërprerë ose pa gabime.",
          "Shërbimi mund të ndikohet nga mirëmbajtja, ofruesit e palëve të treta, problemet me internetin, rrjetet e mesazheve, ofruesit e strehimit, sjellja e shfletuesit ose rrethana jashtë kontrollit tonë.",
        ],
      },
      {
        title: "9. Pronësia intelektuale",
        body: [
          "Vela, dizajni i aplikacionit, programi, proceset, tekstet, raportet dhe materialet e produktit janë pronë e jona ose e licencuesve tanë. Këto kushte ju japin të drejtën ta përdorni shërbimin, jo pronësinë mbi vetë shërbimin.",
          "Klinika juaj e ruan pronësinë mbi të dhënat dhe skedarët që fut në shërbim. Ju na jepni leje t'i strehojmë, përpunojmë, shfaqim, transmetojmë, ruajmë si kopje rezervë dhe t'i trajtojmë ndryshe këto përmbajtje sa nevojitet për ta ofruar dhe përmirësuar shërbimin.",
        ],
      },
      {
        title: "10. Kufizimet e përgjegjësisë",
        body: [
          "Në masën maksimale të lejuar nga ligji, Vela ofrohet pa garanci se do të jetë e pandërprerë, pa gabime ose e përshtatshme për nevojat specifike rregullatore të çdo klinike.",
          "Në masën maksimale të lejuar nga ligji, nuk mbajmë përgjegjësi për dëme të tërthorta, rastësore, të veçanta, pasuese, shembullore ose ndëshkuese, për humbje fitimi, të ardhurash, reputacioni ose për ndërprerje të biznesit që rrjedhin nga përdorimi i shërbimit.",
        ],
      },
      {
        title: "11. Kur mbaron një plan, pezullimi dhe përfundimi",
        body: [
          "Kur një abonim përfundon (i anuluar, ose i papaguar pas riprovimeve), hapësira e punës bëhet vetëm për lexim: mund të hyni ende dhe të shihni e shkarkoni kartelat tuaja, por nuk mund të shtoni ose të ndryshoni asgjë dhe pacientëve nuk u dërgohen mesazhe. Rinovimi i planit e rikthen qasjen e plotë.",
          "Të dhënat e një hapësire pune vetëm për lexim i ruajmë 90 ditë nga dita kur mbaroi plani. Pas kësaj ato mund të fshihen përgjithmonë, përveç rasteve kur ligji na detyron të ruajmë disa dokumente (për shembull dokumentet e faturimit).",
          "Mund ta pezullojmë ose ta ndërpresim qasjen për shkelje thelbësore të këtyre kushteve, për mospagesë ose për rrezik sigurie apo mashtrimi. Secila palë mund ta përfundojë këtë marrëveshje siç e lejojnë këto kushte. Para se të mbarojë plani juaj, eksportoni ose kopjoni çdo të dhënë që ju nevojitet për dokumente klinike, ligjore, tatimore ose të biznesit.",
        ],
      },
      {
        title: "12. Ndryshimet e këtyre kushteve",
        body: [
          "Mund t'i përditësojmë këto kushte kur ndryshojnë produkti, kërkesat ligjore ose nevojat e biznesit. Nëse një përditësim ndikon ndjeshëm në të drejtat ose përgjegjësitë tuaja, do të marrim hapa të arsyeshëm për t'i njoftuar pronarët e llogarive.",
          "Vazhdimi i përdorimit të Vela pasi kushtet e përditësuara hyjnë në fuqi do të thotë se i pranoni kushtet e përditësuara.",
        ],
      },
      {
        title: "13. Kontakti",
        body: ["Pyetje për këto kushte: {email}. {entity}, {address}."],
      },
    ],
  },
  privacy: {
    metaTitle: "Politika e Privatësisë | Vela",
    metaDescription: "Politika e Privatësisë për programin e Vela për menaxhimin e klinikave.",
    title: "Politika e Privatësisë",
    description: "Kjo politikë shpjegon cilat të dhëna përpunon Vela, si përdoren të dhënat e klinikës dhe të pacientëve për funksionimin e hapësirës së punës dhe si mund të kërkojnë pronarët e llogarive ndihmë për privatësinë, eksportimin, korrigjimin ose fshirjen.",
    sections: [
      {
        title: "1. Kush jemi",
        body: [
          "Kjo Politikë e Privatësisë shpjegon si {entity}, {address}, që ofron Vela, mbledh, përdor, ruan dhe ndan të dhëna. Për pyetje ose kërkesa për privatësinë, kontaktoni {email}.",
          "Ne jemi kontrollues i të dhënave të llogarisë, të faturimit dhe të faqes së internetit për pronarët e klinikave dhe stafin e tyre. Klinikat kontrollojnë të dhënat e pacientëve që fusin në Vela; për këto të dhëna kontrollues është klinika, ndërsa ne i përpunojmë në emër të klinikës për të ofruar programin, për të mbështetur llogarinë, për të ruajtur sigurinë dhe për ta mbajtur produktin në punë.",
        ],
      },
      {
        title: "2. Të dhënat që mbledhim",
        body: [
          "Mbledhim të dhëna të llogarisë si emra, adresa email-i, të dhëna hyrjeje, emrat e klinikave, llojin e klinikës, të dhënat e stafit, zgjedhjet e pamjes, cilësimet, statusin e planit dhe të faturimit, si dhe komunikimin me mbështetjen.",
          "Klinikat mund të ruajnë të dhëna të pacientëve si emra, të dhëna kontakti, historikun e termineve, shënime, mesazhe, imazhe të ngarkuara, përshkrime, të dhëna të kujtesave dhe të dhëna të tjera të punës së klinikës.",
          "Nëse një klinikë i jep stafit qasje në aplikacionin celular Vela Staff, përpunojmë edhe atë që i nevojitet aplikacionit për të punuar: kodet e qasjes së stafit, pajisjet e regjistruara, oraret e hyrjes dhe të daljes, njoftimet dhe mesazhet mes stafit dhe administratorëve të klinikës.",
          "Mbledhim gjithashtu të dhëna teknike si pajisja, shfletuesi, adresa IP, sesioni, siguria, përdorimi, gabimet dhe performanca, të nevojshme për ta mbajtur në punë, mbrojtur dhe përmirësuar shërbimin.",
        ],
      },
      {
        title: "3. Si i përdorim të dhënat dhe mbi çfarë baze",
        body: [
          "Për t'ju ofruar shërbimin për të cilin jeni regjistruar (llogaritë, hapësirat e punës, kartelat, terminet, kujtesat, mesazhet, raportet, mbështetjen): kjo është e nevojshme për përmbushjen e kontratës me ju.",
          "Për të faturuar abonimin dhe për të ruajtur dokumentet e faturimit: e nevojshme për kontratën dhe për përmbushjen e ligjeve tatimore e të kontabilitetit.",
          "Për ta siguruar shërbimin, për të parandaluar abuzimin dhe për të rregulluar gabimet: interesi ynë i ligjshëm për të mbajtur një produkt të sigurt e të besueshëm.",
          "Për të kuptuar performancën e produktit me të dhëna të përmbledhura ose të anonimizuara dhe për të përmirësuar veçoritë: interesi ynë i ligjshëm. Ne nuk i shesim kartelat e pacientëve të klinikave.",
          "Kur kërkojmë pëlqimin tuaj për diçka, mund ta tërhiqni atë në çdo kohë.",
        ],
      },
      {
        title: "4. Të dhëna të ndjeshme të klinikës dhe të pacientëve",
        body: [
          "Meqë klinikat mund të fusin të dhëna shëndetësore, të mirëqenies, termine ose të dhëna të tjera të ndjeshme të pacientëve, klinikat duhet të vendosin cilat të dhëna i takojnë Vela dhe duhet të japin çdo njoftim ose të marrin çdo pëlqim që kërkon ligji në fuqi.",
          "Klinikat janë përgjegjëse për konfigurimin e qasjes së stafit, për mbajtjen e kartelave të sakta, për përgjigjen ndaj kërkesave të pacientëve dhe për respektimin e rregullave profesionale, të privatësisë, të kujdesit shëndetësor dhe të mesazheve që vlejnë për biznesin e tyre.",
        ],
      },
      {
        title: "5. Raportet me ndihmën e AI",
        body: [
          "Raportet mund të përdorin të dhënat operative të klinikës për të krijuar analiza me ndihmën e AI, rekomandime operative ose udhëzime rezervë të bazuara në rregulla. Këto veçori janë menduar për të mbështetur vendimet operative, jo vendimet klinike.",
          "Kërkesat për raportet i kufizojmë te të dhënat që nevojiten për veçorinë. Klinikat duhet të shmangin futjen e detajeve të ndjeshme të panevojshme në fushat me tekst të lirë kur ato nuk duhen për punën.",
        ],
      },
      {
        title: "6. Me kë i ndajmë të dhënat",
        body: [
          "Paddle.com, rishitësi ynë dhe tregtari zyrtar (Merchant of Record), përpunon pagesat, faturat dhe tatimin mbi shitjet. Paddle merr të dhëna faturimi si emri, email-i, adresa dhe të dhënat e pagesës së pronarit të klinikës; ai nuk merr kurrë kartelat e pacientëve.",
          "Përdorim ofrues shërbimesh të besueshëm për strehimin, bazën e të dhënave, identifikimin, ruajtjen, email-in, mesazhet, përpunimin me AI dhe monitorimin e gabimeve. Ata i përpunojnë të dhënat vetëm sipas udhëzimeve tona dhe vetëm sa nevojitet për të na ofruar shërbimet e tyre.",
          "Mund t'i ndajmë të dhënat edhe me këshilltarë profesionalë, si dhe me autoritetet kur e kërkon ligji.",
        ],
      },
      {
        title: "7. Siguria",
        body: [
          "Përdorim masa mbrojtëse teknike dhe organizative për të mbrojtur të dhënat, përfshirë qasjen me identifikim, ndarjen e hapësirave të punës, ruajtjen private të skedarëve, qasjen e nënshkruar në skedarë dhe monitorimin e punës.",
          "Asnjë mënyrë transmetimi ose ruajtjeje nuk është plotësisht e sigurt. Klinikat duhet të përdorin fjalëkalime të forta, të mbrojnë pajisjet e stafit, ta kufizojnë qasjen te stafi i autorizuar dhe të na kontaktojnë menjëherë nëse dyshojnë për qasje të paautorizuar.",
        ],
      },
      {
        title: "8. Ruajtja e të dhënave",
        body: [
          "Të dhënat e llogarisë dhe të klinikës i ruajmë sa kohë që llogaria është aktive. Kur mbaron një plan, hapësira e punës bëhet vetëm për lexim dhe të dhënat e saj ruhen 90 ditë, pastaj mund të fshihen përgjithmonë.",
          "Dokumentet e faturimit ruhen aq gjatë sa e kërkojnë ligjet tatimore dhe të kontabilitetit. Disa të dhëna mund të mbeten në kopjet rezervë ose në regjistrat e sigurisë për një kohë të kufizuar para fshirjes, sipas proceseve tona të punës.",
        ],
      },
      {
        title: "9. Të drejtat tuaja",
        body: [
          "Mund të kërkoni qasje, korrigjim, fshirje ose eksportim të të dhënave tuaja, të kufizoni ose të kundërshtoni mënyrën si i përdorim dhe të tërhiqni pëlqimin. Kontaktoni {email}; përgjigjemi brenda një muaji dhe mund të na duhet ta verifikojmë më parë kërkesën.",
          "Mund të paraqisni gjithashtu ankesë te autoriteti mbikëqyrës për mbrojtjen e të dhënave.",
          "Kërkesat që lidhen me të dhënat e pacientëve zakonisht duhet t'i drejtohen klinikës që i kontrollon ato të dhëna. Kërkesat individuale të pacientëve mund t'ia përcjellim klinikës, përveç kur ligji kërkon një përgjigje tjetër.",
        ],
      },
      {
        title: "10. Transferimet ndërkombëtare",
        body: [
          "Strehimi dhe baza kryesore e të dhënave funksionojnë në Bashkimin Evropian. Disa ofrues shërbimesh mund t'i përpunojnë të dhënat në vende të tjera; kur të dhënat dalin nga Zona Ekonomike Evropiane, i mbrojmë me vendime përshtatshmërie ose me klauzolat kontraktuale standarde të Komisionit Evropian.",
          "Klinikat janë përgjegjëse të konfirmojnë se përdorimi i Vela është i përshtatshëm për vendndodhjen, profesionin dhe pacientët e tyre.",
        ],
      },
      {
        title: "11. Skedarët cookie",
        body: [
          "Vela përdor vetëm skedarët cookie që i nevojiten për të punuar: për t'ju mbajtur të identifikuar, për të mbrojtur llogarinë tuaj dhe për të mbajtur mend gjuhën që zgjidhni. Nuk përdorim skedarë cookie për reklama ose për gjurmim mes faqeve. Pagesa hap formularin e Paddle, i cili përdor skedarët e vet cookie për sigurinë e pagesës.",
        ],
      },
      {
        title: "12. Fëmijët",
        body: [
          "Vela është menduar për klinika dhe biznese me termine, jo që fëmijët të krijojnë llogari të tyre.",
          "Nëse një klinikë ruan të dhëna për të mitur, klinika është përgjegjëse të marrë pëlqimin e duhur të prindit ose kujdestarit dhe të respektojë rregullat në fuqi.",
        ],
      },
      {
        title: "13. Përditësimet e privatësisë",
        body: [
          "Mund ta përditësojmë këtë Politikë të Privatësisë për të pasqyruar ndryshime në produkt, në ofrues, ligjore ose operative. Versioni i përditësuar do të tregojë një datë të re përditësimi.",
          "Për ndryshime thelbësore, do të marrim hapa të arsyeshëm për t'i njoftuar pronarët e llogarive përmes shërbimit, email-it ose një kanali tjetër të përshtatshëm.",
        ],
      },
    ],
  },
  refund: {
    metaTitle: "Politika e Rimbursimit | Vela",
    metaDescription: "Politika e Rimbursimit për abonimet dhe faturimin e Vela.",
    title: "Politika e Rimbursimit",
    description: "Kjo politikë shpjegon anulimet, rinovimet, kërkesat për rimbursim të periudhës së parë, planet vjetore, kostot e ofruesve, tarifimet e dyfishta dhe si mund t'i drejtohen klinikat mbështetjes për çështje faturimi.",
    sections: [
      {
        title: "1. Përmbledhje",
        body: ["Kjo Politikë e Rimbursimit shpjegon rimbursimet, anulimet dhe provat falas për abonimet e Vela. {mor}"],
      },
      {
        title: "2. Provat falas",
        body: ["Plani Basic fillon me një provë falas 14-ditore; plani Pro faturohet që nga dita kur fillon. Gjatë provës nuk tarifohet asgjë dhe nëse anuloni para se të mbarojë, nuk paguani asgjë."],
      },
      {
        title: "3. Rimbursim 14-ditor për pagesën e parë",
        body: [
          "Nëse Vela nuk është e përshtatshme për ju, mund të kërkoni rimbursim të plotë brenda 14 ditëve nga pagesa juaj e parë pas provës falas, si dhe brenda 14 ditëve nga pagesa e parë e një plani vjetor.",
        ],
      },
      {
        title: "4. Rinovimet",
        body: [
          "Pagesat e mëvonshme të rinovimit nuk rimbursohen, përveç kur ligji jua jep këtë të drejtë. Anulimi i ndalon rinovimet e ardhshme dhe e ruani qasjen deri në fund të periudhës që keni paguar.",
        ],
      },
      {
        title: "5. Ndryshimet e planit",
        body: [
          "Kalimi në një plan më të lartë tarifon diferencën për pjesën e mbetur të periudhës aktuale; kalimi në një më të ulët e krediton pjesën e papërdorur në faturën tuaj të ardhshme. Kalimi mes faturimit mujor dhe vjetor nis një periudhë të re faturimi po atë ditë, dhe pjesa e papërdorur e periudhës së vjetër zbritet nga shuma që paguani.",
        ],
      },
      {
        title: "6. Tarifime të dyfishta ose të gabuara",
        body: ["Një tarifim i dyfishtë ose i gabuar rimbursohet gjithmonë plotësisht."],
      },
      {
        title: "7. Si të kërkoni rimbursim",
        body: [
          "Kërkoni rimbursim përmes Paddle në paddle.net, duke përdorur lidhjen në email-in e faturës, ose shkruani në {email} dhe ne do t'ju ndihmojmë.",
          "Rimbursimet kthehen në mënyrën origjinale të pagesës. Bankave dhe ofruesve të kartave mund t'u duhen disa ditë pune për t'i shfaqur.",
        ],
      },
      {
        title: "8. Të drejtat tuaja ligjore",
        body: ["Asgjë në këtë politikë nuk i kufizon të drejtat që keni sipas ligjit për mbrojtjen e konsumatorit aty ku jetoni. Kur ligji ju jep më shumë, vlen ligji."],
      },
    ],
  },
};
