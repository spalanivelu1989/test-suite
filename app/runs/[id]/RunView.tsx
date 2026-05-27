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
  Square,
  OctagonX,
  Plus,
} from "lucide-react";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import type { ProgressEvent, RunReport, TestOutcome } from "@/src/types";
import { ThreeProgressBar } from "@/app/components/ThreeProgressBar";
import { useThemeMode } from "@/app/providers";
import { getCatppuccinColors, catppuccinAlpha } from "@/app/theme/catppuccin";

type Status = "running" | "completed" | "failed" | "cancelled";

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

const PIPELINE_STAGES = [
  { id: "planning", label: "Planner", colorKey: "mauve" },
  { id: "generating", label: "Generator", colorKey: "sky" },
  { id: "healing", label: "Healer", colorKey: "yellow" },
  { id: "reporting", label: "Reporter", colorKey: "green" },
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

  if (runStatus === "failed" || runStatus === "cancelled") {
    // Freeze the bars: the stage that was in flight reads as failed/stopped,
    // earlier stages as done, later stages as never-started.
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
  const [cancelling, setCancelling] = useState(false);
  const { theme } = useThemeMode();
  const colors = getCatppuccinColors(theme);
  const isDark = theme === "dark";

  useEffect(() => {
    const es = new EventSource(`/api/runs/${id}/stream`);
    es.addEventListener("progress", (e) => {
      setEvents((prev) => [...prev, JSON.parse((e as MessageEvent).data)]);
    });
    es.addEventListener("end", async (e) => {
      const { status: s, error: err } = JSON.parse((e as MessageEvent).data);
      es.close();
      if (s === "cancelled") {
        setStatus("cancelled");
        setError(err ?? "Run stopped by user");
        return;
      }
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

  async function handleStop() {
    if (cancelling || status !== "running") return;
    setCancelling(true);
    try {
      await fetch(`/api/runs/${id}/cancel`, { method: "POST" });
      // The SSE `end` event flips status to "cancelled" and the agents wind down.
    } catch {
      setCancelling(false);
    }
  }

  const currentStage = events[events.length - 1]?.stage;


  return (
    <Box
      minH="100dvh"
      bg={
        isDark
          ? `radial-gradient(circle at top, ${colors.mantle} 0%, ${colors.crust} 100%)`
          : `radial-gradient(circle at top, ${colors.base} 0%, ${colors.mantle} 100%)`
      }
      color={colors.text}
      py={10}
      px={{ base: 4, md: 8 }}
      transition="background-color 0.3s ease, color 0.3s ease"
    >
      <Stack gap={8} w="full" maxW="full" mx="auto">
        <HStack justify="space-between" borderBottomWidth="1px" borderColor={isDark ? "white/5" : colors.overlay0} pb={4}>
          <VStack align="stretch" gap={1}>
            <Heading
              size="2xl"
              fontWeight="extrabold"
              color={colors.text}
            >
              Dashboard
            </Heading>
          </VStack>
        </HStack>

        {/* 3D Progress Indicators Grid (T19) */}
        <Box
          bg={isDark ? catppuccinAlpha(colors.surface0, 0.35) : colors.base}
          borderWidth="1px"
          borderColor={isDark ? "white/10" : colors.overlay0}
          borderRadius="2xl"
          p={6}
          backdropFilter="blur(20px)"
          boxShadow={isDark ? "0 20px 40px -15px rgba(0, 0, 0, 0.5)" : "0 10px 30px -10px rgba(0, 0, 0, 0.05)"}
          transition="all 0.3s ease"
        >
          <Flex align="center" justify="space-between" mb={6}>
            <Text fontWeight="semibold" fontSize="sm" color={isDark ? "slate.400" : "slate.600"} display="flex" alignItems="center" gap={2}>
              <Terminal size={14} style={{ color: colors.sapphire }} /> Agents Working...
            </Text>
            <HStack gap={3}>
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
                      : status === "cancelled"
                        ? "orange.400"
                        : "red.500"
                }
              >
                {status === "running"
                  ? "RUNNING"
                  : status === "completed"
                    ? "COMPLETED"
                    : status === "cancelled"
                      ? "STOPPED"
                      : "FAILED"}
              </Text>
              {status === "running" && (
                <Button
                  size="xs"
                  onClick={handleStop}
                  loading={cancelling}
                  loadingText="STOPPING"
                  disabled={cancelling}
                  bg={isDark ? "white/5" : "black/5"}
                  color={isDark ? "slate.300" : "slate.700"}
                  borderWidth="1px"
                  borderColor={isDark ? "white/10" : "black/10"}
                  borderRadius="full"
                  cursor="pointer"
                  display="inline-flex"
                  alignItems="center"
                  gap={2}
                  px={3}
                  py={1}
                  fontWeight="bold"
                  fontSize="10px"
                  letterSpacing="wider"
                  _hover={{
                    bg: catppuccinAlpha(colors.red, 0.1),
                    borderColor: catppuccinAlpha(colors.red, 0.4),
                    color: colors.red,
                    transform: "translateY(-1px)",
                    boxShadow: `0 4px 12px ${catppuccinAlpha(colors.red, 0.15)}`,
                  }}
                  _active={{
                    transform: "translateY(0)",
                  }}
                  transition="all 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
                >
                  <Box
                    w="6px"
                    h="6px"
                    borderRadius="full"
                    bg={colors.red}
                    boxShadow={`0 0 6px ${colors.red}`}
                    style={{ animation: "pulse-glow 1.5s infinite" }}
                  />
                  <span>STOP RUN</span>
                </Button>
              )}
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
                colorHex={colors[st.colorKey]}
              />
            ))}
          </Box>

          {/* Console Output (T19) */}
          <Box
            bg={isDark ? catppuccinAlpha(colors.crust, 0.75) : colors.crust}
            borderColor={isDark ? "white/10" : colors.overlay0}
            borderWidth="1px"
            borderRadius="xl"
            p={4}
            fontFamily="mono"
            boxShadow="inset 0 1px 4px rgba(0, 0, 0, 0.25)"
          >
            <Flex justify="space-between" align="center" borderBottomWidth="1px" borderColor={isDark ? "white/5" : colors.overlay0} pb={2} mb={3}>
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
                    <Text color={colors.sky} userSelect="none" flexShrink={0}>
                      &gt;
                    </Text>
                    <Text color={isDark ? "slate.500" : colors.overlay2} w="65px" flexShrink={0} userSelect="none">
                      [{ev.stage}]
                    </Text>
                    <Text color={colors.text} wordBreak="break-word">
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
            bg={isDark ? catppuccinAlpha(colors.red, 0.05) : catppuccinAlpha(colors.red, 0.1)}
            borderColor={isDark ? "red.500/25" : catppuccinAlpha(colors.red, 0.35)}
            borderWidth="1px"
            borderRadius="xl"
            p={5}
            boxShadow={`0 10px 30px ${catppuccinAlpha(colors.red, isDark ? 0.05 : 0.03)}`}
          >
            <Text color={colors.red} display="flex" alignItems="center" gap={3} fontWeight="medium">
              <TriangleAlert size={20} /> {error}
            </Text>
          </Box>
        )}

        {/* Cancelled state */}
        {status === "cancelled" && (
          <Box
            bg={isDark ? catppuccinAlpha(colors.peach, 0.04) : catppuccinAlpha(colors.peach, 0.08)}
            borderColor={catppuccinAlpha(colors.peach, isDark ? 0.15 : 0.25)}
            borderWidth="1px"
            borderRadius="2xl"
            p={5}
            backdropFilter="blur(16px)"
            boxShadow={`0 10px 30px ${catppuccinAlpha(colors.peach, isDark ? 0.05 : 0.03)}`}
          >
            <Flex
              direction={{ base: "column", sm: "row" }}
              align={{ base: "stretch", sm: "center" }}
              justify="space-between"
              gap={4}
            >
              <Text
                color={colors.peach}
                display="inline-flex"
                alignItems="center"
                gap={3}
                fontWeight="extrabold"
                fontSize="xs"
                letterSpacing="widest"
                fontFamily="mono"
              >
                <OctagonX size={16} /> <span>{(error ?? "Run stopped by user").toUpperCase()}</span>
              </Text>
              <Button
                asChild
                size="sm"
                bg={isDark ? catppuccinAlpha(colors.sapphire, 0.08) : colors.base}
                color={colors.sapphire}
                borderWidth="1px"
                borderColor={catppuccinAlpha(colors.sapphire, 0.35)}
                borderRadius="full"
                cursor="pointer"
                flexShrink={0}
                fontWeight="extrabold"
                fontSize="11px"
                letterSpacing="wider"
                px={4.5}
                py={2}
                _hover={{
                  bg: colors.sapphire,
                  color: isDark ? colors.crust : colors.base,
                  borderColor: colors.sapphire,
                  transform: "scale(1.05) translateY(-0.5px)",
                  boxShadow: isDark 
                    ? `0 0 15px ${catppuccinAlpha(colors.sapphire, 0.45)}`
                    : `0 4px 12px ${catppuccinAlpha(colors.sapphire, 0.35)}`,
                }}
                _active={{
                  transform: "scale(0.97) translateY(0)",
                }}
                transition="all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
              >
                <NextLink href="/" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <Plus size={13} strokeWidth={2.5} /> <span>START A NEW RUN</span>
                </NextLink>
              </Button>
            </Flex>
          </Box>
        )}

        {/* Rich report with tabs (T20 + T21) */}
        {report && (
          <Box
            bg={isDark ? catppuccinAlpha(colors.surface0, 0.35) : colors.base}
            borderWidth="1px"
            borderColor={isDark ? "white/10" : colors.overlay0}
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
              <Tabs.List bg={isDark ? catppuccinAlpha(colors.crust, 0.4) : colors.mantle} p={1.5} borderRadius="xl" borderWidth="1px" borderColor={isDark ? "white/5" : colors.overlay0} mb={6} display="inline-flex">
                <Tabs.Trigger
                  value="report"
                  px={5}
                  py={2}
                  borderRadius="lg"
                  cursor="pointer"
                  color={isDark ? "slate.400" : "slate.600"}
                  _selected={{
                    color: isDark ? "white" : colors.text,
                    bg: isDark ? catppuccinAlpha(colors.text, 0.06) : colors.base,
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
                    color: isDark ? "white" : colors.text,
                    bg: isDark ? catppuccinAlpha(colors.text, 0.06) : colors.base,
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
                    <ReportListCard title="WHAT WAS TESTED (EXPLANATION)" items={report.summary} colorHex={colors.sapphire} />
                  )}

                  <Box>
                    <Heading size="md" fontWeight="bold" color={colors.text} mb={3} display="flex" alignItems="center" gap={2}>
                      <ChevronRight size={16} /> Raw Test Metrics
                    </Heading>
                    
                    <TestMetricsTable report={report} id={id} />
                  </Box>

                  {report.fixPrompts.length > 0 && (
                    <Box>
                      <Heading size="md" fontWeight="bold" color={colors.text} mb={3} display="flex" alignItems="center" gap={2}>
                        <ChevronRight size={16} /> Prescribed Auto-Heal Actions
                      </Heading>
                      <Stack gap={3}>
                        {report.fixPrompts.map((f, i) => (
                          <Box
                            key={i}
                            borderLeftWidth="3px"
                            borderColor="orange.400"
                            bg={isDark ? catppuccinAlpha(colors.peach, 0.04) : catppuccinAlpha(colors.peach, 0.08)}
                            p={4}
                            borderRadius="r-xl"
                            borderRightWidth="1px"
                            borderTopWidth="1px"
                            borderBottomWidth="1px"
                            borderRightColor={isDark ? "white/5" : catppuccinAlpha(colors.peach, 0.2)}
                            borderTopColor={isDark ? "white/5" : catppuccinAlpha(colors.peach, 0.2)}
                            borderBottomColor={isDark ? "white/5" : catppuccinAlpha(colors.peach, 0.2)}
                          >
                            <Text fontWeight="bold" fontSize="sm" color={colors.text} mb={1} fontFamily="mono">
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
                    <ReportListCard title="ISSUES DETECTED" items={report.issues} colorHex={colors.red} />
                    <ReportListCard title="ARCHITECTURAL RECOMMENDATIONS" items={report.recommendations} colorHex={colors.green} />
                  </Box>

                  {/* Export Options */}
                  <Flex justify="flex-start" align="center" gap={3} pt={4} borderTopWidth="1px" borderColor={isDark ? "white/5" : colors.overlay0}>
                    <Text fontSize="xs" fontWeight="bold" color="slate.500" fontFamily="mono">EXPORT DATA:</Text>
                    {([ "json", "md", "html" ] as const).map((fmt) => (
                      <Button
                        key={fmt}
                        asChild
                        variant="subtle"
                        size="xs"
                        bg={isDark ? catppuccinAlpha(colors.text, 0.05) : colors.base}
                        color={colors.text}
                        borderColor={isDark ? "white/5" : colors.overlay0}
                        borderWidth="1px"
                        _hover={{
                          bg: isDark ? catppuccinAlpha(colors.text, 0.1) : colors.surface1,
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
                    <CollapsiblePlanSection planMarkdown={report.planMarkdown} />
                  )}

                  <GeneratedSpecsPanel specs={report.generatedSpecs} />
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
}: {
  planMarkdown: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const lineCount = planMarkdown.split("\n").length;
  const { theme } = useThemeMode();
  const colors = getCatppuccinColors(theme);
  const isDark = theme === "dark";

  return (
    <Box
      borderWidth="1px"
      borderColor={
        isOpen
          ? isDark ? catppuccinAlpha(colors.mauve, 0.2) : catppuccinAlpha(colors.mauve, 0.4)
          : isDark ? "white/5" : colors.overlay0
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
            ? isDark ? catppuccinAlpha(colors.mauve, 0.07) : catppuccinAlpha(colors.mauve, 0.15)
            : isDark ? catppuccinAlpha(colors.text, 0.03) : colors.base
        }
        borderBottomWidth={isOpen ? "1px" : 0}
        borderColor={isDark ? "violet.500/15" : catppuccinAlpha(colors.mauve, 0.2)}
        cursor="pointer"
        onClick={() => setIsOpen((v) => !v)}
        _hover={{
          bg: isOpen
            ? isDark ? catppuccinAlpha(colors.mauve, 0.1) : catppuccinAlpha(colors.mauve, 0.25)
            : isDark ? catppuccinAlpha(colors.text, 0.05) : colors.surface1,
        }}
        transition="background 0.15s ease"
        textAlign="left"
      >
        <HStack gap={3}>
          <ChevronRight
            size={13}
            style={{
              color: isOpen ? colors.mauve : isDark ? colors.overlay1 : colors.overlay2,
              flexShrink: 0,
            }}
          />
          <VStack align="stretch" gap={0}>
            <Text
              fontSize="xs"
              fontWeight="semibold"
              color={
                isOpen
                  ? isDark ? "violet.300" : colors.mauve
                  : isDark ? "slate.300" : colors.text
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
          bg={isDark ? catppuccinAlpha(colors.crust, 0.75) : colors.base}
          borderColor={isDark ? "white/10" : colors.overlay0}
          borderWidth={isDark ? 0 : 1}
          color={colors.text}
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
}: {
  specs: { file: string; code: string }[];
}) {
  const [openSpecs, setOpenSpecs] = useState<Record<string, boolean>>({});
  const { theme } = useThemeMode();
  const colors = getCatppuccinColors(theme);
  const isDark = theme === "dark";

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
          <Code2 size={14} style={{ color: colors.sapphire }} />
          Generated Specs ({specs.length})
        </Heading>

        <HStack gap={2}>
          <Button
            size="xs"
            variant="subtle"
            onClick={allOpen ? collapseAll : expandAll}
            bg={isDark ? catppuccinAlpha(colors.text, 0.05) : colors.base}
            color={colors.text}
            borderWidth="1px"
            borderColor={isDark ? "white/8" : colors.overlay0}
            borderRadius="md"
            cursor="pointer"
            display="inline-flex"
            alignItems="center"
            gap={1.5}
            _hover={{
              bg: isDark ? catppuccinAlpha(colors.sapphire, 0.1) : catppuccinAlpha(colors.sapphire, 0.15),
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
                    : isDark ? "white/5" : colors.overlay0
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
                      ? isDark ? catppuccinAlpha(colors.sapphire, 0.07) : catppuccinAlpha(colors.sapphire, 0.15)
                      : isDark ? catppuccinAlpha(colors.text, 0.03) : colors.base
                  }
                  borderBottomWidth={isOpen ? "1px" : 0}
                  borderColor={isDark ? "cyan.500/15" : colors.overlay0}
                  cursor="pointer"
                  onClick={() => toggleSpec(s.file)}
                  _hover={{
                    bg: isOpen
                      ? isDark ? catppuccinAlpha(colors.sapphire, 0.1) : catppuccinAlpha(colors.sapphire, 0.2)
                      : isDark ? catppuccinAlpha(colors.text, 0.05) : colors.surface1,
                  }}
                  transition="background 0.15s ease"
                  textAlign="left"
                >
                  <HStack gap={3}>
                    <Code2
                      size={13}
                      style={{ color: isOpen ? colors.sapphire : isDark ? colors.overlay1 : colors.overlay2, flexShrink: 0 }}
                    />
                    <VStack align="stretch" gap={0}>
                      <Text
                        fontSize="xs"
                        fontWeight="semibold"
                        fontFamily="mono"
                        color={
                          isOpen
                            ? isDark ? "cyan.300" : colors.sapphire
                            : isDark ? "slate.300" : colors.text
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
                    bg={isDark ? catppuccinAlpha(colors.crust, 0.75) : colors.base}
                    color={colors.text}
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

function TestMetricsTable({ report, id }: { report: RunReport; id: string }) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const { theme } = useThemeMode();
  const colors = getCatppuccinColors(theme);
  const isDark = theme === "dark";

  // Build a lookup map: basename -> code
  const specCodeMap = Object.fromEntries(
    report.generatedSpecs.map((s) => [baseName(s.file), s.code])
  );

  function toggleRow(fileName: string) {
    setExpandedRows((prev) => ({ ...prev, [fileName]: !prev[fileName] }));
  }

  const outcomeGlow = (outcome: TestOutcome) => {
    const outcomeColors = {
      passed: colors.green,
      failed: colors.red,
      flaky: colors.peach,
      healed: colors.blue,
      fixme: colors.surface2,
    };
    return catppuccinAlpha(outcomeColors[outcome], 0.2);
  };

  return (
    <Box borderWidth="1px" borderColor={isDark ? "white/5" : colors.overlay0} borderRadius="xl" overflow="hidden">
      <Table.Root size="sm" variant="outline">
        <Table.Header bg={isDark ? "white/5" : colors.mantle}>
          <Table.Row>
            <Table.ColumnHeader color={isDark ? "slate.400" : colors.overlay2} py={3}>FLOW IDENTIFIER</Table.ColumnHeader>
            <Table.ColumnHeader color={isDark ? "slate.400" : colors.overlay2} py={3}>VERDICT</Table.ColumnHeader>
            <Table.ColumnHeader color={isDark ? "slate.400" : colors.overlay2} py={3}>OBSERVATIONS</Table.ColumnHeader>
            <Table.ColumnHeader color={isDark ? "slate.400" : colors.overlay2} py={3} w="80px">CODE</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body bg={isDark ? catppuccinAlpha(colors.surface0, 0.15) : colors.base}>
          {report.results.map((r) => {
            const specCode = specCodeMap[baseName(r.fileName)] ?? null;
            const isOpen = !!expandedRows[r.fileName];
            return (
              <React.Fragment key={r.fileName}>
                <Table.Row
                  borderColor={isDark ? "white/5" : colors.overlay0}
                  _hover={{ bg: isDark ? catppuccinAlpha(colors.text, 0.02) : colors.surface0 }}
                  transition="background 0.15s ease"
                >
                  <Table.Cell py={3} fontWeight="medium" fontFamily="mono" fontSize="xs" color={colors.text}>
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
                      boxShadow={`0 0 10px ${outcomeGlow(r.outcome)}`}
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
                  <Table.Cell py={3} color={isDark ? "slate.400" : colors.overlay2} fontSize="xs">
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
                          ? isDark ? catppuccinAlpha(colors.sapphire, 0.15) : catppuccinAlpha(colors.sapphire, 0.2)
                          : isDark ? catppuccinAlpha(colors.text, 0.05) : colors.base
                        }
                        color={isOpen
                          ? colors.sapphire
                          : isDark ? "slate.400" : colors.text
                        }
                        borderWidth="1px"
                        borderColor={isOpen
                          ? "cyan.500/30"
                          : isDark ? "white/8" : colors.overlay0
                        }
                        borderRadius="md"
                        cursor="pointer"
                        display="inline-flex"
                        alignItems="center"
                        gap={1}
                        _hover={{
                          bg: isDark ? catppuccinAlpha(colors.sapphire, 0.12) : catppuccinAlpha(colors.sapphire, 0.1),
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
                    borderColor={isDark ? "cyan.500/15" : colors.overlay0}
                    borderTopWidth="1px"
                    borderBottomWidth="2px"
                    bg={isDark ? catppuccinAlpha(colors.sapphire, 0.03) : catppuccinAlpha(colors.sapphire, 0.06)}
                  >
                    <Table.Cell colSpan={4} p={0}>
                      <Box
                        position="relative"
                        borderTopWidth="1px"
                        borderColor={isDark ? "cyan.500/20" : colors.overlay0}
                      >
                        {/* Header bar */}
                        <Flex
                          align="center"
                          justify="space-between"
                          px={4}
                          py={2}
                          bg={isDark ? catppuccinAlpha(colors.sapphire, 0.08) : catppuccinAlpha(colors.sapphire, 0.15)}
                          borderBottomWidth="1px"
                          borderColor={isDark ? "cyan.500/20" : colors.overlay0}
                        >
                          <HStack gap={2}>
                            <Code2 size={12} style={{ color: colors.sapphire }} />
                            <Text
                              fontSize="10px"
                              fontWeight="bold"
                              fontFamily="mono"
                              color={isDark ? "cyan.300" : colors.sapphire}
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
                          bg={isDark ? catppuccinAlpha(colors.crust, 0.85) : colors.base}
                          color={colors.text}
                          borderWidth={isDark ? 0 : 1}
                          borderColor={colors.overlay0}
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
  const colors = getCatppuccinColors(theme);
  const isDark = theme === "dark";

  return (
    <Box
      bg={isDark ? catppuccinAlpha(colors.surface0, 0.4) : colors.base}
      borderWidth="1px"
      borderColor={isDark ? "white/5" : colors.overlay0}
      borderRadius="xl"
      p={5}
    >
      <Heading
        size="xs"
        fontWeight="bold"
        color={isDark ? "slate.400" : colors.overlay2}
        borderBottomWidth="1px"
        borderColor={isDark ? "white/5" : colors.overlay0}
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
              <Text color={isDark ? "slate.300" : colors.text}>{it}</Text>
            </Flex>
          ))}
        </Stack>
      )}
    </Box>
  );
}
