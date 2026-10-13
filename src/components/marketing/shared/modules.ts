export type ModuleDef = {
  label: string;
  /** The hero's rolling word for this module. */
  word: string;
  /** One line for the hero rail. */
  line: string;
  title: string;
  copy: string;
  points: string[];
};

export const MODULES: ModuleDef[] = [
  {
    label: "Calendar",
    word: "scheduling",
    line: "Day, week, and month",
    title: "Every appointment, easy to read.",
    copy: "Day, week, and month views with blocked time and staff assignment, so the schedule never lives in someone's head.",
    points: ["Day, week, and month views", "Protected blocked time", "Staff assigned per visit"],
  },
  {
    label: "Patients",
    word: "patient records",
    line: "One profile per patient",
    title: "The full patient record.",
    copy: "Visit history, documents, payments, and notes on one profile, readable at a glance.",
    points: ["Visit history", "Documents and images", "Payments and notes"],
  },
  {
    label: "Staff",
    word: "staff",
    line: "Shifts and check-ins",
    title: "Coordinate staff coverage.",
    copy: "See who is working today, their shifts, and their check-ins, without a separate rota.",
    points: ["Today's shifts", "Check-in and check-out", "Workload per provider"],
  },
  {
    label: "Inbox",
    word: "messages",
    line: "WhatsApp, by patient",
    title: "Conversations, with full context.",
    copy: "WhatsApp messages land next to the right patient, with a filter for what still needs a reply.",
    points: ["Patient-linked threads", "Unread filter", "Turn a chat into a client"],
  },
  {
    label: "Documents & payments",
    word: "payments",
    line: "Files and balances",
    title: "Documents and payments, together.",
    copy: "Files stay in private storage, and every payment sits on the record it belongs to.",
    points: ["Private document storage", "Payment status per visit", "Downloadable statements"],
  },
  {
    label: "Reports",
    word: "reports",
    line: "Trends in plain words",
    title: "Performance, without spreadsheets.",
    copy: "Trends, completion rate, and an AI-assisted next step, written in plain language.",
    points: ["Appointment trends", "Completion rate", "AI-assisted next step"],
  },
];

const EVENT = "vela:select-module";

/** Ask the module explorer to open module `index` (the hero rail's tiles). */
export function selectModule(index: number) {
  window.dispatchEvent(new CustomEvent<number>(EVENT, { detail: index }));
}

/** Subscribe to `selectModule` calls; returns the unsubscribe function. */
export function onSelectModule(handler: (index: number) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<number>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
