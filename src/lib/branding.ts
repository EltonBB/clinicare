export const brandAccentPresets = [
  {
    id: "blue",
    name: "Blue",
    value: "#3b82f6",
    soft: "#eef5ff",
    shadow: "rgba(59,130,246,0.24)",
  },
  {
    id: "teal",
    name: "Teal",
    value: "#268987",
    soft: "#eef8f6",
    shadow: "rgba(38,137,135,0.24)",
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
export type BrandAccentChoice = BrandAccentPresetId | "custom";

export const defaultBrandAccent = brandAccentPresets[0];

const hexColorPattern = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function expandHexColor(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!hexColorPattern.test(normalized)) {
    return null;
  }

  if (normalized.length === 4) {
    const [, r, g, b] = normalized;
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  return normalized;
}

function hexToRgb(value: string) {
  const hex = expandHexColor(value);

  if (!hex) {
    return null;
  }

  const numberValue = Number.parseInt(hex.slice(1), 16);

  return {
    r: (numberValue >> 16) & 255,
    g: (numberValue >> 8) & 255,
    b: numberValue & 255,
  };
}

export function normalizeBrandHexColor(value?: string | null) {
  return value ? expandHexColor(value) : null;
}

export function resolveBrandAccentPreset(value?: string | null) {
  if (!value) {
    return defaultBrandAccent;
  }

  const preset = brandAccentPresets.find(
    (item) => item.id === value || item.value.toLowerCase() === value.toLowerCase()
  );

  if (preset) {
    return preset;
  }

  const customHex = normalizeBrandHexColor(value);
  const customRgb = customHex ? hexToRgb(customHex) : null;

  if (!customHex || !customRgb) {
    return defaultBrandAccent;
  }

  return {
    id: "custom",
    name: "Custom",
    value: customHex,
    soft: `color-mix(in oklab, ${customHex} 10%, white)`,
    shadow: `rgba(${customRgb.r},${customRgb.g},${customRgb.b},0.24)`,
  } as const;
}
