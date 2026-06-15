"use client";

import React, { useEffect, useState } from "react";
import type { HealProvenance } from "@/src/knowledge/types";
import { TrendChart, type TrendChartPoint } from "./TrendChart";

interface HealTrendPoint {
  runId: string;
  at: string;
  hdrRate: number;
  healed: number;
  templateDirected: number;
  blind: number;
}

interface TrendColors {
  cardBg: string;
  text: string;
  subtext: string;
  border: string;
}

/**
 * App-scoped known-issue fix-rate trend (template-directed vs blind heals over
 * time) for the Monitoring board. Pulls the cross-run series from the knowledge
 * layer, but always shows the card for the current run when it healed something —
 * using the report's own `healProvenance` (no DB needed). Self-hides only when this
 * run healed nothing AND there is no prior trend.
 */
export function HealProvenanceTrend({
  runId,
  generatedAt,
  provenance,
  colors,
}: {
  runId: string;
  generatedAt: string;
  provenance?: HealProvenance;
  colors: TrendColors;
}) {
  const [trend, setTrend] = useState<HealTrendPoint[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/runs/${runId}/heal-trend`)
      .then((r) => (r.ok ? r.json() : { trend: [] }))
      .then((d) => {
        if (alive) setTrend(Array.isArray(d?.trend) ? d.trend : []);
      })
      .catch(() => {
        if (alive) setTrend([]);
      });
    return () => {
      alive = false;
    };
  }, [runId]);

  const localPoint: HealTrendPoint | null =
    provenance && provenance.healed > 0
      ? { ...provenance, runId, at: generatedAt }
      : null;
  const raw =
    trend && trend.length > 0 ? trend : localPoint ? [localPoint] : [];

  if (!trend) return null; // still loading
  if (raw.length === 0) return null; // nothing healed, no history → hide

  const points: TrendChartPoint[] = raw.map((p) => ({
    runId: p.runId,
    at: p.at,
    value: p.hdrRate,
    rows: [
      { label: "Known-issue fixes", value: `${Math.round(p.hdrRate * 100)}%` },
      { label: "Known-issue", value: String(p.templateDirected) },
      { label: "New-issue", value: String(p.blind) },
      { label: "Fixed", value: String(p.healed) },
    ],
  }));
  const latest = raw[raw.length - 1];

  return (
    <TrendChart
      title="KNOWN-ISSUE FIX TREND"
      description="Share of fixes for previously seen failures (known-issue) vs first occurrences (new-issue), per run over time. Higher is better."
      yAxisLabel="Known-issue fix rate"
      points={points}
      currentRunId={runId}
      colors={colors}
      footer={
        <>
          This run: <b>{latest.templateDirected}</b> known-issue ·{" "}
          <b>{latest.blind}</b> new-issue of <b>{latest.healed}</b> fixed
        </>
      }
    />
  );
}
