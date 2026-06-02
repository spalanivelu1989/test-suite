/**
 * Theme Design System tokens and helpers.
 * The dark palette is the official Catppuccin Frappé flavor, sourced from
 * app/theme/catppuccin.ts — exact hex values, do not approximate.
 */
import { frappe, catppuccinAlpha } from "./catppuccin";

export const AWS_COLORS = {
  // Brand/Primary Accents mapping to theme CSS variables
  orange: {
    main: "var(--aws-orange-main)",
    hover: "var(--aws-orange-hover)",
    light: "var(--aws-orange-light)",
  },

  // Headers (glassmorphic translucent top-bar variables)
  header: {
    bg: "var(--aws-header-bg)",
    text: "var(--aws-header-text)",
    searchBg: "var(--aws-header-search-bg)",
    searchText: "var(--aws-header-text)",
    border: "var(--aws-header-border)",
  },

  // Official Catppuccin Frappé surfaces (https://catppuccin.com/palette/).
  dark: {
    bg: frappe.base, // #303446
    sidebarBg: frappe.mantle, // #292c3c
    cardBg: frappe.surface0, // #414559
    subBg: frappe.crust, // #232634
    text: frappe.text, // #c6d0f5
    subtext: frappe.subtext0, // #a5adce
    border: frappe.surface1, // #51576d
    rowHover: catppuccinAlpha(frappe.sapphire, 0.07),
    tabSelectedBg: frappe.surface1, // #51576d
  },

  light: {
    bg: "#f8fafc",
    sidebarBg: "#ffffff",
    cardBg: "#ffffff",
    subBg: "#f1f5f9",
    text: "#1a263b",
    subtext: "#64748b",
    border: "#cbd5e1",
    rowHover: "rgba(59, 130, 246, 0.04)",
    tabSelectedBg: "#e2e8f0",
  },
} as const;

/**
 * Shared brand gradient used by the main sidebar and the primary "Launch" CTA
 * so they stay visually in sync. Dark = Catppuccin Frappé dark surfaces
 * (crust -> base -> surface1) with a blue/mauve accent wash. Both gradients are
 * dark, so foreground text is light in both modes.
 */
export const SIDEBAR_GRADIENT = {
  // Both modes share the navy -> blue brand gradient (used by the sidebar and
  // the primary "Launch" CTA so they stay in sync).
  dark: "linear-gradient(180deg, #0a1628 0%, #0d2b6b 55%, #1a4db5 100%)",
  light: "linear-gradient(180deg, #0a1628 0%, #0d2b6b 55%, #1a4db5 100%)",
  // Brighter variant for hover/active lift.
  darkHover: "linear-gradient(180deg, #0d1e36 0%, #10368a 55%, #2060d4 100%)",
  lightHover: "linear-gradient(180deg, #0d1e36 0%, #10368a 55%, #2060d4 100%)",
} as const;

export interface AWSThemeStyles {
  bg: string;
  sidebarBg: string;
  cardBg: string;
  subBg: string;
  text: string;
  subtext: string;
  border: string;
  rowHover: string;
  tabSelectedBg: string;
}

export function getAWSColors(theme: "light" | "dark"): AWSThemeStyles {
  return theme === "dark" ? AWS_COLORS.dark : AWS_COLORS.light;
}

export function getStatusStyle(status: string) {
  switch (status) {
    case "completed":
    case "passed":
      return {
        bg: catppuccinAlpha(frappe.green, 0.12),
        color: "#16a34a",
        darkColor: frappe.green, // #a6d189
        border: catppuccinAlpha(frappe.green, 0.25),
        label: "Completed",
        dotColor: frappe.green,
      };
    case "running":
      return {
        bg: catppuccinAlpha(frappe.sapphire, 0.15),
        color: "#0891b2",
        darkColor: frappe.sapphire, // #85c1dc
        border: catppuccinAlpha(frappe.sapphire, 0.3),
        label: "Running",
        dotColor: frappe.sky, // #99d1db
        animate: true,
      };
    case "pending":
    case "queued":
      return {
        bg: catppuccinAlpha(frappe.yellow, 0.12),
        color: "#d97706",
        darkColor: frappe.yellow, // #e5c890
        border: catppuccinAlpha(frappe.yellow, 0.25),
        label: "Pending",
        dotColor: frappe.yellow,
        animate: true,
      };
    case "cancelled":
    case "stopped":
      return {
        bg: catppuccinAlpha(frappe.overlay0, 0.15),
        color: "#475569",
        darkColor: frappe.overlay1, // #838ba7
        border: catppuccinAlpha(frappe.overlay0, 0.25),
        label: "Stopped",
        dotColor: frappe.overlay1,
      };
    case "failed":
    case "error":
      return {
        bg: catppuccinAlpha(frappe.red, 0.12),
        color: "#dc2626",
        darkColor: frappe.red, // #e78284
        border: catppuccinAlpha(frappe.red, 0.25),
        label: "Failed",
        dotColor: frappe.red,
      };
    default:
      return {
        bg: catppuccinAlpha(frappe.overlay0, 0.1),
        color: "#64748b",
        darkColor: frappe.overlay1, // #838ba7
        border: catppuccinAlpha(frappe.overlay0, 0.2),
        label: "Unknown",
        dotColor: frappe.overlay1,
      };
  }
}
