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
      bg={isDark ? colors.surface0 : colors.base}
      borderColor={isDark ? "slate.700" : colors.overlay0}
      color={isDark ? "white" : colors.text}
      boxShadow="sm"
      _hover={{
        bg: isDark ? colors.surface1 : colors.surface1,
        borderColor: isDark ? "cyan.600" : "blue.500",
        transform: "scale(1.03)",
        boxShadow: "md",
      }}
      _active={{ transform: "scale(0.97)" }}
      transition="all 0.15s"
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
      root.style.setProperty("--aws-header-bg", "#0e1526");
      root.style.setProperty("--aws-header-text", "#eff2f5");
      root.style.setProperty("--aws-header-search-bg", "#0c1220");
      root.style.setProperty("--aws-header-border", "#232e42");
      
      document.body.style.background = "#0b0f19";
      document.body.style.backgroundImage = "none";
      document.body.style.color = "#eff2f5";
    } else {
      root.style.setProperty("--aws-orange-main", "#3b82f6");
      root.style.setProperty("--aws-orange-hover", "#2563eb");
      root.style.setProperty("--aws-orange-light", "#60a5fa");
      root.style.setProperty("--aws-header-bg", "#ffffff");
      root.style.setProperty("--aws-header-text", "#1a263b");
      root.style.setProperty("--aws-header-search-bg", "#f1f5f9");
      root.style.setProperty("--aws-header-border", "#cbd5e1");
      
      document.body.style.background = "#f8fafc";
      document.body.style.backgroundImage = "none";
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
