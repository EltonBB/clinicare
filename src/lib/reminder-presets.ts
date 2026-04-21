import type { BusinessType } from "@/lib/constants";

export const reminderPresetOptions = [
  {
    id: "clinic",
    label: "Clinic",
    businessType: "Clinic",
    template:
      "Hi {client_name}, this is a reminder for your appointment at {time} on {date}. Reply here if you need to reschedule.",
  },
  {
    id: "salon",
    label: "Salon",
    businessType: "Salon",
    template:
      "Hi {client_name}, your salon appointment is booked for {time} on {date}. Reply here if you need to move it.",
  },
  {
    id: "studio",
    label: "Studio",
    businessType: "Studio",
    template:
      "Hi {client_name}, this is a reminder for your studio session at {time} on {date}. Reply here if plans change.",
  },
  {
    id: "spa",
    label: "Spa",
    businessType: "Spa",
    template:
      "Hi {client_name}, your spa visit is coming up at {time} on {date}. Reply here if you need to reschedule.",
  },
  {
    id: "barbershop",
    label: "Barbershop",
    businessType: "Barbershop",
    template:
      "Hi {client_name}, your barbershop appointment is at {time} on {date}. Reply here if you need a different time.",
  },
  {
    id: "wellness-center",
    label: "Wellness Center",
    businessType: "Wellness Center",
    template:
      "Hi {client_name}, this is a reminder for your wellness appointment at {time} on {date}. Reply here if you need help.",
  },
] as const;

export type ReminderPresetId = (typeof reminderPresetOptions)[number]["id"];

export function resolveReminderPreset(value?: string | null) {
  if (!value) {
    return reminderPresetOptions[0];
  }

  return (
    reminderPresetOptions.find(
      (preset) => preset.id === value || preset.businessType === value
    ) ?? reminderPresetOptions[0]
  );
}

export function reminderPresetForBusinessType(businessType: string) {
  return (
    reminderPresetOptions.find(
      (preset) => preset.businessType === (businessType as BusinessType)
    ) ?? reminderPresetOptions[0]
  );
}
