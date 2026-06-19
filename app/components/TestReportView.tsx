"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Box,
  Text,
  VStack,
  HStack,
  Flex,
  Button,
  Spinner,
} from "@chakra-ui/react";
import {
  ChevronDown,
  Check,
  Download,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useThemeMode } from "@/app/providers";
import "./TestReportView.css";
import type { Run, RunReport, TestResult, TestOutcome } from "@/src/types";

const MotionBox = motion.create(Box);

interface TestReportViewProps {
  run: Run | null;
  report: RunReport | null;
  runs?: Run[];
  onSelectRun?: (run: Run) => void;
}

/* Icon Components corresponding to report.html symbols */
const ChartIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="4" y1="20" x2="4" y2="11" />
    <line x1="10" y1="20" x2="10" y2="4" />
    <line x1="16" y1="20" x2="16" y2="14" />
    <line x1="20" y1="20" x2="2" y2="20" />
  </svg>
);

const ListIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="3.5" cy="6" r="1" />
    <circle cx="3.5" cy="12" r="1" />
    <circle cx="3.5" cy="18" r="1" />
  </svg>
);

const FlaskIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 3h6M10 3v6L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3" />
  </svg>
);

const CameraIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

interface ParsedScreenshot {
  filename: string;
  stepNumber: string;
  phase: "pre" | "post";
  action: string;
}

function parseScreenshotName(filename: string): ParsedScreenshot {
  const m = filename.match(
    /^(?:([a-zA-Z0-9\-]+)-)?step-(\d+)-(pre|post)-(\w+)\.png$/,
  );
  if (m) {
    const stageRaw = m[1] ? m[1].replace(/^\d+-/, "") : "";
    const stage = stageRaw
      ? stageRaw.charAt(0).toUpperCase() + stageRaw.slice(1)
      : "";
    return {
      filename,
      stepNumber: m[2],
      phase: m[3] as "pre" | "post",
      action: stage ? `${m[4]} (${stage})` : m[4],
    };
  }
  return {
    filename,
    stepNumber: "??",
    phase: "pre",
    action: filename.replace(/\.png$/, ""),
  };
}

const BookIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M19 17H6a2 2 0 0 0-2 2" />
  </svg>
);

const CheckIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const AlertIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const WrenchIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L4 17l3 3 5.5-5.5a4 4 0 0 0 5.2-5.2l-2.6 2.6-2.4-.6-.6-2.4z" />
  </svg>
);

const SkipIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="5 4 15 12 5 20 5 4" />
    <line x1="19" y1="5" x2="19" y2="19" />
  </svg>
);

const SearchIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const BulbIcon = () => (
  <svg
    className="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 18h6M10 21h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
  </svg>
);

const OUTCOME_LABEL: Record<TestOutcome, string> = {
  passed: "Passed",
  failed: "Failed",
  flaky: "Unreliable",
  healed: "Passed",
  fixme: "Skipped",
};

const OUTCOME_EMOJI: Record<TestOutcome, React.ReactNode> = {
  passed: <CheckIcon />,
  failed: <XIcon />,
  flaky: <AlertIcon />,
  healed: <CheckIcon />,
  fixme: <SkipIcon />,
};

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

export function TestReportView({
  run,
  report,
  runs,
  onSelectRun,
}: TestReportViewProps) {
  // Tab selector state inside report
  const [activeSubTab, setActiveSubTab] = useState("dashboard");
  const [selectedLightboxImage, setSelectedLightboxImage] = useState<
    string | null
  >(null);
  const [selectedLightboxIndex, setSelectedLightboxIndex] = useState<
    number | null
  >(null);
  const [selectedSpec, setSelectedSpec] = useState<{
    file: string;
    code: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("sidebar-collapsed") === "true";
      } catch (e) {
        console.warn("localStorage.getItem failed:", e);
      }
    }
    return false;
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-collapsed", String(next));
      } catch (e) {
        console.warn("localStorage.setItem failed:", e);
      }
      return next;
    });
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedLightboxIndex === null || !report || !report.screenshots) return;
    const screenshots = report.screenshots;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        setSelectedLightboxIndex((prev) =>
          prev !== null
            ? (prev - 1 + screenshots.length) % screenshots.length
            : null
        );
      } else if (event.key === "ArrowRight") {
        setSelectedLightboxIndex((prev) =>
          prev !== null
            ? (prev + 1) % screenshots.length
            : null
        );
      } else if (event.key === "Escape") {
        setSelectedLightboxIndex(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLightboxIndex, report]);

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!run) return;
    setIsDownloading(true);
    try {
      const response = await fetch(`/api/runs/${run.id}/report?format=html`);
      if (!response.ok) throw new Error("Failed to fetch report HTML");
      const htmlText = await response.text();

      const blob = new Blob([htmlText], { type: "text/html" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      const cleanUrl = run.config.url
        .replace(/https?:\/\//, "")
        .replace(/[^a-zA-Z0-9]/g, "_");
      link.download = `test_report_${cleanUrl}_${run.id.slice(0, 8)}.html`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading report:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Detailed Results Table Search & Filtering States
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFilter, setCurrentFilter] = useState("all");

  const [hoveredCard, setHoveredCard] = useState<
    "passed" | "failed" | "unreliable" | null
  >(null);

  const passedTestNames = useMemo(() => {
    if (!report || !report.results) return [];
    return report.results
      .filter((r) => r.outcome === "passed" || r.outcome === "healed")
      .map((r) => r.flowId);
  }, [report]);

  const failedTestNames = useMemo(() => {
    if (!report || !report.results) return [];
    return report.results
      .filter((r) => r.outcome === "failed")
      .map((r) => r.flowId);
  }, [report]);

  const flakyTestNames = useMemo(() => {
    if (!report || !report.results) return [];
    return report.results
      .filter((r) => r.outcome === "flaky")
      .map((r) => r.flowId);
  }, [report]);

  // Sync state helpers
  const successPct = report ? Math.round(report.successRate.rate * 100) : 0;

  // Results Bucketing
  const b = useMemo(() => {
    const buckets = {
      passed: [] as TestResult[],
      needsAttention: [] as TestResult[],
      whereToImprove: [] as TestResult[],
    };
    if (report && report.results) {
      for (const r of report.results) {
        if (r.outcome === "passed" || r.outcome === "healed") {
          buckets.passed.push(r);
        } else if (r.outcome === "failed" || r.outcome === "fixme") {
          buckets.needsAttention.push(r);
        } else {
          buckets.whereToImprove.push(r); // flaky
        }
      }
    }
    return buckets;
  }, [report?.results]);

  // Overall Verdict setup
  const verdict = useMemo(() => {
    if (successPct >= 90) {
      return {
        label: "Excellent",
        cls: "",
        desc: "Almost everything is working perfectly — no failures or reliability issues were found.",
      };
    } else if (successPct >= 70) {
      return {
        label: "Good",
        cls: "is-caution",
        desc: "Most checks passed, but a few areas need attention.",
      };
    } else if (successPct >= 50) {
      return {
        label: "Needs Work",
        cls: "is-caution",
        desc: "Several checks failed. We recommend investigating these issues.",
      };
    } else {
      return {
        label: "Critical",
        cls: "is-alert",
        desc: "Many checks failed. Immediate action is recommended.",
      };
    }
  }, [successPct]);

  // Detailed Results calculations
  const filterCounts = useMemo(() => {
    const counts = {
      all: 0,
      pass: 0,
      fail: 0,
      flaky: 0,
      heal: 0,
      skip: 0,
    };
    if (report && report.results) {
      counts.all = report.results.length;
      for (const r of report.results) {
        if (r.outcome === "passed" || r.outcome === "healed") counts.pass++;
        else if (r.outcome === "failed") counts.fail++;
        else if (r.outcome === "flaky") counts.flaky++;
        else if (r.outcome === "fixme") counts.skip++;
      }
    }
    return counts;
  }, [report?.results]);

  // Filtered Test Cases for table display
  const filteredResults = useMemo(() => {
    if (!report || !report.results) return [];
    return report.results.filter((r) => {
      let matchesFilter = false;
      if (currentFilter === "all") matchesFilter = true;
      else if (
        currentFilter === "pass" &&
        (r.outcome === "passed" || r.outcome === "healed")
      )
        matchesFilter = true;
      else if (currentFilter === "fail" && r.outcome === "failed")
        matchesFilter = true;
      else if (currentFilter === "flaky" && r.outcome === "flaky")
        matchesFilter = true;
      else if (currentFilter === "skip" && r.outcome === "fixme")
        matchesFilter = true;

      const text = `${r.flowId} ${r.fileName}`.toLowerCase();
      const matchesSearch = text.includes(searchQuery.toLowerCase());

      return matchesFilter && matchesSearch;
    });
  }, [report?.results, currentFilter, searchQuery]);

  // Navigate to test case row in Detailed Results and filter by its name
  const focusTest = (testName: string) => {
    setActiveSubTab("results");
    setCurrentFilter("all");
    setSearchQuery(testName);
  };

  // Explanation for outcome row in table
  const getOutcomeExplanation = (r: TestResult) => {
    if (r.outcome === "passed")
      return "Everything worked exactly as expected. No action needed.";
    if (r.outcome === "failed") {
      return r.failureReason
        ? `Something went wrong: ${r.failureReason}`
        : "This check did not pass. Manual investigation is recommended.";
    }
    if (r.outcome === "flaky") {
      return "This test sometimes passes and sometimes fails without any code change — a sign the feature may be unstable.";
    }
    if (r.outcome === "healed") {
      return "A small issue was detected and automatically repaired by the AI. It now passes, but is worth a quick review.";
    }
    if (r.outcome === "fixme") {
      return "This check was intentionally paused because it is known to be broken. It should be revisited soon.";
    }
    return "";
  };

  const getRowClass = (r: TestResult) => {
    if (r.outcome === "passed" || r.outcome === "healed") return "r-pass";
    if (r.outcome === "failed") return "r-fail";
    if (r.outcome === "flaky") return "r-flaky";
    if (r.outcome === "fixme") return "r-skip";
    return "";
  };

  const getPillClass = (r: TestResult) => {
    if (r.outcome === "passed" || r.outcome === "healed") return "pill-pass";
    if (r.outcome === "failed") return "pill-fail";
    if (r.outcome === "flaky") return "pill-flaky";
    if (r.outcome === "fixme") return "pill-skip";
    return "";
  };

  const { theme } = useThemeMode();
  const isDark = theme === "dark";
  const darkClass = isDark ? " dark" : "";

  // Render Loader / Queued / Running states if report is missing
  if (!run) {
    return (
      <div
        className={`test-report-container${darkClass}`}
        style={{ padding: "40px", textAlign: "center" }}
      >
        <div style={{ fontSize: "15px", color: "#64748b", fontWeight: 600 }}>
          No test executions found. Go to the Dashboard to launch your first
          test run.
        </div>
      </div>
    );
  }

  if (run.status === "failed" || run.status === "cancelled") {
    const isCancelled = run.status === "cancelled";
    return (
      <div className={`test-report-container${darkClass}`}>
        <div
          className={`page ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}
        >
          {/* Report Left Sidebar */}
          <aside className="sidebar">
            <div className="sidebar-header">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  width: "100%",
                }}
              >
                {!isSidebarCollapsed && (
                  <h1 style={{ margin: 0 }}>
                    Test results for {run.config.url.replace(/https?:\/\//, "")}
                  </h1>
                )}
                <button
                  type="button"
                  className="sidebar-toggle-btn"
                  onClick={toggleSidebar}
                  title={
                    isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"
                  }
                >
                  {isSidebarCollapsed ? (
                    <ChevronRight size={18} />
                  ) : (
                    <ChevronLeft size={18} />
                  )}
                </button>
              </div>
            </div>

            {!isSidebarCollapsed && runs && runs.length > 0 && onSelectRun && (
              <Box
                position="relative"
                ref={dropdownRef}
                className="run-selector-container"
              >
                <Text
                  as="label"
                  className="run-selector-label"
                  mb={1}
                  display="block"
                >
                  Select Test Run
                </Text>

                {/* Trigger Button */}
                <Box
                  role="button"
                  tabIndex={0}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  w="full"
                  minH="48px"
                  py={2.5}
                  px={3.5}
                  bg="var(--surface-2)"
                  border="1px solid"
                  borderColor="var(--border)"
                  borderRadius="var(--radius-sm)"
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  gap={2}
                  cursor="pointer"
                  transition="all 0.15s ease"
                  _hover={{ borderColor: "var(--accent)" }}
                >
                  <VStack
                    align="flex-start"
                    gap={0.5}
                    overflow="hidden"
                    flex={1}
                  >
                    <Text
                      fontSize="11.5px"
                      fontWeight="semibold"
                      truncate
                      w="full"
                    >
                      {run.config.url.replace(/https?:\/\//, "")}
                    </Text>
                    <HStack gap={1.5} fontSize="10px" color="var(--text-3)">
                      <Text fontFamily="var(--mono)">{run.id.slice(0, 8)}</Text>
                      <Text>•</Text>
                      <Text>
                        {new Date(run.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </HStack>
                  </VStack>
                  <ChevronDown
                    size={16}
                    style={{
                      opacity: 0.7,
                      transform: isDropdownOpen ? "rotate(180deg)" : "none",
                      transition: "transform 0.2s ease",
                      flexShrink: 0,
                    }}
                  />
                </Box>

                {/* Dropdown Options List */}
                <AnimatePresence>
                  {isDropdownOpen && (
                    <MotionBox
                      position="absolute"
                      top="calc(100% + 6px)"
                      left={0}
                      right={0}
                      zIndex={100}
                      bg="var(--surface)"
                      border="1px solid"
                      borderColor="var(--border)"
                      borderRadius="var(--radius-sm)"
                      boxShadow="var(--shadow-lg)"
                      maxH="280px"
                      overflowY="auto"
                      py={1.5}
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.12, ease: "easeOut" }}
                      style={{ transformOrigin: "top" }}
                    >
                      {runs.map((r) => {
                        const isSelected = r.id === run?.id;
                        const dateStr = new Date(r.createdAt).toLocaleString(
                          undefined,
                          {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        );
                        return (
                          <Box
                            key={r.id}
                            onClick={() => {
                              onSelectRun(r);
                              setIsDropdownOpen(false);
                            }}
                            px={3.5}
                            py={2}
                            cursor="pointer"
                            bg={
                              isSelected ? "var(--accent-soft)" : "transparent"
                            }
                            color={
                              isSelected ? "var(--accent-text)" : "var(--text)"
                            }
                            transition="all 0.15s ease"
                            _hover={{
                              bg: isSelected
                                ? "var(--accent-soft)"
                                : "var(--surface-2)",
                            }}
                            display="flex"
                            alignItems="center"
                            justifyContent="space-between"
                            gap={2}
                          >
                            <VStack
                              align="flex-start"
                              gap={0.5}
                              overflow="hidden"
                              flex={1}
                            >
                              <Text
                                fontSize="11.5px"
                                fontWeight="semibold"
                                truncate
                                w="full"
                              >
                                {r.config.url.replace(/https?:\/\//, "")}
                              </Text>
                              <HStack
                                gap={1.5}
                                fontSize="10px"
                                color="var(--text-3)"
                              >
                                <Text fontFamily="var(--mono)">
                                  {r.id.slice(0, 8)}
                                </Text>
                                <Text>•</Text>
                                <Text>{dateStr}</Text>
                              </HStack>
                            </VStack>
                            {isSelected && (
                              <Check
                                size={14}
                                style={{
                                  color: "var(--accent)",
                                  flexShrink: 0,
                                }}
                              />
                            )}
                          </Box>
                        );
                      })}
                    </MotionBox>
                  )}
                </AnimatePresence>
              </Box>
            )}

            {!isSidebarCollapsed && (
              <div className="sidebar-footer">
                <div className="sidebar-meta">
                  <div>
                    <span className="k">App tested</span>
                    <span className="v">{run.config.url}</span>
                  </div>
                  <div>
                    <span className="k">Run ID</span>
                    <span className="v mono">{run.id}</span>
                  </div>
                  <div>
                    <span className="k">Status</span>
                    <span className="v">{run.status.toUpperCase()}</span>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* Report Right Content Area */}
          <main
            className="report-content"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "60px 40px",
              gap: "16px",
            }}
          >
            <span style={{ fontSize: "40px" }}>
              {isCancelled ? "⏹️" : "❌"}
            </span>
            <div style={{ textAlign: "center" }}>
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: "bold",
                  color: "var(--text)",
                  marginBottom: "8px",
                }}
              >
                {isCancelled ? "Run Stopped" : "Run Failed"}
              </h3>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-3)",
                  maxWidth: "450px",
                  lineHeight: "1.5",
                }}
              >
                {isCancelled
                  ? "This test run was stopped by the user. No report was generated."
                  : `This test run failed during execution: ${run.error || "Unknown pipeline error"}. No report was generated.`}
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (run.status === "pending" || run.status === "running" || !report) {
    return (
      <div className={`test-report-container${darkClass}`}>
        <div
          className={`page ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}
        >
          {/* Report Left Sidebar */}
          <aside className="sidebar">
            <div className="sidebar-header">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  width: "100%",
                }}
              >
                {!isSidebarCollapsed && (
                  <h1 style={{ margin: 0 }}>
                    Test results for {run.config.url.replace(/https?:\/\//, "")}
                  </h1>
                )}
                <button
                  type="button"
                  className="sidebar-toggle-btn"
                  onClick={toggleSidebar}
                  title={
                    isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"
                  }
                >
                  {isSidebarCollapsed ? (
                    <ChevronRight size={18} />
                  ) : (
                    <ChevronLeft size={18} />
                  )}
                </button>
              </div>
            </div>

            {!isSidebarCollapsed && runs && runs.length > 0 && onSelectRun && (
              <Box
                position="relative"
                ref={dropdownRef}
                className="run-selector-container"
              >
                <Text
                  as="label"
                  className="run-selector-label"
                  mb={1}
                  display="block"
                >
                  Select Test Run
                </Text>

                {/* Trigger Button */}
                <Box
                  role="button"
                  tabIndex={0}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  w="full"
                  minH="48px"
                  py={2.5}
                  px={3.5}
                  bg="var(--surface-2)"
                  border="1px solid"
                  borderColor="var(--border)"
                  borderRadius="var(--radius-sm)"
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  gap={2}
                  cursor="pointer"
                  transition="all 0.15s ease"
                  _hover={{ borderColor: "var(--accent)" }}
                >
                  <VStack
                    align="flex-start"
                    gap={0.5}
                    overflow="hidden"
                    flex={1}
                  >
                    <Text
                      fontSize="11.5px"
                      fontWeight="semibold"
                      truncate
                      w="full"
                    >
                      {run.config.url.replace(/https?:\/\//, "")}
                    </Text>
                    <HStack gap={1.5} fontSize="10px" color="var(--text-3)">
                      <Text fontFamily="var(--mono)">{run.id.slice(0, 8)}</Text>
                      <Text>•</Text>
                      <Text>
                        {new Date(run.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </HStack>
                  </VStack>
                  <ChevronDown
                    size={16}
                    style={{
                      opacity: 0.7,
                      transform: isDropdownOpen ? "rotate(180deg)" : "none",
                      transition: "transform 0.2s ease",
                      flexShrink: 0,
                    }}
                  />
                </Box>

                {/* Dropdown Options List */}
                <AnimatePresence>
                  {isDropdownOpen && (
                    <MotionBox
                      position="absolute"
                      top="calc(100% + 6px)"
                      left={0}
                      right={0}
                      zIndex={100}
                      bg="var(--surface)"
                      border="1px solid"
                      borderColor="var(--border)"
                      borderRadius="var(--radius-sm)"
                      boxShadow="var(--shadow-lg)"
                      maxH="280px"
                      overflowY="auto"
                      py={1.5}
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.12, ease: "easeOut" }}
                      style={{ transformOrigin: "top" }}
                    >
                      {runs.map((r) => {
                        const isSelected = r.id === run?.id;
                        const dateStr = new Date(r.createdAt).toLocaleString(
                          undefined,
                          {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        );
                        return (
                          <Box
                            key={r.id}
                            onClick={() => {
                              onSelectRun(r);
                              setIsDropdownOpen(false);
                            }}
                            px={3.5}
                            py={2}
                            cursor="pointer"
                            bg={
                              isSelected ? "var(--accent-soft)" : "transparent"
                            }
                            color={
                              isSelected ? "var(--accent-text)" : "var(--text)"
                            }
                            transition="all 0.15s ease"
                            _hover={{
                              bg: isSelected
                                ? "var(--accent-soft)"
                                : "var(--surface-2)",
                            }}
                            display="flex"
                            alignItems="center"
                            justifyContent="space-between"
                            gap={2}
                          >
                            <VStack
                              align="flex-start"
                              gap={0.5}
                              overflow="hidden"
                              flex={1}
                            >
                              <Text
                                fontSize="11.5px"
                                fontWeight="semibold"
                                truncate
                                w="full"
                              >
                                {r.config.url.replace(/https?:\/\//, "")}
                              </Text>
                              <HStack
                                gap={1.5}
                                fontSize="10px"
                                color="var(--text-3)"
                              >
                                <Text fontFamily="var(--mono)">
                                  {r.id.slice(0, 8)}
                                </Text>
                                <Text>•</Text>
                                <Text>{dateStr}</Text>
                              </HStack>
                            </VStack>
                            {isSelected && (
                              <Check
                                size={14}
                                style={{
                                  color: "var(--accent)",
                                  flexShrink: 0,
                                }}
                              />
                            )}
                          </Box>
                        );
                      })}
                    </MotionBox>
                  )}
                </AnimatePresence>
              </Box>
            )}

            {!isSidebarCollapsed && (
              <div className="sidebar-footer">
                <div className="sidebar-meta">
                  <div>
                    <span className="k">App tested</span>
                    <span className="v">{run.config.url}</span>
                  </div>
                  <div>
                    <span className="k">Run ID</span>
                    <span className="v mono">{run.id}</span>
                  </div>
                  <div>
                    <span className="k">Status</span>
                    <span className="v">{run.status.toUpperCase()}</span>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* Report Right Content Area */}
          <main
            className="report-content"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "60px 40px",
              gap: "20px",
              flex: 1,
            }}
          >
            <div
              className="loader-ring"
              style={{
                width: "40px",
                height: "40px",
                border: "3px solid rgba(6, 182, 212, 0.15)",
                borderTopColor: "rgba(6, 182, 212, 0.9)",
                borderRadius: "50%",
                animation: "spin 1s infinite linear",
              }}
            />
            <div style={{ textAlign: "center" }}>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: "bold",
                  marginBottom: "6px",
                }}
              >
                Test Run is {run.status === "pending" ? "Queued" : "Active"}
              </h3>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--text-3)",
                  maxWidth: "450px",
                  lineHeight: "1.5",
                }}
              >
                The pipeline is currently executing stage:{" "}
                <strong style={{ color: "var(--accent)" }}>
                  {run.stage.toUpperCase()}
                </strong>
                . The test report will automatically load here once the run
                reaches completion.
              </p>
            </div>
          </main>
        </div>
        <style
          dangerouslySetInnerHTML={{
            __html: `
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `,
          }}
        />
      </div>
    );
  }

  return (
    <div className={`test-report-container${darkClass}`}>
      <div className={`page ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {/* Report Left Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                width: "100%",
              }}
            >
              {!isSidebarCollapsed && (
                <h1 style={{ margin: 0 }}>
                  Test results for {report.url.replace(/https?:\/\//, "")}
                </h1>
              )}
              <button
                type="button"
                className="sidebar-toggle-btn"
                onClick={toggleSidebar}
                title={
                  isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"
                }
              >
                {isSidebarCollapsed ? (
                  <ChevronRight size={18} />
                ) : (
                  <ChevronLeft size={18} />
                )}
              </button>
            </div>
          </div>

          {!isSidebarCollapsed && runs && runs.length > 0 && onSelectRun && (
            <Box
              position="relative"
              ref={dropdownRef}
              className="run-selector-container"
            >
              <Text
                as="label"
                className="run-selector-label"
                mb={1}
                display="block"
              >
                Select Test Run
              </Text>

              {/* Trigger Button */}
              <Box
                role="button"
                tabIndex={0}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                w="full"
                minH="48px"
                py={2.5}
                px={3.5}
                bg="var(--surface-2)"
                border="1px solid"
                borderColor="var(--border)"
                borderRadius="var(--radius-sm)"
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                cursor="pointer"
                transition="all 0.2s ease"
                _hover={{
                  borderColor: "var(--accent)",
                  bg: "var(--surface-3)",
                }}
                _focus={{
                  borderColor: "var(--accent)",
                  outline: "none",
                }}
              >
                <VStack
                  align="flex-start"
                  gap={0.5}
                  overflow="hidden"
                  flex={1}
                  pr={2}
                >
                  <Text
                    fontSize="12px"
                    fontWeight="bold"
                    color="var(--text)"
                    truncate
                    w="full"
                  >
                    {run?.config.url.replace(/https?:\/\//, "") ??
                      "Unknown URL"}
                  </Text>
                  <HStack gap={1.5} fontSize="10.5px" color="var(--text-3)">
                    <Text fontFamily="var(--mono)">{run?.id.slice(0, 8)}</Text>
                    <Text>•</Text>
                    <Text>
                      {run &&
                        new Date(run.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                    </Text>
                  </HStack>
                </VStack>
                <ChevronDown
                  size={16}
                  style={{
                    color: "var(--text-3)",
                    transform: isDropdownOpen ? "rotate(180deg)" : "none",
                    transition: "transform 0.2s ease",
                    flexShrink: 0,
                  }}
                />
              </Box>

              {/* Dropdown Options List */}
              <AnimatePresence>
                {isDropdownOpen && (
                  <MotionBox
                    position="absolute"
                    top="calc(100% + 6px)"
                    left={0}
                    right={0}
                    zIndex={100}
                    bg="var(--surface)"
                    border="1px solid"
                    borderColor="var(--border)"
                    borderRadius="var(--radius-sm)"
                    boxShadow="var(--shadow-lg)"
                    maxH="280px"
                    overflowY="auto"
                    py={1.5}
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    style={{ transformOrigin: "top" }}
                  >
                    {runs.map((r) => {
                      const isSelected = r.id === run?.id;
                      const dateStr = new Date(r.createdAt).toLocaleString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      );
                      return (
                        <Box
                          key={r.id}
                          onClick={() => {
                            onSelectRun(r);
                            setIsDropdownOpen(false);
                          }}
                          px={3.5}
                          py={2}
                          cursor="pointer"
                          bg={isSelected ? "var(--accent-soft)" : "transparent"}
                          color={
                            isSelected ? "var(--accent-text)" : "var(--text)"
                          }
                          transition="all 0.15s ease"
                          _hover={{
                            bg: isSelected
                              ? "var(--accent-soft)"
                              : "var(--surface-2)",
                          }}
                          display="flex"
                          alignItems="center"
                          justifyContent="space-between"
                          gap={2}
                        >
                          <VStack
                            align="flex-start"
                            gap={0.5}
                            overflow="hidden"
                            flex={1}
                          >
                            <Text
                              fontSize="11.5px"
                              fontWeight="semibold"
                              truncate
                              w="full"
                            >
                              {r.config.url.replace(/https?:\/\//, "")}
                            </Text>
                            <HStack
                              gap={1.5}
                              fontSize="10px"
                              color="var(--text-3)"
                            >
                              <Text fontFamily="var(--mono)">
                                {r.id.slice(0, 8)}
                              </Text>
                              <Text>•</Text>
                              <Text>{dateStr}</Text>
                            </HStack>
                          </VStack>
                          {isSelected && (
                            <Check
                              size={14}
                              style={{ color: "var(--accent)", flexShrink: 0 }}
                            />
                          )}
                        </Box>
                      );
                    })}
                  </MotionBox>
                )}
              </AnimatePresence>
            </Box>
          )}

          <nav className="nav-tabs" aria-label="Report navigation">
            <button
              type="button"
              className={`tab-btn ${activeSubTab === "dashboard" ? "active" : ""}`}
              onClick={() => setActiveSubTab("dashboard")}
              title={isSidebarCollapsed ? "Dashboard Overview" : undefined}
            >
              <ChartIcon /> {!isSidebarCollapsed && "Dashboard Overview"}
            </button>
            <button
              type="button"
              className={`tab-btn ${activeSubTab === "journeys" ? "active" : ""}`}
              onClick={() => setActiveSubTab("journeys")}
              title={isSidebarCollapsed ? "What Was Tested" : undefined}
            >
              <ListIcon /> {!isSidebarCollapsed && "What Was Tested"}
            </button>
            <button
              type="button"
              className={`tab-btn ${activeSubTab === "results" ? "active" : ""}`}
              onClick={() => setActiveSubTab("results")}
              title={isSidebarCollapsed ? "Detailed Results" : undefined}
            >
              <FlaskIcon /> {!isSidebarCollapsed && "Detailed Results"}
            </button>
            <button
              type="button"
              className={`tab-btn ${activeSubTab === "screenshots" ? "active" : ""}`}
              onClick={() => setActiveSubTab("screenshots")}
              title={isSidebarCollapsed ? "Agent Screenshots" : undefined}
            >
              <CameraIcon /> {!isSidebarCollapsed && "Agent Screenshots"}
            </button>
          </nav>

          {!isSidebarCollapsed && (
            <div className="sidebar-footer">
              <div className="sidebar-meta">
                <div>
                  <span className="k">App tested</span>
                  <span className="v">{report.url}</span>
                </div>
                <div>
                  <span className="k">Run ID</span>
                  <span className="v mono">{report.runId}</span>
                </div>
                <div>
                  <span className="k">Generated</span>
                  <span className="v">
                    {new Date(report.generatedAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Report Right Content Area */}
        <main className="report-content">
          {/* TAB 1: DASHBOARD OVERVIEW */}
          <div
            className={`tab-panel ${activeSubTab === "dashboard" ? "active" : ""}`}
          >
            {/* Top Bar with Download Button */}
            <Flex justify="flex-end" mb={4}>
              <Button
                onClick={handleDownload}
                disabled={isDownloading}
                size="sm"
                background="linear-gradient(180deg, #0a1628 0%, #0d2b6b 55%, #1a4db5 100%)"
                color="#ffffff"
                border="1.5px solid rgba(255,255,255,0.3)"
                borderRadius="var(--radius-sm)"
                px={4}
                py={2.5}
                fontSize="12px"
                fontWeight="700"
                transition="all 0.2s ease"
                boxShadow="0 3px 12px rgba(13,43,107,0.45)"
                _hover={{
                  background:
                    "linear-gradient(180deg, #0d1e36 0%, #10368a 55%, #2060d4 100%)",
                  borderColor: "rgba(255,255,255,0.55)",
                  transform: "translateY(-1px)",
                  boxShadow: "0 6px 20px rgba(13,43,107,0.55)",
                }}
                _active={{
                  transform: "translateY(0.5px)",
                  boxShadow: "0 2px 8px rgba(13,43,107,0.35)",
                }}
                display="flex"
                alignItems="center"
                gap={2}
              >
                {isDownloading ? (
                  <>
                    <Spinner size="xs" color="currentColor" />
                    <span>Downloading...</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>Download Report</span>
                  </>
                )}
              </Button>
            </Flex>

            {/* Conic progress verdict banner */}
            <section
              className={`verdict ${verdict.cls}`}
              aria-labelledby="verdict-label"
            >
              <div
                className="verdict-score"
                style={{ "--percentage": successPct } as React.CSSProperties}
              >
                {successPct}%
              </div>
              <div className="verdict-body">
                <span className="verdict-badge" id="verdict-label">
                  {successPct >= 50 ? <CheckIcon /> : <XIcon />}
                  {verdict.label}
                </span>
                <div className="verdict-count">
                  <b>{report.successRate.passed}</b> of{" "}
                  <b>{report.successRate.total}</b> checks passed
                </div>
                <p className="verdict-desc">{verdict.desc}</p>
              </div>
            </section>

            {/* Quick Stats Grid */}
            <section className="stats" aria-label="Quick statistics">
              <div
                className="stat stat-passed"
                style={{ position: "relative", cursor: "pointer" }}
                onMouseEnter={() => setHoveredCard("passed")}
                onMouseLeave={() => setHoveredCard(null)}
                onClick={() => {
                  setActiveSubTab("results");
                  setCurrentFilter("pass");
                }}
              >
                <div className="stat-top">
                  <span style={{ color: "var(--pass)" }}>
                    <CheckIcon />
                  </span>
                  <span className="stat-num">{report.successRate.passed}</span>
                </div>
                <div className="stat-label">Passed</div>

                {hoveredCard === "passed" && passedTestNames.length > 0 && (
                  <div className="stat-popover">
                    <div className="stat-popover-title">
                      Passed Tests ({passedTestNames.length})
                    </div>
                    <ul className="stat-popover-list">
                      {passedTestNames.map((name, idx) => (
                        <li key={idx} title={name}>
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div
                className="stat stat-failed"
                style={{ position: "relative", cursor: "pointer" }}
                onMouseEnter={() => setHoveredCard("failed")}
                onMouseLeave={() => setHoveredCard(null)}
                onClick={() => {
                  setActiveSubTab("results");
                  setCurrentFilter("fail");
                }}
              >
                <div className="stat-top">
                  <span style={{ color: "var(--fail)" }}>
                    <XIcon />
                  </span>
                  <span className="stat-num">
                    {
                      report.results.filter((r) => r.outcome === "failed")
                        .length
                    }
                  </span>
                </div>
                <div className="stat-label">Failed</div>

                {hoveredCard === "failed" && failedTestNames.length > 0 && (
                  <div className="stat-popover">
                    <div className="stat-popover-title">
                      Failed Tests ({failedTestNames.length})
                    </div>
                    <ul className="stat-popover-list">
                      {failedTestNames.map((name, idx) => (
                        <li key={idx} title={name}>
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div
                className="stat stat-unreliable"
                style={{ position: "relative", cursor: "pointer" }}
                onMouseEnter={() => setHoveredCard("unreliable")}
                onMouseLeave={() => setHoveredCard(null)}
                onClick={() => {
                  setActiveSubTab("results");
                  setCurrentFilter("flaky");
                }}
              >
                <div className="stat-top">
                  <span style={{ color: "var(--warn)" }}>
                    <AlertIcon />
                  </span>
                  <span className="stat-num">{filterCounts.flaky}</span>
                </div>
                <div className="stat-label">Unreliable</div>

                {hoveredCard === "unreliable" && flakyTestNames.length > 0 && (
                  <div className="stat-popover">
                    <div className="stat-popover-title">
                      Unreliable Tests ({flakyTestNames.length})
                    </div>
                    <ul className="stat-popover-list">
                      {flakyTestNames.map((name, idx) => (
                        <li key={idx} title={name}>
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>

            {/* Dynamic Findings Summary Banner */}
            <div className="summary-card">
              {b.needsAttention.length > 0 && (
                <div className="summary-banner banner-fail">
                  <div className="banner-icon">
                    <XIcon />
                  </div>
                  <div className="banner-content">
                    <h3>
                      Action Required: {b.needsAttention.length} Failed Checks
                    </h3>
                    <p>
                      Critical issues were detected in core user flows. We
                      recommend investigating these failures first:
                    </p>
                    <ul className="banner-list">
                      {b.needsAttention.slice(0, 5).map((r, idx) => (
                        <li key={idx}>
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => focusTest(r.flowId)}
                          >
                            {r.flowId}
                          </button>
                        </li>
                      ))}
                      {b.needsAttention.length > 5 && (
                        <li
                          style={{
                            fontWeight: 600,
                            color: "var(--text-3)",
                            fontSize: "var(--fs-xs)",
                          }}
                        >
                          and {b.needsAttention.length - 5} more failure(s)...
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {b.whereToImprove.length > 0 && (
                <div className="summary-banner banner-warn">
                  <div className="banner-icon">
                    <AlertIcon />
                  </div>
                  <div className="banner-content">
                    <h3>
                      Reliability Note: {b.whereToImprove.length} Inconsistent
                      Run(s)
                    </h3>
                    <p>
                      Some checks passed but required retries. These flows are
                      working but should be audited for stability:
                    </p>
                    <ul className="banner-list">
                      {b.whereToImprove.map((r, idx) => (
                        <li key={idx}>
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => focusTest(r.flowId)}
                          >
                            {r.flowId} (Flaky)
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {b.needsAttention.length === 0 &&
                b.whereToImprove.length === 0 && (
                  <div className="summary-banner banner-pass">
                    <div className="banner-icon">
                      <CheckIcon />
                    </div>
                    <div className="banner-content">
                      <h3>All Systems Operational</h3>
                      <p>
                        All automated checks completed successfully. No failures
                        or reliability concerns were reported for this run. Your
                        key user journeys are stable.
                      </p>
                    </div>
                  </div>
                )}
            </div>

            {/* AI-generated Test Summary */}
            {report.testSummary && report.testSummary.trim().length > 0 && (
              <div className="test-summary-block">
                <h2 className="section-h">
                  <span className="badge">
                    <BookIcon />
                  </span>
                  Test Summary
                </h2>
                <p className="test-summary">{report.testSummary}</p>
              </div>
            )}

            {/* Results Breakdown Buckets */}
            <h2 className="section-h">
              <span className="badge">
                <ChartIcon />
              </span>
              Results Breakdown
            </h2>
            <p className="section-desc">
              Results are grouped into three categories so you can instantly see
              what is working, what needs fixing, and what could be made more
              reliable.
            </p>

            <div className="buckets">
              {/* Bucket: Working Well */}
              <div className="bucket b-pass">
                <div className="bucket-header">
                  <span className="bucket-title">
                    <CheckIcon /> Working Well
                  </span>
                  <span className="bucket-count">{b.passed.length}</span>
                </div>
                <p className="bucket-sub">
                  These checks passed — the features are working as intended.
                </p>
                {b.passed.length > 0 ? (
                  <ul className="bucket-list">
                    {b.passed.map((r, idx) => (
                      <li key={idx}>{r.flowId}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty">
                    <CheckIcon /> No checks completed successfully.
                  </div>
                )}
              </div>

              {/* Bucket: Needs Immediate Attention */}
              <div className="bucket b-fail">
                <div className="bucket-header">
                  <span className="bucket-title">
                    <XIcon /> Needs Attention
                  </span>
                  <span className="bucket-count">
                    {b.needsAttention.length}
                  </span>
                </div>
                <p className="bucket-sub">
                  These checks failed and should be investigated as soon as
                  possible.
                </p>
                {b.needsAttention.length > 0 ? (
                  <ul className="bucket-list">
                    {b.needsAttention.map((r, idx) => (
                      <li key={idx}>
                        <span style={{ fontWeight: 600 }}>{r.flowId}</span>
                        {r.failureReason && (
                          <span
                            style={{
                              display: "block",
                              color: "var(--text-3)",
                              fontSize: "11px",
                              marginTop: "2px",
                            }}
                          >
                            {r.failureReason}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty">
                    <CheckIcon /> Nothing needs urgent attention.
                  </div>
                )}
              </div>

              {/* Bucket: Could Be More Reliable */}
              <div className="bucket b-warn">
                <div className="bucket-header">
                  <span className="bucket-title">
                    <WrenchIcon /> Could Be Reliable
                  </span>
                  <span className="bucket-count">
                    {b.whereToImprove.length}
                  </span>
                </div>
                <p className="bucket-sub">
                  These work, but were flaky or inconsistent during execution.
                </p>
                {b.whereToImprove.length > 0 ? (
                  <ul className="bucket-list">
                    {b.whereToImprove.map((r, idx) => (
                      <li key={idx}>
                        <span style={{ fontWeight: 600 }}>{r.flowId}</span>
                        <span
                          style={{
                            display: "block",
                            color: "var(--text-3)",
                            fontSize: "11px",
                            marginTop: "2px",
                          }}
                        >
                          Passed on retry (Flaky)
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty">
                    <CheckIcon /> No reliability improvements needed.
                  </div>
                )}
              </div>
            </div>

            {/* Observations & Recommendations */}
            {/* Hide Suite Observations for now
            report.issues.length > 0 && (
              <div style={{ marginTop: "var(--sp-6)" }}>
                <h2 className="section-h">
                  <span className="badge">
                    <SearchIcon />
                  </span>
                  Suite Observations
                </h2>
                <p className="section-desc">
                  Issues spotted in the test suite setup that are worth
                  addressing.
                </p>
                <ul className="prose prose-warn">
                  {report.issues.map((issue, idx) => (
                    <li key={idx}>
                      <AlertIcon />
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
            */}

            {/* Side-by-Side: What could be better & Recommendations */}
            {(report.better || report.recommendationsText) && (
              <div className="side-by-side-grid">
                <div>
                  <h2 className="section-h">
                    <span
                      className="badge"
                      style={{
                        backgroundColor: "var(--warn-bg)",
                        color: "var(--warn)",
                      }}
                    >
                      <AlertIcon />
                    </span>
                    What could be better
                  </h2>
                  <div className="prose-card">
                    {report.better ||
                      "No major frontend gaps or testability limitations identified."}
                  </div>
                </div>
                <div>
                  <h2 className="section-h">
                    <span
                      className="badge"
                      style={{
                        backgroundColor: "var(--heal-bg)",
                        color: "var(--heal)",
                      }}
                    >
                      <BulbIcon />
                    </span>
                    Recommendations
                  </h2>
                  <div className="prose-card">
                    {report.recommendationsText ||
                      "No actionable recommendations needed at this time."}
                  </div>
                </div>
              </div>
            )}

            {report.recommendations.length > 0 && (
              <div style={{ marginTop: "var(--sp-6)" }}>
                <h2 className="section-h">
                  <span className="badge">
                    <BulbIcon />
                  </span>
                  Coverage Recommendations
                </h2>
                <p className="section-desc">
                  Suggestions for how to improve test coverage and overall
                  quality going forward.
                </p>
                <ul className="prose">
                  {report.recommendations.map((rec, idx) => (
                    <li key={idx}>
                      <BulbIcon />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* TAB 2: WHAT WAS TESTED */}
          <div
            className={`tab-panel ${activeSubTab === "journeys" ? "active" : ""}`}
          >
            <h2 className="section-h">
              <span className="badge">
                <ListIcon />
              </span>
              What Was Tested
            </h2>
            <p className="section-desc">
              A plain-English summary of what our automated checks verified on
              your app:
            </p>
            {report.summary && report.summary.length > 0 ? (
              <ul className="prose">
                {report.summary.map((summaryItem, idx) => {
                  const testResult = report.results?.[idx];
                  const fileName = testResult?.fileName;
                  const spec = report.generatedSpecs?.find(
                    (s) =>
                      s.file.split("/").pop() === fileName ||
                      (testResult && s.file.includes(testResult.flowId)),
                  );

                  return (
                    <li key={idx}>
                      <CheckIcon />
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          width: "100%",
                        }}
                      >
                        <span>{summaryItem}</span>
                        {spec && (
                          <button
                            type="button"
                            className="code-pill-btn"
                            onClick={() => setSelectedSpec(spec)}
                          >
                            <Code2 size={12} />
                            {spec.file.split("/").pop()}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="empty-msg">
                No plain-English summary is available for this run.
              </p>
            )}
          </div>

          {/* TAB 3: DETAILED RESULTS */}
          <div
            className={`tab-panel ${activeSubTab === "results" ? "active" : ""}`}
          >
            <h2 className="section-h">
              <span className="badge">
                <FlaskIcon />
              </span>
              Detailed Results <span className="tag">Interactive</span>
            </h2>
            <p className="section-desc">
              Each row is one automated check. Search or filter to find specific
              results instantly.
            </p>

            {/* Filter controls */}
            <div className="table-controls">
              <div className="search-wrapper">
                <span className="search-icon">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  placeholder="Search checks or files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search test cases"
                  style={{ paddingRight: searchQuery ? "2.2rem" : "1.0rem" }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search query"
                    title="Clear search"
                  >
                    <XIcon />
                  </button>
                )}
              </div>
              <div
                className="filter-group"
                role="group"
                aria-label="Filter test cases by outcome"
              >
                <button
                  type="button"
                  className={`filter-btn ${currentFilter === "all" ? "active" : ""}`}
                  onClick={() => setCurrentFilter("all")}
                >
                  All ({filterCounts.all})
                </button>
                <button
                  type="button"
                  className={`filter-btn ${currentFilter === "pass" ? "active" : ""}`}
                  onClick={() => setCurrentFilter("pass")}
                >
                  Passed ({filterCounts.pass})
                </button>
                <button
                  type="button"
                  className={`filter-btn ${currentFilter === "fail" ? "active" : ""}`}
                  onClick={() => setCurrentFilter("fail")}
                >
                  Failed ({filterCounts.fail})
                </button>
                <button
                  type="button"
                  className={`filter-btn ${currentFilter === "flaky" ? "active" : ""}`}
                  onClick={() => setCurrentFilter("flaky")}
                >
                  Unreliable ({filterCounts.flaky})
                </button>
              </div>
            </div>

            {/* Test Results Table */}
            {filteredResults.length > 0 ? (
              <table className="results">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: "40%" }}>
                      Check &amp; File
                    </th>
                    <th scope="col" style={{ width: "20%" }}>
                      Result
                    </th>
                    <th scope="col" style={{ width: "40%" }}>
                      What This Means
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((r, idx) => (
                    <tr key={idx} className={getRowClass(r)}>
                      <td data-label="Check">
                        <span className="flow-name">{r.flowId}</span>
                        <span className="flow-file">{r.fileName}</span>
                      </td>
                      <td data-label="Result">
                        <span className={`pill ${getPillClass(r)}`}>
                          {OUTCOME_EMOJI[r.outcome]} {OUTCOME_LABEL[r.outcome]}
                        </span>
                      </td>
                      <td data-label="What This Means" className="td-detail">
                        {getOutcomeExplanation(r)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-table-state">
                <SearchIcon /> No matching checks found. Try adjusting your
                search query or filters.
              </div>
            )}

            {/* Recommended Fixes */}
            {currentFilter === "fail" &&
              report.fixPrompts &&
              report.fixPrompts.length > 0 && (
                <div style={{ marginTop: "var(--sp-6)" }}>
                  <h2 className="section-h">
                    <span className="badge">
                      <WrenchIcon />
                    </span>
                    Recommended Fixes
                  </h2>
                  <p className="section-desc">
                    For each failing check, the AI has diagnosed the problem and
                    suggested exactly what should be changed to resolve it.
                  </p>
                  {report.fixPrompts.map((fix, idx) => (
                    <div className="fix-card" key={idx}>
                      <div className="fix-test">🧪 {fix.test}</div>
                      <div className="fix-row">
                        <strong>What went wrong:</strong> {fix.problem}
                      </div>
                      <div className="fix-row fix-action">
                        <strong>Recommended fix:</strong> {fix.change}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* TAB 4: AGENT SCREENSHOTS */}
          <div
            className={`tab-panel ${activeSubTab === "screenshots" ? "active" : ""}`}
          >
            <h2 className="section-h">
              <span className="badge">
                <CameraIcon />
              </span>
              Agent Screenshots
            </h2>
            <p className="section-desc">
              Visual logs captured automatically during the AI agent's
              exploration and verification phase. Pre-action screenshots
              highlight the target element with a orange/red border to show
              click/input targets.
            </p>

            {report.screenshots && report.screenshots.length > 0 ? (
              <div className="screenshots-grid">
                {report.screenshots.map((s, idx) => {
                  const parsed = parseScreenshotName(s.filename);
                  const imgUrl = `data:image/png;base64,${s.base64}`;

                  return (
                    <div
                      key={idx}
                      className="screenshot-card"
                      onClick={() => setSelectedLightboxIndex(idx)}
                    >
                      <div className="screenshot-img-container">
                        <img
                          src={imgUrl}
                          alt={`Step ${parsed.stepNumber} ${parsed.action}`}
                          loading="lazy"
                        />
                        <div className="screenshot-badge-overlay">
                          <span className={`screenshot-badge ${parsed.phase}`}>
                            {parsed.phase === "pre"
                              ? "Pre-Action Highlight"
                              : "Post-Action State"}
                          </span>
                        </div>
                      </div>
                      <div className="screenshot-details">
                        <div className="screenshot-title">
                          Step {parsed.stepNumber}:{" "}
                          <span className="action-verb">{parsed.action}</span>
                        </div>
                        <div className="screenshot-desc">
                          {parsed.phase === "pre"
                            ? "Visual highlight overlay applied to click target"
                            : "Resulting page state after execution"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                className="empty-state-container"
                style={{ textAlign: "center", padding: "40px 20px" }}
              >
                <div style={{ fontSize: "40px", marginBottom: "16px" }}>📷</div>
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: "bold",
                    marginBottom: "8px",
                  }}
                >
                  No screenshots found
                </h3>
                <p
                  style={{
                    color: "gray",
                    fontSize: "13px",
                    maxWidth: "400px",
                    margin: "0 auto",
                  }}
                >
                  This run does not contain any visual logs. Interactive
                  explorer screenshots are saved when running Discoverer or
                  Designer agents.
                </p>
              </div>
            )}
          </div>

          {/* Report Footer */}
          <footer className="report-footer">
            Generated by AI &nbsp;·&nbsp;{" "}
            {new Date(report.generatedAt).toUTCString()}
          </footer>
        </main>
      </div>

      {/* Lightbox Modal */}
      {selectedLightboxIndex !== null && report && report.screenshots && report.screenshots[selectedLightboxIndex] && (
        <div
          className="lightbox-overlay active"
          onClick={() => setSelectedLightboxIndex(null)}
        >
          <button
            className="lightbox-prev"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedLightboxIndex((prev) =>
                prev !== null && report.screenshots
                  ? (prev - 1 + report.screenshots.length) % report.screenshots.length
                  : null
              );
            }}
            aria-label="Previous image"
          >
            <ChevronLeft size={28} />
          </button>

          <div
            className="lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="lightbox-close"
              onClick={() => setSelectedLightboxIndex(null)}
            >
              ×
            </button>
            <img
              src={`data:image/png;base64,${report.screenshots[selectedLightboxIndex].base64}`}
              alt="Enlarged screenshot"
            />
          </div>

          <button
            className="lightbox-next"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedLightboxIndex((prev) =>
                prev !== null && report.screenshots
                  ? (prev + 1) % report.screenshots.length
                  : null
              );
            }}
            aria-label="Next image"
          >
            <ChevronRight size={28} />
          </button>
        </div>
      )}

      {/* Code Viewer Modal */}
      {selectedSpec && (
        <div
          className="lightbox-overlay active"
          onClick={() => setSelectedSpec(null)}
        >
          <div
            className="lightbox-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "90%",
              width: "900px",
              height: "80vh",
              display: "flex",
              flexDirection: "column",
              background: "#1e1e2e",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
            }}
          >
            <button
              className="lightbox-close"
              onClick={() => setSelectedSpec(null)}
              style={{ top: "12px", right: "16px" }}
            >
              ×
            </button>
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #414559",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#181825",
                userSelect: "none",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Code2 size={13} style={{ color: "#81c8be" }} />
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: "bold",
                    fontFamily: "var(--mono)",
                    color: "#b5bfe2",
                  }}
                >
                  {selectedSpec.file.split("/").pop()}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginRight: "32px",
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: "bold",
                    textTransform: "uppercase",
                    background: "#414559",
                    color: "#81c8be",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  TypeScript
                </span>
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: "12px",
                    color: "#b5bfe2",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    transition: "background-color 0.2s",
                  }}
                  onClick={() => handleCopyCode(selectedSpec.code)}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = "#414559")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  <Copy size={11} />
                  {copiedCode ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <div
              style={{
                flex: 1,
                overflow: "auto",
                padding: "16px",
                background: "#232634",
              }}
            >
              {highlightTypeScript(selectedSpec.code)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
