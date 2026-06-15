"use client";

import React, { useEffect, useState } from "react";
import { TrendChart, type TrendChartPoint } from "./TrendChart";

interface ReuseTrendPoint {
  runId: string;
  at: string;
  reuseRate: number;
  reused: number;
  total: number;
}

interface TrendColors {
  cardBg: string;
  text: string;
  subtext: string;
  border: string;
}

const REUSE_ACCENT = "var(--chakra-colors-purple-500, #8b5cf6)";

/**
 * App-scoped knowledge-maturation trend: the share of test specs the generator
 * reused from prior runs (vs regenerated), per run over time. A rising line means
 * the knowledge base is maturing — more reuse, less regeneration. Falls back to the
 * current run's own spec counts when the KB is cold; self-hides when no specs.
 */
export function KnowledgeReuseTrend({
  runId,
  generatedAt,
  reused,
  total,
  colors,
}: {
  runId: string;
  generatedAt: string;
  /** This run's reused-spec count (from the report). */
  reused: number;
  /** This run's total generated-spec count (from the report). */
  total: number;
  colors: TrendColors;
}) {
  const [trend, setTrend] = useState<ReuseTrendPoint[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/runs/${runId}/reuse-trend`)
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

  const localPoint: ReuseTrendPoint | null =
    total > 0
      ? { runId, at: generatedAt, reuseRate: reused / total, reused, total }
      : null;
  const raw =
    trend && trend.length > 0 ? trend : localPoint ? [localPoint] : [];

  if (!trend) return null; // still loading
  if (raw.length === 0) return null; // no specs anywhere → hide

  const points: TrendChartPoint[] = raw.map((p) => ({
    runId: p.runId,
    at: p.at,
    value: p.reuseRate,
    rows: [
      { label: "Spec reuse", value: `${Math.round(p.reuseRate * 100)}%` },
      { label: "Reused", value: String(p.reused) },
      { label: "Newly generated", value: String(p.total - p.reused) },
      { label: "Total specs", value: String(p.total) },
    ],
  }));
  const latest = raw[raw.length - 1];

  return (
    <TrendChart
      title="KNOWLEDGE REUSE TREND"
      description="Share of test specs the generator reused from prior runs instead of regenerating, per run over time. Rising means the knowledge base is maturing."
      yAxisLabel="Spec reuse rate"
      points={points}
      currentRunId={runId}
      colors={colors}
      accent={REUSE_ACCENT}
      footer={
        <>
          This run: <b>{latest.reused}</b> reused ·{" "}
          <b>{latest.total - latest.reused}</b> new of <b>{latest.total}</b>{" "}
          specs
        </>
      }
    />
  );
}
