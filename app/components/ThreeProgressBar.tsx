"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Box } from "@chakra-ui/react";
import { useThemeMode } from "@/app/providers";
import { getCatppuccinColors, catppuccinAlpha } from "@/app/theme/catppuccin";

interface ThreeProgressBarProps {
  status: "pending" | "active" | "completed" | "failed";
  label: string;
  colorHex?: string; // Optional custom color hex
  activeStartAt?: string; // Optional start time of the active stage (ISO string)
  icon?: ReactNode; // Optional leading icon (e.g. an AI agent bot glyph)
}

export function ThreeProgressBar({
  status,
  label,
  colorHex: customColorHex,
  activeStartAt,
  icon,
}: ThreeProgressBarProps) {
  const [mounted, setMounted] = useState(false);
  const { theme } = useThemeMode();
  const colors = getCatppuccinColors(theme);
  const isDark = theme === "dark";
  const colorHex = customColorHex ?? colors.sapphire;

  // Approximate numerical value for simulation
  const [progressVal, setProgressVal] = useState(0);

  // Map state to a target percentage
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === "pending") {
      setProgressVal(0);
    } else if (status === "completed") {
      setProgressVal(1.0);
    } else if (status === "failed") {
      setProgressVal((prev) => (prev > 0 ? prev : 0.5));
    } else if (status === "active") {
      // Calculate initial progress based on activeStartAt
      let initialProgress = 0.02;
      if (activeStartAt) {
        const startTime = new Date(activeStartAt).getTime();
        const now = Date.now();
        const secondsElapsed = Math.max(0, (now - startTime) / 1000);
        // Linear rate: 1.5% every 800ms -> 1.875% per second (0.01875)
        initialProgress = Math.min(0.95, 0.02 + secondsElapsed * 0.01875);
      }
      setProgressVal(initialProgress);

      interval = setInterval(() => {
        setProgressVal((prev) => {
          if (prev >= 0.95) return 0.95;
          return prev + 0.015; // Smooth linear increase of 1.5% every 800ms
        });
      }, 800);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, activeStartAt]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null; // Avoid SSR hydration mismatches
  }

  const percentage = Math.round(progressVal * 100);
  const isActive = status === "active";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  // Adaptive style values based on theme and stage status
  let cardBg = "";
  let borderColor = "";
  let labelColor = "";
  let statusColor = "";
  let progressBg = "";
  let progressTrackBg = "";

  if (isDark) {
    cardBg = isActive
      ? catppuccinAlpha(colors.surface0, 0.6)
      : catppuccinAlpha(colors.surface0, 0.3);
    progressTrackBg = "rgba(0, 0, 0, 0.25)";

    if (isActive) {
      borderColor = catppuccinAlpha(colors.sapphire, 0.25);
      labelColor = colors.text;
      statusColor = colors.sapphire;
      progressBg = colors.sapphire;
    } else if (isCompleted) {
      borderColor = catppuccinAlpha(colors.green, 0.25);
      labelColor = colors.green;
      statusColor = colors.green;
      progressBg = colors.green;
    } else if (isFailed) {
      borderColor = catppuccinAlpha(colors.red, 0.25);
      labelColor = colors.red;
      statusColor = colors.red;
      progressBg = colors.red;
    } else {
      borderColor = catppuccinAlpha(colors.text, 0.05);
      labelColor = colors.overlay1;
      statusColor = colors.surface2;
      progressBg = colors.surface2;
    }
  } else {
    // Light Mode (Latte)
    cardBg = isActive ? colors.base : catppuccinAlpha(colors.base, 0.7);
    progressTrackBg = catppuccinAlpha(colors.crust, 0.3);

    if (isActive) {
      borderColor = catppuccinAlpha(colors.sapphire, 0.4);
      labelColor = colors.text;
      statusColor = colors.sapphire;
      progressBg = colors.sapphire;
    } else if (isCompleted) {
      borderColor = catppuccinAlpha(colors.green, 0.35);
      labelColor = colors.green;
      statusColor = colors.green;
      progressBg = colors.green;
    } else if (isFailed) {
      borderColor = catppuccinAlpha(colors.red, 0.35);
      labelColor = colors.red;
      statusColor = colors.red;
      progressBg = colors.red;
    } else {
      borderColor = catppuccinAlpha(colors.overlay0, 0.25);
      labelColor = colors.overlay2;
      statusColor = colors.surface2;
      progressBg = colors.surface2;
    }
  }

  // Display status text
  let statusText = "0%";
  if (isCompleted) statusText = "COMPLETE";
  else if (isFailed) statusText = "FAILED";
  else if (status === "pending") statusText = "0%";
  else statusText = `${percentage}%`;

  // Windows-style block count calculations
  const totalBlocks = 20;
  const filledBlocksCount = Math.round((percentage / 100) * totalBlocks);

  return (
    <Box
      w="full"
      bg={cardBg}
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="xl"
      p={4}
      backdropFilter="blur(16px)"
      boxShadow={
        isActive
          ? `0 4px 12px ${catppuccinAlpha(colors.sapphire, isDark ? 0.15 : 0.1)}`
          : "none"
      }
      transition="all 0.3s ease"
      position="relative"
      overflow="hidden"
    >
      {/* Label and Status Flex Row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "14px",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {isActive && (
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: statusColor,
                boxShadow: `0 0 8px ${statusColor}`,
                animation: "pulse-glow 1.5s infinite",
                flexShrink: 0,
              }}
            />
          )}
          {icon && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                color: statusColor,
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              {icon}
            </span>
          )}
          <span
            style={{
              fontWeight: "600",
              fontSize: "13px",
              letterSpacing: "0.05em",
              color: labelColor,
              textTransform: "uppercase",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {label}
          </span>
        </div>

        <span
          style={{
            fontSize: "12px",
            fontFamily: "monospace",
            fontWeight: "bold",
            color: statusColor,
            marginLeft: "8px",
            flexShrink: 0,
          }}
        >
          {statusText}
        </span>
      </div>

      {/* Retro Segmented Progress Track */}
      <div
        style={{
          height: "14px",
          width: "100%",
          backgroundColor: progressTrackBg,
          borderRadius: "4px",
          padding: "2px",
          display: "flex",
          gap: "3px",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : catppuccinAlpha(colors.overlay0, 0.15)}`,
          boxSizing: "border-box",
        }}
      >
        {Array.from({ length: totalBlocks }).map((_, index) => {
          const isFilled = index < filledBlocksCount;

          let blockBg = "transparent";
          let blockOpacity = 0.1;

          if (isFilled) {
            blockBg = progressBg;
            blockOpacity = 1;
          } else {
            blockBg = isDark
              ? "rgba(255, 255, 255, 0.15)"
              : catppuccinAlpha(colors.overlay0, 0.25);
            blockOpacity = 0.1;
          }

          return (
            <div
              key={index}
              style={{
                flex: 1,
                height: "100%",
                backgroundColor: blockBg,
                borderRadius: "1px",
                transition: "background-color 0.2s ease, opacity 0.2s ease",
                opacity: blockOpacity,
              }}
            />
          );
        })}
      </div>

      <style jsx global>{`
        @keyframes pulse-glow {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.4;
            transform: scale(0.85);
          }
        }
      `}</style>
    </Box>
  );
}
