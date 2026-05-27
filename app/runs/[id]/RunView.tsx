"use client";

import React from "react";

import {
  Badge,
  Box,
  Button,
  Code,
  Heading,
  HStack,
  Link,
  Spinner,
  Stack,
  Tabs,
  Table,
  Text,
  Flex,
  VStack,
} from "@chakra-ui/react";
import {
  CircleCheck,
  CircleX,
  Code2,
  ChevronDown,
  ChevronUp,
  Download,
  TriangleAlert,
  Wrench,
  ChevronRight,
  Terminal,
} from "lucide-react";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import type { ProgressEvent, RunReport, TestOutcome } from "@/src/types";
import { ThreeProgressBar } from "@/app/components/ThreeProgressBar";
import { useThemeMode } from "@/app/providers";

type Status = "running" | "completed" | "failed";

/** Return the basename of a file path for matching purposes. */
function baseName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

const OUTCOME_COLOR: Record<TestOutcome, string> = {
  passed: "green",
  failed: "red",
  flaky: "orange",
  healed: "blue",
  fixme: "gray",
};

const OUTCOME_GLOW: Record<TestOutcome, string> = {
  passed: "rgba(16, 185, 129, 0.2)",
  failed: "rgba(239, 68, 68, 0.2)",
  flaky: "rgba(245, 158, 11, 0.2)",
  healed: "rgba(59, 130, 246, 0.2)",
  fixme: "rgba(100, 116, 139, 0.2)",
};

const PIPELINE_STAGES = [
  { id: "planning", label: "Planner", colorHex: "#a78bfa" },
  { id: "generating", label: "Generator", colorHex: "#22d3ee" },
  { id: "healing", label: "Healer", colorHex: "#fbbf24" },
  { id: "reporting", label: "Reporter", colorHex: "#34d399" },
] as const;

function getStageStatus(
  stageId: string,
  currentRunStage: string | undefined,
  runStatus: Status
): "pending" | "active" | "completed" | "failed" {
  if (runStatus === "completed") {
    return "completed";
  }

  // Map raw execution stages to the corresponding active agent stage
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

  if (runStatus === "failed") {
    if (thisStageIndex === currentStageIndex) {
      return "failed";
    }
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

export function RunView({ id }: { id: string }) {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [status, setStatus] = useState<Status>("running");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const { theme } = useThemeMode();
  const isDark = theme === "dark";

  useEffect(() => {
    const es = new EventSource(`/api/runs/${id}/stream`);
    es.addEventListener("progress", (e) => {
      setEvents((prev) => [...prev, JSON.parse((e as MessageEvent).data)]);
    });
    es.addEventListener("end", async (e) => {
      const { status: s, error: err } = JSON.parse((e as MessageEvent).data);
      es.close();
      if (s === "failed") {
        setStatus("failed");
        setError(err ?? "The run failed");
        return;
      }
      const res = await fetch(`/api/runs/${id}/report?format=json`);
      if (res.ok) setReport((await res.json()) as RunReport);
      setStatus("completed");
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setStatus((cur) => (cur === "running" ? "failed" : cur));
        setError((cur) => cur ?? "Lost connection to the run stream");
      }
    };
    return () => es.close();
  }, [id]);

  const currentStage = events[events.length - 1]?.stage;


  return (
    <Box
      minH="100dvh"
      bg={
        isDark
          ? "radial-gradient(circle at top, #0b1528 0%, #020617 100%)"
          : "radial-gradient(circle at top, #f1f5f9 0%, #e2e8f0 100%)"
      }
      color={isDark ? "white" : "slate.900"}
      py={10}
      px={{ base: 4, md: 8 }}
      transition="background-color 0.3s ease, color 0.3s ease"
    >
      <Stack gap={8} w="full" maxW="full" mx="auto">
        <HStack justify="space-between" borderBottomWidth="1px" borderColor={isDark ? "white/5" : "gray.200"} pb={4}>
          <VStack align="stretch" gap={1}>
            <Heading
              size="2xl"
              fontWeight="extrabold"
              color={isDark ? "white" : "slate.900"}
            >
              Dashboard
            </Heading>
          </VStack>
        </HStack>

        {/* 3D Progress Indicators Grid (T19) */}
        <Box
          bg={isDark ? "rgba(15, 23, 42, 0.35)" : "white"}
          borderWidth="1px"
          borderColor={isDark ? "white/10" : "gray.200"}
          borderRadius="2xl"
          p={6}
          backdropFilter="blur(20px)"
          boxShadow={isDark ? "0 20px 40px -15px rgba(0, 0, 0, 0.5)" : "0 10px 30px -10px rgba(0, 0, 0, 0.05)"}
          transition="all 0.3s ease"
        >
          <Flex align="center" justify="space-between" mb={6}>
            <Text fontWeight="semibold" fontSize="sm" color={isDark ? "slate.400" : "slate.600"} display="flex" alignItems="center" gap={2}>
              <Terminal size={14} style={{ color: "#06b6d4" }} /> Agents Working...
            </Text>
            <HStack gap={2}>
              {status === "running" && <Spinner size="xs" color="cyan.500" />}
              <Text
                fontWeight="bold"
                fontSize="xs"
                fontFamily="mono"
                color={
                  status === "running"
                    ? "cyan.450"
                    : status === "completed"
                      ? "emerald.500"
                      : "red.500"
                }
              >
                {status === "running" ? "RUNNING" : status === "completed" ? "COMPLETED" : "FAILED"}
              </Text>
            </HStack>
          </Flex>

          <Box
            display="grid"
            gridTemplateColumns={{ base: "1fr", md: "repeat(4, 1fr)" }}
            gap={4}
            w="full"
            mb={6}
          >
            {PIPELINE_STAGES.map((st) => (
              <ThreeProgressBar
                key={st.id}
                label={st.label}
                status={getStageStatus(st.id, currentStage, status)}
                colorHex={st.colorHex}
              />
            ))}
          </Box>

          {/* Console Output (T19) */}
          <Box
            bg={isDark ? "rgba(2, 6, 23, 0.75)" : "slate.950"}
            borderColor={isDark ? "white/10" : "slate.900"}
            borderWidth="1px"
            borderRadius="xl"
            p={4}
            fontFamily="mono"
            boxShadow="inset 0 1px 4px rgba(0, 0, 0, 0.25)"
          >
            <Flex justify="space-between" align="center" borderBottomWidth="1px" borderColor="white/5" pb={2} mb={3}>
              <Text fontSize="xs" color="slate.500">
                SYSTEM LOG STREAM
              </Text>
              <Box w={2} h={2} borderRadius="full" bg={status === "running" ? "cyan.400" : "slate.600"} className={status === "running" ? "animate-pulse" : ""} />
            </Flex>
            
            <Stack gap={1.5} maxH="44" overflowY="auto" className="scrollbar-thin">
              {events.length === 0 ? (
                <Text fontSize="xs" color="slate.600">
                  Waiting for log connection...
                </Text>
              ) : (
                events.map((ev, i) => (
                  <Flex key={i} fontSize="xs" align="flex-start" gap={2}>
                    <Text color="cyan.500" userSelect="none" flexShrink={0}>
                      &gt;
                    </Text>
                    <Text color="slate.500" w="65px" flexShrink={0} userSelect="none">
                      [{ev.stage}]
                    </Text>
                    <Text color="slate.300" wordBreak="break-word">
                      {ev.message}
                    </Text>
                  </Flex>
                ))
              )}
            </Stack>
          </Box>
        </Box>

        {/* Failure state */}
        {status === "failed" && (
          <Box
            bg={isDark ? "rgba(239, 68, 68, 0.05)" : "red.50"}
            borderColor={isDark ? "red.500/25" : "red.200"}
            borderWidth="1px"
            borderRadius="xl"
            p={5}
            boxShadow="0 10px 30px rgba(239, 68, 68, 0.05)"
          >
            <Text color={isDark ? "red.400" : "red.700"} display="flex" alignItems="center" gap={3} fontWeight="medium">
              <TriangleAlert size={20} /> {error}
            </Text>
          </Box>
        )}

        {/* Rich report with tabs (T20 + T21) */}
        {report && (
          <Box
            bg={isDark ? "rgba(15, 23, 42, 0.35)" : "white"}
            borderWidth="1px"
            borderColor={isDark ? "white/10" : "gray.200"}
            borderRadius="2xl"
            p={{ base: 6, md: 8 }}
            backdropFilter="blur(20px)"
            boxShadow={isDark ? "0 25px 50px -12px rgba(0, 0, 0, 0.5)" : "0 15px 30px -10px rgba(0, 0, 0, 0.05)"}
            transition="all 0.3s ease"
          >
            <Flex
              direction={{ base: "column", md: "row" }}
              justify="space-between"
              align={{ base: "stretch", md: "center" }}
              gap={4}
              mb={6}
              pb={6}
              borderBottomWidth="1px"
              borderColor={isDark ? "white/5" : "gray.200"}
            >
              <VStack align="stretch" gap={1.5}>
                <HStack gap={3}>
                  <Text
                    fontSize="4xl"
                    fontWeight="black"
                    fontFamily="mono"
                    color={isDark ? "white" : "slate.900"}
                    textShadow={isDark ? "0 0 15px rgba(255,255,255,0.1)" : "none"}
                  >
                    {Math.round(report.successRate.rate * 100)}%
                  </Text>
                  <VStack align="stretch" gap={0}>
                    <Text fontSize="sm" fontWeight="bold" color={isDark ? "slate.300" : "slate.700"}>
                      SUCCESS RATE
                    </Text>
                    <Text fontSize="xs" color="slate.500">
                      {report.successRate.passed}/{report.successRate.total} tests passed
                    </Text>
                  </VStack>
                </HStack>
              </VStack>
            </Flex>

            <Tabs.Root defaultValue="report" variant="subtle">
              <Tabs.List bg={isDark ? "rgba(2, 6, 23, 0.4)" : "gray.100"} p={1.5} borderRadius="xl" borderWidth="1px" borderColor={isDark ? "white/5" : "gray.200"} mb={6} display="inline-flex">
                <Tabs.Trigger
                  value="report"
                  px={5}
                  py={2}
                  borderRadius="lg"
                  cursor="pointer"
                  color={isDark ? "slate.400" : "slate.600"}
                  _selected={{
                    color: isDark ? "white" : "slate.900",
                    bg: isDark ? "rgba(255,255,255,0.06)" : "white",
                    boxShadow: isDark ? "inset 0 1px 1px rgba(255,255,255,0.08)" : "sm",
                  }}
                  transition="all 0.2s"
                >
                  Report
                </Tabs.Trigger>
                <Tabs.Trigger
                  value="code"
                  px={5}
                  py={2}
                  borderRadius="lg"
                  cursor="pointer"
                  color={isDark ? "slate.400" : "slate.600"}
                  _selected={{
                    color: isDark ? "white" : "slate.900",
                    bg: isDark ? "rgba(255,255,255,0.06)" : "white",
                    boxShadow: isDark ? "inset 0 1px 1px rgba(255,255,255,0.08)" : "sm",
                  }}
                  transition="all 0.2s"
                >
                  Generated Specs
                </Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="report">
                <Stack gap={6}>
                  {report.summary && report.summary.length > 0 && (
                    <ReportListCard title="WHAT WAS TESTED (EXPLANATION)" items={report.summary} colorHex="#0ea5e9" />
                  )}

                  <Box>
                    <Heading size="md" fontWeight="bold" color={isDark ? "slate.300" : "slate.800"} mb={3} display="flex" alignItems="center" gap={2}>
                      <ChevronRight size={16} /> Raw Test Metrics
                    </Heading>
                    
                    <TestMetricsTable report={report} isDark={isDark} id={id} />
                  </Box>

                  {report.fixPrompts.length > 0 && (
                    <Box>
                      <Heading size="md" fontWeight="bold" color={isDark ? "slate.300" : "slate.800"} mb={3} display="flex" alignItems="center" gap={2}>
                        <ChevronRight size={16} /> Prescribed Auto-Heal Actions
                      </Heading>
                      <Stack gap={3}>
                        {report.fixPrompts.map((f, i) => (
                          <Box
                            key={i}
                            borderLeftWidth="3px"
                            borderColor="orange.400"
                            bg={isDark ? "rgba(245, 158, 11, 0.04)" : "orange.50/40"}
                            p={4}
                            borderRadius="r-xl"
                            borderRightWidth="1px"
                            borderTopWidth="1px"
                            borderBottomWidth="1px"
                            borderRightColor={isDark ? "white/5" : "orange.200/20"}
                            borderTopColor={isDark ? "white/5" : "orange.200/20"}
                            borderBottomColor={isDark ? "white/5" : "orange.200/20"}
                          >
                            <Text fontWeight="bold" fontSize="sm" color={isDark ? "slate.200" : "slate.800"} mb={1} fontFamily="mono">
                              {f.test}
                            </Text>
                            <Text fontSize="xs" color={isDark ? "slate.400" : "slate.600"} mb={2}>
                              Problem: {f.problem}
                            </Text>
                            <Text fontSize="xs" fontWeight="semibold" color="orange.500">
                              → Action: {f.change}
                            </Text>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  )}



                  <Box display="grid" gridTemplateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={4}>
                    <ReportListCard title="ISSUES DETECTED" items={report.issues} colorHex="#ef4444" />
                    <ReportListCard title="ARCHITECTURAL RECOMMENDATIONS" items={report.recommendations} colorHex="#10b981" />
                  </Box>

                  {/* Export Options */}
                  <Flex justify="flex-start" align="center" gap={3} pt={4} borderTopWidth="1px" borderColor={isDark ? "white/5" : "gray.200"}>
                    <Text fontSize="xs" fontWeight="bold" color="slate.500" fontFamily="mono">EXPORT DATA:</Text>
                    {([ "json", "md", "html" ] as const).map((fmt) => (
                      <Button
                        key={fmt}
                        asChild
                        variant="subtle"
                        size="xs"
                        bg={isDark ? "rgba(255,255,255,0.05)" : "white"}
                        color={isDark ? "slate.300" : "slate.700"}
                        borderColor={isDark ? "white/5" : "gray.200"}
                        borderWidth="1px"
                        _hover={{
                          bg: isDark ? "rgba(255,255,255,0.1)" : "gray.50",
                          borderColor: "cyan.500/20",
                          color: isDark ? "white" : "cyan.700",
                        }}
                        borderRadius="md"
                        cursor="pointer"
                      >
                        <Link
                          href={`/api/runs/${id}/report?format=${fmt}`}
                          target="_blank"
                          display="flex"
                          alignItems="center"
                          gap={1}
                        >
                          <Download size={10} /> {fmt.toUpperCase()}
                        </Link>
                      </Button>
                    ))}
                  </Flex>
                </Stack>
              </Tabs.Content>

              <Tabs.Content value="code">
                <Stack gap={6}>
                  {report.planMarkdown && (
                    <CollapsiblePlanSection planMarkdown={report.planMarkdown} isDark={isDark} />
                  )}

                  <GeneratedSpecsPanel specs={report.generatedSpecs} isDark={isDark} />
                </Stack>
              </Tabs.Content>
            </Tabs.Root>
          </Box>
        )}
      </Stack>
    </Box>
  );
}

function CollapsiblePlanSection({
  planMarkdown,
  isDark,
}: {
  planMarkdown: string;
  isDark: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const lineCount = planMarkdown.split("\n").length;

  return (
    <Box
      borderWidth="1px"
      borderColor={
        isOpen
          ? isDark ? "violet.500/20" : "violet.200/60"
          : isDark ? "white/5" : "gray.200"
      }
      borderRadius="xl"
      overflow="hidden"
      transition="border-color 0.2s ease"
    >
      {/* Clickable header */}
      <Flex
        as="button"
        w="full"
        align="center"
        justify="space-between"
        px={4}
        py={3}
        bg={
          isOpen
            ? isDark ? "rgba(139,92,246,0.07)" : "violet.50/60"
            : isDark ? "rgba(255,255,255,0.03)" : "gray.50"
        }
        borderBottomWidth={isOpen ? "1px" : 0}
        borderColor={isDark ? "violet.500/15" : "violet.200/50"}
        cursor="pointer"
        onClick={() => setIsOpen((v) => !v)}
        _hover={{
          bg: isOpen
            ? isDark ? "rgba(139,92,246,0.1)" : "violet.50"
            : isDark ? "rgba(255,255,255,0.05)" : "gray.100",
        }}
        transition="background 0.15s ease"
        textAlign="left"
      >
        <HStack gap={3}>
          <ChevronRight
            size={13}
            style={{
              color: isOpen ? "#8b5cf6" : isDark ? "#64748b" : "#94a3b8",
              flexShrink: 0,
            }}
          />
          <VStack align="stretch" gap={0}>
            <Text
              fontSize="xs"
              fontWeight="semibold"
              color={
                isOpen
                  ? isDark ? "violet.300" : "violet.700"
                  : isDark ? "slate.300" : "slate.700"
              }
            >
              AI Spec Test Plan
            </Text>
            <Text fontSize="9px" color="slate.500" fontFamily="mono">
              {lineCount} lines
            </Text>
          </VStack>
        </HStack>

        <HStack gap={2}>
          {isOpen && (
            <Badge
              variant="subtle"
              colorPalette="purple"
              fontSize="9px"
              borderRadius="sm"
            >
              expanded
            </Badge>
          )}
          <Box
            color={isOpen ? "violet.400" : isDark ? "slate.500" : "slate.400"}
            transition="transform 0.2s ease, color 0.2s ease"
            transform={isOpen ? "rotate(90deg)" : "rotate(0deg)"}
          >
            <ChevronRight size={14} />
          </Box>
        </HStack>
      </Flex>

      {/* Code body */}
      {isOpen && (
        <Code
          as="pre"
          display="block"
          whiteSpace="pre-wrap"
          p={5}
          w="full"
          bg={isDark ? "rgba(2, 6, 23, 0.75)" : "#f8f9fc"}
          borderColor={isDark ? "white/10" : "gray.200"}
          borderWidth={isDark ? 0 : 1}
          color={isDark ? "slate.300" : "slate.800"}
          fontSize="11px"
          fontFamily="'Fira Code', 'JetBrains Mono', monospace"
          lineHeight={1.7}
          maxH="600px"
          overflowY="auto"
          style={{ tabSize: 2 }}
        >
          {planMarkdown}
        </Code>
      )}
    </Box>
  );
}

function GeneratedSpecsPanel({
  specs,
  isDark,
}: {
  specs: { file: string; code: string }[];
  isDark: boolean;
}) {
  const [openSpecs, setOpenSpecs] = useState<Record<string, boolean>>({});

  const allOpen = specs.length > 0 && specs.every((s) => openSpecs[s.file]);

  function toggleSpec(file: string) {
    setOpenSpecs((prev) => ({ ...prev, [file]: !prev[file] }));
  }

  function expandAll() {
    setOpenSpecs(Object.fromEntries(specs.map((s) => [s.file, true])));
  }

  function collapseAll() {
    setOpenSpecs({});
  }

  return (
    <Box>
      {/* Section header */}
      <Flex align="center" justify="space-between" mb={3}>
        <Heading
          size="sm"
          fontWeight="bold"
          color={isDark ? "slate.400" : "slate.500"}
          display="flex"
          alignItems="center"
          gap={2}
        >
          <Code2 size={14} style={{ color: "#06b6d4" }} />
          Generated Specs ({specs.length})
        </Heading>

        <HStack gap={2}>
          <Button
            size="xs"
            variant="subtle"
            onClick={allOpen ? collapseAll : expandAll}
            bg={isDark ? "rgba(255,255,255,0.05)" : "white"}
            color={isDark ? "slate.400" : "slate.600"}
            borderWidth="1px"
            borderColor={isDark ? "white/8" : "gray.200"}
            borderRadius="md"
            cursor="pointer"
            display="inline-flex"
            alignItems="center"
            gap={1.5}
            _hover={{
              bg: isDark ? "rgba(6,182,212,0.1)" : "cyan.50",
              color: "cyan.400",
              borderColor: "cyan.500/30",
            }}
            transition="all 0.15s ease"
            px={2.5}
            py={1}
          >
            {allOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            <Text fontSize="10px" fontWeight="bold" letterSpacing="wide">
              {allOpen ? "COLLAPSE ALL" : "EXPAND ALL"}
            </Text>
          </Button>
        </HStack>
      </Flex>

      {specs.length === 0 ? (
        <Text fontSize="xs" color="slate.600" fontStyle="italic">
          No specs generated.
        </Text>
      ) : (
        <Stack gap={3}>
          {specs.map((s) => {
            const isOpen = !!openSpecs[s.file];
            const name = baseName(s.file);
            const lineCount = s.code.split("\n").length;

            return (
              <Box
                key={s.file}
                borderWidth="1px"
                borderColor={
                  isOpen
                    ? isDark ? "cyan.500/20" : "cyan.200/60"
                    : isDark ? "white/5" : "gray.200"
                }
                borderRadius="xl"
                overflow="hidden"
                transition="border-color 0.2s ease"
              >
                {/* Clickable header */}
                <Flex
                  as="button"
                  w="full"
                  align="center"
                  justify="space-between"
                  px={4}
                  py={3}
                  bg={
                    isOpen
                      ? isDark ? "rgba(6,182,212,0.07)" : "cyan.50/60"
                      : isDark ? "rgba(255,255,255,0.03)" : "gray.50"
                  }
                  borderBottomWidth={isOpen ? "1px" : 0}
                  borderColor={isDark ? "cyan.500/15" : "cyan.200/50"}
                  cursor="pointer"
                  onClick={() => toggleSpec(s.file)}
                  _hover={{
                    bg: isOpen
                      ? isDark ? "rgba(6,182,212,0.1)" : "cyan.50"
                      : isDark ? "rgba(255,255,255,0.05)" : "gray.100",
                  }}
                  transition="background 0.15s ease"
                  textAlign="left"
                >
                  <HStack gap={3}>
                    <Code2
                      size={13}
                      style={{ color: isOpen ? "#06b6d4" : isDark ? "#64748b" : "#94a3b8", flexShrink: 0 }}
                    />
                    <VStack align="stretch" gap={0}>
                      <Text
                        fontSize="xs"
                        fontWeight="semibold"
                        fontFamily="mono"
                        color={
                          isOpen
                            ? isDark ? "cyan.300" : "cyan.700"
                            : isDark ? "slate.300" : "slate.700"
                        }
                      >
                        {name}
                      </Text>
                      <Text fontSize="9px" color="slate.500" fontFamily="mono">
                        {lineCount} lines
                      </Text>
                    </VStack>
                  </HStack>

                  <HStack gap={2}>
                    <Badge
                      variant="subtle"
                      colorPalette="cyan"
                      fontSize="9px"
                      borderRadius="sm"
                      display={isOpen ? "inline-flex" : "none"}
                    >
                      expanded
                    </Badge>
                    <Box
                      color={isOpen ? "cyan.400" : isDark ? "slate.500" : "slate.400"}
                      transition="transform 0.2s ease, color 0.2s ease"
                      transform={isOpen ? "rotate(180deg)" : "rotate(0deg)"}
                    >
                      <ChevronDown size={14} />
                    </Box>
                  </HStack>
                </Flex>

                {/* Code body */}
                {isOpen && (
                  <Code
                    as="pre"
                    display="block"
                    whiteSpace="pre-wrap"
                    p={5}
                    w="full"
                    bg={isDark ? "rgba(2, 6, 23, 0.75)" : "#f8f9fc"}
                    color={isDark ? "slate.300" : "slate.800"}
                    fontSize="11px"
                    fontFamily="'Fira Code', 'JetBrains Mono', monospace"
                    lineHeight={1.7}
                    borderWidth={0}
                    maxH="600px"
                    overflowY="auto"
                    style={{ tabSize: 2 }}
                  >
                    {s.code}
                  </Code>
                )}
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}

function TestMetricsTable({ report, isDark, id }: { report: RunReport; isDark: boolean; id: string }) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Build a lookup map: basename -> code
  const specCodeMap = Object.fromEntries(
    report.generatedSpecs.map((s) => [baseName(s.file), s.code])
  );

  function toggleRow(fileName: string) {
    setExpandedRows((prev) => ({ ...prev, [fileName]: !prev[fileName] }));
  }

  return (
    <Box borderWidth="1px" borderColor={isDark ? "white/5" : "gray.200"} borderRadius="xl" overflow="hidden">
      <Table.Root size="sm" variant="outline">
        <Table.Header bg={isDark ? "white/5" : "gray.50"}>
          <Table.Row>
            <Table.ColumnHeader color={isDark ? "slate.400" : "slate.600"} py={3}>FLOW IDENTIFIER</Table.ColumnHeader>
            <Table.ColumnHeader color={isDark ? "slate.400" : "slate.600"} py={3}>VERDICT</Table.ColumnHeader>
            <Table.ColumnHeader color={isDark ? "slate.400" : "slate.600"} py={3}>OBSERVATIONS</Table.ColumnHeader>
            <Table.ColumnHeader color={isDark ? "slate.400" : "slate.600"} py={3} w="80px">CODE</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body bg={isDark ? "rgba(15, 23, 42, 0.15)" : "white"}>
          {report.results.map((r) => {
            const specCode = specCodeMap[baseName(r.fileName)] ?? null;
            const isOpen = !!expandedRows[r.fileName];
            return (
              <React.Fragment key={r.fileName}>
                <Table.Row
                  borderColor={isDark ? "white/5" : "gray.100"}
                  _hover={{ bg: isDark ? "rgba(255,255,255,0.02)" : "gray.50/60" }}
                  transition="background 0.15s ease"
                >
                  <Table.Cell py={3} fontWeight="medium" fontFamily="mono" fontSize="xs" color={isDark ? "white" : "slate.850"}>
                    <VStack align="stretch" gap={0.5}>
                      <Text>{r.flowId}</Text>
                      <Text fontSize="9px" color="slate.500" fontFamily="mono">{baseName(r.fileName)}</Text>
                    </VStack>
                  </Table.Cell>
                  <Table.Cell py={3}>
                    <Badge
                      colorPalette={OUTCOME_COLOR[r.outcome]}
                      variant="solid"
                      borderRadius="md"
                      fontSize="10px"
                      fontWeight="bold"
                      boxShadow={`0 0 10px ${OUTCOME_GLOW[r.outcome]}`}
                      display="inline-flex"
                      alignItems="center"
                      gap={1}
                      px={2.5}
                      py={0.5}
                    >
                      {r.outcome === "passed" && <CircleCheck size={10} />}
                      {r.outcome === "failed" && <CircleX size={10} />}
                      {r.outcome === "healed" && <Wrench size={10} />}
                      {(r.outcome === "flaky" || r.outcome === "fixme") && (
                        <TriangleAlert size={10} />
                      )}
                      {r.outcome.toUpperCase()}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell py={3} color={isDark ? "slate.400" : "slate.600"} fontSize="xs">
                    {r.failureReason ?? (r.healed ? "Locator was auto-healed successfully" : "Test passed without issues")}
                  </Table.Cell>
                  <Table.Cell py={3}>
                    {specCode ? (
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => toggleRow(r.fileName)}
                        aria-label={isOpen ? "Hide code" : "View code"}
                        bg={isOpen
                          ? isDark ? "rgba(6, 182, 212, 0.15)" : "cyan.50"
                          : isDark ? "rgba(255,255,255,0.05)" : "white"
                        }
                        color={isOpen
                          ? "cyan.400"
                          : isDark ? "slate.400" : "slate.600"
                        }
                        borderWidth="1px"
                        borderColor={isOpen
                          ? "cyan.500/30"
                          : isDark ? "white/8" : "gray.200"
                        }
                        borderRadius="md"
                        cursor="pointer"
                        display="inline-flex"
                        alignItems="center"
                        gap={1}
                        _hover={{
                          bg: isDark ? "rgba(6, 182, 212, 0.12)" : "cyan.50",
                          color: "cyan.400",
                          borderColor: "cyan.500/30",
                        }}
                        transition="all 0.15s ease"
                        px={2}
                        py={1}
                      >
                        <Code2 size={10} />
                        {isOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      </Button>
                    ) : (
                      <Text fontSize="9px" color="slate.600" fontFamily="mono">N/A</Text>
                    )}
                  </Table.Cell>
                </Table.Row>

                {/* Expandable code panel */}
                {isOpen && specCode && (
                  <Table.Row
                    borderColor={isDark ? "cyan.500/15" : "cyan.200/50"}
                    borderTopWidth="1px"
                    borderBottomWidth="2px"
                    bg={isDark ? "rgba(6, 182, 212, 0.03)" : "cyan.50/30"}
                  >
                    <Table.Cell colSpan={4} p={0}>
                      <Box
                        position="relative"
                        borderTopWidth="1px"
                        borderColor={isDark ? "cyan.500/20" : "cyan.200/60"}
                      >
                        {/* Header bar */}
                        <Flex
                          align="center"
                          justify="space-between"
                          px={4}
                          py={2}
                          bg={isDark ? "rgba(6, 182, 212, 0.08)" : "cyan.50"}
                          borderBottomWidth="1px"
                          borderColor={isDark ? "cyan.500/20" : "cyan.200/60"}
                        >
                          <HStack gap={2}>
                            <Code2 size={12} style={{ color: "#06b6d4" }} />
                            <Text
                              fontSize="10px"
                              fontWeight="bold"
                              fontFamily="mono"
                              color={isDark ? "cyan.300" : "cyan.700"}
                              letterSpacing="wider"
                            >
                              {baseName(r.fileName)}
                            </Text>
                          </HStack>
                          <HStack gap={3}>
                            <Badge
                              colorPalette={OUTCOME_COLOR[r.outcome]}
                              variant="subtle"
                              fontSize="9px"
                              borderRadius="sm"
                            >
                              {r.outcome}
                            </Badge>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => toggleRow(r.fileName)}
                              color={isDark ? "slate.500" : "slate.400"}
                              cursor="pointer"
                              _hover={{ color: isDark ? "white" : "slate.700" }}
                              px={1}
                            >
                              <ChevronUp size={12} />
                            </Button>
                          </HStack>
                        </Flex>

                        {/* Code block */}
                        <Code
                          as="pre"
                          display="block"
                          whiteSpace="pre-wrap"
                          p={5}
                          w="full"
                          bg={isDark ? "rgba(2, 6, 23, 0.85)" : "#f8f9fc"}
                          color={isDark ? "slate.200" : "slate.800"}
                          borderWidth={isDark ? 0 : 1}
                          borderColor="gray.200"
                          fontSize="11px"
                          fontFamily="'Fira Code', 'JetBrains Mono', monospace"
                          lineHeight={1.7}
                          maxH="480px"
                          overflowY="auto"
                          style={{ tabSize: 2 }}
                        >
                          {specCode}
                        </Code>
                      </Box>
                    </Table.Cell>
                  </Table.Row>
                )}
              </React.Fragment>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}


function ReportListCard({ title, items, colorHex }: { title: string; items: string[]; colorHex: string }) {
  const { theme } = useThemeMode();
  const isDark = theme === "dark";

  return (
    <Box
      bg={isDark ? "rgba(15, 23, 42, 0.4)" : "gray.50"}
      borderWidth="1px"
      borderColor={isDark ? "white/5" : "gray.200"}
      borderRadius="xl"
      p={5}
    >
      <Heading
        size="xs"
        fontWeight="bold"
        color={isDark ? "slate.400" : "slate.650"}
        borderBottomWidth="1px"
        borderColor={isDark ? "white/5" : "gray.200"}
        pb={2}
        mb={3}
        letterSpacing="wide"
      >
        {title}
      </Heading>
      {items.length === 0 ? (
        <Text fontSize="xs" color="slate.600" fontStyle="italic">
          None reported.
        </Text>
      ) : (
        <Stack gap={2}>
          {items.map((it, i) => (
            <Flex key={i} align="flex-start" gap={2} fontSize="xs">
              <span style={{ color: colorHex }}>•</span>
              <Text color={isDark ? "slate.300" : "slate.700"}>{it}</Text>
            </Flex>
          ))}
        </Stack>
      )}
    </Box>
  );
}
