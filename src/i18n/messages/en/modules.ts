// The six modules, in order: Calendar, Patients, Staff, Inbox, Documents & payments, Reports.
// Shared by the website and the sign-in pages' module orbit. `word` completes the product
// headline "One workspace for …".
export const modules = [
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
