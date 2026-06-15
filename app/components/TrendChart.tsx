"use client";

import React, { useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";

interface TrendColors {
  cardBg: string;
  text: string;
  subtext: string;
  border: string;
}

/** One plotted run: a 0–1 `value` for the line + labeled rows for the tooltip. */
export interface TrendChartPoint {
  runId: string;
  at: string;
  /** Plotted on the y-axis (0..1). */
  value: number;
  /** Rows shown in the hover tooltip (first row is the emphasized headline). */
  rows: { label: string; value: string }[];
}

const DEFAULT_ACCENT = "var(--chakra-colors-blue-500, #3182ce)";

/**
 * Generic per-run trend line for the Monitoring board: fixed 0–100% y-axis,
 * gridlines, x-axis run labels, area fill, and a hover tooltip with stacked stats.
 * Data-agnostic — callers map their series into {value, rows} and pick an accent.
 */
export function TrendChart({
  title,
  description,
  yAxisLabel,
  footer,
  points,
  currentRunId,
  colors,
  accent = DEFAULT_ACCENT,
}: {
  title: string;
  description: string;
  yAxisLabel: string;
  footer?: React.ReactNode;
  points: TrendChartPoint[];
  currentRunId: string;
  colors: TrendColors;
  accent?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;

  const latest = points[points.length - 1];
  const first = points[0];
  const latestPct = Math.round(latest.value * 100);
  const deltaPts = Math.round((latest.value - first.value) * 100);

  // ── Chart geometry (responsive via viewBox; y-domain fixed 0–100%) ──
  const n = points.length;
  const VBW = 620;
  const VBH = 280;
  const M = { top: 26, right: 18, bottom: 42, left: 64 };
  const plotW = VBW - M.left - M.right;
  const plotH = VBH - M.top - M.bottom;
  const x = (i: number) =>
    M.left + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (v: number) => M.top + (1 - v) * plotH; // 100% at top
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xStep = Math.max(1, Math.ceil(n / 8)); // thin x labels when crowded
  const linePts = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const areaPts = `${x(0)},${y(0)} ${linePts} ${x(n - 1)},${y(0)}`;
  const gradId = `area-${title.replace(/[^a-zA-Z0-9]/g, "")}`;
  const shortDate = (iso: string) => {
    const d = (iso || "").slice(0, 10); // "YYYY-MM-DD"
    return d.length === 10 ? d.slice(5) : ""; // "MM-DD"
  };

  return (
    <Box
      flex="1 1 340px"
      minW={0}
      bg={colors.cardBg}
      border="1px solid"
      borderColor={colors.border}
      p={3.5}
      borderRadius="sm"
      fontSize="13px"
    >
      <Flex align="baseline" justify="space-between" gap={4} wrap="wrap" mb={1}>
        <Text color={colors.subtext} fontWeight="semibold">
          {title}
        </Text>
        <Flex align="baseline" gap={2}>
          <Text
            fontSize="22px"
            fontWeight="black"
            color={accent}
            lineHeight={1}
          >
            {latestPct}%
          </Text>
          <Text fontSize="12px" color={colors.subtext}>
            latest
          </Text>
          {points.length >= 2 && (
            <Text
              fontSize="12px"
              fontWeight="semibold"
              color={
                deltaPts > 0
                  ? "green.500"
                  : deltaPts < 0
                    ? "orange.400"
                    : colors.subtext
              }
            >
              {deltaPts > 0 ? "▲" : deltaPts < 0 ? "▼" : "■"}{" "}
              {Math.abs(deltaPts)} pts
            </Text>
          )}
        </Flex>
      </Flex>
      <Text fontSize="12px" color={colors.subtext} mb={2}>
        {description}
      </Text>

      <Box width="100%">
        <svg
          width="100%"
          viewBox={`0 0 ${VBW} ${VBH}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${title} across ${n} run${n === 1 ? "" : "s"}`}
          style={{ maxWidth: 680, display: "block" }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.22} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Y gridlines + tick labels (0–100%) */}
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={M.left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke={colors.border}
                strokeWidth={1}
                strokeDasharray={t === 0 ? undefined : "3 3"}
                opacity={t === 0 ? 1 : 0.6}
              />
              <text
                x={M.left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={11}
                fill={colors.subtext}
              >
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}

          {/* Y axis */}
          <line
            x1={M.left}
            y1={M.top}
            x2={M.left}
            y2={M.top + plotH}
            stroke={colors.subtext}
            strokeWidth={1}
            opacity={0.5}
          />

          {/* Area + line (only with ≥2 points) */}
          {n >= 2 && <polygon points={areaPts} fill={`url(#${gradId})`} />}
          {n >= 2 && (
            <polyline
              points={linePts}
              fill="none"
              stroke={accent}
              strokeWidth={2.25}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Data points + x-axis labels */}
          {points.map((p, i) => {
            const isCurrent = p.runId === currentRunId;
            const showXLabel = i % xStep === 0 || i === n - 1;
            return (
              <g key={p.runId}>
                <circle
                  cx={x(i)}
                  cy={y(p.value)}
                  r={isCurrent ? 5 : 3.5}
                  fill={isCurrent ? accent : colors.cardBg}
                  stroke={accent}
                  strokeWidth={2}
                />
                {isCurrent && (
                  <text
                    x={x(i)}
                    y={y(p.value) - 10}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill={accent}
                  >
                    {Math.round(p.value * 100)}%
                  </text>
                )}
                {showXLabel && (
                  <text
                    x={x(i)}
                    y={M.top + plotH + 16}
                    textAnchor="middle"
                    fontSize={11}
                    fill={colors.subtext}
                  >
                    {shortDate(p.at) || `#${i + 1}`}
                  </text>
                )}
              </g>
            );
          })}

          {/* Axis titles */}
          <text
            x={M.left + plotW / 2}
            y={VBH - 4}
            textAnchor="middle"
            fontSize={11}
            fill={colors.subtext}
          >
            Run timeline (oldest → newest)
          </text>
          <text
            transform={`translate(13 ${M.top + plotH / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={11}
            fill={colors.subtext}
          >
            {yAxisLabel}
          </text>

          {/* Hover highlight + plain stacked tooltip */}
          {hover !== null &&
            (() => {
              const p = points[hover];
              const px = x(hover);
              const py = y(p.value);
              const rows = p.rows;
              const TW = 180;
              const ROW = 18;
              const TOP = 12;
              const TH = TOP + rows.length * ROW + 6;
              const tx = Math.min(
                Math.max(px - TW / 2, M.left),
                M.left + plotW - TW,
              );
              const above = py - TH - 12 >= M.top;
              const ty = above ? py - TH - 12 : py + 12;
              return (
                <g pointerEvents="none">
                  <line
                    x1={px}
                    x2={px}
                    y1={M.top}
                    y2={M.top + plotH}
                    stroke={colors.subtext}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    opacity={0.5}
                  />
                  <circle cx={px} cy={py} r={5} fill={accent} />
                  <rect
                    x={tx}
                    y={ty}
                    width={TW}
                    height={TH}
                    rx={3}
                    fill={colors.cardBg}
                    stroke={colors.border}
                    strokeWidth={1}
                  />
                  {rows.map((r, k) => {
                    const ry = ty + TOP + k * ROW + 4;
                    return (
                      <g key={r.label}>
                        <text
                          x={tx + 10}
                          y={ry}
                          fontSize={11}
                          fontWeight={k === 0 ? 700 : 400}
                          fill={k === 0 ? colors.text : colors.subtext}
                        >
                          {r.label}
                        </text>
                        <text
                          x={tx + TW - 10}
                          y={ry}
                          textAnchor="end"
                          fontSize={11}
                          fontWeight={700}
                          fill={colors.text}
                        >
                          {r.value}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })()}

          {/* Invisible hover columns: hovering anywhere over a run reveals it */}
          <g onMouseLeave={() => setHover(null)}>
            {points.map((p, i) => {
              const leftMid = i === 0 ? M.left : (x(i - 1) + x(i)) / 2;
              const rightMid =
                i === n - 1 ? M.left + plotW : (x(i) + x(i + 1)) / 2;
              return (
                <rect
                  key={`hit-${p.runId}`}
                  x={leftMid}
                  y={M.top}
                  width={Math.max(1, rightMid - leftMid)}
                  height={plotH}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(i)}
                  onMouseMove={() => setHover(i)}
                />
              );
            })}
          </g>
        </svg>
      </Box>

      {footer && (
        <Text fontSize="12px" color={colors.subtext} mt={2}>
          {footer}
        </Text>
      )}
    </Box>
  );
}
