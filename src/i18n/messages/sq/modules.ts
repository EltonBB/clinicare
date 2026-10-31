import type { modules as en } from "../en/modules";
import type { Translation } from "../types";

export const modules: Translation<typeof en> = [
  {
    label: "Kalendari",
    word: "oraret",
    line: "Ditë, javë dhe muaj",
    title: "Çdo termin, i lehtë për t'u lexuar.",
    copy: "Pamje ditore, javore dhe mujore me kohë të bllokuar dhe staf të caktuar, që orari të mos mbetet vetëm në kokën e dikujt.",
    points: ["Pamje ditore, javore dhe mujore", "Kohë e bllokuar e mbrojtur", "Staf i caktuar për çdo vizitë"],
  },
  {
    label: "Pacientët",
    word: "kartelat e pacientëve",
    line: "Një profil për çdo pacient",
    title: "Kartela e plotë e pacientit.",
    copy: "Historiku i vizitave, dokumentet, pagesat dhe shënimet në një profil, të lexueshme me një shikim.",
    points: ["Historiku i vizitave", "Dokumente dhe imazhe", "Pagesa dhe shënime"],
  },
  {
    label: "Stafi",
    word: "stafin",
    line: "Ndërrime dhe regjistrime",
    title: "Koordinoni mbulimin e stafit.",
    copy: "Shihni kush punon sot, ndërrimet dhe regjistrimet e tyre, pa një orar të veçantë.",
    points: ["Ndërrimet e sotme", "Regjistrimi i hyrjes dhe i daljes", "Ngarkesa për çdo anëtar të stafit"],
  },
  {
    label: "Mesazhet",
    word: "mesazhet",
    line: "WhatsApp, sipas pacientit",
    title: "Biseda, me gjithë kontekstin.",
    copy: "Mesazhet në WhatsApp vijnë pranë pacientit të duhur, me një filtër për ato që ende presin përgjigje.",
    points: ["Biseda të lidhura me pacientin", "Filtri i të palexuarave", "Ktheni një bisedë në pacient"],
  },
  {
    label: "Dokumente dhe pagesa",
    word: "pagesat",
    line: "Skedarë dhe bilance",
    title: "Dokumentet dhe pagesat, bashkë.",
    copy: "Skedarët ruhen në hapësirë private dhe çdo pagesë qëndron te kartela ku i përket.",
    points: ["Ruajtje private e dokumenteve", "Statusi i pagesës për çdo vizitë", "Pasqyra që shkarkohen"],
  },
  {
    label: "Raportet",
    word: "raportet",
    line: "Tendenca me fjalë të thjeshta",
    title: "Performanca, pa tabela të pafundme.",
    copy: "Tendencat, shkalla e përfundimit dhe një hap i ardhshëm me ndihmën e AI, të shkruara thjesht.",
    points: ["Tendencat e termineve", "Shkalla e përfundimit", "Hapi i ardhshëm me ndihmën e AI"],
  },
];
