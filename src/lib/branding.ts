export const brandAccentPresets = [
  {
    id: "vela",
    name: "Vela",
    value: "#0A22FF",
    hover: "#0a1ee2",
    soft: "#f0edff",
    shadow: "rgba(10,34,255,0.25)",
  },
  {
    id: "blue",
    name: "Blue",
    value: "#3b82f6",
    hover: "color-mix(in oklab, #3b82f6 88%, black)",
    soft: "#eef5ff",
    shadow: "rgba(59,130,246,0.24)",
  },
  {
    id: "teal",
    name: "Teal",
    value: "#268987",
    hover: "color-mix(in oklab, #268987 88%, black)",
    soft: "#eef8f6",
    shadow: "rgba(38,137,135,0.24)",
  },
  {
    id: "indigo",
    name: "Indigo",
    value: "#5b5fc7",
    hover: "color-mix(in oklab, #5b5fc7 88%, black)",
    soft: "#f1f2ff",
    shadow: "rgba(91,95,199,0.24)",
  },
  {
    id: "violet",
    name: "Violet",
    value: "#7c4dff",
    hover: "color-mix(in oklab, #7c4dff 88%, black)",
    soft: "#f4f0ff",
    shadow: "rgba(124,77,255,0.24)",
  },
  {
    id: "rose",
    name: "Rose",
    value: "#c94f7c",
    hover: "color-mix(in oklab, #c94f7c 88%, black)",
    soft: "#fff0f5",
    shadow: "rgba(201,79,124,0.24)",
  },
  {
    id: "coral",
    name: "Coral",
    value: "#d76d4b",
    hover: "color-mix(in oklab, #d76d4b 88%, black)",
    soft: "#fff3ee",
    shadow: "rgba(215,109,75,0.24)",
  },
  {
    id: "amber",
    name: "Amber",
    value: "#b97818",
    hover: "color-mix(in oklab, #b97818 88%, black)",
    soft: "#fff7e8",
    shadow: "rgba(185,120,24,0.24)",
  },
  {
    id: "emerald",
    name: "Emerald",
    value: "#258f5b",
    hover: "color-mix(in oklab, #258f5b 88%, black)",
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
    hover: `color-mix(in oklab, ${customHex} 88%, black)`,
    soft: `color-mix(in oklab, ${customHex} 10%, white)`,
    shadow: `rgba(${customRgb.r},${customRgb.g},${customRgb.b},0.24)`,
  } as const;
}
