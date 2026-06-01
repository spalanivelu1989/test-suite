/**
 * Official Catppuccin Frappé (Dark) and Latte (Light) palettes.
 * Source: https://catppuccin.com/palette/ — exact hex values, do not approximate.
 */
export const frappe = {
  rosewater: "#f2d5cf",
  flamingo: "#eebebe",
  pink: "#f4b8e4",
  mauve: "#a855f7",
  red: "#ef4444",
  maroon: "#ea999c",
  peach: "#ef9f76",
  yellow: "#f59e0b",
  green: "#22c55e",
  teal: "#0d9488",
  sky: "#06b6d4",
  sapphire: "#0891b2",
  blue: "#3b82f6",
  lavender: "#6366f1",
  text: "#eff2f5",
  subtext1: "#e2e8f0",
  subtext0: "#a8b6c8",
  overlay2: "#839cb8",
  overlay1: "#6e859e",
  overlay0: "#5a6e85",
  surface2: "#202c40",
  surface1: "#1c2738",
  surface0: "#141f33",
  base: "#0b1329",
  mantle: "#0d172a",
  crust: "#070c1a",
} as const;

export const latte = {
  rosewater: "#dc8a78",
  flamingo: "#dd7878",
  pink: "#ea76cb",
  mauve: "#7c3aed",
  red: "#ef4444",
  maroon: "#e64553",
  peach: "#fe641b",
  yellow: "#f59e0b",
  green: "#22c55e",
  teal: "#0d9488",
  sky: "#3b82f6",
  sapphire: "#2563eb",
  blue: "#1d4ed8",
  lavender: "#4f46e5",
  text: "#1a263b",
  subtext1: "#334155",
  subtext0: "#64748b",
  overlay2: "#e2e8f0",
  overlay1: "#cbd5e1",
  overlay0: "#94a3b8",
  surface2: "#bae6fd",
  surface1: "#e2e8f0",
  surface0: "#ffffff",
  base: "#eff2f5",
  mantle: "#ffffff",
  crust: "#cbd5e1",
} as const;

/** rgba() helper for translucency over a Catppuccin color. */
export function catppuccinAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Legacy alias for backwards compatibility. */
export const frappeAlpha = catppuccinAlpha;

/** Dynamic color lookup based on active theme mode. */
export function getCatppuccinColors(theme: "light" | "dark") {
  return theme === "dark" ? frappe : latte;
}

const vSemantic = (lightHex: string, darkHex: string) => ({
  value: { _light: lightHex, _dark: darkHex },
});

/** Semantic neutral ramp (light <-> dark) mapping between Latte and Frappé. */
const semanticNeutral = {
  50: vSemantic(latte.base, frappe.text),
  100: vSemantic(latte.mantle, frappe.subtext1),
  200: vSemantic(latte.crust, frappe.subtext0),
  300: vSemantic(latte.surface0, frappe.overlay2),
  400: vSemantic(latte.surface1, frappe.overlay1),
  450: vSemantic(latte.surface2, frappe.overlay0),
  500: vSemantic(latte.overlay0, frappe.overlay0),
  600: vSemantic(latte.overlay1, frappe.surface2),
  650: vSemantic(latte.overlay2, frappe.surface2),
  700: vSemantic(latte.subtext0, frappe.surface1),
  800: vSemantic(latte.subtext1, frappe.surface0),
  850: vSemantic(latte.text, frappe.base),
  900: vSemantic(latte.text, frappe.base),
  950: vSemantic(latte.text, frappe.crust),
};

/** Build a semantic accent scale mapping between Latte and Frappé hues. */
function semanticAccent(
  latteMain: string,
  latteLight: string,
  frappeMain: string,
  frappeLight: string = frappeMain
) {
  return {
    50: vSemantic(latteLight, frappeLight),
    100: vSemantic(latteLight, frappeLight),
    200: vSemantic(latteLight, frappeLight),
    300: vSemantic(latteLight, frappeLight),
    400: vSemantic(latteMain, frappeMain),
    450: vSemantic(latteMain, frappeMain),
    500: vSemantic(latteMain, frappeMain),
    600: vSemantic(latteMain, frappeMain),
    700: vSemantic(latteMain, frappeMain),
    800: vSemantic(latteMain, frappeMain),
    900: vSemantic(latteMain, frappeMain),
    950: vSemantic(latteMain, frappeMain),
  };
}

/**
 * Chakra v3 semantic color token overrides.
 * Maps standard scales used across UI onto the dual-flavor Catppuccin theme.
 */
export const semanticColorTokens = {
  white: vSemantic(latte.base, frappe.text),
  slate: { ...semanticNeutral },
  gray: { ...semanticNeutral },
  cyan: semanticAccent(latte.sapphire, latte.sky, frappe.sapphire, frappe.sky),
  blue: semanticAccent(latte.blue, latte.blue, frappe.blue),
  green: semanticAccent(latte.green, latte.green, frappe.green),
  emerald: semanticAccent(latte.green, latte.green, frappe.green),
  teal: semanticAccent(latte.teal, latte.teal, frappe.teal),
  red: semanticAccent(latte.red, latte.red, frappe.red),
  orange: semanticAccent(latte.peach, latte.peach, frappe.peach),
  yellow: semanticAccent(latte.yellow, latte.yellow, frappe.yellow),
  amber: semanticAccent(latte.yellow, latte.yellow, frappe.yellow),
  violet: semanticAccent(latte.mauve, latte.lavender, frappe.mauve, frappe.lavender),
  purple: semanticAccent(latte.mauve, latte.lavender, frappe.mauve, frappe.lavender),
  pink: semanticAccent(latte.pink, latte.pink, frappe.pink),
};
