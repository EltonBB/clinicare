import type { mobile as en } from "../en/mobile";
import type { Translation } from "../types";

export const mobile: Translation<typeof en> = {
  todayDate: "Sot, {date}",
  tomorrowDate: "Nesër, {date}",
  today: "Sot",
  yesterday: "Dje",
  now: "tani",
  minutesAgo: "{count} min më parë",
  hoursAgo: "{count} orë më parë",
  daysAgo: "{count} ditë më parë",
  clinicAdmin: "Administrata e klinikës",
  threadSubtitles: { "Front desk": "Recepsioni", "Vela dashboard": "Paneli i Vela" },
  thisDevice: "Kjo pajisje",
  paired: "Lidhur më {date}",
  push: {
    titles: { message: "Mesazh i ri", appointment: "Orari u përditësua", reminder: "Kujtesë", system: "Vela Staff" },
    bodies: {
      message: "Keni një mesazh të ri nga klinika juaj.",
      appointment: "Orari juaj ndryshoi.",
      reminder: "Keni një kujtesë të re.",
      system: "Hapni aplikacionin për detajet.",
    },
  },
};
