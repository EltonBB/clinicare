export const brandAccentPresets = [
  {
    id: "teal",
    name: "Teal",
    value: "#268987",
    soft: "#eef8f6",
    shadow: "rgba(38,137,135,0.24)",
  },
  {
    id: "blue",
    name: "Blue",
    value: "#2f6fbd",
    soft: "#eef5ff",
    shadow: "rgba(47,111,189,0.24)",
  },
  {
    id: "indigo",
    name: "Indigo",
    value: "#5b5fc7",
    soft: "#f1f2ff",
    shadow: "rgba(91,95,199,0.24)",
  },
  {
    id: "violet",
    name: "Violet",
    value: "#7c4dff",
    soft: "#f4f0ff",
    shadow: "rgba(124,77,255,0.24)",
  },
  {
    id: "rose",
    name: "Rose",
    value: "#c94f7c",
    soft: "#fff0f5",
    shadow: "rgba(201,79,124,0.24)",
  },
  {
    id: "coral",
    name: "Coral",
    value: "#d76d4b",
    soft: "#fff3ee",
    shadow: "rgba(215,109,75,0.24)",
  },
  {
    id: "amber",
    name: "Amber",
    value: "#b97818",
    soft: "#fff7e8",
    shadow: "rgba(185,120,24,0.24)",
  },
  {
    id: "emerald",
    name: "Emerald",
    value: "#258f5b",
    soft: "#eef9f3",
    shadow: "rgba(37,143,91,0.24)",
  },
] as const;

export type BrandAccentPresetId = (typeof brandAccentPresets)[number]["id"];

export const defaultBrandAccent = brandAccentPresets[0];

export function resolveBrandAccentPreset(value?: string | null) {
  if (!value) {
    return defaultBrandAccent;
  }

  return (
    brandAccentPresets.find(
      (preset) => preset.id === value || preset.value.toLowerCase() === value.toLowerCase()
    ) ?? defaultBrandAccent
  );
}
