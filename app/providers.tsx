"use client";

import { ChakraProvider, createSystem, defaultConfig, Button } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";

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
  },
});

export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeMode();

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
      bg={theme === "dark" ? "rgba(15, 23, 42, 0.6)" : "white"}
      borderColor={theme === "dark" ? "white/10" : "slate.200"}
      color={theme === "dark" ? "white" : "slate.900"}
      boxShadow="md"
      _hover={{
        bg: theme === "dark" ? "rgba(15, 23, 42, 0.9)" : "slate.50",
        borderColor: "cyan.500/40",
        transform: "scale(1.05)",
        boxShadow: theme === "dark" ? "0 0 12px rgba(6, 182, 212, 0.25)" : "0 0 10px rgba(0, 0, 0, 0.1)",
      }}
      _active={{ transform: "scale(0.95)" }}
      transition="all 0.2s"
      cursor="pointer"
      fontSize="xl"
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </Button>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme;
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.className = saved;
    } else {
      document.documentElement.className = "dark";
    }
  }, []);

  useEffect(() => {
    // Dynamic sync of document body theme styles
    document.body.style.background = theme === "dark" ? "#020617" : "#f8fafc";
    document.body.style.color = theme === "dark" ? "#f8fafc" : "#0f172a";
    document.body.style.transition = "background-color 0.3s ease, color 0.3s ease";
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.className = next;
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
