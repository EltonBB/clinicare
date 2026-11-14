import type { owner as en } from "../en/owner";
import type { Translation } from "../types";

export const owner: Translation<typeof en> = {
  meta: "Klinikat | Vela",
  title: "Klinikat",
  due: { one: "{count} për t'u fshirë", other: "{count} për t'u fshirë" },
  columns: { clinic: "Klinika", plan: "Plani", billing: "Faturimi", access: "Qasja", change: "Ndryshimi" },
  since: "Që nga {date}",
  dueSuffix: " · për t'u fshirë",
  statuses: {
    NONE: "Ende pa plan",
    TRIALING: "Provë",
    ACTIVE: "Paguan",
    PAST_DUE: "Pagesa po dështon",
    PAUSED: "Pezulluar",
    CANCELED: "Anuluar",
  },
  intervals: { YEAR: "vjetor", MONTH: "mujor" },
  free: "Llogari falas",
  ends: "Përfundon më {date}",
  trialUntil: "Provë deri më {date}",
  renews: "Rinovohet më {date}",
  keptUntil: ", ruhet deri më {date}",
  access: { full: "E përdorshme", choosing: "Po zgjedh planin{kept}", readOnly: "Vetëm për lexim{kept}" },
  control: {
    label: "Faturimi",
    freeBasic: "Falas · Basic",
    freePro: "Falas · Pro",
    paying: "Duhet të paguajë",
    save: "Ruaj",
    trialOffered: "Prova e Pro u ofrua",
    onTrial: "Në provën e Pro",
    trialEnded: "Prova e Pro përfundoi",
    trialStayed: "Qëndroi në Basic pas provës së Pro",
  },
};
