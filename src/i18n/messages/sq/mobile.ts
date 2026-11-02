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
};
