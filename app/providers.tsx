"use client";

import { ChakraProvider, createSystem, defaultConfig, Button } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { frappe, frappeAlpha, semanticColorTokens, getCatppuccinColors } from "./theme/catppuccin";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useThemeMode() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useThemeMode must be used within a ThemeProvider");
  return context;
}

const customConfig = createSystem(defaultConfig, {
  theme: {
    tokens: {
      fonts: {
        heading: { value: "var(--font-sans), sans-serif" },
        body: { value: "var(--font-sans), sans-serif" },
        mono: { value: "var(--font-mono), monospace" },
      },
    },
    semanticTokens: {
      colors: semanticColorTokens,
    },
  },
});

export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeMode();
  const colors = getCatppuccinColors(theme);
  const isDark = theme === "dark";

  return (
    <Button
      onClick={toggleTheme}
      position="fixed"
      top={4}
      right={4}
      zIndex={1000}
      size="sm"
      variant="outline"
      borderRadius="full"
      w="42px"
      h="42px"
      p={0}
      bg={isDark ? frappeAlpha(colors.surface0, 0.6) : colors.base}
      borderColor={isDark ? "white/10" : colors.overlay0}
      color={isDark ? "white" : colors.text}
      boxShadow="md"
      _hover={{
        bg: isDark ? frappeAlpha(colors.surface0, 0.9) : colors.surface1,
        borderColor: "cyan.500/40",
        transform: "scale(1.05)",
        boxShadow: isDark
          ? `0 0 12px ${frappeAlpha(colors.sapphire, 0.25)}`
          : `0 0 10px ${frappeAlpha(colors.sapphire, 0.15)}`,
      }}
      _active={{ transform: "scale(0.95)" }}
      transition="all 0.2s"
      cursor="pointer"
      fontSize="xl"
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      {isDark ? "🌙" : "☀️"}
    </Button>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme;
    const activeTheme = saved === "light" || saved === "dark" ? saved : "dark";
    setTheme(activeTheme);
    const root = document.documentElement;
    if (activeTheme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
      root.setAttribute("data-theme", "dark");
      root.style.colorScheme = "dark";
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
      root.style.colorScheme = "light";
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    
    // Set custom CSS theme variables dynamically based on Flow Watcher palette
    if (theme === "dark") {
      root.style.setProperty("--aws-orange-main", "#06b6d4");
      root.style.setProperty("--aws-orange-hover", "#0891b2");
      root.style.setProperty("--aws-orange-light", "#22d3ee");
      root.style.setProperty("--aws-header-bg", "rgba(11, 19, 40, 0.75)");
      root.style.setProperty("--aws-header-text", "#eff2f5");
      root.style.setProperty("--aws-header-search-bg", "rgba(20, 31, 51, 0.6)");
      root.style.setProperty("--aws-header-border", "rgba(38, 54, 74, 0.4)");
      
      document.body.style.backgroundImage = "radial-gradient(circle at 80% 20%, rgba(6, 182, 212, 0.08), transparent 45%), radial-gradient(circle at 15% 80%, rgba(99, 102, 241, 0.08), transparent 45%), linear-gradient(160deg, #070a13 0%, #0d1224 60%, #070a13 100%)";
      document.body.style.color = "#eff2f5";
    } else {
      root.style.setProperty("--aws-orange-main", "#3b82f6");
      root.style.setProperty("--aws-orange-hover", "#2563eb");
      root.style.setProperty("--aws-orange-light", "#60a5fa");
      root.style.setProperty("--aws-header-bg", "rgba(255, 255, 255, 0.75)");
      root.style.setProperty("--aws-header-text", "#1a263b");
      root.style.setProperty("--aws-header-search-bg", "rgba(226, 232, 240, 0.6)");
      root.style.setProperty("--aws-header-border", "rgba(203, 213, 225, 0.4)");
      
      document.body.style.backgroundImage = "radial-gradient(circle at 85% 15%, rgba(56, 189, 248, 0.06), transparent 35%), linear-gradient(160deg, #f1f5f9 0%, #e2e8f0 100%)";
      document.body.style.color = "#1a263b";
    }
    document.body.style.backgroundAttachment = "fixed";
    document.body.style.backgroundSize = "cover";
    document.body.style.transition = "background-color 0.3s ease, color 0.3s ease";
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    const root = document.documentElement;
    if (next === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
      root.setAttribute("data-theme", "dark");
      root.style.colorScheme = "dark";
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
      root.style.colorScheme = "light";
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <ChakraProvider value={customConfig}>
        <style dangerouslySetInnerHTML={{ __html: `
          * {
            user-select: text !important;
            -webkit-user-select: text !important;
          }
          button, button *, input, select, textarea, a, a *, svg, svg *, [role="button"], [role="button"] *, [role="checkbox"], [role="checkbox"] *, [type="checkbox"], [type="checkbox"] * {
            user-select: none !important;
            -webkit-user-select: none !important;
          }
          ::selection {
            background-color: rgba(6, 182, 212, 0.35) !important;
            color: #ffffff !important;
          }
          ::-moz-selection {
            background-color: rgba(6, 182, 212, 0.35) !important;
            color: #ffffff !important;
          }
        ` }} />
        {children}
      </ChakraProvider>
    </ThemeContext.Provider>
  );
}
