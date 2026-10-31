// The stored role and status values. Kept free of imports so client forms can
// use them without pulling in the server-side staff view model.
export const staffRoles = [
  "Specialist",
  "Receptionist",
  "Manager",
  "Assistant",
] as const;

export const staffStatuses = ["ACTIVE", "AWAY", "INACTIVE"] as const;

export type StaffRole = (typeof staffRoles)[number];
export type StaffStatus = (typeof staffStatuses)[number];
