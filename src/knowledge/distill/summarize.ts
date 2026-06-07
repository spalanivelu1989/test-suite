// Cluster → principle (Spec R10, ADR-0005). Turns one bounded cluster of similar
// heals into a human-readable playbook. The LLM is OPTIONAL: when a summarizer is
// supplied it narrates the cluster; otherwise (or on any parse failure) a
// deterministic per-strategy TEMPLATE is used, so the job always produces output
// even with no ANTHROPIC_API_KEY (C4/SC9).

import type { HealStrategy } from "../types";
import type { Cluster } from "./cluster";

export interface DistilledPrinciple {
  principle: string;
  antipattern?: string;
  recommendation: string;
}

/** A summarizer call (injected) — prompt in, raw model text out. */
export type Summarizer = (prompt: string) => Promise<string>;

const TEMPLATES: Record<HealStrategy, DistilledPrinciple> = {
  "role-locator": {
    principle:
      "Brittle CSS/id selectors break across runs; semantic role/label locators survive.",
    antipattern: "Targeting elements by volatile #id or .class selectors.",
    recommendation:
      "Use getByRole/getByLabel/getByText with accessible names instead of CSS selectors.",
  },
  "regex-text": {
    principle:
      "Exact text assertions flake on dynamic content (counts, dates, ids).",
    antipattern: "Asserting on exact strings that embed dynamic values.",
    recommendation:
      "Match dynamic text with a regex or a partial (hasText / { exact: false }).",
  },
  "wait-visibility": {
    principle:
      "Interacting before an element is ready flakes, especially on SPA route changes.",
    antipattern:
      "Clicking/reading an element without waiting for it to appear.",
    recommendation:
      "Add an explicit visibility wait (toBeVisible / waitFor) before interacting.",
  },
  "assertion-fix": {
    principle:
      "Assertions encoding a stale expectation fail when the app's truth changes.",
    antipattern: "Hard-coding an expected value that legitimately varies.",
    recommendation:
      "Assert on invariant properties or ranges rather than a single brittle value.",
  },
  fixme: {
    principle:
      "Some failures are genuine and should be quarantined, not forced green.",
    recommendation:
      "Mark confirmed real failures test.fixme() with an explanation.",
  },
  other: {
    principle: "A recurring fix pattern was observed for this failure class.",
    recommendation: "Review the exemplar fix and apply the same approach.",
  },
};

function template(strategy: HealStrategy): DistilledPrinciple {
  return TEMPLATES[strategy] ?? TEMPLATES.other;
}

/** Extract the first JSON object from possibly-noisy model text. */
function parseJsonObject(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildPrompt(cluster: Cluster): string {
  return [
    "You distill a cluster of similar automated-test failures-and-fixes into ONE reusable principle.",
    `Repair strategy: ${cluster.strategy}`,
    `Failure signature: ${cluster.signature}`,
    `Supporting runs: ${cluster.supportCount}`,
    `Example fix — before: ${cluster.exemplar.before}`,
    `Example fix — after:  ${cluster.exemplar.after}`,
    'Reply with ONLY JSON: {"principle": "...", "antipattern": "...", "recommendation": "..."}',
  ].join("\n");
}

/**
 * Summarize one cluster. Uses the injected summarizer when present and its output
 * parses; otherwise falls back to the deterministic strategy template.
 */
export async function summarizeCluster(
  cluster: Cluster,
  summarize?: Summarizer,
): Promise<DistilledPrinciple> {
  const fallback = template(cluster.strategy);
  if (!summarize) return fallback;
  try {
    const raw = await summarize(buildPrompt(cluster));
    const obj = parseJsonObject(raw);
    const principle =
      typeof obj?.principle === "string" ? obj.principle.trim() : "";
    const recommendation =
      typeof obj?.recommendation === "string" ? obj.recommendation.trim() : "";
    if (!principle || !recommendation) return fallback;
    return {
      principle,
      recommendation,
      antipattern:
        typeof obj?.antipattern === "string" && obj.antipattern.trim()
          ? obj.antipattern.trim()
          : fallback.antipattern,
    };
  } catch {
    return fallback; // best-effort: a summarizer failure never blocks distillation
  }
}
