/**
 * Redesigned Theme Design System tokens and helpers.
 * Implements a modern glassmorphic look and feel based on the Flow Watcher Design System.
 */

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

  dark: {
    bg: "transparent", // background image handled in body layout
    sidebarBg: "rgba(13, 23, 42, 0.65)",
    cardBg: "rgba(11, 19, 36, 0.9)",
    subBg: "rgba(7, 11, 22, 0.85)",
    text: "#eff2f5",
    subtext: "#94a3b8",
    border: "rgba(56, 189, 248, 0.25)",
    rowHover: "rgba(56, 189, 248, 0.08)",
    tabSelectedBg: "rgba(29, 42, 58, 0.75)",
  },

  light: {
    bg: "transparent",
    sidebarBg: "rgba(255, 255, 255, 0.65)",
    cardBg: "rgba(255, 255, 255, 0.95)",
    subBg: "rgba(241, 245, 249, 0.9)",
    text: "#1a263b",
    subtext: "#64748b",
    border: "rgba(15, 23, 42, 0.08)",
    rowHover: "rgba(59, 130, 246, 0.05)",
    tabSelectedBg: "rgba(224, 242, 254, 0.75)",
  }
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
        bg: "rgba(34, 197, 94, 0.12)",
        color: "#16a34a",
        darkColor: "#4ade80",
        border: "rgba(34, 197, 94, 0.25)",
        label: "Completed",
        dotColor: "#4ade80"
      };
    case "running":
      return {
        bg: "rgba(6, 182, 212, 0.15)",
        color: "#0891b2",
        darkColor: "#22d3ee",
        border: "rgba(6, 182, 212, 0.3)",
        label: "Running",
        dotColor: "#22d3ee",
        animate: true
      };
    case "pending":
    case "queued":
      return {
        bg: "rgba(245, 158, 11, 0.12)",
        color: "#d97706",
        darkColor: "#fbbf24",
        border: "rgba(245, 158, 11, 0.25)",
        label: "Pending",
        dotColor: "#fbbf24",
        animate: true
      };
    case "cancelled":
    case "stopped":
      return {
        bg: "rgba(100, 116, 139, 0.15)",
        color: "#475569",
        darkColor: "#94a3b8",
        border: "rgba(100, 116, 139, 0.25)",
        label: "Stopped",
        dotColor: "#94a3b8"
      };
    case "failed":
    case "error":
      return {
        bg: "rgba(239, 68, 68, 0.12)",
        color: "#dc2626",
        darkColor: "#f87171",
        border: "rgba(239, 68, 68, 0.25)",
        label: "Failed",
        dotColor: "#f87171"
      };
    default:
      return {
        bg: "rgba(100, 116, 139, 0.1)",
        color: "#64748b",
        darkColor: "#94a3b8",
        border: "rgba(100, 116, 139, 0.2)",
        label: "Unknown",
        dotColor: "#64748b"
      };
  }
}
