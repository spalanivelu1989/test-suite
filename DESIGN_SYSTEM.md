# Flow Watcher Design System

A comprehensive reference for replicating the Flow Watcher UI theme in any Lovable project.

---

## Table of Contents

1. [Overview](#overview)
2. [Color Palette](#color-palette)
3. [CSS Variables](#css-variables)
4. [Background System](#background-system)
5. [Typography](#typography)
6. [Border Radius](#border-radius)
7. [Scrollbar Styling](#scrollbar-styling)
8. [Tailwind Config](#tailwind-config)
9. [Theme Hook](#theme-hook)
10. [Usage Examples](#usage-examples)

---

## Overview

| Property | Value |
|----------|-------|
| **Default theme** | Dark (Zinc/Slate base) |
| **Theme switching** | Class-based (`.dark` on `<html>`) |
| **CSS variable format** | HSL without `hsl()` wrapper |
| **Border radius** | `0.85rem` (13.6px) |
| **Layout** | Fully fluid, responsive padding |
| **Font** | System sans-serif with `antialiased` |

---

## Color Palette

### Dark Mode (Default)

| Token | HSL | Description |
|-------|-----|-------------|
| `--background` | `221 53% 8%` | Deep navy page background |
| `--foreground` | `210 38% 95%` | Near-white text |
| `--primary` | `196 100% 52%` | Cyan accent/CTA |
| `--secondary` | `217 30% 16%` | Subtle surface |
| `--muted` | `218 29% 16%` | Disabled/muted surface |
| `--muted-foreground` | `212 22% 72%` | Secondary text |
| `--accent` | `216 38% 20%` | Highlight surface |
| `--card` | `220 45% 11%` | Card background |
| `--border` | `216 32% 22%` | Borders |
| `--destructive` | `0 72% 51%` | Error/delete red |
| `--success` | `142 76% 36%` | Success green |
| `--warning` | `38 92% 50%` | Warning amber |

### Light Mode

| Token | HSL | Description |
|-------|-----|-------------|
| `--background` | `210 38% 95%` | Soft blue-grey |
| `--foreground` | `216 42% 18%` | Dark text |
| `--primary` | `211 100% 50%` | Vivid blue |
| `--secondary` | `208 35% 91%` | Light surface |
| `--muted` | `209 36% 90%` | Muted surface |
| `--muted-foreground` | `216 22% 42%` | Secondary text |
| `--accent` | `203 88% 92%` | Sky-blue highlight |
| `--card` | `0 0% 100%` | White cards |
| `--border` | `206 38% 82%` | Light borders |

### Sidebar (Both Modes)

| Token (Dark) | HSL |
|--------------|-----|
| `--sidebar-background` | `220 57% 12%` |
| `--sidebar-foreground` | `210 38% 95%` |
| `--sidebar-primary` | `196 100% 52%` |
| `--sidebar-accent` | `216 38% 20%` |
| `--sidebar-border` | `216 32% 22%` |

### Chart Colors

| Token | Dark HSL | Light HSL |
|-------|----------|-----------|
| `--chart-1` | `196 100% 52%` | `211 100% 50%` |
| `--chart-2` | `168 76% 40%` | `193 94% 45%` |
| `--chart-3` | `220 84% 63%` | `168 76% 37%` |
| `--chart-4` | `38 92% 50%` | `38 92% 50%` |
| `--chart-5` | `258 82% 60%` | `258 82% 60%` |

---

## CSS Variables

Copy this into your `src/index.css` **inside `@layer base`**:

```css
@layer base {
  :root {
    /* Light Glass Theme */
    --background: 210 38% 95%;
    --foreground: 216 42% 18%;
    --card: 0 0% 100%;
    --card-foreground: 216 42% 18%;
    --popover: 0 0% 100%;
    --popover-foreground: 216 42% 18%;
    --primary: 211 100% 50%;
    --primary-foreground: 0 0% 100%;
    --secondary: 208 35% 91%;
    --secondary-foreground: 216 42% 20%;
    --muted: 209 36% 90%;
    --muted-foreground: 216 22% 42%;
    --accent: 203 88% 92%;
    --accent-foreground: 213 67% 22%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 0 0% 100%;
    --success: 142 76% 36%;
    --success-foreground: 0 0% 100%;
    --warning: 38 92% 50%;
    --warning-foreground: 0 0% 0%;
    --border: 206 38% 82%;
    --input: 206 38% 82%;
    --ring: 201 100% 47%;
    --radius: 0.85rem;

    --chart-1: 211 100% 50%;
    --chart-2: 193 94% 45%;
    --chart-3: 168 76% 37%;
    --chart-4: 38 92% 50%;
    --chart-5: 258 82% 60%;

    --sidebar-background: 218 52% 18%;
    --sidebar-foreground: 208 58% 94%;
    --sidebar-primary: 193 96% 45%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 214 42% 32%;
    --sidebar-accent-foreground: 0 0% 100%;
    --sidebar-border: 212 36% 36%;
    --sidebar-ring: 193 96% 45%;

    --tooltip-bg: hsl(0, 0%, 100%);
    --tooltip-border: hsl(206, 38%, 82%);
    --tooltip-fg: hsl(216, 42%, 18%);

    --app-bg-layer-1: radial-gradient(circle at 86% 16%, rgba(56, 189, 248, 0.28), transparent 30%);
    --app-bg-layer-2: radial-gradient(circle at 16% 82%, rgba(59, 130, 246, 0.22), transparent 36%);
    --app-bg-layer-3: linear-gradient(160deg, rgba(248, 251, 255, 0.98) 0%, rgba(233, 242, 251, 0.98) 58%, rgba(228, 240, 250, 0.98) 100%);
    --app-shell-lines: linear-gradient(110deg, transparent 0 32px, rgba(148, 203, 255, 0.3) 32px 33px, transparent 33px 64px);
    --app-shell-lines-opacity: 0.5;
  }

  .dark {
    /* Dark Glass Theme */
    --background: 221 53% 8%;
    --foreground: 210 38% 95%;
    --card: 220 45% 11%;
    --card-foreground: 210 38% 95%;
    --popover: 220 45% 11%;
    --popover-foreground: 210 38% 95%;
    --primary: 196 100% 52%;
    --primary-foreground: 0 0% 100%;
    --secondary: 217 30% 16%;
    --secondary-foreground: 210 38% 95%;
    --muted: 218 29% 16%;
    --muted-foreground: 212 22% 72%;
    --accent: 216 38% 20%;
    --accent-foreground: 0 0% 100%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 0 0% 100%;
    --success: 142 76% 36%;
    --success-foreground: 0 0% 100%;
    --warning: 38 92% 50%;
    --warning-foreground: 0 0% 0%;
    --border: 216 32% 22%;
    --input: 216 32% 22%;
    --ring: 196 100% 52%;

    --chart-1: 196 100% 52%;
    --chart-2: 168 76% 40%;
    --chart-3: 220 84% 63%;
    --chart-4: 38 92% 50%;
    --chart-5: 258 82% 60%;

    --sidebar-background: 220 57% 12%;
    --sidebar-foreground: 210 38% 95%;
    --sidebar-primary: 196 100% 52%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 216 38% 20%;
    --sidebar-accent-foreground: 0 0% 100%;
    --sidebar-border: 216 32% 22%;
    --sidebar-ring: 196 100% 52%;

    --tooltip-bg: hsl(220, 45%, 11%);
    --tooltip-border: hsl(216, 32%, 22%);
    --tooltip-fg: hsl(210, 38%, 95%);

    --app-bg-layer-1: radial-gradient(circle at 85% 15%, rgba(34, 211, 238, 0.2), transparent 32%);
    --app-bg-layer-2: radial-gradient(circle at 18% 82%, rgba(37, 99, 235, 0.24), transparent 38%);
    --app-bg-layer-3: linear-gradient(162deg, rgba(4, 11, 24, 0.98) 0%, rgba(9, 20, 40, 0.99) 55%, rgba(7, 17, 34, 0.99) 100%);
    --app-shell-lines: linear-gradient(110deg, transparent 0 32px, rgba(56, 189, 248, 0.2) 32px 33px, transparent 33px 64px);
    --app-shell-lines-opacity: 0.42;
  }
}
```

---

## Background System

The background uses three layered radial/linear gradients applied to `<body>`, plus a subtle vertical-line overlay via the `.app-shell` component class.

```css
@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground antialiased;
    background-image: var(--app-bg-layer-1), var(--app-bg-layer-2), var(--app-bg-layer-3);
    background-attachment: fixed;
  }
}

@layer components {
  .app-shell {
    @apply relative isolate;
  }
  .app-shell::before {
    content: "";
    @apply pointer-events-none absolute inset-0;
    opacity: var(--app-shell-lines-opacity);
    background-image: var(--app-shell-lines);
    mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 82%, transparent 100%);
  }
}
```

---

## Typography

Uses the default Tailwind system font stack with `antialiased` rendering:

```css
body {
  @apply antialiased;
  /* Font stack: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 
     "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif */
}
```

---

## Border Radius

```
--radius: 0.85rem  (≈ 13.6px)

lg = var(--radius)          → 0.85rem
md = calc(var(--radius) - 2px)  → ~0.725rem
sm = calc(var(--radius) - 4px)  → ~0.6rem
```

---

## Scrollbar Styling

```css
@layer components {
  .glass-scroll-area {
    scrollbar-width: thin;
    scrollbar-color: rgba(14, 116, 144, 0.35) transparent;
  }
  .dark .glass-scroll-area {
    scrollbar-color: rgba(56, 189, 248, 0.35) transparent;
  }
}
```

---

## Tailwind Config

Key extensions for `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
```

---

## Theme Hook

Create `src/hooks/useTheme.ts`:

```ts
import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark";
const THEME_STORAGE_KEY = "app-theme";
const THEME_EVENT = "app-theme-change";

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    return "dark";
  }
  return "dark";
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }));
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const nextTheme = event.newValue;
      if ((nextTheme === "light" || nextTheme === "dark") && nextTheme !== theme) {
        setThemeState(nextTheme);
      }
    };
    const onThemeEvent = (event: Event) => {
      const nextTheme = (event as CustomEvent<Theme>).detail;
      if ((nextTheme === "light" || nextTheme === "dark") && nextTheme !== theme) {
        setThemeState(nextTheme);
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(THEME_EVENT, onThemeEvent);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(THEME_EVENT, onThemeEvent);
    };
  }, [theme]);

  return { theme, setTheme, toggleTheme };
}
```

### Usage:

```tsx
import { useTheme } from "@/hooks/useTheme";
import { Moon, Sun } from "lucide-react";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme}>
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}
```

---

## Usage Examples

### Semantic color classes (always use these, never raw colors):

```tsx
// ✅ Correct
<div className="bg-card text-card-foreground border border-border rounded-lg">
<Button className="bg-primary text-primary-foreground">
<span className="text-muted-foreground">

// ❌ Wrong — never hardcode colors
<div className="bg-slate-900 text-white">
<Button className="bg-cyan-500">
```

### Semi-transparent cards:

```tsx
<div className="bg-card/80 backdrop-blur-sm border border-border rounded-lg p-4">
  {/* Card content */}
</div>
```

### Status indicators:

```tsx
<Badge className="bg-success text-success-foreground">Active</Badge>
<Badge className="bg-destructive text-destructive-foreground">Failed</Badge>
<Badge className="bg-warning text-warning-foreground">Pending</Badge>
```

### App shell wrapper:

```tsx
<div className="app-shell min-h-screen">
  {/* Your layout here */}
</div>
```

---

## Required Dependencies

```
tailwindcss-animate
```

Install in any new project: `npm install tailwindcss-animate`
