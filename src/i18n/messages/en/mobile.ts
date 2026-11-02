/** Labels the mobile API (lib/mobile) builds for the Vela Staff app, in the language the app asks for. */
export const mobile = {
  todayDate: "Today, {date}",
  tomorrowDate: "Tomorrow, {date}",
  today: "Today",
  yesterday: "Yesterday",
  now: "now",
  minutesAgo: "{count}m ago",
  hoursAgo: "{count}h ago",
  daysAgo: "{count}d ago",
  clinicAdmin: "Clinic admin",
  // Keyed by the subtitle stored on the staff thread (lib/mobile/inbox).
  threadSubtitles: { "Front desk": "Front desk", "Vela dashboard": "Vela dashboard" },
  thisDevice: "This device",
  paired: "Paired {date}",
  // Push notifications: generic by design, never a patient's name or detail.
  push: {
    titles: { message: "New message", appointment: "Schedule updated", reminder: "Reminder", system: "Vela Staff" },
    bodies: {
      message: "You have a new message from your clinic.",
      appointment: "Your schedule has changed.",
      reminder: "You have a new reminder.",
      system: "Open the app for details.",
    },
  },
};
