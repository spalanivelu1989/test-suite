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
} from "lucide-react";
import { getAWSColors, AWS_COLORS, getStatusStyle } from "@/app/theme/aws";
import { useThemeMode } from "@/app/providers";
import type { Run, ProgressEvent, RunReport, TestOutcome } from "@/src/types";
import { ThreeProgressBar } from "./ThreeProgressBar";

interface InstanceDetailsPaneProps {
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
  { id: "planning", label: "Planner", colorKey: "mauve" },
  { id: "generating", label: "Generator", colorKey: "sky" },
  { id: "healing", label: "Healer", colorKey: "yellow" },
  { id: "reporting", label: "Reporter", colorKey: "green" },
] as const;

function getStageStatus(
  stageId: string,
  currentRunStage: string | undefined,
  runStatus: string
): "pending" | "active" | "completed" | "failed" {
  if (runStatus === "completed") return "completed";

  let mappedStageId = "planning";
  if (currentRunStage === "generating") {
    mappedStageId = "generating";
  } else if (currentRunStage === "running" || currentRunStage === "healing") {
    mappedStageId = "healing";
  } else if (currentRunStage === "flake-check" || currentRunStage === "reporting") {
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

function findNarrativeForSpec(specFile: string, summary: string[]): string | undefined {
  const name = specFile.split("/").pop() ?? specFile;
  const cleanSpec = name.replace(".spec.ts", "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

function highlightTypeScript(code: string) {
  const lines = code.split("\n");
  return lines.map((line, idx) => {
    let html = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    
    html = html.replace(/(["'`])(.*?)\1/g, '<span style="color: #a3e635;">$1$2$1</span>');
    
    const keywords = [
      "import", "from", "const", "let", "var", "await", "async", 
      "function", "class", "return", "export", "default", 
      "if", "else", "for", "while", "new", "type", "interface", "as"
    ];
    const kwRegex = new RegExp(`\\b(${keywords.join("|")})\\b`, "g");
    html = html.replace(kwRegex, '<span style="color: #c084fc; font-weight: bold;">$1</span>');
    
    const testTerms = ["test", "expect", "describe", "beforeAll", "beforeEach", "afterEach", "goto", "click", "fill", "locator"];
    const termRegex = new RegExp(`\\b(${testTerms.join("|")})\\b`, "g");
    html = html.replace(termRegex, '<span style="color: #60a5fa;">$1</span>');
    
    html = html.replace(/(\/\/.*)$/g, '<span style="color: #71717a; font-style: italic;">$1</span>');
    
    return (
      <Flex key={idx} align="flex-start" py={0.5} fontFamily="mono" fontSize="13px">
        <Text
          w="30px"
          minW="30px"
          color="#71717a"
          textAlign="right"
          pr={2.5}
          userSelect="none"
          borderRight="1px solid"
          borderColor="#27272a"
          mr={3}
        >
          {idx + 1}
        </Text>
        <Box
          flex={1}
          whiteSpace="pre-wrap"
          wordBreak="break-all"
          color="#e4e4e7"
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

function AWSCodeViewer({ filename, code, isMaximized, copiedFile, onCopy }: AWSCodeViewerProps) {
  const isCopied = copiedFile === filename;
  
  return (
    <Box
      border="1px solid"
      borderColor="#27272a"
      borderRadius="md"
      overflow="hidden"
      display="flex"
      flexDirection="column"
      h="100%"
      minH="200px"
      bg="#0f0f11"
    >
      <Flex
        bg="#18181b"
        px={3}
        py={2}
        align="center"
        justify="space-between"
        borderBottom="1px solid"
        borderColor="#27272a"
        userSelect="none"
      >
        <HStack gap={2}>
          <Code2 size={13} style={{ color: "#f97316" }} />
          <Text fontSize="13px" fontWeight="bold" fontFamily="mono" color="#d4d4d8">
            {filename}
          </Text>
        </HStack>
        <HStack gap={3}>
          <Badge variant="subtle" fontSize="11px" bg="#27272a" color="#a1a1aa" borderRadius="sm">
            TypeScript
          </Badge>
          <Button
            size="xs"
            variant="ghost"
            fontSize="12px"
            height="20px"
            px={2.5}
            color="#d4d4d8"
            _hover={{ bg: "#27272a", color: "white" }}
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
        bg="#09090b"
      >
        {highlightTypeScript(code)}
      </Box>
    </Box>
  );
}

export function InstanceDetailsPane({
  run,
  events,
  report,
  cancelling,
  onStop,
  onClose,
  isMaximized,
  onToggleMaximize,
}: InstanceDetailsPaneProps) {
  const { theme } = useThemeMode();
  const colors = getAWSColors(theme);
  const isDark = theme === "dark";
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState("details");
  const [selectedSpecFile, setSelectedSpecFile] = useState<string | null>(null);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [specFilterText, setSpecFilterText] = useState("");
  const [rightPaneTab, setRightPaneTab] = useState<"narrative" | "code">("narrative");

  const handleCopyCode = (filename: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedFile(filename);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  useEffect(() => {
    if (report?.generatedSpecs && report.generatedSpecs.length > 0) {
      const exists = report.generatedSpecs.some(s => s.file === selectedSpecFile);
      if (!exists) {
        setSelectedSpecFile(report.generatedSpecs[0].file);
      }
    } else {
      setSelectedSpecFile(null);
    }
  }, [report, selectedSpecFile]);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [events]);

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
      {/* 1. Header with Instance Name & State */}
      <Flex
        px={4}
        py={2.5}
        bg={isDark ? "slate.900" : "slate.50"}
        borderBottom="1px solid"
        borderColor={colors.border}
        align="center"
        justify="space-between"
      >
        <HStack gap={4}>
          <Text fontSize="13.5px" fontWeight="bold" fontFamily="mono" color={colors.text}>
            {shortId} ({run.config.url})
          </Text>
          <Badge
            variant="subtle"
            fontSize="10px"
            bg={statusStyle.bg}
            color={isDark ? statusStyle.darkColor : statusStyle.color}
            px={2}
            borderRadius="sm"
          >
            {statusStyle.label}
          </Badge>
        </HStack>

        <HStack gap={1.5}>
          <IconButton
            aria-label={isMaximized ? "Restore Details" : "Maximize Details (Full Screen)"}
            title={isMaximized ? "Exit full screen" : "Full screen (hides Instances table)"}
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
      <Tabs.Root value={activeDetailsTab} onValueChange={(details) => setActiveDetailsTab(details.value)} variant="subtle" style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
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
            _selected={{ bg: colors.cardBg, color: AWS_COLORS.orange.main }}
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
            _selected={{ bg: colors.cardBg, color: AWS_COLORS.orange.main }}
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
            _selected={{ bg: colors.cardBg, color: AWS_COLORS.orange.main }}
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
            _selected={{ bg: colors.cardBg, color: AWS_COLORS.orange.main }}
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
            _selected={{ bg: colors.cardBg, color: AWS_COLORS.orange.main }}
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
            _selected={{ bg: colors.cardBg, color: AWS_COLORS.orange.main }}
          >
            Test Plan & Specs Code
          </Tabs.Trigger>
        </Tabs.List>

        <Box flex={1} overflowY="auto" p={4} bg={colors.subBg}>
          {/* TAB 1: DETAILS */}
          <Box display={activeDetailsTab === "details" ? "block" : "none"}>
            <Box display="grid" gridTemplateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={6} fontSize="13px">
              <VStack align="stretch" gap={3}>
                <Heading size="xs" color={colors.text} borderBottom="1px solid" borderColor={colors.border} pb={1.5}>
                  Instance Summary
                </Heading>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Instance ID:</Text>
                  <Text fontWeight="bold" fontFamily="mono">{run.id}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Host IP address:</Text>
                  <Text fontWeight="bold">127.0.0.1</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>DNS Name:</Text>
                  <Text fontWeight="bold" fontFamily="mono">ec2-{run.id.slice(0, 8)}.local</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>State:</Text>
                  <Text fontWeight="bold" color={statusStyle.color}>{run.status}</Text>
                </Flex>
              </VStack>

              <VStack align="stretch" gap={3}>
                <Heading size="xs" color={colors.text} borderBottom="1px solid" borderColor={colors.border} pb={1.5}>
                  Crawl & Agent Settings
                </Heading>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Target URL:</Text>
                  <Text fontWeight="bold" overflow="hidden" textOverflow="ellipsis" maxW="200px" title={run.config.url}>
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
                        })[run.config.crawlMode] ?? run.config.crawlMode
                      : "Standard depth (depth 1)"}
                  </Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Max Pages visited:</Text>
                  <Text fontWeight="bold">{run.config.maxPages ?? 10}</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Launch time:</Text>
                  <Text fontWeight="bold">{new Date(run.createdAt).toLocaleString()}</Text>
                </Flex>
              </VStack>

              <VStack align="stretch" gap={3}>
                <Heading size="xs" color={colors.text} borderBottom="1px solid" borderColor={colors.border} pb={1.5}>
                  Storage Paths
                </Heading>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Workspace path:</Text>
                  <Text fontWeight="bold" fontFamily="mono">.runs/{run.id.slice(0, 8)}/</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Generated tests:</Text>
                  <Text fontWeight="bold" fontFamily="mono">.runs/{run.id.slice(0, 8)}/tests/</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Markdown spec plan:</Text>
                  <Text fontWeight="bold" fontFamily="mono">.runs/{run.id.slice(0, 8)}/specs/</Text>
                </Flex>
                <Flex justify="space-between">
                  <Text color={colors.subtext}>Playwright config:</Text>
                  <Text fontWeight="bold" fontFamily="mono">playwright.config.ts</Text>
                </Flex>
              </VStack>
            </Box>
          </Box>

          {/* TAB 2: STATUS CHECKS & REPORT */}
          <Box display={activeDetailsTab === "status-checks" ? "block" : "none"}>
            <VStack align="stretch" gap={5}>
              
              {/* Stepper progress bars */}
              <Box>
                <Text fontSize="13px" fontWeight="bold" color={colors.subtext} mb={3}>
                  Agent Execution Pipeline Checks
                </Text>
                <Box display="grid" gridTemplateColumns={{ base: "1fr", sm: "repeat(4, 1fr)" }} gap={3}>
                  {PIPELINE_STAGES.map((st) => {
                    const status = getStageStatus(st.id, currentStage, run.status);
                    let activeStartAt: string | undefined = undefined;
                    if (status === "active") {
                      const targetStages =
                        st.id === "planning" ? ["planning"] :
                        st.id === "generating" ? ["generating"] :
                        st.id === "healing" ? ["running", "healing"] :
                        st.id === "reporting" ? ["flake-check", "reporting"] : [];
                      const startEvent = events.find((ev) => targetStages.includes(ev.stage));
                      activeStartAt = startEvent?.at ?? run.createdAt;
                    }
                    return (
                      <ThreeProgressBar
                        key={st.id}
                        label={st.label}
                        status={status}
                        activeStartAt={activeStartAt}
                      />
                    );
                  })}
                </Box>
              </Box>

              {/* Run report display */}
              {report ? (
                <VStack align="stretch" gap={4} borderTop="1px solid" borderColor={colors.border} pt={4}>
                  <HStack justify="space-between">
                    <HStack gap={4}>
                      <Text fontSize="22px" fontWeight="black" fontFamily="mono">
                        {Math.round(report.successRate.rate * 100)}% Success
                      </Text>
                      <Text fontSize="13px" color={colors.subtext}>
                        ({report.successRate.passed} passed / {report.successRate.total} total tests executed)
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
                          _hover={{ bg: colors.rowHover, borderColor: AWS_COLORS.orange.main }}
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
                  <Box border="1px solid" borderColor={colors.border} borderRadius="sm" overflow="hidden">
                    <Table.Root size="sm" variant="outline" border="none">
                      <Table.Header bg={isDark ? "white/5" : "gray.100"}>
                        <Table.Row borderColor={colors.border}>
                          <Table.ColumnHeader color={colors.subtext} fontSize="11px" py={1.5}>Flow ID</Table.ColumnHeader>
                          <Table.ColumnHeader color={colors.subtext} fontSize="11px" py={1.5}>Verdict</Table.ColumnHeader>
                          <Table.ColumnHeader color={colors.subtext} fontSize="11px" py={1.5}>Observations / Error Logs</Table.ColumnHeader>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body fontSize="13px">
                        {report.results.map((res, i) => (
                          <Table.Row key={i} borderColor={colors.border} _hover={{ bg: colors.rowHover }}>
                            <Table.Cell py={1.5} fontFamily="mono" fontWeight="medium">
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
                            <Table.Cell py={1.5} color={res.failureReason ? "red.400" : colors.subtext}>
                              {res.failureReason ?? (res.healed ? "Locator was auto-healed successfully" : "Test completed with no errors")}
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Root>
                  </Box>

                  {/* Fix Prompts / Auto-heals */}
                  {report.fixPrompts.length > 0 && (
                    <Box>
                      <Text fontSize="13px" fontWeight="bold" color="orange.500" mb={2}>
                        Prescribed Auto-Heal Actions
                      </Text>
                      <VStack align="stretch" gap={2}>
                        {report.fixPrompts.map((fix, idx) => (
                          <Box key={idx} bg="orange.500/5" borderLeft="3px solid" borderColor="orange.500" p={2.5} borderRadius="sm" fontSize="13px">
                            <Text fontWeight="bold">{fix.test}</Text>
                            <Text color={colors.subtext} fontSize="11.5px" mt={0.5}>Problem: {fix.problem}</Text>
                            <Text color="orange.600" fontWeight="semibold" fontSize="11.5px" mt={0.5}>→ Auto-heal fix: {fix.change}</Text>
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
                
                {/* 1. What Was Tested (Overall narrative) */}
                {report.summary && report.summary.length > 0 && (
                  <Box bg={isDark ? "white/5" : "gray.50"} p={3} borderRadius="md" border="1px solid" borderColor={colors.border}>
                    <Heading size="xs" color={colors.text} mb={2.5} display="flex" alignItems="center" gap={2} fontSize="13px">
                      📋 Run Overview Narrative
                    </Heading>
                    <VStack align="stretch" gap={1.5} pl={1.5}>
                      {report.summary.map((bullet, idx) => (
                        <Text key={idx} fontSize="13px" color={colors.text} lineHeight={1.5}>
                          • {bullet}
                        </Text>
                      ))}
                    </VStack>
                  </Box>
                )}

                {/* 2. Tested Flows & Spec Files Paired */}
                {report.generatedSpecs && report.generatedSpecs.length > 0 ? (
                  <Box border="1px solid" borderColor={colors.border} p={3.5} borderRadius="md" bg={isDark ? "white/3" : "gray.50/30"}>
                    <Heading size="xs" color={colors.text} mb={3.5} display="flex" alignItems="center" gap={2} fontSize="13px">
                      📋 Tested User Flows & Spec Files Explorer
                    </Heading>
                    
                    <Grid templateColumns={{ base: "1fr", md: "260px 1fr" }} gap={4} h={isMaximized ? "calc(100vh - 380px)" : "300px"}>
                      {/* Left Navigation: AWS Lambda File Explorer */}
                      <Flex
                        direction="column"
                        border="1px solid"
                        borderColor={colors.border}
                        borderRadius="sm"
                        bg={isDark ? "slate.950" : "white"}
                        overflow="hidden"
                      >
                        {/* Search Input */}
                        <Box px={2.5} py={2} borderBottom="1px solid" borderColor={colors.border}>
                          <input
                            placeholder="Filter spec files..."
                            value={specFilterText}
                            onChange={(e) => setSpecFilterText(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              fontSize: "13px",
                              borderRadius: "2px",
                              border: `1px solid ${isDark ? "#334155" : "#cbd5e1"}`,
                              backgroundColor: isDark ? "#09090b" : "#ffffff",
                              color: isDark ? "#ffffff" : "#000000",
                              outline: "none",
                            }}
                          />
                        </Box>
                        
                        {/* File Tree Explorer */}
                        <Box overflowY="auto" flex={1} p={2}>
                          {(() => {
                            const filteredSpecs = report.generatedSpecs.filter(spec => {
                              const name = spec.file.split("/").pop() ?? spec.file;
                              return name.toLowerCase().includes(specFilterText.toLowerCase());
                            });
                            
                            return (
                              <VStack align="stretch" gap={0} fontSize="13px">
                                {/* Folder Row */}
                                <Flex align="center" gap={1.5} py={1.5} px={2} color={colors.text} fontWeight="semibold" userSelect="none">
                                  <span style={{ color: "#ec7211", fontSize: "12px" }}>📁</span>
                                  <Text fontSize="13px">tests</Text>
                                  <Badge variant="subtle" fontSize="11px" bg={isDark ? "zinc.800" : "gray.200"} color={colors.subtext} px={1} borderRadius="xs" ml="auto">
                                    {filteredSpecs.length}
                                  </Badge>
                                </Flex>
                                
                                {/* Nested Spec Files */}
                                <VStack align="stretch" gap={0.5} pl={4.5} borderLeft="1px dashed" borderColor={colors.border} ml={3} mt={0.5}>
                                  {filteredSpecs.map((spec) => {
                                    const name = spec.file.split("/").pop() ?? spec.file;
                                    const flowId = name.replace(".spec.ts", "");
                                    const matchedFlow = report.flows?.find(
                                      (f) => f.id === flowId || flowId.includes(f.id) || f.id.includes(flowId)
                                    );
                                    const testResult = report.results?.find(
                                      (r) => r.fileName === name || r.flowId === flowId || name.includes(r.flowId)
                                    );
                                    const isSelected = selectedSpecFile === spec.file;
                                    const statusDotColor = testResult
                                      ? (testResult.outcome === "passed" ? "#00c853" : testResult.outcome === "failed" ? "#ff3d00" : "#ffab00")
                                      : "#94a3b8";
                                    
                                    return (
                                      <Flex
                                        key={spec.file}
                                        as="button"
                                        w="full"
                                        py={1.5}
                                        px={2.5}
                                        borderRadius="xs"
                                        align="center"
                                        justify="space-between"
                                        textAlign="left"
                                        cursor="pointer"
                                        bg={isSelected ? (isDark ? "zinc.800" : "gray.200") : "transparent"}
                                        borderLeft="3px solid"
                                        borderLeftColor={isSelected ? "#ec7211" : "transparent"}
                                        _hover={{ bg: isSelected ? (isDark ? "zinc.800" : "gray.200") : colors.rowHover }}
                                        onClick={() => setSelectedSpecFile(spec.file)}
                                      >
                                        <HStack gap={2} flex={1} overflow="hidden">
                                          <span style={{ color: "#ec7211", fontSize: "12px", flexShrink: 0 }}>📄</span>
                                          <Text
                                            fontSize="13px"
                                            fontWeight={isSelected ? "bold" : "medium"}
                                            color={isSelected ? colors.text : colors.subtext}
                                            whiteSpace="nowrap"
                                            textOverflow="ellipsis"
                                            overflow="hidden"
                                            display="block"
                                            w="100%"
                                            title={name}
                                          >
                                            {name}
                                          </Text>
                                        </HStack>
                                        <Box w="6px" h="6px" borderRadius="full" bg={statusDotColor} flexShrink={0} ml={2} title={testResult?.outcome || "unknown"} />
                                      </Flex>
                                    );
                                  })}
                                  {filteredSpecs.length === 0 && (
                                    <Text fontSize="12px" color={colors.subtext} fontStyle="italic" py={2} pl={2}>
                                      No specs match filter
                                    </Text>
                                  )}
                                </VStack>
                              </VStack>
                            );
                          })()}
                        </Box>
                      </Flex>
                      
                      {/* Right Details Panel: AWS Lambda Function Code Editor / Details layout */}
                      {(() => {
                        const spec = report.generatedSpecs.find(s => s.file === selectedSpecFile) || report.generatedSpecs[0];
                        if (!spec) return (
                          <Flex align="center" justify="center" h="100%" border="1px solid" borderColor={colors.border} borderRadius="sm">
                            <Text fontSize="13px" color={colors.subtext}>Select a user flow to view details.</Text>
                          </Flex>
                        );
                        
                        const name = spec.file.split("/").pop() ?? spec.file;
                        const flowId = name.replace(".spec.ts", "");
                        const matchedFlow = report.flows?.find(
                           (f) => f.id === flowId || flowId.includes(f.id) || f.id.includes(flowId)
                        );
                        const pairedNarrative = report.summary ? findNarrativeForSpec(name, report.summary) : undefined;
                        const testResult = report.results?.find(
                          (r) => r.fileName === name || r.flowId === flowId || name.includes(r.flowId)
                        );
                        
                        return (
                          <Box
                            display="flex"
                            flexDirection="column"
                            h="100%"
                            overflow="hidden"
                            border="1px solid"
                            borderColor={colors.border}
                            borderRadius="sm"
                            bg={isDark ? "slate.900" : "white"}
                          >
                            {/* Editor Tab Bar */}
                            <Flex
                              bg={isDark ? "slate.950" : "gray.50"}
                              borderBottom="1px solid"
                              borderColor={colors.border}
                              align="center"
                              justify="space-between"
                              px={3}
                              py={1}
                            >
                              <HStack gap={1}>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  h="26px"
                                  px={3.5}
                                  borderRadius="xs"
                                  fontSize="13px"
                                  fontWeight="bold"
                                  color={rightPaneTab === "narrative" ? (isDark ? "white" : "black") : colors.subtext}
                                  bg={rightPaneTab === "narrative" ? (isDark ? "slate.900" : "white") : "transparent"}
                                  borderBottom={rightPaneTab === "narrative" ? "2px solid #ec7211" : "none"}
                                  _hover={{ bg: isDark ? "slate.900" : "white" }}
                                  cursor="pointer"
                                  onClick={() => setRightPaneTab("narrative")}
                                  display="flex"
                                  alignItems="center"
                                  gap={1.5}
                                >
                                  <span style={{ fontSize: "12px" }}>📖</span> Narrative & Steps
                                </Button>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  h="26px"
                                  px={3.5}
                                  borderRadius="xs"
                                  fontSize="13px"
                                  fontWeight="bold"
                                  color={rightPaneTab === "code" ? (isDark ? "white" : "black") : colors.subtext}
                                  bg={rightPaneTab === "code" ? (isDark ? "slate.900" : "white") : "transparent"}
                                  borderBottom={rightPaneTab === "code" ? "2px solid #ec7211" : "none"}
                                  _hover={{ bg: isDark ? "slate.900" : "white" }}
                                  cursor="pointer"
                                  onClick={() => setRightPaneTab("code")}
                                  display="flex"
                                  alignItems="center"
                                  gap={1.5}
                                >
                                  <span style={{ fontSize: "12px" }}>💻</span> Playwright Spec Code
                                </Button>
                              </HStack>
                              
                              <HStack gap={2}>
                                <Text fontSize="12px" color={colors.subtext} fontFamily="mono" display={{ base: "none", sm: "block" }}>
                                  {name}
                                </Text>
                                {testResult && (
                                  <Badge
                                    colorPalette={OUTCOME_COLOR[testResult.outcome]}
                                    variant="solid"
                                    fontSize="11px"
                                    borderRadius="xs"
                                    px={2}
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
                                  <Box border="1px solid" borderColor={colors.border} borderRadius="sm" p={3} bg={isDark ? "white/5" : "gray.50"}>
                                    <Grid templateColumns={{ base: "1fr", sm: "repeat(2, 1fr)" }} gap={3} fontSize="13px">
                                      <HStack align="flex-start" gap={2}>
                                        <Text color={colors.subtext} fontWeight="semibold" w="80px" flexShrink={0}>Flow Name:</Text>
                                        <Text fontWeight="bold" color={colors.text}>
                                          {matchedFlow?.name || flowId.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                                        </Text>
                                      </HStack>
                                      <HStack align="flex-start" gap={2}>
                                        <Text color={colors.subtext} fontWeight="semibold" w="80px" flexShrink={0}>Spec File:</Text>
                                        <Text fontWeight="medium" fontFamily="mono" color={colors.text} style={{ wordBreak: "break-all" }}>
                                          {spec.file}
                                        </Text>
                                      </HStack>
                                      <HStack align="flex-start" gap={2}>
                                        <Text color={colors.subtext} fontWeight="semibold" w="80px" flexShrink={0}>Outcome:</Text>
                                        {testResult ? (
                                          <Badge
                                            colorPalette={OUTCOME_COLOR[testResult.outcome]}
                                            variant="solid"
                                            fontSize="11px"
                                            borderRadius="xs"
                                            px={1.5}
                                          >
                                            {testResult.outcome.toUpperCase()}
                                          </Badge>
                                        ) : (
                                          <Badge colorPalette="gray" variant="solid" fontSize="11px" borderRadius="xs" px={1.5}>PENDING</Badge>
                                        )}
                                      </HStack>
                                      <HStack align="flex-start" gap={2}>
                                        <Text color={colors.subtext} fontWeight="semibold" w="80px" flexShrink={0}>Steps Count:</Text>
                                        <Text fontWeight="bold" color={colors.text}>
                                          {matchedFlow?.steps?.length ?? 0} actions
                                        </Text>
                                      </HStack>
                                    </Grid>
                                  </Box>
                                  
                                  {/* Narrative Block (AWS Callout style) */}
                                  {pairedNarrative && (
                                    <Box
                                      bg={isDark ? "slate.800/40" : "blue.50/30"}
                                      borderLeft="4px solid"
                                      borderColor="blue.500"
                                      p={3.5}
                                      borderRadius="xs"
                                    >
                                      <Flex gap={2} align="flex-start">
                                        <span style={{ color: "#3b82f6", fontSize: "14px", marginTop: "-1px" }}>ℹ️</span>
                                        <VStack align="stretch" gap={1}>
                                          <Text fontSize="13px" fontWeight="bold" color={colors.text}>
                                            User Flow Narrative (What was verified)
                                          </Text>
                                          <Text fontSize="13px" color={colors.text} lineHeight={1.5}>
                                            {pairedNarrative}
                                          </Text>
                                        </VStack>
                                      </Flex>
                                    </Box>
                                  )}
                                  
                                  {/* Steps Visual List */}
                                  {matchedFlow && matchedFlow.steps && matchedFlow.steps.length > 0 && (
                                    <Box>
                                      <Text fontSize="13px" fontWeight="bold" mb={2.5} color={colors.text}>
                                        📋 Action Timeline Steps (How it was tested)
                                      </Text>
                                      <VStack align="stretch" gap={3} pl={1}>
                                        {matchedFlow.steps.map((step, idx) => {
                                          let stepIcon = <Box w="14px" h="14px" borderRadius="full" border="2px solid" borderColor="gray.400" flexShrink={0} mt={0.5} />;
                                          if (testResult?.outcome === "passed") {
                                            stepIcon = <CircleCheck size={14} color="#00c853" style={{ flexShrink: 0, marginTop: "2px" }} />;
                                          } else if (testResult?.outcome === "failed" && idx === matchedFlow.steps!.length - 1) {
                                            stepIcon = <CircleX size={14} color="#ff3d00" style={{ flexShrink: 0, marginTop: "2px" }} />;
                                          } else if (testResult?.outcome === "failed") {
                                            stepIcon = <CircleCheck size={14} color="#00c853" style={{ flexShrink: 0, marginTop: "2px" }} />;
                                          }
                                          
                                          return (
                                            <HStack key={idx} align="flex-start" gap={3} p={2} bg={isDark ? "white/2" : "gray.50"} borderRadius="xs" borderLeft="2px solid" borderColor={isDark ? "zinc.700" : "gray.300"}>
                                              <Badge variant="solid" bg="slate.500" color="white" fontSize="11px" px={1.5} py={0.5} borderRadius="xs" flexShrink={0}>
                                                Step {idx + 1}
                                              </Badge>
                                              {stepIcon}
                                              <Text fontSize="13px" color={colors.text} lineHeight={1.4}>
                                                {step}
                                              </Text>
                                            </HStack>
                                          );
                                        })}
                                      </VStack>
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
                  report.flows && report.flows.length > 0 && (
                    <Box border="1px solid" borderColor={colors.border} p={4} borderRadius="md" bg={isDark ? "white/3" : "gray.50/30"}>
                      <Heading size="xs" color={colors.text} mb={3}>
                        📋 Detailed Test Scenarios & Steps
                      </Heading>
                      <VStack align="stretch" gap={3}>
                        {report.flows.map((flow) => (
                          <Box key={flow.id} bg={isDark ? "white/3" : "white"} p={3} borderRadius="sm" borderLeft="3px solid" borderColor={AWS_COLORS.orange.main}>
                            <Text fontSize="13px" fontWeight="bold" color={colors.text}>
                              {flow.name || flow.id} (Check ID: <code style={{ fontSize: "12px" }}>{flow.id}</code>)
                            </Text>
                            <VStack align="stretch" gap={1.5} mt={2.5} pl={3}>
                              {(flow.steps ?? []).map((step, idx) => (
                                <Text key={idx} fontSize="13px" color={colors.subtext} lineHeight={1.4}>
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

                {/* 3. Issues Found & Recommendations */}
                <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
                  <Box bg={isDark ? "white/5" : "gray.50"} p={4} borderRadius="md" border="1px solid" borderColor={colors.border}>
                    <Heading size="xs" color="red.500" mb={3} display="flex" alignItems="center" gap={2}>
                      🔍 Issues Found
                    </Heading>
                    {report.issues && report.issues.length > 0 ? (
                      <VStack align="stretch" gap={2} pl={2}>
                        {report.issues.map((issue, idx) => (
                          <Text key={idx} fontSize="13px" color={colors.text} lineHeight={1.5}>
                            • {issue}
                          </Text>
                        ))}
                      </VStack>
                    ) : (
                      <Text fontSize="13px" color={colors.subtext} fontStyle="italic">No issues detected.</Text>
                    )}
                  </Box>

                  <Box bg={isDark ? "white/5" : "gray.50"} p={4} borderRadius="md" border="1px solid" borderColor={colors.border}>
                    <Heading size="xs" color="orange.500" mb={3} display="flex" alignItems="center" gap={2}>
                      💡 Recommendations
                    </Heading>
                    {report.recommendations && report.recommendations.length > 0 ? (
                      <VStack align="stretch" gap={2} pl={2}>
                        {report.recommendations.map((rec, idx) => (
                          <Text key={idx} fontSize="13px" color={colors.text} lineHeight={1.5}>
                            • {rec}
                          </Text>
                        ))}
                      </VStack>
                    ) : (
                      <Text fontSize="13px" color={colors.subtext} fontStyle="italic">No recommendations at this time.</Text>
                    )}
                  </Box>
                </Grid>

              </VStack>
            ) : (
              <Flex align="center" justify="center" h="150px" direction="column" gap={3}>
                {run.status === "running" ? (
                  <>
                    <Spinner size="md" color={AWS_COLORS.orange.main} />
                    <Text fontSize="13px" color={colors.subtext}>
                      Agent pipeline is in progress. The narrative summary will be available once reporting is complete.
                    </Text>
                  </>
                ) : (
                  <Text fontSize="13px" color={colors.subtext} fontStyle="italic">
                    No narrative available (Run stopped or failed before reporting completed).
                  </Text>
                )}
              </Flex>
            )}
          </Box>

          {/* TAB 3: MONITORING */}
          <Box display={activeDetailsTab === "monitoring" ? "block" : "none"}>
            <Box display="grid" gridTemplateColumns={{ base: "1fr", md: "repeat(4, 1fr)" }} gap={4} fontSize="13px">
              <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} p={3.5} borderRadius="sm">
                <Text color={colors.subtext} fontWeight="semibold" mb={1}>SUCCESS RATE</Text>
                <Text fontSize="24px" fontWeight="black" color={report ? "green.500" : colors.subtext}>
                  {report ? `${Math.round(report.successRate.rate * 100)}%` : "N/A"}
                </Text>
                <Text fontSize="12px" color={colors.subtext} mt={1}>Passed tests / planned tests</Text>
              </Box>

              <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} p={3.5} borderRadius="sm">
                <Text color={colors.subtext} fontWeight="semibold" mb={1}>CLAUDE CALL COUNT</Text>
                <Text fontSize="24px" fontWeight="black" color={AWS_COLORS.orange.main}>
                  {report ? report.claudeCallCount : 0} calls
                </Text>
                <Text fontSize="12px" color={colors.subtext} mt={1}>LLM planning & repair requests</Text>
              </Box>

              <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} p={3.5} borderRadius="sm">
                <Text color={colors.subtext} fontWeight="semibold" mb={1}>FLAKE RATE</Text>
                <Text fontSize="24px" fontWeight="black" color="orange.500">
                  {report ? `${Math.round(report.flakeRate * 100)}%` : "N/A"}
                </Text>
                <Text fontSize="12px" color={colors.subtext} mt={1}>Divergent results across re-runs</Text>
              </Box>

              <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} p={3.5} borderRadius="sm">
                <Text color={colors.subtext} fontWeight="semibold" mb={1}>AUTO-HEAL SUCCESS</Text>
                <Text fontSize="24px" fontWeight="black" color="blue.500">
                  {report ? `${Math.round(report.healSuccessRate * 100)}%` : "N/A"}
                </Text>
                <Text fontSize="12px" color={colors.subtext} mt={1}>Failed locators healed by LLM</Text>
              </Box>
            </Box>
          </Box>

          {/* TAB 4: CONSOLE LOGS */}
          <Box display={activeDetailsTab === "logs" ? "block" : "none"}>
            <Flex justify="space-between" align="center" mb={2}>
              <Text fontSize="13px" fontWeight="bold" color={colors.subtext}>
                Live System Log Stream (stdout)
              </Text>
              <HStack gap={2}>
                <Box w="6px" h="6px" borderRadius="full" bg={run.status === "running" ? "green.500" : "slate.500"} className={run.status === "running" ? "animate-pulse" : ""} />
                <Text fontSize="12px" color={colors.subtext} fontFamily="mono">
                  {run.status === "running" ? "STREAMING" : "STREAM CLOSED"}
                </Text>
              </HStack>
            </Flex>

            {/* Terminal Window */}
            <Box
              ref={logContainerRef}
              bg="black"
              color="#38bdf8"
              p={4}
              borderRadius="sm"
              fontFamily="mono"
              fontSize="13px"
              h={isMaximized ? "calc(100vh - 240px)" : "260px"}
              overflowY="auto"
              border="1px solid"
              borderColor="slate.800"
              boxShadow="inset 0 2px 8px rgba(0,0,0,0.8)"
            >
              {events.length === 0 ? (
                <Text color="slate.600" fontStyle="italic">
                  Waiting for system console log messages...
                </Text>
              ) : (
                events.map((ev, i) => (
                  <Flex key={i} align="flex-start" gap={2} mb={1} lineHeight={1.5}>
                    <Text color="emerald.500" userSelect="none" flexShrink={0}>
                      &gt;
                    </Text>
                    <Text color="slate.500" w="65px" flexShrink={0} userSelect="none">
                      [{ev.stage}]
                    </Text>
                    <Text color="white" wordBreak="break-word" whiteSpace="pre-wrap">
                      {ev.message}
                    </Text>
                  </Flex>
                ))
              )}
            </Box>
          </Box>

          {/* TAB 5: TEST PLAN & SPECS CODE */}
          <Box display={activeDetailsTab === "code" ? "block" : "none"}>
            {report ? (
              <VStack align="stretch" gap={4}>
                
                {/* AI Plan Section */}
                {report.planMarkdown && (
                  <Box border="1px solid" borderColor={colors.border} borderRadius="sm" overflow="hidden">
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
                        <Code2 size={13} style={{ color: AWS_COLORS.orange.main }} />
                        <Text fontSize="13px" fontWeight="bold">AI Spec Test Plan</Text>
                      </HStack>
                      {showPlan ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
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
                  <Text fontSize="13px" fontWeight="bold" color={colors.subtext} mb={2}>
                    Generated Spec Files ({report.generatedSpecs.length})
                  </Text>
                  
                  {report.generatedSpecs.length === 0 ? (
                    <Text fontSize="13px" color={colors.subtext} fontStyle="italic">No spec files generated.</Text>
                  ) : (
                    <VStack align="stretch" gap={2}>
                      {report.generatedSpecs.map((spec) => {
                        const isOpen = !!openSpecs[spec.file];
                        const name = spec.file.split("/").pop() ?? spec.file;
                        const flowId = name.replace(".spec.ts", "");
                        const matchedFlow = report.flows?.find(
                          (f) => f.id === flowId || flowId.includes(f.id) || f.id.includes(flowId)
                        );
                        const pairedNarrative = report.summary ? findNarrativeForSpec(name, report.summary) : undefined;
                        
                        return (
                          <Box key={spec.file} border="1px solid" borderColor={colors.border} borderRadius="sm" overflow="hidden">
                            <Flex
                              as="button"
                              w="full"
                              align="center"
                              justify="space-between"
                              px={3}
                              py={2}
                              bg={isOpen ? (isDark ? "white/5" : "gray.100") : "transparent"}
                              cursor="pointer"
                              onClick={() => setOpenSpecs(prev => ({ ...prev, [spec.file]: !prev[spec.file] }))}
                            >
                              <HStack gap={3}>
                                <Code2 size={13} style={{ color: AWS_COLORS.orange.main }} />
                                <Text fontSize="13px" fontWeight="bold" fontFamily="mono">{name}</Text>
                                {matchedFlow && (
                                  <Text fontSize="12px" color={colors.subtext} fontWeight="medium">
                                    — {matchedFlow.name}
                                  </Text>
                                )}
                              </HStack>
                              {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </Flex>
                            
                            {isOpen && (
                              <VStack align="stretch" gap={0} borderTop="1px solid" borderColor={colors.border}>
                                {(pairedNarrative || matchedFlow) && (
                                  <Box
                                    p={3}
                                    bg={isDark ? "white/2" : "gray.50/50"}
                                    borderBottom="1px solid"
                                    borderColor={colors.border}
                                    textAlign="left"
                                  >
                                    {pairedNarrative && (
                                      <Box mb={matchedFlow ? 3 : 0}>
                                        <Text fontSize="13px" fontWeight="bold" mb={1} color={colors.text}>
                                          📖 Narrative (What Was Tested):
                                        </Text>
                                        <Text fontSize="13px" color={colors.text} mb={1}>
                                          {pairedNarrative}
                                        </Text>
                                      </Box>
                                    )}
                                    {matchedFlow && (
                                      <Box>
                                        <Text fontSize="13px" fontWeight="bold" mb={1} color={colors.text}>
                                          📋 Test Scenario Steps:
                                        </Text>
                                        {matchedFlow.steps && matchedFlow.steps.length > 0 && (
                                          <VStack align="stretch" gap={1} pl={2}>
                                            {matchedFlow.steps.map((step, idx) => (
                                              <Text key={idx} fontSize="12px" color={colors.subtext}>
                                                {idx + 1}. {step}
                                              </Text>
                                            ))}
                                          </VStack>
                                        )}
                                      </Box>
                                    )}
                                  </Box>
                                )}
                                <Box p={3} bg="black" h={isMaximized ? "450px" : "250px"} overflow="hidden">
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
                  Code and test plan will be displayed here once generated by the AI agent.
                </Text>
              </Flex>
            )}
          </Box>
        </Box>
      </Tabs.Root>
    </Box>
  );
}
