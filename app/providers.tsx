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
    if (activeTheme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  }, []);

  useEffect(() => {
    // Dynamic sync of document body theme styles
    const colors = getCatppuccinColors(theme);
    document.body.style.background = colors.base;
    document.body.style.color = colors.text;
    document.body.style.transition = "background-color 0.3s ease, color 0.3s ease";
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <ChakraProvider value={customConfig}>
        <ThemeToggle />
        {children}
      </ChakraProvider>
    </ThemeContext.Provider>
  );
}
