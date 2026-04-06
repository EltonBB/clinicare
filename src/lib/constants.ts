export const businessTypes = [
  "Clinic",
  "Salon",
  "Studio",
  "Spa",
  "Barbershop",
  "Wellness Center",
] as const;

export type BusinessType = (typeof businessTypes)[number];
