"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Flex,
  HStack,
  Text,
  VStack,
  Tabs,
  Badge,
  Button,
  Heading,
  Table,
  Link,
  IconButton,
  Spinner,
  Grid,
} from "@chakra-ui/react";
import {
  X,
  Terminal,
  CircleCheck,
  CircleX,
  TriangleAlert,
  Wrench,
  Download,
  ExternalLink,
  Code2,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Copy,
  Search,
  ListFilter,
  ArrowDownToLine,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import { RobotFace } from "./RobotFace";
import { getAWSColors, AWS_COLORS, getStatusStyle } from "@/app/theme/aws";
import { useThemeMode } from "@/app/providers";
import type {
  Run,
  ProgressEvent,
  RunReport,
  RunStage,
  TestOutcome,
} from "@/src/types";
import { ThreeProgressBar } from "./ThreeProgressBar";

interface TestRunDetailsPaneProps {
  run: Run;
  events: ProgressEvent[];
  report: RunReport | null;
  cancelling: boolean;
  onStop: () => void;
  onClose: () => void;
  isMaximized: boolean;
  onToggleMaximize: () => void;
}

const OUTCOME_COLOR: Record<TestOutcome, string> = {
  passed: "green",
  failed: "red",
  flaky: "orange",
  healed: "blue",
  fixme: "gray",
};

const PIPELINE_STAGES = [
  { id: "planning", label: "Discoverer", colorKey: "mauve" },
  { id: "generating", label: "Designer", colorKey: "sky" },
  { id: "healing", label: "Evolver", colorKey: "yellow" },
  { id: "reporting", label: "Reporter", colorKey: "green" },
] as const;

const FLOW_MOCK_DETAILS: Record<
  string,
  { narrative: string; steps: string[] }
> = {
  "navigation-flow.spec.ts": {
    narrative:
      "Verifies the critical global header menu navigation elements. Ensures that corporate branding logos, primary dropdown selectors, and header navigation hyperlinks are fully loaded, visible, and interactive for users visiting the site.",
    steps: [
      "Navigate to the application home page (https://tarento.com)",
      "Wait for the global layout headers and DOM tree to complete loading",
      "Locate the primary navigation bar container",
      "Verify that the main brand logo and all primary menu categories (Services, Industries, Case Studies, Insights, Careers) render correctly",
      "Check that header navigation elements are visible and ready for user interactions",
    ],
  },
  "home-content.spec.ts": {
    narrative:
      "Verifies the home page landing hero banners and core value proposition sections. Ensures that the dynamic slide blocks, main call-to-actions, and main body components are rendered successfully for landing page visitors.",
    steps: [
      "Navigate to the home page (https://tarento.com)",
      "Verify the main hero slider section is loaded and visible",
      "Ensure corporate header statements and body descriptions are legible",
      "Locate and verify secondary widgets (value statements, client grids) display correctly",
    ],
  },
  "contact-form.spec.ts": {
    narrative:
      "Verifies the integrity of the contact inquiry submission flow. Focuses on inputs parsing validation, submit button state handling, and the server-side API response for submission requests.",
    steps: [
      "Navigate to the Contact Us page (https://tarento.com/contact)",
      "Check that name, email, subject, and message input fields render properly",
      "Input valid text into name and email fields",
      "Click the submit button to transmit the form data",
      "Wait for the contact form success indicator alert to become visible",
    ],
  },
  "about-page.spec.ts": {
    narrative:
      "Validates the corporate background, company overview, and team profile content on the About page. Ensures information blocks, executive lists, and brand pillars are correctly structured and formatted.",
    steps: [
      "Navigate to the About page (https://tarento.com/about)",
      "Verify that the corporate intro headers render correctly",
      "Ensure executive leadership cards and descriptive paragraphs are visible",
      "Validate the layout does not contain broken links or overlapping containers",
    ],
  },
  "footer-links.spec.ts": {
    narrative:
      "Ensures the global site footer contains all relevant social link icons, copyright declarations, and legal disclaimer anchors. Verifies these links are present and mapped to valid URLs.",
    steps: [
      "Load the home page (https://tarento.com)",
      "Scroll down to the footer layout area",
      "Identify the social media links column (Facebook, Twitter, LinkedIn)",
      "Verify all social icon elements are displayed and clickable",
      "Check that copyright disclaimer text and links are visible",
    ],
  },
  "careers-page.spec.ts": {
    narrative:
      "Validates the recruitment application workflow. Tests navigating to the open job positions list, clicking on specific jobs, and verifying the application form loads with the appropriate input controls.",
    steps: [
      "Navigate to the Careers section (https://tarento.com/careers)",
      "Wait for the open positions list to load from the server",
      "Locate and click on a dynamic 'Apply Now' button next to an open job position",
      "Verify the candidate application form modal opens successfully",
    ],
  },
  "insights-carousel.spec.ts": {
    narrative:
      "Verifies the dynamic blog/insights carousel widget functionality. Simulates slide transitions, next/prev slide navigation controls, and lazy-loading of corresponding slide cards.",
    steps: [
      "Navigate to the Insights page (https://tarento.com/insights)",
      "Verify that the insights blog slider component is rendered and active",
      "Locate the next and previous carousel navigation arrow buttons",
      "Assert that active card state changes and the container translates correctly",
    ],
  },
};

function getStageStatus(
  stageId: string,
  currentRunStage: string | undefined,
  runStatus: string,
): "pending" | "active" | "completed" | "failed" {
  if (runStatus === "completed") return "completed";

  let mappedStageId = "planning";
  if (currentRunStage === "generating" || currentRunStage === "validating") {
    mappedStageId = "generating";
  } else if (currentRunStage === "running" || currentRunStage === "healing") {
    mappedStageId = "healing";
  } else if (
    currentRunStage === "flake-check" ||
    currentRunStage === "reporting"
  ) {
    mappedStageId = "reporting";
  } else if (currentRunStage === "done") {
    return "completed";
  }

  const stageOrder = ["planning", "generating", "healing", "reporting"];
  const currentStageIndex = stageOrder.indexOf(mappedStageId);
  const thisStageIndex = stageOrder.indexOf(stageId);

  if (runStatus === "failed" || runStatus === "cancelled") {
    if (thisStageIndex === currentStageIndex) return "failed";
    return thisStageIndex < currentStageIndex ? "completed" : "pending";
  }

  if (thisStageIndex < currentStageIndex) {
    return "completed";
  } else if (thisStageIndex === currentStageIndex) {
    return "active";
  } else {
    return "pending";
  }
}

function findNarrativeForSpec(
  specFile: string,
  summary: string[],
): string | undefined {
  const name = specFile.split("/").pop() ?? specFile;

  if (FLOW_MOCK_DETAILS[name]) {
    return FLOW_MOCK_DETAILS[name].narrative;
  }

  const cleanSpec = name
    .replace(".spec.ts", "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = cleanSpec.split(" ").filter((t) => t.length > 3);

  // 1. Try substring match
  for (const bullet of summary) {
    const cleanBullet = bullet.toLowerCase();
    if (cleanBullet.includes(cleanSpec)) {
      return bullet;
    }
  }

  // 2. Try matching based on token overlaps
  let bestBullet: string | undefined = undefined;
  let maxOverlap = 0;
  for (const bullet of summary) {
    const cleanBullet = bullet.toLowerCase();
    let overlap = 0;
    for (const token of tokens) {
      if (cleanBullet.includes(token)) {
        overlap++;
      }
    }
    if (overlap > maxOverlap && overlap >= 1) {
      maxOverlap = overlap;
      bestBullet = bullet;
    }
  }

  return bestBullet;
}

function parseMarkdownPlan(
  planMarkdown: string | null,
): Array<{ title: string; steps: string[] }> {
  if (!planMarkdown) return [];
  const scenarios: Array<{ title: string; steps: string[] }> = [];
  let currentScenario: { title: string; steps: string[] } | null = null;
  let inSteps = false;

  const lines = planMarkdown.split("\n");
  for (let line of lines) {
    const trimmed = line.trim();

    // Check for scenario headers
    if (
      line.startsWith("####") ||
      line.startsWith("###") ||
      (line.startsWith("##") && line.toLowerCase().includes("scenario"))
    ) {
      if (
        line.startsWith("###") &&
        !line.startsWith("####") &&
        !/\d+\.\d+/.test(line)
      ) {
        continue;
      }
      const title = line
        .replace(/^(####|###|##)\s*(scenario\s*\d*[\s—:-]*)?/i, "")
        .trim();
      currentScenario = { title, steps: [] };
      scenarios.push(currentScenario);
      inSteps = false;
      continue;
    }

    // Check for steps block indicator
    if (
      trimmed.toLowerCase().includes("steps:") &&
      (trimmed.startsWith("*") ||
        trimmed.startsWith("-") ||
        trimmed.endsWith(":"))
    ) {
      inSteps = true;
      continue;
    }

    // If in steps, capture numbered or bulleted list items
    if (inSteps && currentScenario) {
      if (/^(\d+\.|\-|\*)\s+/.test(trimmed)) {
        const stepText = trimmed.replace(/^(\d+\.|\-|\*)\s+/, "").trim();
        if (stepText) {
          currentScenario.steps.push(stepText);
        }
      } else if (trimmed === "") {
        // Continue
      } else if (line.startsWith("#")) {
        inSteps = false;
      }
    }
  }

  return scenarios;
}

function findPlanScenarioForSpec(
  specFile: string,
  scenarios: Array<{ title: string; steps: string[] }>,
): { title: string; steps: string[] } | undefined {
  const name = specFile.split("/").pop() ?? specFile;
  const cleanSpec = name
    .replace(".spec.ts", "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const tokens = cleanSpec.split(" ").filter((t) => t.length > 3);

  // 1. Try exact substring match
  for (const sc of scenarios) {
    const cleanTitle = sc.title.toLowerCase();
    if (cleanTitle.includes(cleanSpec) || cleanSpec.includes(cleanTitle)) {
      return sc;
    }
  }

  // 2. Try token overlap matching
  let bestScenario: { title: string; steps: string[] } | undefined = undefined;
  let maxOverlap = 0;
  for (const sc of scenarios) {
    const cleanTitle = sc.title.toLowerCase();
    let overlap = 0;
    for (const token of tokens) {
      if (cleanTitle.includes(token)) {
        overlap++;
      }
    }
    if (overlap > maxOverlap && overlap >= 1) {
      maxOverlap = overlap;
      bestScenario = sc;
    }
  }

  return bestScenario;
}

function highlightTypeScript(code: string) {
  const lines = code.split("\n");
  return lines.map((line, idx) => {
    let html = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    html = html.replace(
      /(["'`])(.*?)\1/g,
      '<span style="color: #a6d189;">$1$2$1</span>',
    );

    const keywords = [
      "import",
      "from",
      "const",
      "let",
      "var",
      "await",
      "async",
      "function",
      "class",
      "return",
      "export",
      "default",
      "if",
      "else",
      "for",
      "while",
      "new",
      "type",
      "interface",
      "as",
    ];
    const kwRegex = new RegExp(`\\b(${keywords.join("|")})\\b`, "g");
    html = html.replace(
      kwRegex,
      '<span style="color: #ca9ee6; font-weight: bold;">$1</span>',
    );

    const testTerms = [
      "test",
      "expect",
      "describe",
      "beforeAll",
      "beforeEach",
      "afterEach",
      "goto",
      "click",
      "fill",
      "locator",
    ];
    const termRegex = new RegExp(`\\b(${testTerms.join("|")})\\b`, "g");
    html = html.replace(termRegex, '<span style="color: #8caaee;">$1</span>');

    html = html.replace(
      /(\/\/.*)$/g,
      '<span style="color: #838ba7; font-style: italic;">$1</span>',
    );

    return (
      <Flex
        key={idx}
        align="flex-start"
        py={0.5}
        fontFamily="mono"
        fontSize="13px"
      >
        <Text
          w="30px"
          minW="30px"
          color="#838ba7"
          textAlign="right"
          pr={2.5}
          userSelect="none"
          borderRight="1px solid"
          borderColor="#414559"
          mr={3}
        >
          {idx + 1}
        </Text>
        <Box
          flex={1}
          whiteSpace="pre-wrap"
          wordBreak="break-all"
          color="#b5bfe2"
          dangerouslySetInnerHTML={{ __html: html || " " }}
        />
      </Flex>
    );
  });
}

interface AWSCodeViewerProps {
  filename: string;
  code: string;
  isMaximized: boolean;
  copiedFile: string | null;
  onCopy: (file: string, code: string) => void;
}

function AWSCodeViewer({
  filename,
  code,
  isMaximized,
  copiedFile,
  onCopy,
}: AWSCodeViewerProps) {
  const isCopied = copiedFile === filename;

  return (
    <Box
      border="1px solid"
      borderColor="#414559"
      borderRadius="md"
      overflow="hidden"
      display="flex"
      flexDirection="column"
      h="100%"
      minH="200px"
      bg="#232634"
    >
      <Flex
        bg="#232634"
        px={3}
        py={2}
        align="center"
        justify="space-between"
        borderBottom="1px solid"
        borderColor="#414559"
        userSelect="none"
      >
        <HStack gap={2}>
          <Code2 size={13} style={{ color: "#81c8be" }} />
          <Text
            fontSize="13px"
            fontWeight="bold"
            fontFamily="mono"
            color="#b5bfe2"
          >
            {filename}
          </Text>
        </HStack>
        <HStack gap={3}>
          <Badge
            variant="subtle"
            fontSize="11px"
            bg="#414559"
            color="#81c8be"
            borderRadius="sm"
          >
            TypeScript
          </Badge>
          <Button
            size="xs"
            variant="ghost"
            fontSize="12px"
            height="20px"
            px={2.5}
            color="#b5bfe2"
            _hover={{ bg: "#414559", color: "white" }}
            onClick={() => onCopy(filename, code)}
            cursor="pointer"
            display="flex"
            alignItems="center"
            gap={1}
          >
            <Copy size={11} />
            {isCopied ? "Copied!" : "Copy"}
          </Button>
        </HStack>
      </Flex>
      <Box
        p={3}
        overflow="auto"
        flex={1}
        fontFamily="mono"
        fontSize="13px"
        bg="#232634"
        css={{
          "&::-webkit-scrollbar": { width: "8px", height: "8px" },
          "&::-webkit-scrollbar-track": { background: "#232634" },
          "&::-webkit-scrollbar-thumb": {
            background: "#414559",
            borderRadius: "4px",
          },
          "&::-webkit-scrollbar-thumb:hover": { background: "#51576d" },
        }}
      >
        {highlightTypeScript(code)}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Console Logs — execution timeline + per-test results breakdown
// ---------------------------------------------------------------------------

type LogLevel =
  | "error"
  | "warn"
  | "success"
  | "tool"
  | "heal"
  | "knowledge"
  | "agent"
  | "info";

/** Glyph + color per log level (rendered on the dark terminal panel). */
const LOG_LEVEL_META: Record<
  LogLevel,
  { label: string; color: string; glyph: string }
> = {
  error: { label: "Error", color: "#e78284", glyph: "✗" },
  warn: { label: "Warning", color: "#e5c890", glyph: "⚠" },
  success: { label: "Success", color: "#a6d189", glyph: "✓" },
  tool: { label: "Tool", color: "#8caaee", glyph: "🔧" },
  heal: { label: "Heal", color: "#ca9ee6", glyph: "🩹" },
  knowledge: { label: "Knowledge", color: "#81c8be", glyph: "🧠" },
  agent: { label: "Agent", color: "#babbf1", glyph: "✦" },
  info: { label: "Info", color: "#949cbb", glyph: "›" },
};

/** Filter-chip order (quiet → loud). */
const LOG_LEVEL_ORDER: LogLevel[] = [
  "info",
  "agent",
  "tool",
  "success",
  "heal",
  "knowledge",
  "warn",
  "error",
];

interface ParsedLogLine {
  level: LogLevel;
  /** Agent label parsed from a "[discoverer] …" prefix, if any. */
  agent?: string;
  /** Message with the "[label]" prefix stripped. */
  text: string;
  at: string;
  stage: RunStage;
  raw: string;
}

/**
 * Classify a progress event into a log level for color/iconography. Ordering
 * matters: tool/heal/knowledge markers win, stage-intro lines stay neutral even
 * when they mention "failures", then error/warn/success heuristics apply.
 */
function classifyLogLine(stage: RunStage, raw: string, text: string): LogLevel {
  const t = text.trim();
  if (/^tool:\s/i.test(t) || /\]\s*tool:\s/i.test(raw)) return "tool";
  if (raw.includes("🩹") || /auto-?heal/i.test(raw)) return "heal";
  if (raw.includes("🧠") || /^knowledge\b/i.test(t)) return "knowledge";

  // "Validation score 82/100 — 1 error(s), 3 warning(s)" → level from counts.
  const vs = t.match(/validation score\s+\d+\/100\s+—\s+(\d+)\s+error/i);
  if (vs) {
    if (Number(vs[1]) > 0) return "error";
    const warn = t.match(/(\d+)\s+warning/i);
    return warn && Number(warn[1]) > 0 ? "warn" : "success";
  }

  if (stage === "error" || stage === "cancelled") return "error";
  // Stage-intro lines ("Evolver: repairing failures…") stay neutral.
  if (
    /^(discoverer|designer|validator|evolver|reporter|running generated|re-running)/i.test(
      t,
    )
  )
    return "info";
  if (/\b(failed|could not|unable to|no tests|exception|cannot)\b/i.test(t))
    return "error";
  if (/\b(warn|warning|trimmed|quarantin|missing|skipped)\b/i.test(t))
    return "warn";
  if (
    stage === "done" ||
    /\b(complete|completed|success|passed)\b/i.test(t) ||
    t.includes("✓")
  )
    return "success";
  return "info";
}

function parseLogEvent(ev: ProgressEvent): ParsedLogLine {
  let text = ev.message;
  let agent: string | undefined;
  const labelMatch = text.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
  if (labelMatch) {
    agent = labelMatch[1];
    text = labelMatch[2];
  }
  let level = classifyLogLine(ev.stage, ev.message, text);
  // Plain agent narration (had a label, nothing notable) gets the agent glyph.
  if (level === "info" && agent) level = "agent";
  return { level, agent, text, at: ev.at, stage: ev.stage, raw: ev.message };
}

/** Maps pipeline stages into the ordered, user-facing timeline groups. */
const TIMELINE_GROUPS: { id: string; label: string; stages: RunStage[] }[] = [
  { id: "plan", label: "Discoverer", stages: ["planning"] },
  { id: "generate", label: "Designer", stages: ["generating"] },
  { id: "validate", label: "Validator", stages: ["validating"] },
  {
    id: "execute",
    label: "Run & Heal",
    stages: ["running", "healing", "flake-check"],
  },
  { id: "report", label: "Reporter", stages: ["reporting"] },
  { id: "complete", label: "Complete", stages: ["done"] },
  { id: "system", label: "System", stages: ["queued", "cancelled", "error"] },
];

interface TimelineGroup {
  id: string;
  label: string;
  ordinal: number;
  lines: ParsedLogLine[];
  startAt?: string;
  endAt?: string;
  durationMs?: number;
  status: "pending" | "active" | "completed" | "failed";
  counts: Partial<Record<LogLevel, number>>;
}

/** Group the flat event stream into ordered pipeline stages with timing/status. */
function buildTimeline(
  events: ProgressEvent[],
  runStatus: string,
  runUpdatedAt: string,
): TimelineGroup[] {
  const groupOf = (stage: RunStage) =>
    TIMELINE_GROUPS.find((g) => g.stages.includes(stage))?.id ?? "system";

  const linesByGroup: Record<string, ParsedLogLine[]> = {};
  for (const ev of events) {
    const gid = groupOf(ev.stage);
    (linesByGroup[gid] ??= []).push(parseLogEvent(ev));
  }

  // Canonical pipeline groups always show as a skeleton; "system" only if used.
  const ordered = TIMELINE_GROUPS.filter(
    (g) => g.id !== "system" || (linesByGroup[g.id]?.length ?? 0) > 0,
  );
  const nonEmpty = ordered.filter((g) => (linesByGroup[g.id]?.length ?? 0) > 0);
  const lastActiveId = nonEmpty[nonEmpty.length - 1]?.id;
  const running = runStatus === "running" || runStatus === "pending";

  return ordered.map((g, i) => {
    const lines = linesByGroup[g.id] ?? [];
    const counts: Partial<Record<LogLevel, number>> = {};
    for (const l of lines) counts[l.level] = (counts[l.level] ?? 0) + 1;

    const startAt = lines[0]?.at;
    // Stage ends when the next non-empty stage begins; the live one is open-ended.
    let endAt: string | undefined;
    for (let j = i + 1; j < ordered.length; j++) {
      const nl = linesByGroup[ordered[j].id];
      if (nl?.length) {
        endAt = nl[0].at;
        break;
      }
    }
    if (!endAt && lines.length && !(g.id === lastActiveId && running)) {
      endAt = runUpdatedAt;
    }
    const durationMs =
      startAt && endAt
        ? Math.max(0, new Date(endAt).getTime() - new Date(startAt).getTime())
        : undefined;

    let status: TimelineGroup["status"] = "pending";
    if (lines.length === 0) status = "pending";
    else if (g.id === lastActiveId)
      status =
        runStatus === "running" || runStatus === "pending"
          ? "active"
          : runStatus === "failed" || runStatus === "cancelled"
            ? "failed"
            : "completed";
    else status = "completed";

    return {
      id: g.id,
      label: g.label,
      ordinal: i + 1,
      lines,
      startAt,
      endAt,
      durationMs,
      status,
      counts,
    };
  });
}

function formatClock(at: string): string {
  const d = new Date(at);
  return isNaN(d.getTime())
    ? "--:--:--"
    : d.toLocaleTimeString("en-GB", { hour12: false });
}

function formatDur(ms?: number): string {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Plain-text export of the whole stream for the Copy / Download actions. */
function logsToPlainText(events: ProgressEvent[]): string {
  return events
    .map((ev) => `[${formatClock(ev.at)}] [${ev.stage}] ${ev.message}`)
    .join("\n");
}

export function TestRunDetailsPane({
  run,
  events,
  report,
  cancelling,
  onStop,
  onClose,
  isMaximized,
  onToggleMaximize,
}: TestRunDetailsPaneProps) {
  const { theme } = useThemeMode();
  const colors = getAWSColors(theme);
  const isDark = theme === "dark";
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState("details");
  const [selectedSpecFile, setSelectedSpecFile] = useState<string | null>(null);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [specFilterText, setSpecFilterText] = useState("");
  const [rightPaneTab, setRightPaneTab] = useState<"narrative" | "code">(
    "narrative",
  );

  // Console Logs tab state.
  const [logLevelFilter, setLogLevelFilter] = useState<Set<LogLevel>>(
    () => new Set(LOG_LEVEL_ORDER),
  );
  const [logSearch, setLogSearch] = useState("");
  const [logAutoScroll, setLogAutoScroll] = useState(true);
  const [collapsedLogGroups, setCollapsedLogGroups] = useState<
    Record<string, boolean>
  >({});
  const [copiedLogs, setCopiedLogs] = useState(false);

  const toggleLogLevel = (lvl: LogLevel) =>
    setLogLevelFilter((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      // Never let the filter empty out — that would hide every line.
      return next.size === 0 ? new Set(LOG_LEVEL_ORDER) : next;
    });

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logsToPlainText(events));
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const handleDownloadLogs = () => {
    const blob = new Blob([logsToPlainText(events)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${run.id.slice(0, 8)}-console.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCode = (filename: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedFile(filename);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  useEffect(() => {
    if (report?.generatedSpecs && report.generatedSpecs.length > 0) {
      const exists = report.generatedSpecs.some(
        (s) => s.file === selectedSpecFile,
      );
      if (!exists) {
        setSelectedSpecFile(report.generatedSpecs[0].file);
      }
    } else {
      setSelectedSpecFile(null);
    }
  }, [report, selectedSpecFile]);

  // Auto-scroll logs (only while on the Console Logs tab and auto-scroll is on).
  useEffect(() => {
    if (
      logAutoScroll &&
      activeDetailsTab === "logs" &&
      logContainerRef.current
    ) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [events, logAutoScroll, activeDetailsTab]);

  const shortId = `i-${run.id.slice(0, 17)}`;
  const statusStyle = getStatusStyle(run.status);
  const currentStage = events[events.length - 1]?.stage ?? run.stage;

  // Code expand state
  const [openSpecs, setOpenSpecs] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [showPlan, setShowPlan] = useState(false);

  return (
    <Box
      h={isMaximized ? "100%" : "480px"}
      flex={isMaximized ? 1 : "0 0 auto"}
      minH={0}
      transition="height 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
      bg={colors.cardBg}
      borderTop="1px solid"
      borderColor={colors.border}
      boxShadow="0 -4px 20px rgba(0,0,0,0.15)"
      display="flex"
      flexDirection="column"
      overflow="hidden"
      zIndex={50}
    >
      {/* 1. Header with Run Name & State */}
      <Flex
        px={4}
        py={2.5}
        bg={colors.subBg}
        borderBottom="1px solid"
        borderColor={colors.border}
        align="center"
        justify="space-between"
      >
        <HStack gap={4}>
          <Text
            fontSize="13.5px"
            fontWeight="bold"
            fontFamily="mono"
            color={colors.text}
          >
            {shortId} ({run.config.url})
          </Text>
          <Badge
            variant="subtle"
            fontSize="10px"
            bg={statusStyle.bg}
            color={isDark ? statusStyle.darkColor : statusStyle.color}
            px={2}
            borderRadius="md"
          >
            {statusStyle.label}
          </Badge>
        </HStack>

        <HStack gap={1.5}>
          <IconButton
            aria-label={
              isMaximized ? "Restore Details" : "Maximize Details (Full Screen)"
            }
            title={
              isMaximized
                ? "Exit full screen"
                : "Full screen (hides Test Runs table)"
            }
            variant="ghost"
            size="xs"
            onClick={onToggleMaximize}
            cursor="pointer"
            _hover={{ bg: colors.rowHover }}
            color={colors.text}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </IconButton>

          <IconButton
            aria-label="Close Details"
            variant="ghost"
            size="xs"
            onClick={onClose}
            cursor="pointer"
            _hover={{ bg: colors.rowHover }}
          >
            <X size={15} />
          </IconButton>
        </HStack>
      </Flex>

      {/* 2. Tabs for different perspectives */}
      <Tabs.Root
        value={activeDetailsTab}
        onValueChange={(details) => setActiveDetailsTab(details.value)}
        variant="subtle"
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <Tabs.List
          bg={isDark ? "slate.900" : "slate.100"}
          px={4}
          py={1}
          borderBottom="1px solid"
          borderColor={colors.border}
          gap={1}
          display="flex"
        >
          <Tabs.Trigger
            value="details"
            fontSize="13px"
            fontWeight="bold"
            px={3}
            py={1.5}
            borderRadius="sm"
            cursor="pointer"
            color={colors.subtext}
            _selected={{
              bg: isDark ? colors.cardBg : "rgba(59, 130, 246, 0.08)",
              color: AWS_COLORS.orange.main,
            }}
            _hover={{ bg: isDark ? "white/5" : "rgba(59, 130, 246, 0.04)" }}
          >
            Details
          </Tabs.Trigger>
          <Tabs.Trigger
            value="status-checks"
            fontSize="13px"
            fontWeight="bold"
            px={3}
            py={1.5}
            borderRadius="sm"
            cursor="pointer"
            color={colors.subtext}
            _selected={{
              bg: isDark ? colors.cardBg : "rgba(59, 130, 246, 0.08)",
              color: AWS_COLORS.orange.main,
            }}
            _hover={{ bg: isDark ? "white/5" : "rgba(59, 130, 246, 0.04)" }}
          >
            Status Checks & Report
          </Tabs.Trigger>
          <Tabs.Trigger
            value="narrative"
            fontSize="13px"
            fontWeight="bold"
            px={3}
            py={1.5}
            borderRadius="sm"
            cursor="pointer"
            color={colors.subtext}
            _selected={{
              bg: isDark ? colors.cardBg : "rgba(59, 130, 246, 0.08)",
              color: AWS_COLORS.orange.main,
            }}
            _hover={{ bg: isDark ? "white/5" : "rgba(59, 130, 246, 0.04)" }}
          >
            User Flows & Spec Files
          </Tabs.Trigger>
          <Tabs.Trigger
            value="monitoring"
            fontSize="13px"
            fontWeight="bold"
            px={3}
            py={1.5}
            borderRadius="sm"
            cursor="pointer"
            color={colors.subtext}
            _selected={{
              bg: isDark ? colors.cardBg : "rgba(59, 130, 246, 0.08)",
              color: AWS_COLORS.orange.main,
            }}
            _hover={{ bg: isDark ? "white/5" : "rgba(59, 130, 246, 0.04)" }}
          >
            Monitoring
          </Tabs.Trigger>
          <Tabs.Trigger
            value="logs"
            fontSize="13px"
            fontWeight="bold"
            px={3}
            py={1.5}
            borderRadius="sm"
            cursor="pointer"
            color={colors.subtext}
            _selected={{
              bg: isDark ? colors.cardBg : "rgba(59, 130, 246, 0.08)",
              color: AWS_COLORS.orange.main,
            }}
            _hover={{ bg: isDark ? "white/5" : "rgba(59, 130, 246, 0.04)" }}
          >
            Console Logs
          </Tabs.Trigger>
          <Tabs.Trigger
            value="code"
            fontSize="13px"
            fontWeight="bold"
            px={3}
            py={1.5}
            borderRadius="sm"
            cursor="pointer"
            color={colors.subtext}
            _selected={{
              bg: isDark ? colors.cardBg : "rgba(59, 130, 246, 0.08)",
              color: AWS_COLORS.orange.main,
            }}
            _hover={{ bg: isDark ? "white/5" : "rgba(59, 130, 246, 0.04)" }}
          >
            Test Plan & Specs Code
          </Tabs.Trigger>
        </Tabs.List>

        <Box flex={1} overflowY="auto" p={4} bg={colors.subBg}>
          {/* TAB 1: DETAILS */}
          <Box display={activeDetailsTab === "details" ? "block" : "none"}>
            <Flex
              direction={{ base: "column", md: "row" }}
              gap={6}
              fontSize="13px"
              align="stretch"
            >
              <VStack align="stretch" gap={3} flex={1}>
                <Heading
                  size="xs"
                  color={colors.text}
                  borderBottom="1px solid"
                  borderColor={colors.border}
                  pb={1.5}
                >
                  Test Run Summary
                </Heading>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Run ID:</Text>
                  <Text fontWeight="bold" fontFamily="mono">
                    {run.id}
                  </Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Host IP address:</Text>
                  <Text fontWeight="bold">127.0.0.1</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>DNS Name:</Text>
                  <Text fontWeight="bold" fontFamily="mono">
                    ec2-{run.id.slice(0, 8)}.local
                  </Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>State:</Text>
                  <Text fontWeight="bold" color={statusStyle.color}>
                    {run.status}
                  </Text>
                </Flex>
              </VStack>

              <Box
                borderLeft="1px solid"
                borderColor={colors.border}
                display={{ base: "none", md: "block" }}
              />

              <VStack align="stretch" gap={3} flex={1}>
                <Heading
                  size="xs"
                  color={colors.text}
                  borderBottom="1px solid"
                  borderColor={colors.border}
                  pb={1.5}
                >
                  Crawl & Agent Settings
                </Heading>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Target URL:</Text>
                  <Text
                    fontWeight="bold"
                    overflow="hidden"
                    textOverflow="ellipsis"
                    maxW="200px"
                    title={run.config.url}
                  >
                    {run.config.url}
                  </Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Crawl Mode:</Text>
                  <Text fontWeight="bold">
                    {run.config.crawlMode
                      ? ({
                          direct: "Direct page only (depth 0)",
                          standard: "Standard depth (depth 1)",
                          deep: "Deep crawl (depth 3)",
                          aggressive: "Aggressive crawl (depth 10)",
                        }[run.config.crawlMode] ?? run.config.crawlMode)
                      : "Standard depth (depth 1)"}
                  </Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Max Pages visited:</Text>
                  <Text fontWeight="bold">
                    {run.config.crawlMode === "direct"
                      ? 1
                      : (run.config.maxPages ?? 10)}
                  </Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Launch time:</Text>
                  <Text fontWeight="bold">
                    {new Date(run.createdAt).toLocaleString()}
                  </Text>
                </Flex>
              </VStack>

              <Box
                borderLeft="1px solid"
                borderColor={colors.border}
                display={{ base: "none", md: "block" }}
              />

              <VStack align="stretch" gap={3} flex={1}>
                <Heading
                  size="xs"
                  color={colors.text}
                  borderBottom="1px solid"
                  borderColor={colors.border}
                  pb={1.5}
                >
                  Storage Paths
                </Heading>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Workspace path:</Text>
                  <Text fontWeight="bold" fontFamily="mono">
                    .runs/{run.id.slice(0, 8)}/
                  </Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Generated tests:</Text>
                  <Text fontWeight="bold" fontFamily="mono">
                    .runs/{run.id.slice(0, 8)}/tests/
                  </Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Markdown spec plan:</Text>
                  <Text fontWeight="bold" fontFamily="mono">
                    .runs/{run.id.slice(0, 8)}/specs/
                  </Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Playwright config:</Text>
                  <Text fontWeight="bold" fontFamily="mono">
                    playwright.config.ts
                  </Text>
                </Flex>
              </VStack>
            </Flex>
          </Box>

          {/* TAB 2: STATUS CHECKS & REPORT */}
          <Box
            display={activeDetailsTab === "status-checks" ? "block" : "none"}
          >
            <VStack align="stretch" gap={5}>
              {/* Stepper progress bars */}
              <Box>
                <Text
                  fontSize="13px"
                  fontWeight="bold"
                  color={colors.subtext}
                  mb={3}
                >
                  Agent Execution Pipeline Checks
                </Text>
                <Box
                  display="grid"
                  gridTemplateColumns={{ base: "1fr", sm: "repeat(4, 1fr)" }}
                  gap={3}
                >
                  {PIPELINE_STAGES.map((st) => {
                    const status = getStageStatus(
                      st.id,
                      currentStage,
                      run.status,
                    );
                    let activeStartAt: string | undefined = undefined;
                    if (status === "active") {
                      const targetStages =
                        st.id === "planning"
                          ? ["planning"]
                          : st.id === "generating"
                            ? ["generating"]
                            : st.id === "healing"
                              ? ["running", "healing"]
                              : st.id === "reporting"
                                ? ["flake-check", "reporting"]
                                : [];
                      const startEvent = events.find((ev) =>
                        targetStages.includes(ev.stage),
                      );
                      activeStartAt = startEvent?.at ?? run.createdAt;
                    }
                    return (
                      <ThreeProgressBar
                        key={st.id}
                        label={st.label}
                        status={status}
                        activeStartAt={activeStartAt}
                        icon={<RobotFace size={15} />}
                      />
                    );
                  })}
                </Box>
              </Box>

              {/* Run report display */}
              {report ? (
                <VStack
                  align="stretch"
                  gap={4}
                  borderTop="1px solid"
                  borderColor={colors.border}
                  pt={4}
                >
                  <HStack justify="space-between">
                    <HStack gap={4}>
                      <Text
                        fontSize="22px"
                        fontWeight="black"
                        fontFamily="mono"
                      >
                        {Math.round(report.successRate.rate * 100)}% Success
                      </Text>
                      <Text fontSize="13px" color={colors.subtext}>
                        ({report.successRate.passed} passed /{" "}
                        {report.successRate.total} total tests executed)
                      </Text>
                    </HStack>
                    <HStack gap={2}>
                      {["json", "md", "html"].map((fmt) => (
                        <Button
                          key={fmt}
                          size="xs"
                          variant="outline"
                          borderColor={colors.border}
                          color={colors.text}
                          cursor="pointer"
                          _hover={{
                            bg: colors.rowHover,
                            borderColor: AWS_COLORS.orange.main,
                          }}
                        >
                          <Link
                            href={`/api/runs/${run.id}/report?format=${fmt}`}
                            target="_blank"
                            display="flex"
                            alignItems="center"
                            gap={1}
                            fontSize="11.5px"
                            textDecoration="none"
                          >
                            <Download size={10} /> {fmt.toUpperCase()}
                          </Link>
                        </Button>
                      ))}
                    </HStack>
                  </HStack>

                  {/* Test outcomes table */}
                  <Box
                    border="1px solid"
                    borderColor={colors.border}
                    borderRadius="sm"
                    overflow="hidden"
                  >
                    <Table.Root size="sm" variant="outline" border="none">
                      <Table.Header bg={isDark ? "white/5" : "gray.100"}>
                        <Table.Row borderColor={colors.border}>
                          <Table.ColumnHeader
                            color={colors.subtext}
                            fontSize="11px"
                            py={1.5}
                          >
                            Flow ID
                          </Table.ColumnHeader>
                          <Table.ColumnHeader
                            color={colors.subtext}
                            fontSize="11px"
                            py={1.5}
                          >
                            Verdict
                          </Table.ColumnHeader>
                          <Table.ColumnHeader
                            color={colors.subtext}
                            fontSize="11px"
                            py={1.5}
                          >
                            Observations / Error Logs
                          </Table.ColumnHeader>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body fontSize="13px">
                        {report.results.map((res, i) => (
                          <Table.Row
                            key={i}
                            borderColor={colors.border}
                            _hover={{ bg: colors.rowHover }}
                          >
                            <Table.Cell
                              py={1.5}
                              fontFamily="mono"
                              fontWeight="medium"
                            >
                              {res.flowId}
                            </Table.Cell>
                            <Table.Cell py={1.5}>
                              <Badge
                                colorPalette={OUTCOME_COLOR[res.outcome]}
                                variant="solid"
                                fontSize="11px"
                                borderRadius="sm"
                                px={1.5}
                              >
                                {res.outcome.toUpperCase()}
                              </Badge>
                            </Table.Cell>
                            <Table.Cell
                              py={1.5}
                              color={
                                res.failureReason ? "red.400" : colors.subtext
                              }
                            >
                              {res.failureReason ??
                                (res.healed
                                  ? "Locator was auto-healed successfully"
                                  : "Test completed with no errors")}
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Root>
                  </Box>

                  {/* Fix Prompts / Auto-heals */}
                  {report.fixPrompts.length > 0 && (
                    <Box>
                      <Text
                        fontSize="13px"
                        fontWeight="bold"
                        color="orange.500"
                        mb={2}
                      >
                        Prescribed Auto-Heal Actions
                      </Text>
                      <VStack align="stretch" gap={2}>
                        {report.fixPrompts.map((fix, idx) => (
                          <Box
                            key={idx}
                            bg="orange.500/5"
                            borderLeft="3px solid"
                            borderColor="orange.500"
                            p={2.5}
                            borderRadius="sm"
                            fontSize="13px"
                          >
                            <Text fontWeight="bold">{fix.test}</Text>
                            <Text
                              color={colors.subtext}
                              fontSize="11.5px"
                              mt={0.5}
                            >
                              Problem: {fix.problem}
                            </Text>
                            <Text
                              color="orange.600"
                              fontWeight="semibold"
                              fontSize="11.5px"
                              mt={0.5}
                            >
                              → Auto-heal fix: {fix.change}
                            </Text>
                          </Box>
                        ))}
                      </VStack>
                    </Box>
                  )}
                </VStack>
              ) : null}
            </VStack>
          </Box>

          {/* TAB: NARRATIVE (NON-TECH AUDIENCE) */}
          <Box display={activeDetailsTab === "narrative" ? "block" : "none"}>
            {report ? (
              <VStack align="stretch" gap={4}>
                {/* 2. Tested Flows & Spec Files Paired */}
                {report.generatedSpecs && report.generatedSpecs.length > 0 ? (
                  <Box position="relative">
                    <Flex justify="space-between" align="center" mb={4}>
                      <Heading
                        size="xs"
                        display="flex"
                        alignItems="center"
                        gap={2.5}
                        fontSize="14.5px"
                        fontWeight="bold"
                        letterSpacing="wide"
                        color={isDark ? "#ffffff" : "#1a1a1a"}
                      >
                        Tested User Flows & Spec Files Explorer
                      </Heading>
                      <Badge
                        variant="outline"
                        fontSize="10px"
                        fontWeight="bold"
                        letterSpacing="wider"
                        px={2.5}
                        py={0.5}
                        borderRadius="sm"
                        borderColor={isDark ? "#81c8be" : "#008b6b"}
                        color={isDark ? "#81c8be" : "#008b6b"}
                      >
                        IDE NAVIGATOR
                      </Badge>
                    </Flex>

                    <Grid
                      templateColumns={{ base: "1fr", md: "280px 1fr" }}
                      gap={4}
                      h={isMaximized ? "calc(100vh - 380px)" : "320px"}
                    >
                      {/* Left Navigation: Premium File Explorer */}
                      <Flex
                        direction="column"
                        border="1px solid"
                        borderColor={isDark ? "zinc.800" : "zinc.200"}
                        borderRadius="md"
                        bg={isDark ? "#232634" : "white"}
                        overflow="hidden"
                      >
                        {/* Search Input */}
                        <Box
                          px={2.5}
                          py={2}
                          borderBottom="1px solid"
                          borderColor={isDark ? "zinc.850" : "zinc.100"}
                        >
                          <input
                            placeholder="Filter spec files..."
                            value={specFilterText}
                            onChange={(e) => setSpecFilterText(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "6px 10px",
                              fontSize: "12px",
                              borderRadius: "4px",
                              border: `1px solid ${isDark ? "#414559" : "#d4d4d8"}`,
                              backgroundColor: isDark ? "#232634" : "#ffffff",
                              color: isDark ? "#ffffff" : "#18181b",
                              outline: "none",
                              transition: "all 0.2s ease-in-out",
                            }}
                          />
                        </Box>

                        {/* File Tree Explorer */}
                        <Box overflowY="auto" flex={1} p={2}>
                          {(() => {
                            const filteredSpecs = report.generatedSpecs.filter(
                              (spec) => {
                                const name =
                                  spec.file.split("/").pop() ?? spec.file;
                                return name
                                  .toLowerCase()
                                  .includes(specFilterText.toLowerCase());
                              },
                            );

                            return (
                              <VStack align="stretch" gap={0} fontSize="13px">
                                {/* Folder Row */}
                                <Flex
                                  align="center"
                                  gap={1.5}
                                  py={1.5}
                                  px={2}
                                  color={colors.text}
                                  fontWeight="bold"
                                  userSelect="none"
                                >
                                  <span
                                    style={{
                                      color: isDark ? "#81c8be" : "#008b6b",
                                      fontSize: "14px",
                                    }}
                                  >
                                    📂
                                  </span>
                                  <Text
                                    fontSize="13px"
                                    fontWeight="bold"
                                    color={isDark ? "zinc.200" : "zinc.800"}
                                    letterSpacing="wide"
                                  >
                                    tests
                                  </Text>
                                  <Badge
                                    variant="subtle"
                                    fontSize="10px"
                                    fontWeight="bold"
                                    bg={isDark ? "zinc.800" : "zinc.100"}
                                    color={isDark ? "zinc.300" : "zinc.700"}
                                    px={2}
                                    py={0.5}
                                    borderRadius="sm"
                                    ml="auto"
                                  >
                                    {filteredSpecs.length}
                                  </Badge>
                                </Flex>

                                {/* Nested Spec Files */}
                                <VStack
                                  align="stretch"
                                  gap={1}
                                  pl={4.5}
                                  borderLeft="1px dashed"
                                  borderColor={isDark ? "zinc.800" : "zinc.200"}
                                  ml={3}
                                  mt={0.5}
                                >
                                  {filteredSpecs.map((spec) => {
                                    const name =
                                      spec.file.split("/").pop() ?? spec.file;
                                    const flowId = name.replace(".spec.ts", "");
                                    const testResult = report.results?.find(
                                      (r) =>
                                        r.fileName === name ||
                                        r.flowId === flowId ||
                                        name.includes(r.flowId),
                                    );
                                    const isSelected =
                                      selectedSpecFile === spec.file;

                                    return (
                                      <Flex
                                        key={spec.file}
                                        as="button"
                                        w="full"
                                        py={1.5}
                                        px={2.5}
                                        borderRadius="sm"
                                        align="center"
                                        justify="space-between"
                                        textAlign="left"
                                        cursor="pointer"
                                        bg={
                                          isSelected
                                            ? isDark
                                              ? "rgba(129, 200, 190, 0.1)"
                                              : "rgba(0, 139, 107, 0.06)"
                                            : "transparent"
                                        }
                                        borderLeft="3px solid"
                                        borderLeftColor={
                                          isSelected
                                            ? isDark
                                              ? "#81c8be"
                                              : "#008b6b"
                                            : "transparent"
                                        }
                                        transition="all 0.15s ease"
                                        _hover={{
                                          bg: isSelected
                                            ? isDark
                                              ? "rgba(129, 200, 190, 0.15)"
                                              : "rgba(0, 139, 107, 0.1)"
                                            : isDark
                                              ? "rgba(255, 255, 255, 0.05)"
                                              : "rgba(0, 0, 0, 0.03)",
                                        }}
                                        onClick={() =>
                                          setSelectedSpecFile(spec.file)
                                        }
                                      >
                                        <HStack
                                          gap={2}
                                          flex={1}
                                          overflow="hidden"
                                        >
                                          <span
                                            style={{
                                              color: isSelected
                                                ? isDark
                                                  ? "#81c8be"
                                                  : "#008b6b"
                                                : "zinc.500",
                                              fontSize: "13px",
                                              flexShrink: 0,
                                            }}
                                          >
                                            📄
                                          </span>
                                          <Text
                                            fontSize="12.5px"
                                            fontFamily="mono"
                                            fontWeight={
                                              isSelected ? "bold" : "medium"
                                            }
                                            color={
                                              isSelected
                                                ? isDark
                                                  ? "#ffffff"
                                                  : "#111827"
                                                : isDark
                                                  ? "#949cbb"
                                                  : "#4b5563"
                                            }
                                            whiteSpace="nowrap"
                                            textOverflow="ellipsis"
                                            overflow="hidden"
                                            display="block"
                                            w="100%"
                                          >
                                            {name}
                                          </Text>
                                        </HStack>
                                      </Flex>
                                    );
                                  })}
                                </VStack>
                              </VStack>
                            );
                          })()}
                        </Box>
                      </Flex>

                      {/* Right Details Panel */}
                      {(() => {
                        const spec =
                          report.generatedSpecs.find(
                            (s) => s.file === selectedSpecFile,
                          ) || report.generatedSpecs[0];
                        if (!spec)
                          return (
                            <Flex
                              align="center"
                              justify="center"
                              h="100%"
                              border="1px solid"
                              borderColor={colors.border}
                              borderRadius="sm"
                            >
                              <Text fontSize="13px" color={colors.subtext}>
                                Select a user flow to view details.
                              </Text>
                            </Flex>
                          );

                        const name = spec.file.split("/").pop() ?? spec.file;
                        const flowId = name.replace(".spec.ts", "");
                        const testResult = report.results?.find(
                          (r) =>
                            r.fileName === name ||
                            r.flowId === flowId ||
                            name.includes(r.flowId),
                        );
                        const matchedFlow = report.flows?.find(
                          (f) =>
                            f.id === flowId ||
                            flowId.includes(f.id) ||
                            f.id.includes(flowId) ||
                            (testResult && f.id === testResult.flowId),
                        );
                        const pairedNarrative = findNarrativeForSpec(
                          name,
                          report.summary || [],
                        );
                        const steps = matchedFlow?.steps?.length
                          ? matchedFlow.steps
                          : FLOW_MOCK_DETAILS[name]?.steps || [];

                        return (
                          <Box
                            display="flex"
                            flexDirection="column"
                            h="100%"
                            overflow="hidden"
                            border="1px solid"
                            borderColor={isDark ? "zinc.800" : "zinc.200"}
                            borderRadius="md"
                            bg={isDark ? "#232634" : "white"}
                            boxShadow={
                              isDark ? "0 4px 20px rgba(0,0,0,0.3)" : "sm"
                            }
                          >
                            {/* Editor Tab Bar */}
                            <Flex
                              bg={isDark ? "#232634" : "#f8fafc"}
                              borderBottom="1px solid"
                              borderColor={isDark ? "zinc.800" : "zinc.200"}
                              align="center"
                              justify="space-between"
                              px={3}
                              py={1}
                            >
                              <HStack gap={1}>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  h="28px"
                                  px={4}
                                  borderRadius="sm"
                                  fontSize="12px"
                                  fontWeight="bold"
                                  color={
                                    rightPaneTab === "narrative"
                                      ? isDark
                                        ? "#ffffff"
                                        : "#1a1a1a"
                                      : isDark
                                        ? "zinc.400"
                                        : "zinc.500"
                                  }
                                  bg={
                                    rightPaneTab === "narrative"
                                      ? isDark
                                        ? "#232634"
                                        : "white"
                                      : "transparent"
                                  }
                                  borderBottom={
                                    rightPaneTab === "narrative"
                                      ? `2px solid ${isDark ? "#81c8be" : "#008b6b"}`
                                      : "none"
                                  }
                                  _hover={{
                                    bg: isDark ? "#292c3c" : "zinc.100",
                                  }}
                                  cursor="pointer"
                                  onClick={() => setRightPaneTab("narrative")}
                                  display="flex"
                                  alignItems="center"
                                  gap={1.5}
                                  transition="all 0.2s"
                                >
                                  Narrative & Steps
                                </Button>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  h="28px"
                                  px={4}
                                  borderRadius="sm"
                                  fontSize="12px"
                                  fontWeight="bold"
                                  color={
                                    rightPaneTab === "code"
                                      ? isDark
                                        ? "#ffffff"
                                        : "#1a1a1a"
                                      : isDark
                                        ? "zinc.400"
                                        : "zinc.500"
                                  }
                                  bg={
                                    rightPaneTab === "code"
                                      ? isDark
                                        ? "#232634"
                                        : "white"
                                      : "transparent"
                                  }
                                  borderBottom={
                                    rightPaneTab === "code"
                                      ? `2px solid ${isDark ? "#81c8be" : "#008b6b"}`
                                      : "none"
                                  }
                                  _hover={{
                                    bg: isDark ? "#292c3c" : "zinc.100",
                                  }}
                                  cursor="pointer"
                                  onClick={() => setRightPaneTab("code")}
                                  display="flex"
                                  alignItems="center"
                                  gap={1.5}
                                  transition="all 0.2s"
                                >
                                  Playwright Spec Code
                                </Button>
                              </HStack>

                              <HStack gap={2}>
                                <Text
                                  fontSize="12px"
                                  color={isDark ? "zinc.400" : "zinc.600"}
                                  fontFamily="mono"
                                  fontWeight="semibold"
                                  display={{ base: "none", sm: "block" }}
                                >
                                  {name}
                                </Text>
                                {testResult && (
                                  <Badge
                                    colorPalette={
                                      OUTCOME_COLOR[testResult.outcome]
                                    }
                                    variant="solid"
                                    fontSize="10px"
                                    fontWeight="bold"
                                    borderRadius="sm"
                                    px={2.5}
                                    py={0.5}
                                  >
                                    {testResult.outcome.toUpperCase()}
                                  </Badge>
                                )}
                              </HStack>
                            </Flex>

                            {/* Tab Content Panel */}
                            <Box flex={1} overflowY="auto" p={4}>
                              {rightPaneTab === "narrative" ? (
                                <VStack align="stretch" gap={4}>
                                  {/* Flow Metadata Cards Grid */}
                                  <Box
                                    border="1px solid"
                                    borderColor={isDark ? "#414559" : "#e4e4e7"}
                                    borderRadius="sm"
                                    p={3}
                                    bg="transparent"
                                  >
                                    <Grid
                                      templateColumns={{
                                        base: "1fr",
                                        sm: "repeat(2, 1fr)",
                                      }}
                                      gap={3}
                                      fontSize="12px"
                                    >
                                      <HStack align="flex-start" gap={2}>
                                        <Text
                                          color={
                                            isDark ? "zinc.400" : "zinc.500"
                                          }
                                          fontWeight="semibold"
                                          w="85px"
                                          flexShrink={0}
                                        >
                                          Flow Name:
                                        </Text>
                                        <Text
                                          fontWeight="bold"
                                          color={isDark ? "#ffffff" : "#1a1a1a"}
                                        >
                                          {matchedFlow?.name ||
                                            flowId
                                              .replace(/-/g, " ")
                                              .replace(/\b\w/g, (c) =>
                                                c.toUpperCase(),
                                              )}
                                        </Text>
                                      </HStack>
                                      <HStack align="flex-start" gap={2}>
                                        <Text
                                          color={
                                            isDark ? "zinc.400" : "zinc.500"
                                          }
                                          fontWeight="semibold"
                                          w="85px"
                                          flexShrink={0}
                                        >
                                          Spec File:
                                        </Text>
                                        <Text
                                          fontWeight="medium"
                                          fontFamily="mono"
                                          color={
                                            isDark ? "zinc.300" : "zinc.700"
                                          }
                                          style={{ wordBreak: "break-all" }}
                                        >
                                          {spec.file}
                                        </Text>
                                      </HStack>
                                      <HStack align="flex-start" gap={2}>
                                        <Text
                                          color={
                                            isDark ? "zinc.400" : "zinc.500"
                                          }
                                          fontWeight="semibold"
                                          w="85px"
                                          flexShrink={0}
                                        >
                                          Outcome:
                                        </Text>
                                        {testResult ? (
                                          <Badge
                                            colorPalette={
                                              OUTCOME_COLOR[testResult.outcome]
                                            }
                                            variant="solid"
                                            fontSize="9.5px"
                                            fontWeight="bold"
                                            borderRadius="sm"
                                            px={2}
                                          >
                                            {testResult.outcome.toUpperCase()}
                                          </Badge>
                                        ) : (
                                          <Badge
                                            colorPalette="gray"
                                            variant="solid"
                                            fontSize="9.5px"
                                            borderRadius="sm"
                                            px={2}
                                          >
                                            PENDING
                                          </Badge>
                                        )}
                                      </HStack>
                                      <HStack align="flex-start" gap={2}>
                                        <Text
                                          color={
                                            isDark ? "zinc.400" : "zinc.500"
                                          }
                                          fontWeight="semibold"
                                          w="85px"
                                          flexShrink={0}
                                        >
                                          Steps Count:
                                        </Text>
                                        <Text
                                          fontWeight="bold"
                                          color={
                                            isDark ? "zinc.200" : "zinc.750"
                                          }
                                        >
                                          {steps.length} actions
                                        </Text>
                                      </HStack>
                                    </Grid>
                                  </Box>

                                  {/* Narrative Block */}
                                  {pairedNarrative && (
                                    <Box
                                      bg={
                                        isDark
                                          ? "rgba(129, 200, 190, 0.03)"
                                          : "rgba(0, 139, 107, 0.015)"
                                      }
                                      border="1px solid"
                                      borderColor={
                                        isDark ? "#414559" : "#e4e4e7"
                                      }
                                      p={4}
                                      borderRadius="sm"
                                    >
                                      <Flex gap={2.5} align="flex-start">
                                        <VStack align="stretch" gap={1}>
                                          <Text
                                            fontSize="13px"
                                            fontWeight="bold"
                                            color={
                                              isDark ? "zinc.200" : "zinc.800"
                                            }
                                            letterSpacing="wide"
                                          >
                                            User Flow Narrative (What was
                                            verified)
                                          </Text>
                                          <Text
                                            fontSize="12.5px"
                                            color={
                                              isDark ? "zinc.300" : "zinc.700"
                                            }
                                            lineHeight={1.5}
                                          >
                                            {pairedNarrative}
                                          </Text>
                                        </VStack>
                                      </Flex>
                                    </Box>
                                  )}

                                  {/* Steps Visual List */}
                                  {steps && steps.length > 0 && (
                                    <Box>
                                      <Text
                                        fontSize="13px"
                                        fontWeight="bold"
                                        mb={3}
                                        color={isDark ? "zinc.300" : "zinc.700"}
                                        letterSpacing="wide"
                                      >
                                        Action Timeline Steps (How it was
                                        tested)
                                      </Text>
                                      <Box
                                        border="1px solid"
                                        borderColor={
                                          isDark ? "#414559" : "#e4e4e7"
                                        }
                                        borderRadius="sm"
                                        bg="transparent"
                                        overflow="hidden"
                                      >
                                        {steps.map((step, idx) => {
                                          let stepIcon = (
                                            <Box
                                              w="14px"
                                              h="14px"
                                              borderRadius="full"
                                              border="2px solid"
                                              borderColor="gray.400"
                                              flexShrink={0}
                                              mt={0.5}
                                            />
                                          );
                                          if (
                                            testResult?.outcome === "passed"
                                          ) {
                                            stepIcon = (
                                              <CircleCheck
                                                size={15}
                                                color="#a6d189"
                                                style={{
                                                  flexShrink: 0,
                                                  marginTop: "2px",
                                                  filter: isDark
                                                    ? "drop-shadow(0 0 4px rgba(166,209,137,0.3))"
                                                    : "none",
                                                }}
                                              />
                                            );
                                          } else if (
                                            testResult?.outcome === "failed" &&
                                            idx === steps.length - 1
                                          ) {
                                            stepIcon = (
                                              <CircleX
                                                size={15}
                                                color="#e78284"
                                                style={{
                                                  flexShrink: 0,
                                                  marginTop: "2px",
                                                  filter: isDark
                                                    ? "drop-shadow(0 0 4px rgba(231,130,132,0.3))"
                                                    : "none",
                                                }}
                                              />
                                            );
                                          } else if (
                                            testResult?.outcome === "failed"
                                          ) {
                                            stepIcon = (
                                              <CircleCheck
                                                size={15}
                                                color="#a6d189"
                                                style={{
                                                  flexShrink: 0,
                                                  marginTop: "2px",
                                                }}
                                              />
                                            );
                                          }

                                          return (
                                            <HStack
                                              key={idx}
                                              align="flex-start"
                                              gap={3}
                                              p={3}
                                              borderBottom={
                                                idx < steps.length - 1
                                                  ? "1px solid"
                                                  : "none"
                                              }
                                              borderColor={
                                                isDark ? "#414559" : "#e4e4e7"
                                              }
                                              _hover={{
                                                bg: isDark
                                                  ? "#292c3c"
                                                  : "zinc.100",
                                              }}
                                              transition="background 0.2s"
                                            >
                                              <Badge
                                                variant="subtle"
                                                bg={
                                                  isDark
                                                    ? "zinc.800"
                                                    : "zinc.100"
                                                }
                                                color={
                                                  isDark
                                                    ? "zinc.400"
                                                    : "zinc.600"
                                                }
                                                fontSize="10px"
                                                fontWeight="bold"
                                                px={2}
                                                py={0.5}
                                                borderRadius="xs"
                                                flexShrink={0}
                                              >
                                                Step {idx + 1}
                                              </Badge>
                                              {stepIcon}
                                              <Text
                                                fontSize="12.5px"
                                                color={
                                                  isDark
                                                    ? "zinc.200"
                                                    : "zinc.800"
                                                }
                                                lineHeight={1.4}
                                              >
                                                {step}
                                              </Text>
                                            </HStack>
                                          );
                                        })}
                                      </Box>
                                    </Box>
                                  )}
                                </VStack>
                              ) : (
                                <Box h="100%" overflow="hidden">
                                  <AWSCodeViewer
                                    filename={name}
                                    code={spec.code}
                                    isMaximized={isMaximized}
                                    copiedFile={copiedFile}
                                    onCopy={handleCopyCode}
                                  />
                                </Box>
                              )}
                            </Box>
                          </Box>
                        );
                      })()}
                    </Grid>
                  </Box>
                ) : (
                  report.flows &&
                  report.flows.length > 0 && (
                    <Box
                      border="1px solid"
                      borderColor={colors.border}
                      p={4}
                      borderRadius="md"
                      bg={isDark ? "white/3" : "gray.50/30"}
                    >
                      <Heading size="xs" color={colors.text} mb={3}>
                        📋 Detailed Test Scenarios & Steps
                      </Heading>
                      <VStack align="stretch" gap={3}>
                        {report.flows.map((flow) => (
                          <Box
                            key={flow.id}
                            bg={isDark ? "white/3" : "white"}
                            p={3}
                            borderRadius="sm"
                            borderLeft="3px solid"
                            borderColor={AWS_COLORS.orange.main}
                          >
                            <Text
                              fontSize="13px"
                              fontWeight="bold"
                              color={colors.text}
                            >
                              {flow.name || flow.id} (Check ID:{" "}
                              <code style={{ fontSize: "12px" }}>
                                {flow.id}
                              </code>
                              )
                            </Text>
                            <VStack align="stretch" gap={1.5} mt={2.5} pl={3}>
                              {(flow.steps ?? []).map((step, idx) => (
                                <Text
                                  key={idx}
                                  fontSize="13px"
                                  color={colors.subtext}
                                  lineHeight={1.4}
                                >
                                  {idx + 1}. {step}
                                </Text>
                              ))}
                            </VStack>
                          </Box>
                        ))}
                      </VStack>
                    </Box>
                  )
                )}

                {/* 3. Observations & Recommendations */}
                <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
                  <Box
                    bg={isDark ? "white/5" : "gray.50"}
                    p={4}
                    borderRadius="md"
                    border="1px solid"
                    borderColor={colors.border}
                  >
                    <Heading
                      size="xs"
                      color={isDark ? "red.400" : "red.600"}
                      mb={3}
                      display="flex"
                      alignItems="center"
                      gap={2}
                    >
                      Observations
                    </Heading>
                    {report.issues && report.issues.length > 0 ? (
                      <VStack align="stretch" gap={2} pl={2}>
                        {report.issues.map((issue, idx) => (
                          <Text
                            key={idx}
                            fontSize="13px"
                            color={colors.text}
                            lineHeight={1.5}
                          >
                            • {issue}
                          </Text>
                        ))}
                      </VStack>
                    ) : (
                      <Text
                        fontSize="13px"
                        color={colors.subtext}
                        fontStyle="italic"
                      >
                        No issues detected.
                      </Text>
                    )}
                  </Box>

                  <Box
                    bg={isDark ? "white/5" : "gray.50"}
                    p={4}
                    borderRadius="md"
                    border="1px solid"
                    borderColor={colors.border}
                  >
                    <Heading
                      size="xs"
                      color={isDark ? "#e5c890" : "#805e02"}
                      mb={3}
                      display="flex"
                      alignItems="center"
                      gap={2}
                    >
                      Recommendations
                    </Heading>
                    {report.recommendations &&
                    report.recommendations.length > 0 ? (
                      <VStack align="stretch" gap={2} pl={2}>
                        {report.recommendations.map((rec, idx) => (
                          <Text
                            key={idx}
                            fontSize="13px"
                            color={colors.text}
                            lineHeight={1.5}
                          >
                            • {rec}
                          </Text>
                        ))}
                      </VStack>
                    ) : (
                      <Text
                        fontSize="13px"
                        color={colors.subtext}
                        fontStyle="italic"
                      >
                        No recommendations at this time.
                      </Text>
                    )}
                  </Box>
                </Grid>
              </VStack>
            ) : (
              <Flex
                align="center"
                justify="center"
                h="150px"
                direction="column"
                gap={3}
              >
                {run.status === "running" ? (
                  <>
                    <Spinner size="md" color={AWS_COLORS.orange.main} />
                    <Text fontSize="13px" color={colors.subtext}>
                      Agent pipeline is in progress. The narrative summary will
                      be available once reporting is complete.
                    </Text>
                  </>
                ) : (
                  <Text
                    fontSize="13px"
                    color={colors.subtext}
                    fontStyle="italic"
                  >
                    No narrative available (Run stopped or failed before
                    reporting completed).
                  </Text>
                )}
              </Flex>
            )}
          </Box>

          {/* TAB 3: MONITORING */}
          <Box display={activeDetailsTab === "monitoring" ? "block" : "none"}>
            <Box
              display="grid"
              gridTemplateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }}
              gap={4}
              fontSize="13px"
            >
              <Box
                bg={colors.cardBg}
                border="1px solid"
                borderColor={colors.border}
                p={3.5}
                borderRadius="sm"
              >
                <Text color={colors.subtext} fontWeight="semibold" mb={1}>
                  SUCCESS RATE
                </Text>
                <Text
                  fontSize="24px"
                  fontWeight="black"
                  color={report ? "green.500" : colors.subtext}
                >
                  {report
                    ? `${Math.round(report.successRate.rate * 100)}%`
                    : "N/A"}
                </Text>
                <Text fontSize="12px" color={colors.subtext} mt={1}>
                  Passed tests / planned tests
                </Text>
              </Box>

              <Box
                bg={colors.cardBg}
                border="1px solid"
                borderColor={colors.border}
                p={3.5}
                borderRadius="sm"
              >
                <Text color={colors.subtext} fontWeight="semibold" mb={1}>
                  AUTO-HEAL SUCCESS
                </Text>
                <Text fontSize="24px" fontWeight="black" color="blue.500">
                  {report
                    ? `${Math.round(report.healSuccessRate * 100)}%`
                    : "N/A"}
                </Text>
                <Text fontSize="12px" color={colors.subtext} mt={1}>
                  Failed locators healed by LLM
                </Text>
              </Box>
            </Box>
          </Box>

          {/* TAB 4: CONSOLE LOGS */}
          <Box display={activeDetailsTab === "logs" ? "block" : "none"}>
            {(() => {
              const timeline = buildTimeline(events, run.status, run.updatedAt);
              const search = logSearch.trim().toLowerCase();
              const isFiltering =
                search !== "" || logLevelFilter.size < LOG_LEVEL_ORDER.length;

              const matches = (l: ParsedLogLine) =>
                logLevelFilter.has(l.level) &&
                (search === "" ||
                  l.text.toLowerCase().includes(search) ||
                  (l.agent ?? "").toLowerCase().includes(search) ||
                  l.stage.toLowerCase().includes(search));

              // Which levels actually occur — only show those filter chips.
              const presentLevels = new Set<LogLevel>();
              for (const g of timeline)
                for (const l of g.lines) presentLevels.add(l.level);

              const visibleMatchCount = timeline.reduce(
                (n, g) => n + g.lines.filter(matches).length,
                0,
              );

              const setAllCollapsed = (collapsed: boolean) =>
                setCollapsedLogGroups(
                  Object.fromEntries(timeline.map((g) => [g.id, collapsed])),
                );

              const STATUS_DOT: Record<TimelineGroup["status"], string> = {
                pending: "#51576d",
                active: "#a6d189",
                completed: "#8caaee",
                failed: "#e78284",
              };

              return (
                <VStack align="stretch" gap={4}>
                  {/* Toolbar */}
                  <Flex
                    direction={{ base: "column", lg: "row" }}
                    justify="space-between"
                    align={{ base: "stretch", lg: "center" }}
                    gap={3}
                  >
                    <HStack gap={2.5} flexWrap="wrap">
                      <HStack gap={2}>
                        <Box
                          w="7px"
                          h="7px"
                          borderRadius="full"
                          bg={
                            run.status === "running" ? "green.500" : "slate.500"
                          }
                          className={
                            run.status === "running" ? "animate-pulse" : ""
                          }
                        />
                        <Text
                          fontSize="12px"
                          color={colors.subtext}
                          fontFamily="mono"
                          fontWeight="bold"
                        >
                          {run.status === "running"
                            ? "STREAMING"
                            : "STREAM CLOSED"}
                        </Text>
                      </HStack>
                      <Badge
                        variant="subtle"
                        fontSize="10px"
                        bg={isDark ? "white/5" : "gray.100"}
                        color={colors.subtext}
                        borderRadius="sm"
                        px={2}
                      >
                        {events.length} events
                        {isFiltering ? ` · ${visibleMatchCount} shown` : ""}
                      </Badge>
                    </HStack>

                    <HStack gap={2} flexWrap="wrap">
                      {/* Search */}
                      <Flex
                        align="center"
                        gap={1.5}
                        px={2.5}
                        h="28px"
                        borderRadius="sm"
                        border="1px solid"
                        borderColor={colors.border}
                        bg={isDark ? "#232634" : "white"}
                      >
                        <Search size={12} color={colors.subtext} />
                        <input
                          placeholder="Search logs…"
                          value={logSearch}
                          onChange={(e) => setLogSearch(e.target.value)}
                          style={{
                            width: "150px",
                            fontSize: "12px",
                            border: "none",
                            outline: "none",
                            background: "transparent",
                            color: isDark ? "#c6d0f5" : "#1a1a1a",
                          }}
                        />
                      </Flex>

                      <IconButton
                        aria-label={
                          logAutoScroll ? "Auto-scroll on" : "Auto-scroll off"
                        }
                        title="Toggle auto-scroll to newest"
                        size="xs"
                        variant={logAutoScroll ? "solid" : "outline"}
                        borderColor={colors.border}
                        bg={
                          logAutoScroll ? AWS_COLORS.orange.main : "transparent"
                        }
                        color={logAutoScroll ? "white" : colors.subtext}
                        cursor="pointer"
                        onClick={() => setLogAutoScroll((v) => !v)}
                      >
                        <ArrowDownToLine size={13} />
                      </IconButton>
                      <IconButton
                        aria-label="Expand all stages"
                        title="Expand all stages"
                        size="xs"
                        variant="outline"
                        borderColor={colors.border}
                        color={colors.subtext}
                        cursor="pointer"
                        onClick={() => setAllCollapsed(false)}
                      >
                        <ChevronsUpDown size={13} />
                      </IconButton>
                      <IconButton
                        aria-label="Collapse all stages"
                        title="Collapse all stages"
                        size="xs"
                        variant="outline"
                        borderColor={colors.border}
                        color={colors.subtext}
                        cursor="pointer"
                        onClick={() => setAllCollapsed(true)}
                      >
                        <ChevronsDownUp size={13} />
                      </IconButton>
                      <Button
                        size="xs"
                        variant="outline"
                        borderColor={colors.border}
                        color={colors.text}
                        cursor="pointer"
                        fontSize="11.5px"
                        onClick={handleCopyLogs}
                      >
                        <Copy size={11} /> {copiedLogs ? "Copied!" : "Copy"}
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        borderColor={colors.border}
                        color={colors.text}
                        cursor="pointer"
                        fontSize="11.5px"
                        onClick={handleDownloadLogs}
                      >
                        <Download size={11} /> Export
                      </Button>
                    </HStack>
                  </Flex>

                  {/* Level filter chips */}
                  {presentLevels.size > 0 && (
                    <HStack gap={1.5} flexWrap="wrap">
                      <ListFilter size={12} color={colors.subtext} />
                      {LOG_LEVEL_ORDER.filter((lvl) =>
                        presentLevels.has(lvl),
                      ).map((lvl) => {
                        const meta = LOG_LEVEL_META[lvl];
                        const on = logLevelFilter.has(lvl);
                        return (
                          <Box
                            key={lvl}
                            as="button"
                            onClick={() => toggleLogLevel(lvl)}
                            px={2}
                            py={0.5}
                            borderRadius="full"
                            border="1px solid"
                            borderColor={on ? meta.color : colors.border}
                            bg={on ? `${meta.color}1A` : "transparent"}
                            color={on ? meta.color : colors.subtext}
                            opacity={on ? 1 : 0.55}
                            cursor="pointer"
                            fontSize="10.5px"
                            fontWeight="bold"
                            display="flex"
                            alignItems="center"
                            gap={1}
                            transition="all 0.15s"
                          >
                            <span>{meta.glyph}</span>
                            {meta.label}
                          </Box>
                        );
                      })}
                    </HStack>
                  )}

                  {/* Execution timeline (terminal panel) */}
                  <Box
                    ref={logContainerRef}
                    bg={isDark ? "#11111b" : "#1e1e2e"}
                    borderRadius="md"
                    fontFamily="mono"
                    fontSize="12.5px"
                    minH="240px"
                    maxH={isMaximized ? "calc(100vh - 320px)" : "560px"}
                    overflowY="auto"
                    border="1px solid"
                    borderColor={isDark ? "#313244" : "#45475a"}
                    boxShadow="inset 0 2px 8px rgba(0,0,0,0.6)"
                    css={{
                      "&::-webkit-scrollbar": { width: "8px" },
                      "&::-webkit-scrollbar-thumb": {
                        background: "#45475a",
                        borderRadius: "4px",
                      },
                    }}
                  >
                    {events.length === 0 ? (
                      <Text color="#6c7086" fontStyle="italic" p={4}>
                        Waiting for system console log messages…
                      </Text>
                    ) : (
                      timeline.map((group) => {
                        const visibleLines = group.lines.filter(matches);
                        // Hide pending skeletons while filtering; hide emptied
                        // groups unless they're the live one.
                        if (group.lines.length === 0 && isFiltering)
                          return null;
                        if (
                          isFiltering &&
                          visibleLines.length === 0 &&
                          group.status !== "active"
                        )
                          return null;

                        const cleanCompleted =
                          group.status === "completed" &&
                          !group.counts.error &&
                          !group.counts.warn;
                        const collapsed =
                          collapsedLogGroups[group.id] ??
                          (cleanCompleted && group.lines.length > 0);
                        const linesToRender = isFiltering
                          ? visibleLines
                          : group.lines;

                        return (
                          <Box key={group.id}>
                            {/* Stage header */}
                            <Flex
                              as="button"
                              w="100%"
                              align="center"
                              gap={2.5}
                              px={3}
                              py={2}
                              textAlign="left"
                              cursor={
                                group.lines.length > 0 ? "pointer" : "default"
                              }
                              bg={isDark ? "#181825" : "#181825"}
                              borderTop="1px solid"
                              borderColor={isDark ? "#313244" : "#313244"}
                              _hover={
                                group.lines.length > 0
                                  ? { bg: "#1e1e2e" }
                                  : undefined
                              }
                              onClick={() =>
                                group.lines.length > 0 &&
                                setCollapsedLogGroups((p) => ({
                                  ...p,
                                  [group.id]: !collapsed,
                                }))
                              }
                              position="sticky"
                              top={0}
                              zIndex={1}
                            >
                              {group.lines.length > 0 ? (
                                collapsed ? (
                                  <ChevronRight size={13} color="#6c7086" />
                                ) : (
                                  <ChevronDown size={13} color="#6c7086" />
                                )
                              ) : (
                                <Box w="13px" />
                              )}
                              <Flex
                                align="center"
                                justify="center"
                                w="18px"
                                h="18px"
                                borderRadius="full"
                                bg={`${STATUS_DOT[group.status]}22`}
                                color={STATUS_DOT[group.status]}
                                fontSize="10px"
                                fontWeight="bold"
                                flexShrink={0}
                              >
                                {group.ordinal}
                              </Flex>
                              <Text
                                color="#cdd6f4"
                                fontWeight="bold"
                                fontSize="12.5px"
                              >
                                {group.label}
                              </Text>
                              {group.status === "active" && (
                                <Box
                                  w="6px"
                                  h="6px"
                                  borderRadius="full"
                                  bg="#a6d189"
                                  className="animate-pulse"
                                />
                              )}
                              {/* Count chips */}
                              <HStack gap={1.5} ml={1}>
                                {(["error", "warn", "heal"] as LogLevel[])
                                  .filter((lvl) => group.counts[lvl])
                                  .map((lvl) => (
                                    <Text
                                      key={lvl}
                                      fontSize="10px"
                                      color={LOG_LEVEL_META[lvl].color}
                                      fontWeight="bold"
                                    >
                                      {LOG_LEVEL_META[lvl].glyph}
                                      {group.counts[lvl]}
                                    </Text>
                                  ))}
                              </HStack>
                              <HStack gap={3} ml="auto" flexShrink={0}>
                                <Text fontSize="10.5px" color="#6c7086">
                                  {group.lines.length} log
                                  {group.lines.length === 1 ? "" : "s"}
                                </Text>
                                <Text
                                  fontSize="10.5px"
                                  color="#9399b2"
                                  fontFamily="mono"
                                  minW="42px"
                                  textAlign="right"
                                >
                                  {group.status === "active"
                                    ? "live"
                                    : formatDur(group.durationMs)}
                                </Text>
                              </HStack>
                            </Flex>

                            {/* Stage log lines */}
                            {!collapsed &&
                              linesToRender.map((l, i) => {
                                const meta = LOG_LEVEL_META[l.level];
                                const loud =
                                  l.level === "error" || l.level === "warn";
                                return (
                                  <Flex
                                    key={i}
                                    align="flex-start"
                                    gap={2}
                                    pl={9}
                                    pr={3}
                                    py={0.5}
                                    lineHeight={1.55}
                                    _hover={{ bg: "#1e1e2e" }}
                                  >
                                    <Text
                                      color="#585b70"
                                      flexShrink={0}
                                      userSelect="none"
                                      fontSize="11px"
                                      mt="1px"
                                    >
                                      {formatClock(l.at)}
                                    </Text>
                                    <Text
                                      flexShrink={0}
                                      userSelect="none"
                                      w="14px"
                                      textAlign="center"
                                      color={meta.color}
                                    >
                                      {meta.glyph}
                                    </Text>
                                    {l.agent && (
                                      <Text
                                        flexShrink={0}
                                        color="#7f849c"
                                        userSelect="none"
                                      >
                                        {l.agent}
                                      </Text>
                                    )}
                                    <Text
                                      color={loud ? meta.color : "#bac2de"}
                                      fontWeight={loud ? "bold" : "normal"}
                                      wordBreak="break-word"
                                      whiteSpace="pre-wrap"
                                    >
                                      {l.text}
                                    </Text>
                                  </Flex>
                                );
                              })}
                          </Box>
                        );
                      })
                    )}
                  </Box>
                </VStack>
              );
            })()}
          </Box>

          {/* TAB 5: TEST PLAN & SPECS CODE */}
          <Box display={activeDetailsTab === "code" ? "block" : "none"}>
            {report ? (
              <VStack align="stretch" gap={4}>
                {/* AI Plan Section */}
                {report.planMarkdown && (
                  <Box
                    border="1px solid"
                    borderColor={colors.border}
                    borderRadius="sm"
                    overflow="hidden"
                  >
                    <Flex
                      as="button"
                      w="full"
                      align="center"
                      justify="space-between"
                      px={3}
                      py={2}
                      bg={isDark ? "white/5" : "gray.100"}
                      cursor="pointer"
                      onClick={() => setShowPlan(!showPlan)}
                    >
                      <HStack gap={2}>
                        <Code2
                          size={13}
                          style={{ color: AWS_COLORS.orange.main }}
                        />
                        <Text fontSize="13px" fontWeight="bold">
                          AI Spec Test Plan
                        </Text>
                      </HStack>
                      {showPlan ? (
                        <ChevronUp size={13} />
                      ) : (
                        <ChevronDown size={13} />
                      )}
                    </Flex>
                    {showPlan && (
                      <Box
                        as="pre"
                        p={3}
                        bg="black"
                        color="white"
                        fontFamily="mono"
                        fontSize="13px"
                        maxH={isMaximized ? "600px" : "300px"}
                        overflowY="auto"
                        whiteSpace="pre-wrap"
                      >
                        {report.planMarkdown}
                      </Box>
                    )}
                  </Box>
                )}

                {/* Generated Spec Files Tree */}
                <Box>
                  <Text
                    fontSize="13px"
                    fontWeight="bold"
                    color={colors.subtext}
                    mb={2}
                  >
                    Generated Spec Files ({report.generatedSpecs.length})
                  </Text>

                  {report.generatedSpecs.length === 0 ? (
                    <Text
                      fontSize="13px"
                      color={colors.subtext}
                      fontStyle="italic"
                    >
                      No spec files generated.
                    </Text>
                  ) : (
                    <VStack align="stretch" gap={2}>
                      {report.generatedSpecs.map((spec) => {
                        const isOpen = !!openSpecs[spec.file];
                        const name = spec.file.split("/").pop() ?? spec.file;
                        const flowId = name.replace(".spec.ts", "");
                        const testResult = report.results?.find(
                          (r) =>
                            r.fileName === name ||
                            r.flowId === flowId ||
                            name.includes(r.flowId),
                        );
                        const matchedFlow = report.flows?.find(
                          (f) =>
                            f.id === flowId ||
                            flowId.includes(f.id) ||
                            f.id.includes(flowId) ||
                            (testResult && f.id === testResult.flowId),
                        );

                        const parsedScenarios = parseMarkdownPlan(
                          report.planMarkdown,
                        );
                        const matchedScenario = findPlanScenarioForSpec(
                          name,
                          parsedScenarios,
                        );

                        let pairedNarrative = report.summary
                          ? findNarrativeForSpec(name, report.summary)
                          : undefined;
                        if (!pairedNarrative && matchedScenario) {
                          pairedNarrative = `Verifies the functional flow for "${matchedScenario.title}". This test automates user interaction steps to validate correct rendering, controls alignment, and interface response.`;
                        }
                        if (!pairedNarrative) {
                          pairedNarrative = `Automated validation flow verifying ${name.replace(".spec.ts", "").replace(/[-_]/g, " ")}.`;
                        }

                        let steps = matchedFlow?.steps?.length
                          ? matchedFlow.steps
                          : null;
                        if (!steps || steps.length === 0) {
                          steps = matchedScenario?.steps?.length
                            ? matchedScenario.steps
                            : null;
                        }
                        if (!steps || steps.length === 0) {
                          steps = FLOW_MOCK_DETAILS[name]?.steps || [];
                        }

                        return (
                          <Box
                            key={spec.file}
                            border="1px solid"
                            borderColor={colors.border}
                            borderRadius="sm"
                            overflow="hidden"
                          >
                            <Flex
                              as="button"
                              w="full"
                              align="center"
                              justify="space-between"
                              px={3}
                              py={2}
                              bg={
                                isOpen
                                  ? isDark
                                    ? "white/5"
                                    : "gray.100"
                                  : "transparent"
                              }
                              cursor="pointer"
                              onClick={() =>
                                setOpenSpecs((prev) => ({
                                  ...prev,
                                  [spec.file]: !prev[spec.file],
                                }))
                              }
                            >
                              <HStack gap={3}>
                                <Code2
                                  size={13}
                                  style={{ color: AWS_COLORS.orange.main }}
                                />
                                <Text
                                  fontSize="13px"
                                  fontWeight="bold"
                                  fontFamily="mono"
                                >
                                  {name}
                                </Text>
                                {matchedFlow && (
                                  <Text
                                    fontSize="12px"
                                    color={colors.subtext}
                                    fontWeight="medium"
                                  >
                                    — {matchedFlow.name}
                                  </Text>
                                )}
                              </HStack>
                              {isOpen ? (
                                <ChevronUp size={13} />
                              ) : (
                                <ChevronDown size={13} />
                              )}
                            </Flex>

                            {isOpen && (
                              <VStack
                                align="stretch"
                                gap={0}
                                borderTop="1px solid"
                                borderColor={colors.border}
                              >
                                {(pairedNarrative ||
                                  (steps && steps.length > 0)) && (
                                  <Box
                                    p={3}
                                    bg={isDark ? "white/2" : "gray.50/50"}
                                    borderBottom="1px solid"
                                    borderColor={colors.border}
                                    textAlign="left"
                                  >
                                    {pairedNarrative && (
                                      <Box
                                        mb={steps && steps.length > 0 ? 3 : 0}
                                      >
                                        <Text
                                          fontSize="13px"
                                          fontWeight="bold"
                                          mb={1}
                                          color={colors.text}
                                        >
                                          📖 Narrative (What Was Tested):
                                        </Text>
                                        <Text
                                          fontSize="13px"
                                          color={colors.text}
                                          mb={1}
                                        >
                                          {pairedNarrative}
                                        </Text>
                                      </Box>
                                    )}
                                    {steps && steps.length > 0 && (
                                      <Box>
                                        <Text
                                          fontSize="13px"
                                          fontWeight="bold"
                                          mb={1}
                                          color={colors.text}
                                        >
                                          📋 Test Scenario Steps:
                                        </Text>
                                        <VStack align="stretch" gap={1} pl={2}>
                                          {steps.map((step, idx) => (
                                            <Text
                                              key={idx}
                                              fontSize="12px"
                                              color={colors.subtext}
                                            >
                                              {idx + 1}. {step}
                                            </Text>
                                          ))}
                                        </VStack>
                                      </Box>
                                    )}
                                  </Box>
                                )}
                                <Box
                                  p={3}
                                  bg="black"
                                  h={isMaximized ? "450px" : "250px"}
                                  overflow="hidden"
                                >
                                  <AWSCodeViewer
                                    filename={name}
                                    code={spec.code}
                                    isMaximized={isMaximized}
                                    copiedFile={copiedFile}
                                    onCopy={handleCopyCode}
                                  />
                                </Box>
                              </VStack>
                            )}
                          </Box>
                        );
                      })}
                    </VStack>
                  )}
                </Box>
              </VStack>
            ) : (
              <Flex align="center" justify="center" h="150px">
                <Text fontSize="13px" color={colors.subtext} fontStyle="italic">
                  Code and test plan will be displayed here once generated by
                  the AI agent.
                </Text>
              </Flex>
            )}
          </Box>
        </Box>
      </Tabs.Root>
    </Box>
  );
}
