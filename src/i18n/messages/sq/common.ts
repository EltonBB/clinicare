import type { common as en } from "../en/common";
import type { Translation } from "../types";

export const common: Translation<typeof en> = {
  language: {
    label: "Gjuha",
  },
  meta: {
    description: "Menaxhim modern i klientëve dhe i termineve për biznese shërbimesh.",
  },
  plans: {
    perMonth: "në muaj",
    perYear: "në vit",
    basic: {
      description: "Për praktikues të pavarur dhe klinika të vogla që duan një hapësirë pune të rregullt për çdo ditë.",
      audience: "Më i përshtatshmi për një klinikë që po fillon me oraret, kartelat dhe punën e përditshme.",
      features: [
        "Kalendari dhe faqet e termineve",
        "Kartelat e pacientëve dhe shënimet",
        "Dokumente, imazhe dhe skanime",
        "Ndjekja e pagesave dhe e faturave",
        "Mesazhet e WhatsApp pranë pacientit",
        "Një kujtesë para çdo vizite dhe një falënderim pas saj, të dërguara automatikisht",
        "Një panel ditor me vizitat, të ardhurat dhe orarin e sotëm",
      ],
    },
    pro: {
      description: "Për klinika në rritje që duan analiza më të thella, pasqyrë të ekipit dhe mbështetje më të fortë.",
      audience: "Më i përshtatshmi për klinikat që duan raporte, pasqyrë të stafit dhe mbështetje në nisje.",
      features: [
        "Gjithçka nga Basic",
        "Raporte me vlerësime operative me ndihmën e AI",
        "Aktiviteti dhe shfrytëzimi i stafit",
        "Ndjekja e mosparaqitjeve, raportet, sinjalizimet e rrezikut, ofertat automatike të orareve të lira nga lista e pritjes dhe rikujtimet për termin të ri",
        "Më shumë automatizime",
        "Mbështetje me përparësi për konfigurimin",
        "Klinika gati për punë që në nisje",
      ],
    },
  },
};
