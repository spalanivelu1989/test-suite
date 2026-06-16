"use client";

import { Box, Button, Flex, Spinner, Table, Text, Badge, Grid } from "@chakra-ui/react";
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
} from "lucide-react";
import { useEffect, useState, useRef, useMemo } from "react";
import { useThemeMode } from "@/app/providers";
import { getAWSColors } from "@/app/theme/aws";
import { catppuccinAlpha, getCatppuccinColors } from "@/app/theme/catppuccin";

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

const CATEGORIZED_EXAMPLES = {
  "Runs & Status": [
    "Show the 10 most recent test runs with their status",
    "List the tests that passed in the most recent run",
    "Get the prior plan for the target URL https://www.tarento.com/",
  ],
  "App Coverage": [
    "Which apps have the most saved tests?",
    "How many specs were reused vs newly generated per app?",
  ],
};

const SCHEMA_TABLES = [
  {
    name: "apps",
    description: "App origins monitored by the test suite.",
    columns: [
      { name: "app_id", type: "TEXT PRIMARY KEY", desc: "Normalized origin (e.g. https://example.com)" },
      { name: "first_seen", type: "TIMESTAMPTZ", desc: "First recorded run time" },
      { name: "last_seen", type: "TIMESTAMPTZ", desc: "Latest recorded run time" },
      { name: "run_count", type: "INTEGER", desc: "Total runs completed" },
    ],
  },
  {
    name: "runs",
    description: "Test suite execution runs.",
    columns: [
      { name: "run_id", type: "TEXT PRIMARY KEY", desc: "Unique identifier for the execution run" },
      { name: "app_id", type: "TEXT -> apps(app_id)", desc: "Normalized app origin" },
      { name: "url", type: "TEXT", desc: "The exact URL that was targeted in the test" },
      { name: "status", type: "TEXT", desc: "completed | running | failed" },
      { name: "crawl_mode", type: "TEXT", desc: "Crawler setup / strategy" },
      { name: "created_at", type: "TIMESTAMPTZ", desc: "Run creation timestamp" },
    ],
  },
  {
    name: "specs",
    description: "Generated Playwright test files.",
    columns: [
      { name: "id", type: "BIGSERIAL PRIMARY KEY", desc: "Internal spec identifier" },
      { name: "run_id", type: "TEXT -> runs(run_id)", desc: "Associated run ID" },
      { name: "app_id", type: "TEXT", desc: "Associated app origin" },
      { name: "file", type: "TEXT", desc: "Playwright test file path" },
      { name: "title", type: "TEXT", desc: "Abstracted test case/flow title" },
      { name: "flow_id", type: "TEXT", desc: "Logical workspace workflow reference" },
      { name: "reused", type: "BOOLEAN", desc: "True if spec was copied forward from a prior run" },
      { name: "tokens", type: "TEXT[]", desc: "Keywords representing user intent" },
      { name: "pattern_text", type: "TEXT", desc: "Normalized, variable-stripped code skeleton" },
      { name: "created_at", type: "TIMESTAMPTZ", desc: "Timestamp of generation" },
    ],
  },
  {
    name: "test_results",
    description: "Outcome results per workflow flow/file in a run.",
    columns: [
      { name: "id", type: "BIGSERIAL PRIMARY KEY", desc: "Result entry identifier" },
      { name: "run_id", type: "TEXT -> runs(run_id)", desc: "Execution run reference" },
      { name: "app_id", type: "TEXT", desc: "Associated app origin" },
      { name: "flow_id", type: "TEXT", desc: "Target workflow flow identifier" },
      { name: "file", type: "TEXT", desc: "Run test filename" },
      { name: "outcome", type: "TEXT", desc: "passed | healed | failed" },
      { name: "failure_reason", type: "TEXT", desc: "Error messages in case of failure" },
      { name: "created_at", type: "TIMESTAMPTZ", desc: "Timestamp" },
    ],
  },
  {
    name: "coverage_snapshots",
    description: "Workflow coverage coverage percentage per run.",
    columns: [
      { name: "run_id", type: "TEXT PRIMARY KEY -> runs(run_id)", desc: "Associated execution run" },
      { name: "app_id", type: "TEXT", desc: "App origin reference" },
      { name: "curated_total", type: "INTEGER", desc: "Total planned flows" },
      { name: "tested_count", type: "INTEGER", desc: "Number of flows verified" },
      { name: "percent", type: "INTEGER", desc: "Coverage percentage (0..100)" },
      { name: "missing_flows", type: "TEXT[]", desc: "List of untested flow names" },
      { name: "created_at", type: "TIMESTAMPTZ", desc: "Creation timestamp" },
    ],
  },
  {
    name: "raw_reports",
    description: "Full JSON RunReport payloads containing test summaries and logs.",
    columns: [
      { name: "run_id", type: "TEXT PRIMARY KEY -> runs(run_id)", desc: "Execution run reference" },
      { name: "app_id", type: "TEXT", desc: "App origin reference" },
      { name: "report", type: "JSONB", desc: "Raw document JSON. report->>'planMarkdown' is the test plan" },
      { name: "created_at", type: "TIMESTAMPTZ", desc: "Timestamp" },
    ],
  },
  {
    name: "healing_events",
    description: "Self-healing logs capturing AI selector repairs.",
    columns: [
      { name: "id", type: "BIGSERIAL PRIMARY KEY", desc: "Healing case identifier" },
      { name: "run_id", type: "TEXT -> runs(run_id)", desc: "Execution run reference" },
      { name: "app_id", type: "TEXT", desc: "Associated app origin" },
      { name: "flow_id", type: "TEXT", desc: "Target workflow flow identifier" },
      { name: "file", type: "TEXT", desc: "Repaired test file name" },
      { name: "failure_signature", type: "TEXT", desc: "Abstracted exception fingerprint" },
      { name: "before_snippet", type: "TEXT", desc: "Failing locator code" },
      { name: "after_snippet", type: "TEXT", desc: "Repaired locator code" },
      { name: "strategy", type: "TEXT", desc: "Heuristic/AI strategy applied" },
      { name: "outcome", type: "TEXT", desc: "healed | fixme" },
      { name: "created_at", type: "TIMESTAMPTZ", desc: "Timestamp" },
    ],
  },
  {
    name: "playbooks",
    description: "Distilled testing rules and recommendations verified across runs.",
    columns: [
      { name: "id", type: "TEXT PRIMARY KEY", desc: "Unique principle ID" },
      { name: "scope_kind", type: "TEXT", desc: "app | global | componentType" },
      { name: "scope_key", type: "TEXT", desc: "Context descriptor for applicability" },
      { name: "principle", type: "TEXT", desc: "Abstracted rule details" },
      { name: "antipattern", type: "TEXT", desc: "Failing design pattern to avoid" },
      { name: "recommendation", type: "TEXT", desc: "Alternative solution" },
      { name: "support_count", type: "INTEGER", desc: "Verification frequency" },
      { name: "confidence", type: "REAL", desc: "Calculated reliability score" },
      { name: "status", type: "TEXT", desc: "episodic | trusted" },
      { name: "created_at", type: "TIMESTAMPTZ", desc: "Timestamp" },
    ],
  },
];

/** Render any cell value (null, JSON, array, scalar) as a readable string. */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function highlightSQL(code: string, isDark: boolean): React.ReactNode[] {
  if (!code) return [];

  const regex = /(--.*)|('[^']*')|(\b\d+\b)|(\b(?:SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP\s+BY|ORDER\s+BY|LIMIT|OFFSET|AND|OR|AS|WITH|INSERT|UPDATE|DELETE|CREATE|TABLE|IN|NOT|NULL|IS|TRUE|FALSE|HAVING|UNION|ALL|EXISTS|CASE|WHEN|THEN|ELSE|END|DESC|ASC|COUNT|SUM|AVG|MIN|MAX)\b)|([=<>!+\-*\/%]+)|(\S+)|(\s+)/gi;

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

    const [
      full,
      comment,
      string,
      number,
      keyword,
      operator,
      word,
      whitespace,
    ] = match;

    if (comment) {
      parts.push(
        <span key={key++} style={{ color: colors.comment, fontStyle: "italic" }}>
          {comment}
        </span>
      );
    } else if (string) {
      parts.push(
        <span key={key++} style={{ color: colors.string }}>
          {string}
        </span>
      );
    } else if (number) {
      parts.push(
        <span key={key++} style={{ color: colors.number }}>
          {number}
        </span>
      );
    } else if (keyword) {
      parts.push(
        <span key={key++} style={{ color: colors.keyword, fontWeight: "bold" }}>
          {keyword}
        </span>
      );
    } else if (operator) {
      parts.push(
        <span key={key++} style={{ color: colors.operator }}>
          {operator}
        </span>
      );
    } else if (word) {
      parts.push(<span key={key++}>{word}</span>);
    } else if (whitespace) {
      parts.push(whitespace);
    }
  }

  return parts;
}

function convertToCSV(columns: string[], rows: Record<string, unknown>[]): string {
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
  const [focusedField, setFocusedField] = useState<"question" | "sql" | null>(null);

  // Redesign additions
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"history" | "schema">("history");
  const [historySearch, setHistorySearch] = useState("");
  const [schemaSearch, setSchemaSearch] = useState("");
  const [filterText, setFilterText] = useState("");
  const [execTime, setExecTime] = useState<number | null>(null);
  const [copiedCsv, setCopiedCsv] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({ apps: true });
  const [selectedExampleCategory, setSelectedExampleCategory] = useState<keyof typeof CATEGORIZED_EXAMPLES>("Runs & Status");

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

  function useExample(q: string) {
    setQuestion(q);
    setResult(null);
    setError(null);
    setExecTime(null);
    translate(q);
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
      const nextVal = currentVal.substring(0, start) + text + currentVal.substring(end);
      setSql(nextVal);

      // Focus back and position cursor after inserted text
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + text.length;
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
  const textareaColor = sql ? "transparent" : (isDark ? "rgba(205, 214, 244, 0.4)" : "rgba(26, 38, 59, 0.4)");

  const editorFontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace";
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

  // Filters
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return history;
    const q = historySearch.toLowerCase();
    return history.filter(
      (h) =>
        h.question.toLowerCase().includes(q) ||
        h.sql.toLowerCase().includes(q),
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
    }).filter((t): t is typeof SCHEMA_TABLES[number] => t !== null);
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

  return (
    <Box width="100%" p={{ base: 4, md: 6 }}>
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
            <Database size={22} style={{ animation: "pulse-glow 2s infinite" }} />
          </Box>
          <Box>
            <Text fontSize="20px" fontWeight="bold" color={colors.text} letterSpacing="-0.3px">
              SQL Query Playground
            </Text>
            <Text fontSize="12.5px" color={colors.subtext}>
              Ask the knowledge layer a question in plain English. The AI drafts the SQL, and you execute it read-only.
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
      <Flex gap={6} align="flex-start" direction={{ base: "column", xl: "row" }} width="100%">
        {/* Left Side: Playground & Results */}
        <Box flex="1" minW={0} width="100%" display="flex" flexDirection="column" gap={6}>

          {/* Side-by-Side Playground Composer */}
          <Grid templateColumns={{ base: "1fr", xl: "1fr 1fr" }} gap={5} width="100%">

            {/* 1. Prompt Composer */}
            <Box
              bg={colors.cardBg}
              borderRadius="16px"
              border={`1px solid ${colors.border}`}
              boxShadow={cardShadow}
              display="flex"
              flexDirection="column"
              overflow="hidden"
            >
              {/* Header */}
              <Flex align="center" justify="space-between" px={4} py={3} borderBottom={`1px solid ${colors.border}`}>
                <Flex align="center" gap={2}>
                  <Sparkles size={15} color={c.sapphire} />
                  <Text fontSize="13px" fontWeight="bold" color={colors.text} letterSpacing="0.05em">
                    1. ASK A QUESTION
                  </Text>
                </Flex>
              </Flex>

              {/* Textarea */}
              <Box p={3} flex="1">
                <Box style={fieldWrap("question")} bg={colors.subBg} border="none">
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onFocus={() => setFocusedField("question")}
                    onBlur={() => setFocusedField(null)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") translate();
                    }}
                    placeholder="e.g. List the failed tests in the most recent run, sorted by app..."
                    rows={4}
                    style={{ ...bareTextArea, minHeight: "90px" }}
                  />
                </Box>
              </Box>

              {/* Examples Categorized List */}
              <Box px={4} pb={4}>
                <Text fontSize="10.5px" fontWeight="bold" color={colors.subtext} mb={2.5} letterSpacing="0.05em">
                  QUICK TEMPLATES
                </Text>

                {/* Category selectors */}
                <Flex gap={1.5} mb={2.5} overflowX="auto" pb={1}>
                  {(Object.keys(CATEGORIZED_EXAMPLES) as Array<keyof typeof CATEGORIZED_EXAMPLES>).map((cat) => (
                    <Box
                      key={cat}
                      as="button"
                      px={2.5}
                      py={1}
                      borderRadius="6px"
                      fontSize="10px"
                      fontWeight="700"
                      bg={selectedExampleCategory === cat ? catppuccinAlpha(c.sapphire, 0.15) : "transparent"}
                      color={selectedExampleCategory === cat ? c.sapphire : colors.subtext}
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

                {/* Templates */}
                <Flex direction="column" gap={1.5}>
                  {CATEGORIZED_EXAMPLES[selectedExampleCategory].map((q) => (
                    <Box
                      key={q}
                      as="button"
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
                      onClick={() => useExample(q)}
                      transition="all 0.12s ease"
                    >
                      {q}
                    </Box>
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
                <Flex align="center" gap={1.5} color={colors.subtext} fontSize="11px">
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
              boxShadow={focusedField === "sql" ? `0 0 0 3px ${catppuccinAlpha(c.sapphire, 0.18)}` : cardShadow}
              display="flex"
              flexDirection="column"
              overflow="hidden"
              transition="all 0.18s ease"
            >
              {/* Toolbar Header */}
              <Flex align="center" justify="space-between" px={4} py={3} bg={editorHeaderBg} borderBottom={`1px solid ${colors.border}`}>
                <Flex align="center" gap={3} minW={0}>
                  <Flex gap={1.5} align="center">
                    <Box w="10px" h="10px" borderRadius="full" bg="#ed8796" />
                    <Box w="10px" h="10px" borderRadius="full" bg="#eed49f" />
                    <Box w="10px" h="10px" borderRadius="full" bg="#a6da95" />
                  </Flex>
                  <Flex align="center" gap={1.5} ml={2} minW={0}>
                    <Code2 size={14} color={colors.subtext} />
                    <Text fontSize="12.5px" fontWeight="bold" color={editorText} whiteSpace="nowrap">
                      SQL EDITOR
                    </Text>
                  </Flex>
                </Flex>

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
              </Flex>

              {/* Code Editor Body with scrollable gutter & textarea synced */}
              <Flex flex="1" bg={editorBg} position="relative" height="230px" minHeight="230px">
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
                <Box flex="1" position="relative" height="100%" overflow="hidden">
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
                    <Play size={13} fill="currentColor" style={{ marginRight: 6 }} />
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
                <Text fontSize="12.5px" color={c.red} fontFamily="mono" wordBreak="break-word" whiteSpace="pre-wrap">
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
            >
              {/* Header toolbar */}
              <Flex align="center" justify="space-between" wrap="wrap" gap={3} borderBottom={`1px solid ${colors.border}`} pb={3.5}>
                <Flex align="center" gap={2.5}>
                  <Text fontSize="13px" fontWeight="bold" color={colors.text} letterSpacing="0.05em">
                    QUERY RESULTS
                  </Text>

                  {/* Rows Count badge */}
                  <Badge colorPalette="cyan" variant="solid" borderRadius="full" px={2} py={0.5} fontSize="10px">
                    {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
                  </Badge>

                  {/* Execution speed badge */}
                  {execTime !== null && (
                    <Badge colorPalette="gray" variant="solid" borderRadius="full" px={2} py={0.5} fontSize="10px">
                      {execTime} ms
                    </Badge>
                  )}

                  {/* Truncated flag */}
                  {result.truncated && (
                    <Badge colorPalette="orange" variant="solid" borderRadius="full" px={2} py={0.5} fontSize="10px">
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
                    {copiedCsv ? <Check size={12} style={{ marginRight: 4 }} /> : <Copy size={12} style={{ marginRight: 4 }} />}
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
                    {copiedJson ? <Check size={12} style={{ marginRight: 4 }} /> : <Copy size={12} style={{ marginRight: 4 }} />}
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
                  Showing {filteredRows.length} of {result.rowCount} rows matching &quot;{filterText}&quot;
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
                >
                  <Box overflowX="auto" maxH="450px" overflowY="auto">
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
                                const text = formatCell(row[col]);
                                const isNullVal = row[col] === null || row[col] === undefined;
                                return (
                                  <Table.Cell
                                    key={col}
                                    color={isNullVal ? colors.subtext : colors.text}
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
                                    {text}
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
                borderBottom={sidebarTab === "history" ? `2px solid ${c.sapphire}` : "none"}
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
                borderBottom={sidebarTab === "schema" ? `2px solid ${c.sapphire}` : "none"}
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
                    <Text fontSize="12px" color={colors.subtext} py={8} textAlign="center">
                      {history.length === 0 ? "No logged queries." : "No matching items."}
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
                          _hover={{ borderColor: c.sapphire, bg: colors.rowHover }}
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
                              {new Date(h.ranAt).toLocaleTimeString()} · {h.rowCount} row{h.rowCount === 1 ? "" : "s"}
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
                              _hover={{ color: c.red, bg: "rgba(231,130,132,0.15)" }}
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
                    <Text fontSize="12px" color={colors.subtext} py={8} textAlign="center">
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
                              bg={isExpanded ? catppuccinAlpha(c.sapphire, 0.05) : "transparent"}
                              onClick={() => toggleTableExpanded(table.name)}
                              _hover={{ bg: colors.rowHover }}
                            >
                              <Flex align="center" gap={1.5} minW={0}>
                                <Code2 size={13} color={isExpanded ? c.sapphire : colors.subtext} />
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
                                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                                  transition: "transform 0.2s ease",
                                }}
                              />
                            </Flex>

                            {/* Table Info Drawer */}
                            {isExpanded && (
                              <Box p={3} borderTop={`1px solid ${colors.border}`} bg={colors.cardBg}>
                                <Text fontSize="11px" color={colors.subtext} mb={3.5} fontStyle="italic">
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
                                      <Flex align="center" justify="space-between" wrap="wrap" gap={1}>
                                        <Text
                                          fontSize="11.5px"
                                          fontWeight="600"
                                          fontFamily="mono"
                                          color={colors.text}
                                          cursor="pointer"
                                          _hover={{ color: c.sapphire, textDecoration: "underline" }}
                                          onClick={() => insertTextAtCursor(col.name)}
                                          title="Click to insert column name"
                                        >
                                          {col.name}
                                        </Text>
                                        <Badge fontSize="8px" colorPalette="gray" variant="solid">
                                          {col.type}
                                        </Badge>
                                      </Flex>
                                      <Text fontSize="10px" color={colors.subtext} mt={1}>
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
    </Box>
  );
}
