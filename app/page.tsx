"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Heading,
  Text,
  Flex,
  VStack,
  HStack,
  Button,
  Grid,
  Link,
  Table,
  Badge,
  Code,
} from "@chakra-ui/react";
import {
  Server,
  ShieldCheck,
  KeyRound,
  Layers,
  Heart,
  ChevronRight,
  ExternalLink,
  Info,
  CirclePlay,
  Wrench,
  AlertCircle,
} from "lucide-react";
import { useThemeMode } from "@/app/providers";
import { getAWSColors, AWS_COLORS } from "@/app/theme/aws";
import { ConsoleLayout } from "@/app/components/ConsoleLayout";
import { LaunchWizard } from "@/app/components/LaunchWizard";
import { TestRunsTable } from "@/app/components/TestRunsTable";
import { TestReportView } from "@/app/components/TestReportView";
import { TestRunDetailsPane } from "@/app/components/TestRunDetailsPane";
import type { Run, ProgressEvent, RunReport } from "@/src/types";

export default function HomePage() {
  const { theme } = useThemeMode();
  const colors = getAWSColors(theme);
  const isDark = theme === "dark";

  // Tab State
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Runs State
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [isDetailsMaximized, setIsDetailsMaximized] = useState(false);

  // SSE & Report States
  const [eventsMap, setEventsMap] = useState<Record<string, ProgressEvent[]>>(
    {},
  );
  const [reportsMap, setReportsMap] = useState<
    Record<string, RunReport | null>
  >({});
  const [cancellingMap, setCancellingMap] = useState<Record<string, boolean>>(
    {},
  );

  const reportRun = useMemo(() => {
    if (selectedRun) return selectedRun;
    if (runs.length > 0) {
      return [...runs].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];
    }
    return null;
  }, [selectedRun, runs]);

  // Fetch report for the active report run when on the test-report tab
  useEffect(() => {
    if (activeTab === "test-report" && reportRun) {
      fetchReport(reportRun.id);
    }
  }, [activeTab, reportRun?.id]);

  // Fetch runs on load
  const fetchRuns = async () => {
    setIsLoadingRuns(true);
    try {
      const res = await fetch(`/api/runs?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs);
      }
    } catch (err) {
      console.error("Failed to fetch runs:", err);
    } finally {
      setIsLoadingRuns(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  // Sync selectedRun with updated runs list (e.g. status changes)
  useEffect(() => {
    if (selectedRun) {
      const updated = runs.find((r) => r.id === selectedRun.id);
      if (updated && updated !== selectedRun) {
        setSelectedRun(updated);
      }
    }
  }, [runs, selectedRun]);

  // Sync running runs in the background
  useEffect(() => {
    const hasRunning = runs.some(
      (r) => r.status === "running" || r.status === "pending",
    );
    if (!hasRunning) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setRuns(data.runs);
        }
      } catch (err) {
        console.error(err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [runs]);

  // Fetch report helper
  const fetchReport = async (runId: string) => {
    if (reportsMap[runId]) return;
    try {
      const res = await fetch(`/api/runs/${runId}/report?format=json`);
      if (res.ok) {
        const data = (await res.json()) as RunReport;
        setReportsMap((prev) => ({ ...prev, [runId]: data }));
      }
    } catch (err) {
      console.error("Failed to fetch report for run:", runId, err);
    }
  };

  // SSE stream for selected run
  useEffect(() => {
    if (!selectedRun) return;
    const runId = selectedRun.id;
    const runStatus = selectedRun.status;

    if (
      runStatus === "completed" ||
      runStatus === "failed" ||
      runStatus === "cancelled"
    ) {
      fetchReport(runId);
      // The list API strips events, so fetch the full run to populate the log
      // panel for terminal runs (no live SSE stream once a run has ended).
      void (async () => {
        try {
          const res = await fetch(`/api/runs/${runId}`);
          if (!res.ok) return;
          const full = await res.json();
          setEventsMap((prev) => {
            if (prev[runId] && prev[runId].length > 0) return prev;
            return { ...prev, [runId]: full.events || [] };
          });
        } catch (err) {
          console.error("Failed to load events for run:", runId, err);
        }
      })();
      return;
    }

    // Set up SSE stream
    const es = new EventSource(`/api/runs/${runId}/stream`);

    // Reset log buffer only if we don't already have events for this run
    setEventsMap((prev) => {
      if (prev[runId] && prev[runId].length > 0) return prev;
      return { ...prev, [runId]: [] };
    });

    es.addEventListener("progress", (e) => {
      const ev = JSON.parse((e as MessageEvent).data);
      setEventsMap((prev) => ({
        ...prev,
        [runId]: [...(prev[runId] || []), ev],
      }));
    });

    es.addEventListener("end", async (e) => {
      const { status: s, error: err } = JSON.parse((e as MessageEvent).data);
      es.close();

      setRuns((prev) =>
        prev.map((r) => {
          if (r.id === runId) {
            return {
              ...r,
              status: s,
              error: err,
              stage:
                s === "completed"
                  ? "done"
                  : s === "cancelled"
                    ? "cancelled"
                    : "error",
            };
          }
          return r;
        }),
      );

      if (s === "completed") {
        fetchReport(runId);
      }
    });

    // Only close on persistent errors (3 consecutive failures).
    // Transient onerror events are normal during SSE reconnects — closing
    // immediately on the first one causes the log panel to go dark.
    let errorCount = 0;
    es.onerror = () => {
      errorCount++;
      if (errorCount >= 3) {
        es.close();
      }
    };
    es.onopen = () => {
      errorCount = 0; // reset on successful (re)connect
    };

    return () => {
      es.close();
    };
  }, [selectedRun?.id]);

  // Stop Run handler
  const handleStopRun = async (runId: string) => {
    setCancellingMap((prev) => ({ ...prev, [runId]: true }));
    try {
      await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
      fetchRuns(); // refresh state
    } catch (err) {
      console.error("Failed to cancel run:", err);
    } finally {
      setCancellingMap((prev) => ({ ...prev, [runId]: false }));
    }
  };

  // Terminate Run handler
  const handleTerminateRun = async (runId: string) => {
    try {
      const res = await fetch(`/api/runs/${runId}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedRun?.id === runId) {
          setSelectedRun(null);
        }
        fetchRuns();
      }
    } catch (err) {
      console.error("Failed to terminate run:", err);
    }
  };

  const handleLaunchSuccess = (runId: string) => {
    // Refresh runs list
    fetchRuns().then(() => {
      // Switch tab to Test Runs
      setActiveTab("test-runs");
      // Find and select the newly launched run
      const checkInterval = setInterval(() => {
        setRuns((currentRuns) => {
          const newRun = currentRuns.find((r) => r.id === runId);
          if (newRun) {
            setSelectedRun(newRun);
            clearInterval(checkInterval);
          }
          return currentRuns;
        });
      }, 200);
      // Timeout safety
      setTimeout(() => clearInterval(checkInterval), 4000);
    });
  };

  // Compute stats
  const totalCount = runs.length;
  const runningCount = runs.filter((r) => r.status === "running").length;
  const stoppedCount = runs.filter((r) => r.status === "cancelled").length;
  const terminatedCount = runs.filter((r) => r.status === "failed").length;

  return (
    <ConsoleLayout
      activeTab={activeTab}
      setActiveTab={(tab) => {
        setActiveTab(tab);
      }}
      runsCount={totalCount}
      runningCount={runningCount}
    >
      {/* ==================== DASHBOARD TAB ==================== */}
      <Box display={activeTab === "dashboard" ? "block" : "none"} width="100%">
        <VStack align="stretch" gap={6}>
          {/* Resources Overview Grid */}
          <Box
            bg={colors.cardBg}
            border="1px solid"
            borderColor={colors.border}
            borderRadius="xl"
            p={5}
            shadow="xl"
          >
            <HStack justify="space-between" align="center" mb={4}>
              <HStack gap={2}>
                <Box
                  w="6px"
                  h="6px"
                  borderRadius="full"
                  bg={runningCount > 0 ? "#a6d189" : "#737994"}
                  boxShadow={runningCount > 0 ? "0 0 8px #a6d189" : "none"}
                />
                <Text
                  fontSize="11px"
                  fontWeight="extrabold"
                  color={colors.text}
                  letterSpacing="0.08em"
                  fontFamily="mono"
                >
                  OVERVIEW
                </Text>
              </HStack>
            </HStack>

            <Grid
              templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }}
              gap={5}
            >
              {/* Active Runs Card */}
              <Box
                position="relative"
                p={5}
                bg={
                  isDark
                    ? "linear-gradient(135deg, rgba(133, 193, 220, 0.08) 0%, rgba(35, 38, 52, 0.9) 100%)"
                    : "linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(241, 245, 249, 0.9) 100%)"
                }
                border="1px solid"
                borderColor={
                  runningCount > 0 ? "rgba(133, 193, 220, 0.45)" : colors.border
                }
                borderRadius="xl"
                cursor="pointer"
                onClick={() => setActiveTab("test-runs")}
                overflow="hidden"
                transition="all 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
                _hover={{
                  borderColor: isDark
                    ? "rgba(153, 209, 219, 0.5)"
                    : "rgba(59, 130, 246, 0.4)",
                  bg: isDark
                    ? "linear-gradient(135deg, rgba(133, 193, 220, 0.12) 0%, rgba(45, 49, 69, 0.95) 100%)"
                    : "linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(235, 239, 245, 0.95) 100%)",
                  transform: "translateY(-1px)",
                  shadow: "md",
                }}
              >
                <Flex justify="space-between" align="start">
                  <VStack align="start" gap={1}>
                    <Text
                      fontSize="11px"
                      fontWeight="bold"
                      color={colors.subtext}
                      letterSpacing="0.05em"
                      textTransform="uppercase"
                    >
                      Active Runs
                    </Text>
                    <HStack align="baseline" gap={2}>
                      <Text
                        fontSize="36px"
                        fontWeight="normal"
                        lineHeight="1"
                        color="transparent"
                        letterSpacing="-0.5px"
                        style={{
                          // Use `backgroundImage` (not the `background` shorthand,
                          // which resets background-clip to border-box) and set
                          // BOTH the standard + prefixed clip, or Chrome renders
                          // the gradient as a solid block over the number.
                          backgroundImage: isDark
                            ? "linear-gradient(to right, #99d1db, #8caaee)"
                            : "linear-gradient(to right, #0f2d59, #1d4ed8)",
                          backgroundClip: "text",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                        }}
                      >
                        {runningCount}
                      </Text>
                      {runningCount > 0 && (
                        <Badge
                          variant="subtle"
                          bg="rgba(166, 209, 137, 0.12)"
                          color="#a6d189"
                          borderColor="rgba(166, 209, 137, 0.25)"
                          borderWidth="1px"
                          borderRadius="full"
                          fontSize="9px"
                          fontWeight="bold"
                          px={2}
                          py={0.5}
                          display="inline-flex"
                          alignItems="center"
                          gap={1}
                        >
                          <Box
                            w="5px"
                            h="5px"
                            borderRadius="full"
                            bg="#a6d189"
                            style={{
                              animation: "pulse-glow-run 1.2s infinite",
                            }}
                          />
                          LIVE
                        </Badge>
                      )}
                    </HStack>
                  </VStack>
                </Flex>

                <Text
                  fontSize="11.5px"
                  color={colors.subtext}
                  mt={3}
                  fontWeight="medium"
                >
                  {runningCount > 0
                    ? `${runningCount} test run${runningCount > 1 ? "s" : ""} actively running now`
                    : "No test executions currently active"}
                </Text>
              </Box>

              {/* Total Runs Card */}
              <Box
                position="relative"
                p={5}
                bg={
                  isDark
                    ? "linear-gradient(135deg, rgba(166, 209, 137, 0.08) 0%, rgba(35, 38, 52, 0.9) 100%)"
                    : "linear-gradient(135deg, rgba(22, 163, 74, 0.05) 0%, rgba(241, 245, 249, 0.9) 100%)"
                }
                border="1px solid"
                borderColor={colors.border}
                borderRadius="xl"
                cursor="pointer"
                onClick={() => setActiveTab("test-runs")}
                overflow="hidden"
                transition="all 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
                _hover={{
                  borderColor: isDark
                    ? "rgba(166, 209, 137, 0.5)"
                    : "rgba(22, 163, 74, 0.4)",
                  bg: isDark
                    ? "linear-gradient(135deg, rgba(166, 209, 137, 0.12) 0%, rgba(45, 49, 69, 0.95) 100%)"
                    : "linear-gradient(135deg, rgba(22, 163, 74, 0.08) 0%, rgba(235, 239, 245, 0.95) 100%)",
                  transform: "translateY(-1px)",
                  shadow: "md",
                }}
              >
                <Flex justify="space-between" align="start">
                  <VStack align="start" gap={1}>
                    <Text
                      fontSize="11px"
                      fontWeight="bold"
                      color={colors.subtext}
                      letterSpacing="0.05em"
                      textTransform="uppercase"
                    >
                      Total Runs
                    </Text>
                    <Text
                      fontSize="36px"
                      fontWeight="normal"
                      lineHeight="1"
                      color="transparent"
                      letterSpacing="-0.5px"
                      style={{
                        // backgroundImage (not the `background` shorthand) + both
                        // standard & prefixed background-clip, so Chrome clips the
                        // gradient to the glyphs instead of painting a solid block.
                        backgroundImage: isDark
                          ? "linear-gradient(to right, #99d1db, #8caaee)"
                          : "linear-gradient(to right, #0f2d59, #1d4ed8)",
                        backgroundClip: "text",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      {totalCount}
                    </Text>
                  </VStack>
                </Flex>

                <Text
                  fontSize="11.5px"
                  color={colors.subtext}
                  mt={3}
                  fontWeight="medium"
                >
                  {totalCount > 0
                    ? `${totalCount} suite execution${totalCount > 1 ? "s" : ""} recorded in history`
                    : "Ready to launch your first test suite run"}
                </Text>
              </Box>
            </Grid>
          </Box>

          {/* Launch Wizard Form Panel */}
          <Box
            bg={colors.cardBg}
            border="1px solid"
            borderColor={colors.border}
            borderRadius="xl"
            p={5}
            shadow="xl"
          >
            <Heading
              size="sm"
              color={colors.text}
              mb={4}
              fontWeight="extrabold"
              letterSpacing="0.02em"
            >
              Launch Test
            </Heading>

            <LaunchWizard onLaunchSuccess={handleLaunchSuccess} />
          </Box>
        </VStack>
      </Box>

      {/* ==================== TEST RUNS TAB ==================== */}
      <Box
        display={activeTab === "test-runs" ? "flex" : "none"}
        flexDirection="column"
        gap={isDetailsMaximized ? 0 : 4}
        h="100%"
        width="100%"
      >
        {!isDetailsMaximized && (
          <Heading size="sm" color={colors.text} fontWeight="extrabold">
            Test Runs
          </Heading>
        )}

        {!isDetailsMaximized && (
          <Box flex={1} overflow="hidden">
            <TestRunsTable
              runs={runs}
              selectedRunId={selectedRun?.id ?? null}
              onSelectRun={(run) => setSelectedRun(run)}
              onStopRun={(id) => handleStopRun(id)}
              onTerminateRun={(id) => handleTerminateRun(id)}
              onLaunchNew={() => setActiveTab("dashboard")}
              isLoading={isLoadingRuns}
              onRefresh={fetchRuns}
              onViewReport={(run) => {
                setSelectedRun(run);
                setActiveTab("test-report");
              }}
              cancellingMap={cancellingMap}
            />
          </Box>
        )}

        {/* Details pane — bottom drawer by default, full-screen when maximized */}
        {selectedRun && (
          <TestRunDetailsPane
            key={selectedRun.id}
            run={selectedRun}
            events={eventsMap[selectedRun.id] ?? []}
            report={reportsMap[selectedRun.id] ?? null}
            cancelling={cancellingMap[selectedRun.id] ?? false}
            onStop={() => handleStopRun(selectedRun.id)}
            onClose={() => {
              setSelectedRun(null);
              setIsDetailsMaximized(false);
            }}
            isMaximized={isDetailsMaximized}
            onToggleMaximize={() => setIsDetailsMaximized((v) => !v)}
          />
        )}
      </Box>

      {/* ==================== TEST REPORT TAB ==================== */}
      <Box
        display={activeTab === "test-report" ? "block" : "none"}
        width="100%"
        height="100%"
      >
        <TestReportView
          run={reportRun}
          report={reportRun ? (reportsMap[reportRun.id] ?? null) : null}
          runs={runs}
          onSelectRun={(run) => setSelectedRun(run)}
        />
      </Box>

      {/* ==================== SECURITY GROUPS TAB ==================== */}
      <Box
        display={activeTab === "security-groups" ? "block" : "none"}
        width="100%"
      >
        <VStack align="stretch" gap={4}>
          <Heading size="sm" color={colors.text}>
            Security Groups
          </Heading>
          <Text fontSize="13px" color={colors.subtext}>
            Security groups act as a virtual firewall for your instances to
            control inbound and outbound traffic.
          </Text>

          <Box
            bg={colors.cardBg}
            border="1px solid"
            borderColor={colors.border}
            borderRadius="md"
            overflow="hidden"
          >
            <Table.Root size="sm" variant="outline" border="none">
              <Table.Header bg={isDark ? "white/5" : "gray.50"}>
                <Table.Row borderColor={colors.border}>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">
                    Security Group ID
                  </Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">
                    Name
                  </Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">
                    Inbound Rules
                  </Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">
                    Outbound Rules
                  </Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">
                    Instance Bounds
                  </Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body fontSize="13px">
                <Table.Row borderColor={colors.border}>
                  <Table.Cell fontFamily="mono" color={AWS_COLORS.orange.main}>
                    sg-0default
                  </Table.Cell>
                  <Table.Cell fontWeight="bold">default-agent-rules</Table.Cell>
                  <Table.Cell color="slate.500">
                    None (Inbound blocked)
                  </Table.Cell>
                  <Table.Cell>
                    <VStack align="flex-start" gap={1}>
                      <Badge
                        variant="subtle"
                        bg={
                          isDark
                            ? "rgba(133, 193, 220, 0.15)"
                            : "rgba(133, 193, 220, 0.1)"
                        }
                        color={isDark ? "cyan.300" : "cyan.800"}
                        borderColor={isDark ? "cyan.800/30" : "cyan.200"}
                        borderWidth="1px"
                        borderRadius="sm"
                        px={1.5}
                        py={0.5}
                        fontSize="11.5px"
                      >
                        HTTP (80) {"->"} Anywhere
                      </Badge>
                      <Badge
                        variant="subtle"
                        bg={
                          isDark
                            ? "rgba(133, 193, 220, 0.15)"
                            : "rgba(133, 193, 220, 0.1)"
                        }
                        color={isDark ? "cyan.300" : "cyan.800"}
                        borderColor={isDark ? "cyan.800/30" : "cyan.200"}
                        borderWidth="1px"
                        borderRadius="sm"
                        px={1.5}
                        py={0.5}
                        fontSize="11.5px"
                      >
                        HTTPS (443) {"->"} Anywhere
                      </Badge>
                    </VStack>
                  </Table.Cell>
                  <Table.Cell>
                    <VStack align="flex-start" gap={1}>
                      <Text>Max depth: 2 (Crawl constraint)</Text>
                      <Text>Max pages: 20 (Execution limit)</Text>
                    </VStack>
                  </Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table.Root>
          </Box>
        </VStack>
      </Box>

      {/* ==================== KEY PAIRS TAB ==================== */}
      <Box display={activeTab === "key-pairs" ? "block" : "none"} width="100%">
        <VStack align="stretch" gap={4}>
          <Heading size="sm" color={colors.text}>
            Key Pairs (LLM & Runtime Credentials)
          </Heading>
          <Text fontSize="13px" color={colors.subtext}>
            Key pairs secure credentials used by the AI Agent to issue API calls
            to Claude and connect to Playwright.
          </Text>

          <Box
            bg={colors.cardBg}
            border="1px solid"
            borderColor={colors.border}
            borderRadius="md"
            overflow="hidden"
          >
            <Table.Root size="sm" variant="outline" border="none">
              <Table.Header bg={isDark ? "white/5" : "gray.50"}>
                <Table.Row borderColor={colors.border}>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">
                    Key Pair ID
                  </Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">
                    Key Name
                  </Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">
                    Type
                  </Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">
                    Key Fingerprint
                  </Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">
                    Status
                  </Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body fontSize="13px">
                <Table.Row borderColor={colors.border}>
                  <Table.Cell fontFamily="mono" color={AWS_COLORS.orange.main}>
                    key-0claude
                  </Table.Cell>
                  <Table.Cell fontWeight="bold">
                    claude-anthropic-key
                  </Table.Cell>
                  <Table.Cell>API Token (RSA-like auth)</Table.Cell>
                  <Table.Cell fontFamily="mono" color="slate.500">
                    sk-ant-us-east-1-*************
                  </Table.Cell>
                  <Table.Cell>
                    <Badge colorPalette="green">Authorized</Badge>
                  </Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table.Root>
          </Box>
        </VStack>
      </Box>
    </ConsoleLayout>
  );
}
