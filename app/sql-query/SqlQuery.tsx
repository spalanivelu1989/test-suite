"use client";

import {
  Box,
  Button,
  Flex,
  Spinner,
  Table,
  Text,
  Badge,
  Grid,
} from "@chakra-ui/react";
import {
  AlertCircle,
  Check,
  Code2,
  Copy,
  CornerDownLeft,
  Database,
  History,
  Play,
  Sparkles,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Search,
  Download,
  BookOpen,
  X,
  ChevronDown,
  Maximize2,
  Minimize2,
  Zap,
  Eye,
  FileText,
} from "lucide-react";
import { useEffect, useState, useRef, useMemo } from "react";
import { useThemeMode } from "@/app/providers";
import { getAWSColors } from "@/app/theme/aws";
import { catppuccinAlpha, getCatppuccinColors } from "@/app/theme/catppuccin";
import { MarkdownRenderer } from "@/app/components/MarkdownRenderer";
import { CodeBlock } from "@/app/components/CodeBlock";

// "SQL Query" tab — ask the Knowledge DB a question in plain English. The AI turns
// it into SQL (you can edit it), then a read-only backend runs it and renders the
// rows. All execution is strictly read-only (see src/knowledge/sql/guard.ts).

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

interface HistoryEntry {
  id: string;
  question: string;
  sql: string;
  ranAt: string;
  rowCount: number;
}

const HISTORY_KEY = "sql-query-history";
const HISTORY_MAX = 20;

// A quick-template either carries pre-written `sql` (a vetted "canned" query that
// is dropped straight into the editor — no AI round-trip) or omits it, in which
// case clicking it falls back to the AI translator for the free-form `label`.
// The canned SQL mirrors docs/sql-query-playbook.md; keep the two in sync.
interface ExampleTemplate {
  label: string;
  sql?: string;
}

const CATEGORIZED_EXAMPLES = {
  "Runs & Status": [
    {
      label: "What was the most recent test run?",
      sql: `SELECT run_id, app_id, url, status, crawl_mode, created_at
FROM runs
ORDER BY created_at DESC
LIMIT 1`,
    },
    {
      label: "Show me the last 10 test runs",
      sql: `SELECT run_id, app_id, url, status, created_at
FROM runs
ORDER BY created_at DESC
LIMIT 10`,
    },
    {
      label: "How many runs ended up in each status?",
      sql: `SELECT status, COUNT(*) AS runs
FROM runs
GROUP BY status
ORDER BY runs DESC`,
    },
    {
      label: "What test runs happened in the past week?",
      sql: `SELECT run_id, app_id, url, status, created_at
FROM runs
WHERE created_at >= now() - INTERVAL '7 days'
ORDER BY created_at DESC`,
    },
    {
      label: "Which runs failed in the last 30 days?",
      sql: `SELECT run_id, app_id, url, created_at
FROM runs
WHERE status = 'failed'
  AND created_at >= now() - INTERVAL '30 days'
ORDER BY created_at DESC`,
    },
    {
      label: "How many times has each app been tested?",
      sql: `SELECT app_id, COUNT(*) AS run_count
FROM runs
GROUP BY app_id
ORDER BY run_count DESC`,
    },
    {
      label: "When was each app first and last tested?",
      sql: `SELECT app_id,
       MIN(created_at) AS first_run,
       MAX(created_at) AS last_run,
       COUNT(*) AS runs
FROM runs
GROUP BY app_id
ORDER BY last_run DESC`,
    },
    {
      label: "Show me all the test runs for a particular URL",
      sql: `SELECT run_id, url, status, created_at
FROM runs
WHERE app_id = 'https://example.com'
ORDER BY created_at DESC`,
    },
  ],
  "Test Results": [
    {
      label: "How many tests passed and failed in the latest run?",
      sql: `SELECT outcome, COUNT(*) AS total
FROM test_results
WHERE run_id = (SELECT run_id FROM runs ORDER BY created_at DESC LIMIT 1)
GROUP BY outcome
ORDER BY total DESC`,
    },
    {
      label: "Which tests failed in the latest run, and why?",
      sql: `SELECT flow_id, file, failure_reason
FROM test_results
WHERE run_id = (SELECT run_id FROM runs ORDER BY created_at DESC LIMIT 1)
  AND outcome = 'failed'
ORDER BY flow_id`,
    },
    {
      label: "Show me every test result from the latest run",
      sql: `SELECT flow_id, file, outcome, failure_reason
FROM test_results
WHERE run_id = (SELECT run_id FROM runs ORDER BY created_at DESC LIMIT 1)
ORDER BY outcome, flow_id`,
    },
    {
      label: "Overall, how many tests passed, healed, or failed?",
      sql: `SELECT outcome, COUNT(*) AS total
FROM test_results
GROUP BY outcome
ORDER BY total DESC`,
    },
    {
      label: "What's the pass rate for each app?",
      sql: `SELECT app_id,
       COUNT(*) FILTER (WHERE outcome = 'passed') AS passed,
       COUNT(*) AS total,
       ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'passed')
             / NULLIF(COUNT(*), 0), 1) AS pass_pct
FROM test_results
GROUP BY app_id
ORDER BY pass_pct DESC`,
    },
    {
      label: "What are the most common reasons tests fail?",
      sql: `SELECT failure_reason, COUNT(*) AS occurrences
FROM test_results
WHERE outcome = 'failed' AND failure_reason IS NOT NULL
GROUP BY failure_reason
ORDER BY occurrences DESC
LIMIT 20`,
    },
    {
      label: "Which flows fail the most often?",
      sql: `SELECT app_id, flow_id,
       COUNT(*) FILTER (WHERE outcome = 'failed') AS failures,
       COUNT(*) AS times_run
FROM test_results
GROUP BY app_id, flow_id
HAVING COUNT(*) FILTER (WHERE outcome = 'failed') > 0
ORDER BY failures DESC
LIMIT 20`,
    },
    {
      label: "Which tests had to be self-healed in the latest run?",
      sql: `SELECT flow_id, file, failure_reason
FROM test_results
WHERE run_id = (SELECT run_id FROM runs ORDER BY created_at DESC LIMIT 1)
  AND outcome = 'healed'
ORDER BY flow_id`,
    },
  ],
  Coverage: [
    {
      label: "How much did we cover in the latest run?",
      sql: `SELECT app_id, percent, tested_count, curated_total, created_at
FROM coverage_snapshots
ORDER BY created_at DESC
LIMIT 1`,
    },
    {
      label: "What's the latest coverage for each app?",
      sql: `SELECT DISTINCT ON (app_id)
       app_id, percent, tested_count, curated_total, created_at
FROM coverage_snapshots
ORDER BY app_id, created_at DESC`,
    },
    {
      label: "Which runs had less than 80% coverage?",
      sql: `SELECT run_id, app_id, percent, tested_count, curated_total, created_at
FROM coverage_snapshots
WHERE percent < 80
ORDER BY percent ASC`,
    },
    {
      label: "Which runs reached 100% coverage?",
      sql: `SELECT run_id, app_id, tested_count, curated_total, created_at
FROM coverage_snapshots
WHERE percent = 100
ORDER BY created_at DESC`,
    },
    {
      label: "Which flows are still untested in an app's latest run?",
      sql: `SELECT unnest(missing_flows) AS missing_flow
FROM coverage_snapshots
WHERE run_id = (
  SELECT run_id FROM coverage_snapshots
  WHERE app_id = 'https://example.com'
  ORDER BY created_at DESC LIMIT 1
)`,
    },
    {
      label: "How has coverage changed over time for a URL?",
      sql: `SELECT created_at, percent, tested_count, curated_total
FROM coverage_snapshots
WHERE app_id = 'https://example.com'
ORDER BY created_at ASC`,
    },
    {
      label: "What's the average coverage for each app?",
      sql: `SELECT app_id,
       ROUND(AVG(percent), 1) AS avg_percent,
       COUNT(*) AS snapshots
FROM coverage_snapshots
GROUP BY app_id
ORDER BY avg_percent DESC`,
    },
    {
      label: "Which runs had the best coverage?",
      sql: `SELECT run_id, app_id, percent, created_at
FROM coverage_snapshots
ORDER BY percent DESC
LIMIT 10`,
    },
  ],
  "Specs & Plans": [
    {
      label: "Show me the most recent test plan",
      sql: `SELECT report->>'planMarkdown' AS plan_markdown
FROM raw_reports
ORDER BY created_at DESC
LIMIT 1`,
    },
    {
      label: "What's the latest test plan for a particular URL?",
      sql: `SELECT report->>'planMarkdown' AS plan_markdown
FROM raw_reports
WHERE app_id = 'https://example.com'
ORDER BY created_at DESC
LIMIT 1`,
    },
    {
      label: "Can you summarize the latest test run?",
      sql: `SELECT report->>'testSummary' AS test_summary
FROM raw_reports
ORDER BY created_at DESC
LIMIT 1`,
    },
    {
      label: "Which test files were generated in the latest run?",
      sql: `SELECT file, title, flow_id, reused
FROM specs
WHERE run_id = (SELECT run_id FROM runs ORDER BY created_at DESC LIMIT 1)
ORDER BY file`,
    },
    {
      label: "Show me the test code from the latest run",
      sql: `SELECT spec->>'file' AS file,
       spec->>'code' AS code
FROM raw_reports,
     jsonb_array_elements(report->'generatedSpecs') AS spec
WHERE run_id = (SELECT run_id FROM raw_reports ORDER BY created_at DESC LIMIT 1)
ORDER BY file`,
    },
    {
      label: "What scenarios were planned for the latest run?",
      sql: `SELECT ordinal, name
FROM plan_scenarios
WHERE run_id = (SELECT run_id FROM runs ORDER BY created_at DESC LIMIT 1)
ORDER BY ordinal`,
    },
    {
      label: "Which apps have the most saved tests?",
      sql: `SELECT app_id, COUNT(*) AS spec_count
FROM specs
GROUP BY app_id
ORDER BY spec_count DESC`,
    },
    {
      label: "For each app, how many tests were reused vs. newly written?",
      sql: `SELECT app_id,
       COUNT(*) FILTER (WHERE reused) AS reused,
       COUNT(*) FILTER (WHERE NOT reused) AS newly_generated,
       COUNT(*) AS total
FROM specs
GROUP BY app_id
ORDER BY total DESC`,
    },
  ],
  Healing: [
    {
      label: "Show me the most recent self-healing fixes",
      sql: `SELECT created_at, app_id, flow_id, file, strategy, outcome
FROM healing_events
ORDER BY created_at DESC
LIMIT 20`,
    },
    {
      label: "How often does self-healing work vs. give up?",
      sql: `SELECT outcome, COUNT(*) AS total
FROM healing_events
GROUP BY outcome
ORDER BY total DESC`,
    },
    {
      label: "What errors trigger self-healing the most?",
      sql: `SELECT failure_signature, COUNT(*) AS occurrences
FROM healing_events
GROUP BY failure_signature
ORDER BY occurrences DESC
LIMIT 20`,
    },
    {
      label: "Which self-healing strategies get used the most?",
      sql: `SELECT strategy, COUNT(*) AS uses
FROM healing_events
GROUP BY strategy
ORDER BY uses DESC`,
    },
    {
      label: "What got self-healed in the latest run?",
      sql: `SELECT flow_id, file, strategy, outcome
FROM healing_events
WHERE run_id = (SELECT run_id FROM runs ORDER BY created_at DESC LIMIT 1)
ORDER BY flow_id`,
    },
    {
      label: "Show me the before-and-after fixes for a URL",
      sql: `SELECT flow_id, file, strategy, outcome, before_snippet, after_snippet
FROM healing_events
WHERE app_id = 'https://example.com'
ORDER BY created_at DESC`,
    },
    {
      label: "Which apps need the most self-healing?",
      sql: `SELECT app_id, COUNT(*) AS heal_events
FROM healing_events
GROUP BY app_id
ORDER BY heal_events DESC`,
    },
    {
      label: "What's the self-healing success rate for each app?",
      sql: `SELECT app_id,
       COUNT(*) FILTER (WHERE outcome = 'healed') AS healed,
       COUNT(*) AS total,
       ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'healed')
             / NULLIF(COUNT(*), 0), 1) AS heal_pct
FROM healing_events
GROUP BY app_id
ORDER BY heal_pct DESC`,
    },
  ],
  "Apps & Database": [
    {
      label: "What tables are in the database?",
      sql: `SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name`,
    },
    {
      label: "Which apps are we testing?",
      sql: `SELECT app_id, run_count, first_seen, last_seen
FROM apps
ORDER BY last_seen DESC`,
    },
    {
      label: "Which apps are tested the most?",
      sql: `SELECT app_id, run_count, last_seen
FROM apps
ORDER BY run_count DESC
LIMIT 10`,
    },
    {
      label: "Which apps haven't been tested in the last week?",
      sql: `SELECT app_id, last_seen, run_count
FROM apps
WHERE last_seen < now() - INTERVAL '7 days'
ORDER BY last_seen ASC`,
    },
    {
      label: "What are the success, flake, and heal rates for recent runs?",
      sql: `SELECT run_id,
       (report->>'successRate')::numeric      AS success_rate,
       (report->>'flakeRate')::numeric        AS flake_rate,
       (report->>'healSuccessRate')::numeric  AS heal_success_rate,
       created_at
FROM raw_reports
ORDER BY created_at DESC
LIMIT 20`,
    },
    {
      label: "Give me a full health check of an app's latest run",
      sql: `SELECT r.run_id, r.url, r.status, r.created_at,
       cs.percent AS coverage_percent,
       COUNT(tr.id) FILTER (WHERE tr.outcome = 'passed') AS passed,
       COUNT(tr.id) FILTER (WHERE tr.outcome = 'failed') AS failed,
       COUNT(tr.id) FILTER (WHERE tr.outcome = 'healed') AS healed
FROM runs r
LEFT JOIN coverage_snapshots cs ON cs.run_id = r.run_id
LEFT JOIN test_results tr       ON tr.run_id = r.run_id
WHERE r.app_id = 'https://example.com'
GROUP BY r.run_id, r.url, r.status, r.created_at, cs.percent
ORDER BY r.created_at DESC
LIMIT 1`,
    },
    {
      label: "What are our most trusted testing rules?",
      sql: `SELECT id, scope_kind, scope_key, principle, recommendation,
       confidence, support_count
FROM playbooks
WHERE status = 'trusted'
ORDER BY confidence DESC, support_count DESC`,
    },
    {
      label: "What testing rules apply to a particular URL?",
      sql: `SELECT principle, antipattern, recommendation, confidence, status
FROM playbooks
WHERE scope_kind = 'app' AND scope_key = 'https://example.com'
ORDER BY confidence DESC`,
    },
  ],
} satisfies Record<string, ExampleTemplate[]>;

const SCHEMA_TABLES = [
  {
    name: "apps",
    description: "App origins monitored by the test suite.",
    columns: [
      {
        name: "app_id",
        type: "TEXT PRIMARY KEY",
        desc: "Normalized origin (e.g. https://example.com)",
      },
      {
        name: "first_seen",
        type: "TIMESTAMPTZ",
        desc: "First recorded run time",
      },
      {
        name: "last_seen",
        type: "TIMESTAMPTZ",
        desc: "Latest recorded run time",
      },
      { name: "run_count", type: "INTEGER", desc: "Total runs completed" },
    ],
  },
  {
    name: "runs",
    description: "Test suite execution runs.",
    columns: [
      {
        name: "run_id",
        type: "TEXT PRIMARY KEY",
        desc: "Unique identifier for the execution run",
      },
      {
        name: "app_id",
        type: "TEXT -> apps(app_id)",
        desc: "Normalized app origin",
      },
      {
        name: "url",
        type: "TEXT",
        desc: "The exact URL that was targeted in the test",
      },
      { name: "status", type: "TEXT", desc: "completed | running | failed" },
      { name: "crawl_mode", type: "TEXT", desc: "Crawler setup / strategy" },
      {
        name: "created_at",
        type: "TIMESTAMPTZ",
        desc: "Run creation timestamp",
      },
    ],
  },
  {
    name: "specs",
    description: "Generated Playwright test files.",
    columns: [
      {
        name: "id",
        type: "BIGSERIAL PRIMARY KEY",
        desc: "Internal spec identifier",
      },
      {
        name: "run_id",
        type: "TEXT -> runs(run_id)",
        desc: "Associated run ID",
      },
      { name: "app_id", type: "TEXT", desc: "Associated app origin" },
      { name: "file", type: "TEXT", desc: "Playwright test file path" },
      { name: "title", type: "TEXT", desc: "Abstracted test case/flow title" },
      {
        name: "flow_id",
        type: "TEXT",
        desc: "Logical workspace workflow reference",
      },
      {
        name: "reused",
        type: "BOOLEAN",
        desc: "True if spec was copied forward from a prior run",
      },
      {
        name: "tokens",
        type: "TEXT[]",
        desc: "Keywords representing user intent",
      },
      {
        name: "pattern_text",
        type: "TEXT",
        desc: "Normalized, variable-stripped code skeleton",
      },
      {
        name: "created_at",
        type: "TIMESTAMPTZ",
        desc: "Timestamp of generation",
      },
    ],
  },
  {
    name: "test_results",
    description: "Outcome results per workflow flow/file in a run.",
    columns: [
      {
        name: "id",
        type: "BIGSERIAL PRIMARY KEY",
        desc: "Result entry identifier",
      },
      {
        name: "run_id",
        type: "TEXT -> runs(run_id)",
        desc: "Execution run reference",
      },
      { name: "app_id", type: "TEXT", desc: "Associated app origin" },
      {
        name: "flow_id",
        type: "TEXT",
        desc: "Target workflow flow identifier",
      },
      { name: "file", type: "TEXT", desc: "Run test filename" },
      { name: "outcome", type: "TEXT", desc: "passed | healed | failed" },
      {
        name: "failure_reason",
        type: "TEXT",
        desc: "Error messages in case of failure",
      },
      { name: "created_at", type: "TIMESTAMPTZ", desc: "Timestamp" },
    ],
  },
  {
    name: "coverage_snapshots",
    description: "Workflow coverage coverage percentage per run.",
    columns: [
      {
        name: "run_id",
        type: "TEXT PRIMARY KEY -> runs(run_id)",
        desc: "Associated execution run",
      },
      { name: "app_id", type: "TEXT", desc: "App origin reference" },
      { name: "curated_total", type: "INTEGER", desc: "Total planned flows" },
      {
        name: "tested_count",
        type: "INTEGER",
        desc: "Number of flows verified",
      },
      {
        name: "percent",
        type: "INTEGER",
        desc: "Coverage percentage (0..100)",
      },
      {
        name: "missing_flows",
        type: "TEXT[]",
        desc: "List of untested flow names",
      },
      { name: "created_at", type: "TIMESTAMPTZ", desc: "Creation timestamp" },
    ],
  },
  {
    name: "raw_reports",
    description:
      "Full JSON RunReport payloads containing test summaries and logs.",
    columns: [
      {
        name: "run_id",
        type: "TEXT PRIMARY KEY -> runs(run_id)",
        desc: "Execution run reference",
      },
      { name: "app_id", type: "TEXT", desc: "App origin reference" },
      {
        name: "report",
        type: "JSONB",
        desc: "Raw document JSON. report->>'planMarkdown' is the test plan",
      },
      { name: "created_at", type: "TIMESTAMPTZ", desc: "Timestamp" },
    ],
  },
  {
    name: "healing_events",
    description: "Self-healing logs capturing AI selector repairs.",
    columns: [
      {
        name: "id",
        type: "BIGSERIAL PRIMARY KEY",
        desc: "Healing case identifier",
      },
      {
        name: "run_id",
        type: "TEXT -> runs(run_id)",
        desc: "Execution run reference",
      },
      { name: "app_id", type: "TEXT", desc: "Associated app origin" },
      {
        name: "flow_id",
        type: "TEXT",
        desc: "Target workflow flow identifier",
      },
      { name: "file", type: "TEXT", desc: "Repaired test file name" },
      {
        name: "failure_signature",
        type: "TEXT",
        desc: "Abstracted exception fingerprint",
      },
      { name: "before_snippet", type: "TEXT", desc: "Failing locator code" },
      { name: "after_snippet", type: "TEXT", desc: "Repaired locator code" },
      { name: "strategy", type: "TEXT", desc: "Heuristic/AI strategy applied" },
      { name: "outcome", type: "TEXT", desc: "healed | fixme" },
      { name: "created_at", type: "TIMESTAMPTZ", desc: "Timestamp" },
    ],
  },
  {
    name: "playbooks",
    description:
      "Distilled testing rules and recommendations verified across runs.",
    columns: [
      { name: "id", type: "TEXT PRIMARY KEY", desc: "Unique principle ID" },
      {
        name: "scope_kind",
        type: "TEXT",
        desc: "app | global | componentType",
      },
      {
        name: "scope_key",
        type: "TEXT",
        desc: "Context descriptor for applicability",
      },
      { name: "principle", type: "TEXT", desc: "Abstracted rule details" },
      {
        name: "antipattern",
        type: "TEXT",
        desc: "Failing design pattern to avoid",
      },
      { name: "recommendation", type: "TEXT", desc: "Alternative solution" },
      {
        name: "support_count",
        type: "INTEGER",
        desc: "Verification frequency",
      },
      {
        name: "confidence",
        type: "REAL",
        desc: "Calculated reliability score",
      },
      { name: "status", type: "TEXT", desc: "episodic | trusted" },
      { name: "created_at", type: "TIMESTAMPTZ", desc: "Timestamp" },
    ],
  },
];

// Postgres TIMESTAMPTZ values are serialized to UTC ISO strings (…Z) over JSON, so
// the browser would otherwise show UTC. Match those and render them in IST.
const ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

/** Format an ISO timestamp in India Standard Time (Asia/Kolkata). */
function formatIST(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })} IST`;
}

/**
 * Classify a long cell value so the viewer picks the right presentation:
 * - "code"     → source code or JSON (show the raw code view; markdown would mangle it)
 * - "markdown" → headings/lists/tables/blockquotes (show the rendered view)
 * - "text"     → plain prose (raw view; rendering as markdown is a no-op)
 */
function detectContentKind(v: string): "code" | "markdown" | "text" {
  const t = v.trim();

  // Markdown signals — weighted; tables and headings are the strongest cues.
  const hasTable =
    /(^|\n)\s*\|.*\|/.test(v) && /(^|\n)\s*\|?\s*:?-{2,}:?\s*(\||$)/.test(v);
  const markdownScore =
    (/(^|\n)#{1,6}\s/.test(v) ? 2 : 0) +
    (hasTable ? 3 : 0) +
    (/(^|\n)\s*[-*+]\s+\S/.test(v) ? 1 : 0) +
    (/(^|\n)\s*\d+[.)]\s+\S/.test(v) ? 1 : 0) +
    (/\*\*[^*\n]+\*\*/.test(v) ? 1 : 0) +
    (/(^|\n)>\s/.test(v) ? 1 : 0);

  // Code / JSON signals — real declarations and structure, not stray punctuation.
  const isJson =
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"));
  const codeScore =
    (/(^|\n)\s*(import |export )/.test(v) ? 2 : 0) +
    (/(^|\n)\s*(const |let |var |function |class |interface |enum |type )\w/.test(
      v,
    )
      ? 2
      : 0) +
    (/=>|\bawait\s|\)\s*\{|\}\s*\)/.test(v) ? 1 : 0) +
    (isJson ? 3 : 0);

  if (codeScore > markdownScore) return "code";
  if (markdownScore > 0) return "markdown";
  return "text";
}

/** Render any cell value (null, JSON, array, scalar) as a readable string. */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "string" && ISO_DATETIME.test(value)) {
    return formatIST(value);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function highlightSQL(code: string, isDark: boolean): React.ReactNode[] {
  if (!code) return [];

  const regex =
    /(--.*)|('[^']*')|(\b\d+\b)|(\b(?:SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP\s+BY|ORDER\s+BY|LIMIT|OFFSET|AND|OR|AS|WITH|INSERT|UPDATE|DELETE|CREATE|TABLE|IN|NOT|NULL|IS|TRUE|FALSE|HAVING|UNION|ALL|EXISTS|CASE|WHEN|THEN|ELSE|END|DESC|ASC|COUNT|SUM|AVG|MIN|MAX)\b)|([=<>!+\-*\/%]+)|(\S+)|(\s+)/gi;

  const parts: React.ReactNode[] = [];

  const colors = {
    keyword: isDark ? "#ca9ee6" : "#7c3aed",
    string: isDark ? "#a6d189" : "#22c55e",
    comment: isDark ? "#838ba7" : "#94a3b8",
    number: isDark ? "#ef9f76" : "#fe641b",
    operator: isDark ? "#85c1dc" : "#2563eb",
  };

  let match;
  let key = 0;
  regex.lastIndex = 0;

  while ((match = regex.exec(code)) !== null) {
    if (match.index === regex.lastIndex) {
      regex.lastIndex++;
    }

    const [full, comment, string, number, keyword, operator, word, whitespace] =
      match;

    if (comment) {
      parts.push(
        <span
          key={key++}
          style={{ color: colors.comment, fontStyle: "italic" }}
        >
          {comment}
        </span>,
      );
    } else if (string) {
      parts.push(
        <span key={key++} style={{ color: colors.string }}>
          {string}
        </span>,
      );
    } else if (number) {
      parts.push(
        <span key={key++} style={{ color: colors.number }}>
          {number}
        </span>,
      );
    } else if (keyword) {
      parts.push(
        <span key={key++} style={{ color: colors.keyword, fontWeight: "bold" }}>
          {keyword}
        </span>,
      );
    } else if (operator) {
      parts.push(
        <span key={key++} style={{ color: colors.operator }}>
          {operator}
        </span>,
      );
    } else if (word) {
      parts.push(<span key={key++}>{word}</span>);
    } else if (whitespace) {
      parts.push(whitespace);
    }
  }

  return parts;
}

function convertToCSV(
  columns: string[],
  rows: Record<string, unknown>[],
): string {
  const header = columns.join(",");
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return "";
          let str = typeof val === "object" ? JSON.stringify(val) : String(val);
          // Escape quotes
          str = str.replace(/"/g, '""');
          if (str.includes(",") || str.includes("\n") || str.includes('"')) {
            return `"${str}"`;
          }
          return str;
        })
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}`;
}

export function SqlQuery() {
  const { theme } = useThemeMode();
  const colors = getAWSColors(theme);
  const c = getCatppuccinColors(theme);

  const [question, setQuestion] = useState("");
  const [sql, setSql] = useState("");
  const [translating, setTranslating] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [focusedField, setFocusedField] = useState<"question" | "sql" | null>(
    null,
  );
  // Which panel is expanded to full screen ("question" | "sql" | "results" | null).
  const [fullscreen, setFullscreen] = useState<
    "question" | "sql" | "results" | null
  >(null);
  // A long/markdown cell value opened in the viewer modal (null = closed).
  const [viewerCell, setViewerCell] = useState<{
    column: string;
    value: string;
  } | null>(null);
  const [viewerMode, setViewerMode] = useState<"rendered" | "raw">("rendered");
  const [viewerCopied, setViewerCopied] = useState(false);

  // Redesign additions
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"history" | "schema">("history");
  const [historySearch, setHistorySearch] = useState("");
  const [schemaSearch, setSchemaSearch] = useState("");
  const [filterText, setFilterText] = useState("");
  const [execTime, setExecTime] = useState<number | null>(null);
  const [copiedCsv, setCopiedCsv] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>(
    { apps: true },
  );
  const [selectedExampleCategory, setSelectedExampleCategory] =
    useState<keyof typeof CATEGORIZED_EXAMPLES>("Runs & Status");

  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  // Load + persist history in localStorage so it survives reloads.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch {
      /* ignore corrupt history */
    }
  }, []);

  function persistHistory(next: HistoryEntry[]) {
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* storage full / disabled — keep it in memory only */
    }
  }

  // Esc exits full screen; also lock body scroll while a panel is expanded.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  // Esc closes the cell viewer; lock body scroll while it is open. Reset the mode
  // back to "rendered" each time a new cell is opened.
  useEffect(() => {
    if (!viewerCell) return;
    // Markdown content opens in the rendered view; code/JSON/plain text opens in
    // the raw code view (rendering those as markdown mangles them).
    setViewerMode(
      detectContentKind(viewerCell.value) === "markdown" ? "rendered" : "raw",
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewerCell(null);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [viewerCell]);

  function copyViewer() {
    if (!viewerCell) return;
    navigator.clipboard.writeText(viewerCell.value).then(() => {
      setViewerCopied(true);
      setTimeout(() => setViewerCopied(false), 1500);
    });
  }

  async function translate(q?: string) {
    const text = (q ?? question).trim();
    if (!text) return;
    setTranslating(true);
    setError(null);
    setResult(null);
    setExecTime(null);
    try {
      const res = await fetch("/api/knowledge/query/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setSql(data.sql ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "translation failed");
    } finally {
      setTranslating(false);
    }
  }

  async function runQuery() {
    if (!sql.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);
    const startTime = performance.now();
    try {
      const res = await fetch("/api/knowledge/query/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const duration = Math.round(performance.now() - startTime);
      setExecTime(duration);

      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setResult(null);
      } else {
        const r: QueryResult = {
          columns: data.columns ?? [],
          rows: data.rows ?? [],
          rowCount: data.rowCount ?? 0,
          truncated: !!data.truncated,
        };
        setResult(r);
        persistHistory(
          [
            {
              id: `${Date.now()}-${Math.round(performance.now())}`,
              question: question.trim(),
              sql: sql.trim(),
              ranAt: new Date().toISOString(),
              rowCount: r.rowCount,
            },
            ...history,
          ].slice(0, HISTORY_MAX),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "query failed");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  function copySql() {
    if (!sql.trim()) return;
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function useExample(ex: ExampleTemplate) {
    setQuestion(ex.label);
    setResult(null);
    setError(null);
    setExecTime(null);
    if (ex.sql) {
      // Canned query — drop the vetted SQL straight in, skip the AI translator.
      setSql(ex.sql);
    } else {
      translate(ex.label);
    }
  }

  function loadFromHistory(h: HistoryEntry) {
    setQuestion(h.question);
    setSql(h.sql);
    setResult(null);
    setError(null);
    setExecTime(null);
  }

  function deleteHistoryItem(id: string) {
    const next = history.filter((h) => h.id !== id);
    persistHistory(next);
  }

  function toggleTableExpanded(name: string) {
    setExpandedTables((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  function insertTextAtCursor(text: string) {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const currentVal = textareaRef.current.value;
      const nextVal =
        currentVal.substring(0, start) + text + currentVal.substring(end);
      setSql(nextVal);

      // Focus back and position cursor after inserted text
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart =
            textareaRef.current.selectionEnd = start + text.length;
        }
      }, 10);
    } else {
      // Fallback: append
      setSql((prev) => (prev ? prev + " " + text : text));
    }
  }

  const handleScroll = () => {
    if (textareaRef.current) {
      const scrollTop = textareaRef.current.scrollTop;
      const scrollLeft = textareaRef.current.scrollLeft;
      if (gutterRef.current) {
        gutterRef.current.scrollTop = scrollTop;
      }
      if (highlightRef.current) {
        highlightRef.current.scrollTop = scrollTop;
        highlightRef.current.scrollLeft = scrollLeft;
      }
    }
  };

  // Keep gutter and highlight scroll in sync when textarea lines or contents change
  useEffect(() => {
    if (textareaRef.current) {
      const scrollTop = textareaRef.current.scrollTop;
      if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
      if (highlightRef.current) highlightRef.current.scrollTop = scrollTop;
    }
  }, [sql]);

  const copyAsCsv = () => {
    if (!result) return;
    const csvContent = convertToCSV(result.columns, filteredRows);
    navigator.clipboard.writeText(csvContent).then(() => {
      setCopiedCsv(true);
      setTimeout(() => setCopiedCsv(false), 1500);
    });
  };

  const copyAsJson = () => {
    if (!result) return;
    const jsonContent = JSON.stringify(filteredRows, null, 2);
    navigator.clipboard.writeText(jsonContent).then(() => {
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1500);
    });
  };

  const downloadCsv = () => {
    if (!result) return;
    const csvContent = convertToCSV(result.columns, filteredRows);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `query_results_${Date.now()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isDark = theme === "dark";

  // Premium accents — gradient CTAs with a soft colored glow, focus rings, and
  // editor/card surfaces tuned per theme.
  const GEN_GRADIENT = `linear-gradient(135deg, ${c.sapphire} 0%, ${c.blue} 100%)`;
  const GEN_GRADIENT_HOVER = `linear-gradient(135deg, ${c.sky} 0%, ${c.sapphire} 100%)`;
  const RUN_GRADIENT = `linear-gradient(135deg, ${c.green} 0%, ${c.teal} 100%)`;
  const RUN_GRADIENT_HOVER = `linear-gradient(135deg, ${c.teal} 0%, ${c.green} 100%)`;

  const cardShadow = isDark
    ? "0 10px 30px rgba(0,0,0,0.35)"
    : "0 10px 30px rgba(15,23,42,0.06)";

  const editorBg = isDark ? "#1e1e2e" : colors.subBg;
  const editorHeaderBg = isDark ? "#252638" : colors.cardBg;
  const editorText = isDark ? "#cdd6f4" : colors.text;
  const textareaColor = sql
    ? "transparent"
    : isDark
      ? "rgba(205, 214, 244, 0.4)"
      : "rgba(26, 38, 59, 0.4)";

  const editorFontFamily =
    "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";
  const editorFontSize = "13.5px";
  const editorLineHeight = "22px";

  // Textarea style
  const bareTextArea: React.CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    border: "none",
    background: "transparent",
    color: colors.text,
    fontSize: "14px",
    outline: "none",
    resize: "none",
    fontFamily: "inherit",
    lineHeight: 1.6,
  };

  const fieldWrap = (field: "question" | "sql"): React.CSSProperties => ({
    borderRadius: "12px",
    border: `1px solid ${focusedField === field ? c.sapphire : colors.border}`,
    boxShadow:
      focusedField === field
        ? `0 0 0 3px ${catppuccinAlpha(c.sapphire, 0.18)}`
        : cardShadow,
    transition: "border-color 0.18s ease, box-shadow 0.18s ease",
    overflow: "hidden",
  });

  // Overlay props applied to a composer panel when it is expanded to full screen
  // (a fixed, inset card above a backdrop). {} keeps the normal in-grid layout.
  const panelFsProps = (panel: "question" | "sql" | "results") =>
    fullscreen === panel
      ? {
          position: "fixed" as const,
          inset: "16px",
          zIndex: 1400,
          width: "auto",
          maxW: "none",
        }
      : {};

  // The maximize/restore toggle shown in each panel header.
  const renderFsButton = (panel: "question" | "sql" | "results") => (
    <Button
      size="xs"
      h="28px"
      variant="ghost"
      color={colors.subtext}
      borderRadius="6px"
      _hover={{ bg: colors.rowHover, color: editorText }}
      onClick={() => setFullscreen((cur) => (cur === panel ? null : panel))}
      title={fullscreen === panel ? "Exit full screen (Esc)" : "Full screen"}
      aria-label={fullscreen === panel ? "Exit full screen" : "Full screen"}
    >
      {fullscreen === panel ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
    </Button>
  );

  // Filters
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return history;
    const q = historySearch.toLowerCase();
    return history.filter(
      (h) =>
        h.question.toLowerCase().includes(q) || h.sql.toLowerCase().includes(q),
    );
  }, [history, historySearch]);

  const filteredTables = useMemo(() => {
    if (!schemaSearch.trim()) return SCHEMA_TABLES;
    const q = schemaSearch.toLowerCase();
    return SCHEMA_TABLES.map((table) => {
      const nameMatch = table.name.toLowerCase().includes(q);
      const descMatch = table.description.toLowerCase().includes(q);
      const filteredCols = table.columns.filter(
        (col) =>
          col.name.toLowerCase().includes(q) ||
          col.type.toLowerCase().includes(q) ||
          col.desc.toLowerCase().includes(q),
      );
      if (nameMatch || descMatch || filteredCols.length > 0) {
        return {
          ...table,
          columns: nameMatch ? table.columns : filteredCols,
        };
      }
      return null;
    }).filter((t): t is (typeof SCHEMA_TABLES)[number] => t !== null);
  }, [schemaSearch]);

  const filteredRows = useMemo(() => {
    if (!result) return [];
    if (!filterText.trim()) return result.rows;
    const q = filterText.toLowerCase();
    return result.rows.filter((row) =>
      Object.values(row).some((val) => String(val).toLowerCase().includes(q)),
    );
  }, [result, filterText]);

  const lineCount = Math.max(sql.split("\n").length, 8);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  // Content kind of the value open in the viewer — drives which views are offered.
  const viewerKind = viewerCell ? detectContentKind(viewerCell.value) : "text";
  // The markdown "Rendered" view only makes sense for markdown; code/JSON would be
  // mangled, so we hide the toggle and force the raw code view for those.
  const viewerCanRender = viewerKind !== "code";

  return (
    <Box width="100%">
      {/* Dimmed backdrop behind a full-screen composer panel (click to exit). */}
      {fullscreen && (
        <Box
          position="fixed"
          inset="0"
          zIndex={1399}
          bg="blackAlpha.600"
          backdropFilter="blur(2px)"
          onClick={() => setFullscreen(null)}
        />
      )}

      {/* Header Banner */}
      <Flex align="center" justify="space-between" mb={5} wrap="wrap" gap={3}>
        <Flex align="center" gap={3}>
          <Box
            p={2.5}
            borderRadius="12px"
            bg={catppuccinAlpha(c.sapphire, 0.12)}
            color={c.sapphire}
            boxShadow={`0 4px 12px ${catppuccinAlpha(c.sapphire, 0.08)}`}
          >
            <Database
              size={22}
              style={{ animation: "pulse-glow 2s infinite" }}
            />
          </Box>
          <Box>
            <Text
              fontSize="20px"
              fontWeight="bold"
              color={colors.text}
              letterSpacing="-0.3px"
            >
              SQL Query Playground
            </Text>
            <Text fontSize="12.5px" color={colors.subtext}>
              Ask the knowledge layer a question in plain English. The AI drafts
              the SQL, and you execute it read-only.
            </Text>
          </Box>
        </Flex>

        {/* Sidebar Trigger Button */}
        <Button
          size="sm"
          variant="outline"
          borderColor={colors.border}
          color={colors.subtext}
          borderRadius="8px"
          px={3.5}
          h="36px"
          fontSize="12px"
          fontWeight="600"
          _hover={{ bg: colors.rowHover, color: colors.text }}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? (
            <Flex align="center" gap={1.5}>
              Hide Sidebar
              <ChevronRight size={14} />
            </Flex>
          ) : (
            <Flex align="center" gap={1.5}>
              <ChevronLeft size={14} />
              Show Sidebar &amp; Guide
            </Flex>
          )}
        </Button>
      </Flex>

      {/* Main Workspace Layout */}
      <Flex
        gap={6}
        align="flex-start"
        direction={{ base: "column", xl: "row" }}
        width="100%"
      >
        {/* Left Side: Playground & Results */}
        <Box
          flex="1"
          minW={0}
          width="100%"
          display="flex"
          flexDirection="column"
          gap={6}
        >
          {/* Side-by-Side Playground Composer */}
          <Grid
            templateColumns={{ base: "1fr", xl: "1fr 1fr" }}
            gap={5}
            width="100%"
          >
            {/* 1. Prompt Composer */}
            <Box
              bg={colors.cardBg}
              borderRadius="16px"
              border={`1px solid ${colors.border}`}
              boxShadow={cardShadow}
              display="flex"
              flexDirection="column"
              overflow="hidden"
              {...panelFsProps("question")}
            >
              {/* Header */}
              <Flex
                align="center"
                justify="space-between"
                px={4}
                py={3}
                borderBottom={`1px solid ${colors.border}`}
              >
                <Flex align="center" gap={2}>
                  <Sparkles size={15} color={c.sapphire} />
                  <Text
                    fontSize="13px"
                    fontWeight="bold"
                    color={colors.text}
                    letterSpacing="0.05em"
                  >
                    1. ASK A QUESTION
                  </Text>
                </Flex>
                {renderFsButton("question")}
              </Flex>

              {/* Textarea */}
              <Box p={3} flex="1" display="flex" flexDirection="column">
                <Box
                  style={fieldWrap("question")}
                  bg={colors.subBg}
                  border="none"
                  flex={fullscreen === "question" ? "1" : undefined}
                  display={fullscreen === "question" ? "flex" : undefined}
                >
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onFocus={() => setFocusedField("question")}
                    onBlur={() => setFocusedField(null)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter")
                        translate();
                    }}
                    placeholder="e.g. List the failed tests in the most recent run, sorted by app..."
                    rows={4}
                    style={{
                      ...bareTextArea,
                      minHeight: "90px",
                      ...(fullscreen === "question"
                        ? { flex: 1, height: "100%" }
                        : {}),
                    }}
                  />
                </Box>
              </Box>

              {/* Examples Categorized List */}
              <Box px={4} pb={4}>
                <Text
                  fontSize="10.5px"
                  fontWeight="bold"
                  color={colors.subtext}
                  mb={2.5}
                  letterSpacing="0.05em"
                >
                  QUICK TEMPLATES
                </Text>

                {/* Category selectors — hidden when there's only one category. */}
                {Object.keys(CATEGORIZED_EXAMPLES).length > 1 && (
                  <Flex gap={1.5} mb={2.5} overflowX="auto" pb={1}>
                    {(
                      Object.keys(CATEGORIZED_EXAMPLES) as Array<
                        keyof typeof CATEGORIZED_EXAMPLES
                      >
                    ).map((cat) => (
                      <Box
                        key={cat}
                        as="button"
                        px={2.5}
                        py={1}
                        borderRadius="6px"
                        fontSize="10px"
                        fontWeight="700"
                        bg={
                          selectedExampleCategory === cat
                            ? catppuccinAlpha(c.sapphire, 0.15)
                            : "transparent"
                        }
                        color={
                          selectedExampleCategory === cat
                            ? c.sapphire
                            : colors.subtext
                        }
                        border={`1px solid ${selectedExampleCategory === cat ? catppuccinAlpha(c.sapphire, 0.3) : colors.border}`}
                        onClick={() => setSelectedExampleCategory(cat)}
                        _hover={{ bg: colors.rowHover, color: colors.text }}
                        whiteSpace="nowrap"
                        transition="all 0.15s ease"
                      >
                        {cat}
                      </Box>
                    ))}
                  </Flex>
                )}

                {/* Templates */}
                <Flex direction="column" gap={1.5}>
                  {CATEGORIZED_EXAMPLES[selectedExampleCategory].map((ex) => (
                    <Flex
                      key={ex.label}
                      as="button"
                      align="center"
                      gap={2}
                      p={2}
                      borderRadius="8px"
                      border={`1px solid ${colors.border}`}
                      bg={colors.subBg}
                      fontSize="11.5px"
                      color={colors.subtext}
                      textAlign="left"
                      _hover={{
                        bg: colors.rowHover,
                        color: colors.text,
                        borderColor: c.sapphire,
                      }}
                      onClick={() => useExample(ex)}
                      transition="all 0.12s ease"
                      title={
                        ex.sql
                          ? "Insert ready-to-run SQL (no AI)"
                          : "Generate SQL with AI"
                      }
                    >
                      {ex.sql && (
                        <Box
                          color={c.green}
                          flexShrink={0}
                          title="Instant — no AI"
                        >
                          <Zap size={12} fill="currentColor" />
                        </Box>
                      )}
                      <Text as="span" flex="1">
                        {ex.label}
                      </Text>
                    </Flex>
                  ))}
                </Flex>
              </Box>

              {/* Bottom Composer Bar */}
              <Flex
                align="center"
                justify="space-between"
                px={4}
                py={3}
                borderTop={`1px solid ${colors.border}`}
                bg={colors.subBg}
              >
                <Flex
                  align="center"
                  gap={1.5}
                  color={colors.subtext}
                  fontSize="11px"
                >
                  <CornerDownLeft size={12} />
                  <Text>
                    <Text as="span" fontWeight="600">
                      ⌘ + Enter
                    </Text>{" "}
                    to generate
                  </Text>
                </Flex>
                <Button
                  h="36px"
                  px={4.5}
                  fontSize="12.5px"
                  fontWeight="600"
                  variant="outline"
                  borderColor={c.mauve}
                  color={c.mauve}
                  bg="transparent"
                  borderRadius="8px"
                  transition="all 0.18s ease"
                  _hover={{
                    bg: c.mauve,
                    color: isDark ? c.crust : "#ffffff",
                    transform: "translateY(-1.5px) scale(1.02)",
                    boxShadow: `0 0 16px ${catppuccinAlpha(c.mauve, 0.4)}`,
                  }}
                  _active={{ transform: "translateY(0) scale(0.98)" }}
                  _disabled={{
                    opacity: 0.4,
                    cursor: "not-allowed",
                    transform: "none",
                    boxShadow: "none",
                    bg: "transparent",
                    borderColor: colors.border,
                    color: colors.subtext,
                  }}
                  disabled={translating || !question.trim()}
                  onClick={() => translate()}
                >
                  {translating && <Spinner size="xs" mr={2} />}
                  {translating ? "Translating…" : "Generate SQL"}
                </Button>
              </Flex>
            </Box>

            {/* 2. SQL Editor Chrome */}
            <Box
              bg={colors.cardBg}
              borderRadius="16px"
              border={`1px solid ${focusedField === "sql" ? c.sapphire : colors.border}`}
              boxShadow={
                focusedField === "sql"
                  ? `0 0 0 3px ${catppuccinAlpha(c.sapphire, 0.18)}`
                  : cardShadow
              }
              display="flex"
              flexDirection="column"
              overflow="hidden"
              transition="all 0.18s ease"
              {...panelFsProps("sql")}
            >
              {/* Toolbar Header */}
              <Flex
                align="center"
                justify="space-between"
                px={4}
                py={3}
                bg={editorHeaderBg}
                borderBottom={`1px solid ${colors.border}`}
              >
                <Flex align="center" gap={3} minW={0}>
                  <Flex gap={1.5} align="center">
                    <Box w="10px" h="10px" borderRadius="full" bg="#ed8796" />
                    <Box w="10px" h="10px" borderRadius="full" bg="#eed49f" />
                    <Box w="10px" h="10px" borderRadius="full" bg="#a6da95" />
                  </Flex>
                  <Flex align="center" gap={1.5} ml={2} minW={0}>
                    <Code2 size={14} color={colors.subtext} />
                    <Text
                      fontSize="12.5px"
                      fontWeight="bold"
                      color={editorText}
                      whiteSpace="nowrap"
                    >
                      SQL EDITOR
                    </Text>
                  </Flex>
                </Flex>

                <Flex align="center" gap={1}>
                  <Button
                    size="xs"
                    h="28px"
                    variant="ghost"
                    color={colors.subtext}
                    borderRadius="6px"
                    _hover={{ bg: colors.rowHover, color: editorText }}
                    disabled={!sql.trim()}
                    onClick={copySql}
                  >
                    {copied ? (
                      <Check size={13} style={{ marginRight: 5 }} />
                    ) : (
                      <Copy size={13} style={{ marginRight: 5 }} />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  {renderFsButton("sql")}
                </Flex>
              </Flex>

              {/* Code Editor Body with scrollable gutter & textarea synced */}
              <Flex
                flex="1"
                bg={editorBg}
                position="relative"
                height={fullscreen === "sql" ? "auto" : "230px"}
                minHeight={fullscreen === "sql" ? "0" : "230px"}
              >
                {/* Gutter numbers */}
                <Box
                  ref={gutterRef}
                  width="40px"
                  bg={isDark ? "#181825" : "#f1f5f9"}
                  color={colors.subtext}
                  fontFamily={editorFontFamily}
                  fontSize={editorFontSize}
                  lineHeight={editorLineHeight}
                  textAlign="right"
                  pr="10px"
                  pl="6px"
                  py="14px"
                  borderRight={`1px solid ${colors.border}`}
                  overflow="hidden"
                  userSelect="none"
                  height="100%"
                >
                  {lineNumbers.map((num) => (
                    <Box key={num} height={editorLineHeight}>
                      {num}
                    </Box>
                  ))}
                </Box>

                {/* Editor Container (combines textarea + highlight pre overlay) */}
                <Box
                  flex="1"
                  position="relative"
                  height="100%"
                  overflow="hidden"
                >
                  {/* Highlight overlay */}
                  <pre
                    ref={highlightRef}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: "100%",
                      height: "100%",
                      margin: 0,
                      paddingTop: "14px",
                      paddingBottom: "14px",
                      paddingLeft: "12px",
                      paddingRight: "12px",
                      fontFamily: editorFontFamily,
                      fontSize: editorFontSize,
                      lineHeight: editorLineHeight,
                      background: "transparent",
                      color: editorText,
                      pointerEvents: "none",
                      overflow: "hidden",
                      userSelect: "none",
                      whiteSpace: "pre",
                      border: "none",
                      boxSizing: "border-box",
                      textAlign: "left",
                    }}
                  >
                    {highlightSQL(sql, isDark)}
                  </pre>

                  {/* Native Textarea overlay */}
                  <textarea
                    ref={textareaRef}
                    value={sql}
                    onChange={(e) => setSql(e.target.value)}
                    onScroll={handleScroll}
                    onFocus={() => setFocusedField("sql")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="-- Generated SQL query appears here. You can manually edit it before running."
                    spellCheck={false}
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: "100%",
                      height: "100%",
                      margin: 0,
                      paddingTop: "14px",
                      paddingBottom: "14px",
                      paddingLeft: "12px",
                      paddingRight: "12px",
                      fontFamily: editorFontFamily,
                      fontSize: editorFontSize,
                      lineHeight: editorLineHeight,
                      background: "transparent",
                      color: textareaColor, // transparent when editing, placeholder color when empty
                      caretColor: editorText, // Show cursor caret
                      resize: "none",
                      outline: "none",
                      border: "none",
                      overflowY: "auto",
                      overflowX: "auto",
                      whiteSpace: "pre",
                      boxSizing: "border-box",
                    }}
                  />
                </Box>
              </Flex>

              {/* Editor bottom bar with Run CTA */}
              <Flex
                align="center"
                justify="flex-end"
                px={4}
                py={3}
                borderTop={`1px solid ${colors.border}`}
                bg={colors.subBg}
              >
                <Button
                  h="36px"
                  px={5}
                  fontSize="12.5px"
                  fontWeight="700"
                  variant="outline"
                  borderColor={c.green}
                  color={c.green}
                  bg="transparent"
                  borderRadius="8px"
                  transition="all 0.18s ease"
                  _hover={{
                    bg: c.green,
                    color: isDark ? c.crust : "#ffffff",
                    transform: "translateY(-1.5px) scale(1.02)",
                    boxShadow: `0 0 16px ${catppuccinAlpha(c.green, 0.4)}`,
                  }}
                  _active={{ transform: "translateY(0) scale(0.98)" }}
                  _disabled={{
                    opacity: 0.4,
                    cursor: "not-allowed",
                    transform: "none",
                    boxShadow: "none",
                    bg: "transparent",
                    borderColor: colors.border,
                    color: colors.subtext,
                  }}
                  disabled={running || !sql.trim()}
                  onClick={runQuery}
                >
                  {running ? (
                    <Spinner size="xs" mr={2} />
                  ) : (
                    <Play
                      size={13}
                      fill="currentColor"
                      style={{ marginRight: 6 }}
                    />
                  )}
                  {running ? "Executing…" : "Run Query"}
                </Button>
              </Flex>
            </Box>
          </Grid>

          {/* Errors section */}
          {error && (
            <Flex
              gap={3}
              align="flex-start"
              p={4}
              borderRadius="12px"
              bg={isDark ? "rgba(231,130,132,0.08)" : "rgba(210,15,57,0.05)"}
              border={`1px solid ${catppuccinAlpha(c.red, 0.4)}`}
              boxShadow={cardShadow}
            >
              <Box pt="2px">
                <AlertCircle size={16} color={c.red} />
              </Box>
              <Box flex="1">
                <Text fontSize="13px" fontWeight="bold" color={c.red} mb={1}>
                  Execution Error
                </Text>
                <Text
                  fontSize="12.5px"
                  color={c.red}
                  fontFamily="mono"
                  wordBreak="break-word"
                  whiteSpace="pre-wrap"
                >
                  {error}
                </Text>
              </Box>
            </Flex>
          )}

          {/* Results Grid Container */}
          {result && (
            <Box
              bg={colors.cardBg}
              borderRadius="16px"
              border={`1px solid ${colors.border}`}
              boxShadow={cardShadow}
              p={4}
              display="flex"
              flexDirection="column"
              gap={4}
              overflow={fullscreen === "results" ? "hidden" : undefined}
              {...panelFsProps("results")}
            >
              {/* Header toolbar */}
              <Flex
                align="center"
                justify="space-between"
                wrap="wrap"
                gap={3}
                borderBottom={`1px solid ${colors.border}`}
                pb={3.5}
              >
                <Flex align="center" gap={2.5}>
                  <Text
                    fontSize="13px"
                    fontWeight="bold"
                    color={colors.text}
                    letterSpacing="0.05em"
                  >
                    QUERY RESULTS
                  </Text>

                  {/* Rows Count badge */}
                  <Badge
                    colorPalette="cyan"
                    variant="solid"
                    borderRadius="full"
                    px={2}
                    py={0.5}
                    fontSize="10px"
                  >
                    {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
                  </Badge>

                  {/* Execution speed badge */}
                  {execTime !== null && (
                    <Badge
                      colorPalette="gray"
                      variant="solid"
                      borderRadius="full"
                      px={2}
                      py={0.5}
                      fontSize="10px"
                    >
                      {execTime} ms
                    </Badge>
                  )}

                  {/* Truncated flag */}
                  {result.truncated && (
                    <Badge
                      colorPalette="orange"
                      variant="solid"
                      borderRadius="full"
                      px={2}
                      py={0.5}
                      fontSize="10px"
                    >
                      Capped at 500
                    </Badge>
                  )}
                </Flex>

                {/* Export / Copy Panel */}
                <Flex gap={2}>
                  <Button
                    size="xs"
                    h="28px"
                    variant="outline"
                    borderColor={colors.border}
                    color={colors.subtext}
                    borderRadius="6px"
                    onClick={copyAsCsv}
                    _hover={{ bg: colors.rowHover, color: colors.text }}
                  >
                    {copiedCsv ? (
                      <Check size={12} style={{ marginRight: 4 }} />
                    ) : (
                      <Copy size={12} style={{ marginRight: 4 }} />
                    )}
                    {copiedCsv ? "CSV Copied" : "Copy CSV"}
                  </Button>
                  <Button
                    size="xs"
                    h="28px"
                    variant="outline"
                    borderColor={colors.border}
                    color={colors.subtext}
                    borderRadius="6px"
                    onClick={copyAsJson}
                    _hover={{ bg: colors.rowHover, color: colors.text }}
                  >
                    {copiedJson ? (
                      <Check size={12} style={{ marginRight: 4 }} />
                    ) : (
                      <Copy size={12} style={{ marginRight: 4 }} />
                    )}
                    {copiedJson ? "JSON Copied" : "Copy JSON"}
                  </Button>
                  <Button
                    size="xs"
                    h="28px"
                    variant="outline"
                    borderColor={colors.border}
                    color={colors.subtext}
                    borderRadius="6px"
                    onClick={downloadCsv}
                    _hover={{ bg: colors.rowHover, color: colors.text }}
                  >
                    <Download size={12} style={{ marginRight: 4 }} />
                    Download CSV
                  </Button>
                  {renderFsButton("results")}
                </Flex>
              </Flex>

              {/* Real-time search filter */}
              <Flex align="center" position="relative" w="100%">
                <Box position="absolute" left="3.5" color={colors.subtext}>
                  <Search size={14} />
                </Box>
                <input
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filter rows by text..."
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 36px",
                    fontSize: "13px",
                    borderRadius: "8px",
                    border: `1px solid ${colors.border}`,
                    background: colors.subBg,
                    color: colors.text,
                    outline: "none",
                    transition: "border-color 0.15s ease",
                  }}
                />
                {filterText && (
                  <Box
                    as="button"
                    position="absolute"
                    right="3.5"
                    color={colors.subtext}
                    onClick={() => setFilterText("")}
                    _hover={{ color: colors.text }}
                  >
                    <X size={14} />
                  </Box>
                )}
              </Flex>

              {/* Filter statistics */}
              {filterText.trim() && (
                <Text fontSize="11px" color={colors.subtext}>
                  Showing {filteredRows.length} of {result.rowCount} rows
                  matching &quot;{filterText}&quot;
                </Text>
              )}

              {/* Table Data */}
              {filteredRows.length === 0 ? (
                <Flex
                  direction="column"
                  align="center"
                  gap={2}
                  py={10}
                  borderRadius="12px"
                  border={`1px dashed ${colors.border}`}
                  bg={colors.subBg}
                  color={colors.subtext}
                >
                  <Database size={22} />
                  <Text fontSize="13px">No rows matched filter criteria.</Text>
                </Flex>
              ) : (
                <Box
                  border={`1px solid ${colors.border}`}
                  borderRadius="12px"
                  overflow="hidden"
                  boxShadow={cardShadow}
                  bg={colors.cardBg}
                  flex={fullscreen === "results" ? "1" : undefined}
                  minH={fullscreen === "results" ? "0" : undefined}
                  display={fullscreen === "results" ? "flex" : undefined}
                  flexDirection="column"
                >
                  <Box
                    overflowX="auto"
                    maxH={fullscreen === "results" ? "unset" : "450px"}
                    flex={fullscreen === "results" ? "1" : undefined}
                    minH={fullscreen === "results" ? "0" : undefined}
                    overflowY="auto"
                  >
                    <Table.Root
                      size="sm"
                      variant="outline"
                      border="none"
                      style={{ borderCollapse: "separate", borderSpacing: 0 }}
                    >
                      <Table.Header position="sticky" top={0} zIndex={1}>
                        <Table.Row>
                          <Table.ColumnHeader
                            color={colors.subtext}
                            fontSize="10px"
                            fontWeight="700"
                            letterSpacing="0.08em"
                            textTransform="uppercase"
                            textAlign="right"
                            width="48px"
                            py={3}
                            px={3}
                            bg={editorHeaderBg}
                            borderBottom={`1px solid ${colors.border}`}
                            position="sticky"
                            left={0}
                            zIndex={2}
                          >
                            #
                          </Table.ColumnHeader>
                          {result.columns.map((col) => (
                            <Table.ColumnHeader
                              key={col}
                              color={colors.subtext}
                              fontSize="10px"
                              fontWeight="700"
                              letterSpacing="0.08em"
                              textTransform="uppercase"
                              whiteSpace="nowrap"
                              py={3}
                              bg={editorHeaderBg}
                              borderBottom={`1px solid ${colors.border}`}
                            >
                              {col}
                            </Table.ColumnHeader>
                          ))}
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {filteredRows.map((row, i) => {
                          const zebra = i % 2 === 1;
                          const gutterBg = isDark ? "#2a2c3d" : "#eef1f6";
                          return (
                            <Table.Row
                              key={i}
                              bg={
                                zebra
                                  ? isDark
                                    ? "whiteAlpha.50"
                                    : "blackAlpha.50"
                                  : "transparent"
                              }
                              _hover={{ bg: colors.rowHover }}
                              transition="background 0.12s ease"
                            >
                              <Table.Cell
                                color={colors.subtext}
                                fontFamily="mono"
                                fontSize="11px"
                                textAlign="right"
                                py={2.5}
                                px={3}
                                borderColor={colors.border}
                                position="sticky"
                                left={0}
                                bg={gutterBg}
                                borderRight={`1px solid ${colors.border}`}
                              >
                                {i + 1}
                              </Table.Cell>
                              {result.columns.map((col) => {
                                const raw = row[col];
                                const text = formatCell(raw);
                                const isNullVal =
                                  raw === null || raw === undefined;
                                // Long / multi-line text (e.g. plan markdown) or
                                // JSON objects are unreadable when truncated to one
                                // line — offer a "View" button that opens the full
                                // value in the viewer modal.
                                const isObject =
                                  typeof raw === "object" && raw !== null;
                                const isLongText =
                                  (typeof raw === "string" &&
                                    (raw.includes("\n") || raw.length > 120)) ||
                                  isObject;
                                const viewerValue = isObject
                                  ? JSON.stringify(raw, null, 2)
                                  : (raw as string);
                                return (
                                  <Table.Cell
                                    key={col}
                                    color={
                                      isNullVal ? colors.subtext : colors.text
                                    }
                                    fontStyle={isNullVal ? "italic" : "normal"}
                                    fontFamily="mono"
                                    fontSize="12px"
                                    py={2.5}
                                    px={3}
                                    maxW="360px"
                                    overflow="hidden"
                                    textOverflow="ellipsis"
                                    whiteSpace="nowrap"
                                    borderColor={colors.border}
                                    title={text}
                                  >
                                    {isLongText ? (
                                      <Flex align="center" gap={2} minW={0}>
                                        <Box
                                          flex="1"
                                          overflow="hidden"
                                          textOverflow="ellipsis"
                                          whiteSpace="nowrap"
                                        >
                                          {text}
                                        </Box>
                                        <Button
                                          size="xs"
                                          h="22px"
                                          px={2}
                                          flexShrink={0}
                                          variant="outline"
                                          borderColor={colors.border}
                                          color={c.sapphire}
                                          borderRadius="6px"
                                          fontSize="10px"
                                          fontWeight="700"
                                          _hover={{
                                            bg: catppuccinAlpha(
                                              c.sapphire,
                                              0.12,
                                            ),
                                            borderColor: c.sapphire,
                                          }}
                                          onClick={() =>
                                            setViewerCell({
                                              column: col,
                                              value: viewerValue,
                                            })
                                          }
                                        >
                                          <Eye
                                            size={11}
                                            style={{ marginRight: 4 }}
                                          />
                                          View
                                        </Button>
                                      </Flex>
                                    ) : (
                                      text
                                    )}
                                  </Table.Cell>
                                );
                              })}
                            </Table.Row>
                          );
                        })}
                      </Table.Body>
                    </Table.Root>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </Box>

        {/* Right Collapsible Sidebar (History & Schema Guide) */}
        {sidebarOpen && (
          <Box
            width={{ base: "100%", xl: "340px" }}
            flexShrink={0}
            border={`1px solid ${colors.border}`}
            borderRadius="16px"
            bg={colors.cardBg}
            p={4}
            boxShadow={cardShadow}
            display="flex"
            flexDirection="column"
            maxH={{ base: "auto", xl: "780px" }}
            alignSelf="stretch"
          >
            {/* Tab selector */}
            <Flex borderBottom={`1px solid ${colors.border}`} mb={4}>
              <Box
                as="button"
                flex="1"
                py={2.5}
                textAlign="center"
                fontSize="12px"
                fontWeight="bold"
                color={sidebarTab === "history" ? c.sapphire : colors.subtext}
                borderBottom={
                  sidebarTab === "history" ? `2px solid ${c.sapphire}` : "none"
                }
                onClick={() => setSidebarTab("history")}
                _hover={{ color: colors.text }}
                transition="all 0.15s ease"
              >
                <Flex align="center" justify="center" gap={1.5}>
                  <History size={13} />
                  History ({history.length})
                </Flex>
              </Box>
              <Box
                as="button"
                flex="1"
                py={2.5}
                textAlign="center"
                fontSize="12px"
                fontWeight="bold"
                color={sidebarTab === "schema" ? c.sapphire : colors.subtext}
                borderBottom={
                  sidebarTab === "schema" ? `2px solid ${c.sapphire}` : "none"
                }
                onClick={() => setSidebarTab("schema")}
                _hover={{ color: colors.text }}
                transition="all 0.15s ease"
              >
                <Flex align="center" justify="center" gap={1.5}>
                  <BookOpen size={13} />
                  Schema Guide
                </Flex>
              </Box>
            </Flex>

            {/* Sidebar content panels */}

            {/* Tab 1: History Panel */}
            {sidebarTab === "history" && (
              <Flex direction="column" gap={3} flex="1" overflow="hidden">
                <Flex gap={2}>
                  <Flex align="center" position="relative" flex="1">
                    <Box position="absolute" left="2.5" color={colors.subtext}>
                      <Search size={12} />
                    </Box>
                    <input
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      placeholder="Search runs..."
                      style={{
                        width: "100%",
                        padding: "6px 8px 6px 28px",
                        fontSize: "12px",
                        borderRadius: "6px",
                        border: `1px solid ${colors.border}`,
                        background: colors.subBg,
                        color: colors.text,
                        outline: "none",
                      }}
                    />
                  </Flex>
                  {history.length > 0 && (
                    <Button
                      size="xs"
                      variant="outline"
                      borderColor={colors.border}
                      color={colors.subtext}
                      _hover={{ color: c.red, bg: colors.rowHover }}
                      onClick={() => persistHistory([])}
                    >
                      <Trash2 size={12} style={{ marginRight: 4 }} />
                      Clear
                    </Button>
                  )}
                </Flex>

                <Box flex="1" overflowY="auto" maxH="580px" pr={1}>
                  {filteredHistory.length === 0 ? (
                    <Text
                      fontSize="12px"
                      color={colors.subtext}
                      py={8}
                      textAlign="center"
                    >
                      {history.length === 0
                        ? "No logged queries."
                        : "No matching items."}
                    </Text>
                  ) : (
                    <Flex direction="column" gap={2}>
                      {filteredHistory.map((h) => (
                        <Box
                          key={h.id}
                          position="relative"
                          p={2.5}
                          borderRadius="8px"
                          border={`1px solid ${colors.border}`}
                          bg={colors.subBg}
                          transition="all 0.15s ease"
                          _hover={{
                            borderColor: c.sapphire,
                            bg: colors.rowHover,
                          }}
                        >
                          <Box
                            as="button"
                            textAlign="left"
                            width="calc(100% - 24px)"
                            onClick={() => loadFromHistory(h)}
                          >
                            <Text
                              fontSize="12px"
                              fontWeight="600"
                              color={colors.text}
                              overflow="hidden"
                              textOverflow="ellipsis"
                              whiteSpace="nowrap"
                            >
                              {h.question || "Manual Query"}
                            </Text>
                            <Text
                              fontSize="10px"
                              fontFamily="mono"
                              color={colors.subtext}
                              mt={0.5}
                              overflow="hidden"
                              textOverflow="ellipsis"
                              whiteSpace="nowrap"
                            >
                              {h.sql}
                            </Text>
                            <Text fontSize="9px" color={colors.subtext} mt={1}>
                              {new Date(h.ranAt).toLocaleTimeString("en-IN", {
                                timeZone: "Asia/Kolkata",
                              })}{" "}
                              · {h.rowCount} row{h.rowCount === 1 ? "" : "s"}
                            </Text>
                          </Box>

                          {/* Individual delete */}
                          <Box position="absolute" top="2" right="2">
                            <Button
                              size="xs"
                              h="20px"
                              w="20px"
                              minW="20px"
                              p={0}
                              variant="ghost"
                              color={colors.subtext}
                              _hover={{
                                color: c.red,
                                bg: "rgba(231,130,132,0.15)",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteHistoryItem(h.id);
                              }}
                            >
                              <X size={12} />
                            </Button>
                          </Box>
                        </Box>
                      ))}
                    </Flex>
                  )}
                </Box>
              </Flex>
            )}

            {/* Tab 2: Schema Guide Panel */}
            {sidebarTab === "schema" && (
              <Flex direction="column" gap={3} flex="1" overflow="hidden">
                <Flex align="center" position="relative">
                  <Box position="absolute" left="2.5" color={colors.subtext}>
                    <Search size={12} />
                  </Box>
                  <input
                    value={schemaSearch}
                    onChange={(e) => setSchemaSearch(e.target.value)}
                    placeholder="Search tables or columns..."
                    style={{
                      width: "100%",
                      padding: "6px 8px 6px 28px",
                      fontSize: "12px",
                      borderRadius: "6px",
                      border: `1px solid ${colors.border}`,
                      background: colors.subBg,
                      color: colors.text,
                      outline: "none",
                    }}
                  />
                </Flex>

                <Box flex="1" overflowY="auto" maxH="580px" pr={1}>
                  {filteredTables.length === 0 ? (
                    <Text
                      fontSize="12px"
                      color={colors.subtext}
                      py={8}
                      textAlign="center"
                    >
                      No tables match your search.
                    </Text>
                  ) : (
                    <Flex direction="column" gap={2}>
                      {filteredTables.map((table) => {
                        const isExpanded = !!expandedTables[table.name];
                        return (
                          <Box
                            key={table.name}
                            borderRadius="8px"
                            border={`1px solid ${isExpanded ? c.sapphire : colors.border}`}
                            bg={colors.subBg}
                            overflow="hidden"
                          >
                            {/* Table Label (toggle expand) */}
                            <Flex
                              as="button"
                              align="center"
                              justify="space-between"
                              w="100%"
                              px={3}
                              py={2}
                              bg={
                                isExpanded
                                  ? catppuccinAlpha(c.sapphire, 0.05)
                                  : "transparent"
                              }
                              onClick={() => toggleTableExpanded(table.name)}
                              _hover={{ bg: colors.rowHover }}
                            >
                              <Flex align="center" gap={1.5} minW={0}>
                                <Code2
                                  size={13}
                                  color={
                                    isExpanded ? c.sapphire : colors.subtext
                                  }
                                />
                                <Text
                                  fontSize="12px"
                                  fontWeight="bold"
                                  fontFamily="mono"
                                  color={isExpanded ? c.sapphire : colors.text}
                                  overflow="hidden"
                                  textOverflow="ellipsis"
                                  whiteSpace="nowrap"
                                  _hover={{ textDecoration: "underline" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    insertTextAtCursor(table.name);
                                  }}
                                  title="Click to insert table name"
                                >
                                  {table.name}
                                </Text>
                              </Flex>
                              <ChevronDown
                                size={14}
                                color={colors.subtext}
                                style={{
                                  transform: isExpanded
                                    ? "rotate(180deg)"
                                    : "rotate(0deg)",
                                  transition: "transform 0.2s ease",
                                }}
                              />
                            </Flex>

                            {/* Table Info Drawer */}
                            {isExpanded && (
                              <Box
                                p={3}
                                borderTop={`1px solid ${colors.border}`}
                                bg={colors.cardBg}
                              >
                                <Text
                                  fontSize="11px"
                                  color={colors.subtext}
                                  mb={3.5}
                                  fontStyle="italic"
                                >
                                  {table.description}
                                </Text>
                                <Flex direction="column" gap={2}>
                                  {table.columns.map((col) => (
                                    <Box
                                      key={col.name}
                                      borderBottom={`1px solid ${isDark ? "#2d3149" : "#e2e8f0"}`}
                                      pb={2}
                                      mb={1}
                                    >
                                      <Flex
                                        align="center"
                                        justify="space-between"
                                        wrap="wrap"
                                        gap={1}
                                      >
                                        <Text
                                          fontSize="11.5px"
                                          fontWeight="600"
                                          fontFamily="mono"
                                          color={colors.text}
                                          cursor="pointer"
                                          _hover={{
                                            color: c.sapphire,
                                            textDecoration: "underline",
                                          }}
                                          onClick={() =>
                                            insertTextAtCursor(col.name)
                                          }
                                          title="Click to insert column name"
                                        >
                                          {col.name}
                                        </Text>
                                        <Badge
                                          fontSize="8px"
                                          colorPalette="gray"
                                          variant="solid"
                                        >
                                          {col.type}
                                        </Badge>
                                      </Flex>
                                      <Text
                                        fontSize="10px"
                                        color={colors.subtext}
                                        mt={1}
                                      >
                                        {col.desc}
                                      </Text>
                                    </Box>
                                  ))}
                                </Flex>
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                    </Flex>
                  )}
                </Box>
              </Flex>
            )}
          </Box>
        )}
      </Flex>

      {/* Cell viewer modal — renders long/markdown values (e.g. plan_markdown)
          either as formatted markdown or as raw monospace text. */}
      {viewerCell && (
        <>
          <Box
            position="fixed"
            inset="0"
            zIndex={1499}
            bg="blackAlpha.600"
            backdropFilter="blur(2px)"
            onClick={() => setViewerCell(null)}
          />
          <Flex
            position="fixed"
            inset={{ base: "12px", md: "48px" }}
            zIndex={1500}
            direction="column"
            bg={colors.cardBg}
            borderRadius="16px"
            border={`1px solid ${colors.border}`}
            boxShadow="0 24px 60px rgba(0,0,0,0.45)"
            overflow="hidden"
          >
            {/* Header */}
            <Flex
              align="center"
              justify="space-between"
              px={5}
              py={3.5}
              borderBottom={`1px solid ${colors.border}`}
              bg={colors.subBg}
              gap={3}
            >
              <Flex align="center" gap={2.5} minW={0}>
                <FileText size={16} color={c.sapphire} />
                <Text
                  fontSize="13px"
                  fontWeight="bold"
                  color={colors.text}
                  fontFamily="mono"
                  overflow="hidden"
                  textOverflow="ellipsis"
                  whiteSpace="nowrap"
                >
                  {viewerCell.column}
                </Text>
              </Flex>

              <Flex align="center" gap={2}>
                {/* Rendered / Raw toggle — only for markdown/text; code is always
                    shown in the raw code view. */}
                {viewerCanRender && (
                  <Flex
                    bg={colors.subBg}
                    border={`1px solid ${colors.border}`}
                    borderRadius="8px"
                    p="2px"
                    gap="2px"
                  >
                    {(["rendered", "raw"] as const).map((mode) => (
                      <Box
                        key={mode}
                        as="button"
                        px={2.5}
                        py={1}
                        borderRadius="6px"
                        fontSize="11px"
                        fontWeight="700"
                        textTransform="capitalize"
                        bg={
                          viewerMode === mode
                            ? catppuccinAlpha(c.sapphire, 0.15)
                            : "transparent"
                        }
                        color={
                          viewerMode === mode ? c.sapphire : colors.subtext
                        }
                        onClick={() => setViewerMode(mode)}
                        _hover={{ color: colors.text }}
                        transition="all 0.15s ease"
                      >
                        {mode}
                      </Box>
                    ))}
                  </Flex>
                )}

                <Button
                  size="xs"
                  h="28px"
                  variant="outline"
                  borderColor={colors.border}
                  color={colors.subtext}
                  borderRadius="6px"
                  onClick={copyViewer}
                  _hover={{ bg: colors.rowHover, color: colors.text }}
                >
                  {viewerCopied ? (
                    <Check size={12} style={{ marginRight: 4 }} />
                  ) : (
                    <Copy size={12} style={{ marginRight: 4 }} />
                  )}
                  {viewerCopied ? "Copied" : "Copy"}
                </Button>

                <Button
                  size="xs"
                  h="28px"
                  w="28px"
                  minW="28px"
                  p={0}
                  variant="ghost"
                  color={colors.subtext}
                  borderRadius="6px"
                  onClick={() => setViewerCell(null)}
                  _hover={{ bg: colors.rowHover, color: colors.text }}
                  title="Close (Esc)"
                  aria-label="Close"
                >
                  <X size={15} />
                </Button>
              </Flex>
            </Flex>

            {/* Body */}
            <Box flex="1" overflowY="auto" px={6} py={5} bg={colors.cardBg}>
              {viewerCanRender && viewerMode === "rendered" ? (
                <MarkdownRenderer content={viewerCell.value} />
              ) : (
                <CodeBlock content={viewerCell.value} />
              )}
            </Box>
          </Flex>
        </>
      )}
    </Box>
  );
}
