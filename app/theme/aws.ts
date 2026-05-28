/**
 * AWS Console Design System tokens and helpers.
 * Simulates the official AWS Management Console (dark header, orange accents, clean tabular details).
 */

export const AWS_COLORS = {
  // Brand
  orange: {
    main: "#ec7211", // AWS brand orange
    hover: "#d05e0a",
    light: "#ff9900",
  },
  
  // Headers (always dark squid ink in both light/dark AWS consoles)
  header: {
    bg: "#232f3e",
    text: "#ffffff",
    searchBg: "#394b5f",
    searchText: "#ffffff",
    border: "#19222d",
  },

  dark: {
    bg: "#0f172a",       // slate-900
    sidebarBg: "#1e293b",// slate-800
    cardBg: "#1e293b",   // slate-800
    subBg: "#0b0f19",    // terminal/inner container
    text: "#f8fafc",     // slate-50
    subtext: "#94a3b8",  // slate-400
    border: "#334155",   // slate-700
    rowHover: "#334155", // slate-700
    tabSelectedBg: "#334155",
  },

  light: {
    bg: "#eaeded",       // AWS console light gray
    sidebarBg: "#ffffff",
    cardBg: "#ffffff",
    subBg: "#f2f3f3",
    text: "#16191f",     // AWS dark charcoal text
    subtext: "#545b64",  // AWS medium gray text
    border: "#eaeded",   // AWS table border
    rowHover: "#f2f3f3",
    tabSelectedBg: "#eaeded",
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
        bg: "rgba(29, 129, 2, 0.1)",
        color: "#1d8102",
        darkColor: "#00c853",
        border: "rgba(29, 129, 2, 0.2)",
        label: "Completed",
        dotColor: "#00c853"
      };
    case "running":
      return {
        bg: "rgba(223, 142, 29, 0.12)",
        color: "#b45309",
        darkColor: "#fbbf24",
        border: "rgba(223, 142, 29, 0.25)",
        label: "Running",
        dotColor: "#fbbf24",
        animate: true
      };
    case "pending":
    case "queued":
      return {
        bg: "rgba(223, 142, 29, 0.1)",
        color: "#df8e1d",
        darkColor: "#ffab00",
        border: "rgba(223, 142, 29, 0.2)",
        label: "Pending",
        dotColor: "#ffab00",
        animate: true
      };
    case "cancelled":
    case "stopped":
      return {
        bg: "rgba(236, 114, 17, 0.1)",
        color: "#ec7211",
        darkColor: "#ff9900",
        border: "rgba(236, 114, 17, 0.2)",
        label: "Stopped",
        dotColor: "#ec7211"
      };
    case "failed":
    case "error":
      return {
        bg: "rgba(209, 50, 18, 0.1)",
        color: "#d13212",
        darkColor: "#ff3d00",
        border: "rgba(209, 50, 18, 0.2)",
        label: "Terminated",
        dotColor: "#ff3d00"
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
