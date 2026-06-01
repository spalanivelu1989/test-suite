"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Heading,
  Text,
  Flex,
  VStack,
  HStack,
  Badge,
  Grid,
  Table,
} from "@chakra-ui/react";
import {
  Server,
  ShieldCheck,
  KeyRound,
  Layers,
  AlertCircle,
} from "lucide-react";
import { useThemeMode } from "@/app/providers";
import { getAWSColors, AWS_COLORS } from "@/app/theme/aws";
import { ConsoleLayout } from "@/app/components/ConsoleLayout";
import { LaunchWizard } from "@/app/components/LaunchWizard";
import { TestRunsTable } from "@/app/components/TestRunsTable";
import { TestRunDetailsPane } from "@/app/components/TestRunDetailsPane";
import type { Run, ProgressEvent, RunReport } from "@/src/types";

export function RunView({ id }: { id: string }) {
  const { theme } = useThemeMode();
  const colors = getAWSColors(theme);
  const isDark = theme === "dark";

  // Tab State - Defaults to test-runs to highlight the run
  const [activeTab, setActiveTab] = useState<string>("test-runs");

  // Runs State
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [isDetailsMaximized, setIsDetailsMaximized] = useState(false);

  // SSE & Report States
  const [eventsMap, setEventsMap] = useState<Record<string, ProgressEvent[]>>({});
  const [reportsMap, setReportsMap] = useState<Record<string, RunReport | null>>({});
  const [cancellingMap, setCancellingMap] = useState<Record<string, boolean>>({});



  // Fetch runs on load and pre-select the current run
  const fetchRuns = async () => {
    setIsLoadingRuns(true);
    try {
      const res = await fetch(`/api/runs?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const runsList = data.runs as Run[];
        setRuns(runsList);
        
        // Find and select the run matching the ID from parameters
        const match = runsList.find((r) => r.id === id);
        if (match) {
          setSelectedRun(match);
        }
      }
    } catch (err) {
      console.error("Failed to fetch runs:", err);
    } finally {
      setIsLoadingRuns(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [id]);

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
    const hasRunning = runs.some((r) => r.status === "running" || r.status === "pending");
    if (!hasRunning) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs?t=${Date.now()}`, { cache: "no-store" });
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

    if (runStatus === "completed" || runStatus === "failed" || runStatus === "cancelled") {
      fetchReport(runId);
      // Pre-fill history events from the run object
      setEventsMap((prev) => ({ ...prev, [runId]: selectedRun.events || [] }));
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
              stage: s === "completed" ? "done" : s === "cancelled" ? "cancelled" : "error",
            };
          }
          return r;
        })
      );

      if (s === "completed") {
        fetchReport(runId);
      }
    });

    es.onerror = () => {
      es.close();
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
    fetchRuns().then(() => {
      setActiveTab("test-runs");
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
      setTimeout(() => clearInterval(checkInterval), 4000);
    });
  };

  // Compute stats
  const totalCount = runs.length;
  const runningCount = runs.filter((r) => r.status === "running").length;



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
            position="relative"
            bg={colors.cardBg}
            border="1px solid"
            borderColor={colors.border}
            borderRadius="xl"
            p={4}
            backdropFilter="blur(16px)"
            overflow="hidden"
            style={{
              boxShadow: isDark
                ? `inset 1px 1px 0px rgba(255, 255, 255, 0.35),
                   inset 2px 2px 4px rgba(255, 255, 255, 0.1),
                   1px 1px 0px rgba(6, 182, 212, 0.2),
                   2px 2px 0px rgba(6, 182, 212, 0.18),
                   3px 3px 1px rgba(6, 182, 212, 0.15),
                   4px 4px 2px rgba(13, 148, 136, 0.12),
                   6px 6px 4px rgba(3, 105, 161, 0.1),
                   8px 8px 8px rgba(3, 105, 161, 0.08),
                   12px 12px 16px rgba(0, 0, 0, 0.25),
                   20px 20px 24px rgba(0, 0, 0, 0.3)`
                : `inset 1px 1px 0px rgba(255, 255, 255, 0.7),
                   inset 2px 2px 4px rgba(255, 255, 255, 0.3),
                   1px 1px 0px rgba(6, 182, 212, 0.12),
                   2px 2px 0px rgba(6, 182, 212, 0.1),
                   3px 3px 1px rgba(15, 23, 42, 0.06),
                   4px 4px 2px rgba(15, 23, 42, 0.05),
                   6px 6px 4px rgba(15, 23, 42, 0.04),
                   8px 8px 8px rgba(15, 23, 42, 0.03),
                   12px 12px 12px rgba(15, 23, 42, 0.02)`
            }}
          >
            <Heading size="xs" color={colors.text} mb={4} borderBottom="1px solid" borderColor={colors.border} pb={2}>
              Resources Overview
            </Heading>
            
            <Grid templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }} gap={4}>
              <Box
                p={3.5}
                bg={colors.subBg}
                border="1px solid"
                borderColor={colors.border}
                borderRadius="lg"
                cursor="pointer"
                onClick={() => setActiveTab("test-runs")}
                _hover={{ borderColor: "var(--aws-orange-main)", boxShadow: "0 4px 12px rgba(6, 182, 212, 0.15)" }}
                transition="all 0.2s ease"
              >
                <Server size={18} style={{ color: "var(--aws-orange-main)", marginBottom: "8px" }} />
                <Text fontSize="12.5px" color={colors.subtext} fontWeight="bold">Active Runs</Text>
                <Text fontSize="26px" fontWeight="black" color={colors.text}>{runningCount}</Text>
              </Box>

              <Box
                p={3.5}
                bg={colors.subBg}
                border="1px solid"
                borderColor={colors.border}
                borderRadius="lg"
                cursor="pointer"
                onClick={() => setActiveTab("test-runs")}
                _hover={{ borderColor: "var(--aws-orange-main)", boxShadow: "0 4px 12px rgba(6, 182, 212, 0.15)" }}
                transition="all 0.2s ease"
              >
                <Layers size={18} style={{ color: "teal.400", marginBottom: "8px" }} />
                <Text fontSize="12.5px" color={colors.subtext} fontWeight="bold">Total Runs</Text>
                <Text fontSize="26px" fontWeight="black" color={colors.text}>{totalCount}</Text>
              </Box>

              <Box
                p={3.5}
                bg={colors.subBg}
                border="1px solid"
                borderColor={colors.border}
                borderRadius="lg"
                cursor="pointer"
                onClick={() => setActiveTab("security-groups")}
                _hover={{ borderColor: "var(--aws-orange-main)", boxShadow: "0 4px 12px rgba(6, 182, 212, 0.15)" }}
                transition="all 0.2s ease"
              >
                <AlertCircle size={18} style={{ color: "purple.400", marginBottom: "8px" }} />
                <Text fontSize="12.5px" color={colors.subtext} fontWeight="bold">Security Groups</Text>
                <Text fontSize="26px" fontWeight="black" color={colors.text}>1</Text>
              </Box>

              <Box
                p={3.5}
                bg={colors.subBg}
                border="1px solid"
                borderColor={colors.border}
                borderRadius="lg"
                cursor="pointer"
                onClick={() => setActiveTab("key-pairs")}
                _hover={{ borderColor: "var(--aws-orange-main)", boxShadow: "0 4px 12px rgba(6, 182, 212, 0.15)" }}
                transition="all 0.2s ease"
              >
                <KeyRound size={18} style={{ color: "orange.400", marginBottom: "8px" }} />
                <Text fontSize="12.5px" color={colors.subtext} fontWeight="bold">Key Pairs (API Keys)</Text>
                <Text fontSize="26px" fontWeight="black" color={colors.text}>1</Text>
              </Box>
            </Grid>
          </Box>

          {/* Launch Wizard Form Panel */}
          <Box
            position="relative"
            bg={colors.cardBg}
            border="1px solid"
            borderColor={colors.border}
            borderRadius="xl"
            p={5}
            backdropFilter="blur(16px)"
            overflow="hidden"
            style={{
              boxShadow: isDark
                ? `inset 1px 1px 0px rgba(255, 255, 255, 0.35),
                   inset 2px 2px 4px rgba(255, 255, 255, 0.1),
                   1px 1px 0px rgba(6, 182, 212, 0.2),
                   2px 2px 0px rgba(6, 182, 212, 0.18),
                   3px 3px 1px rgba(6, 182, 212, 0.15),
                   4px 4px 2px rgba(13, 148, 136, 0.12),
                   6px 6px 4px rgba(3, 105, 161, 0.1),
                   8px 8px 8px rgba(3, 105, 161, 0.08),
                   12px 12px 16px rgba(0, 0, 0, 0.25),
                   20px 20px 24px rgba(0, 0, 0, 0.3)`
                : `inset 1px 1px 0px rgba(255, 255, 255, 0.7),
                   inset 2px 2px 4px rgba(255, 255, 255, 0.3),
                   1px 1px 0px rgba(6, 182, 212, 0.12),
                   2px 2px 0px rgba(6, 182, 212, 0.1),
                   3px 3px 1px rgba(15, 23, 42, 0.06),
                   4px 4px 2px rgba(15, 23, 42, 0.05),
                   6px 6px 4px rgba(15, 23, 42, 0.04),
                   8px 8px 8px rgba(15, 23, 42, 0.03),
                   12px 12px 12px rgba(15, 23, 42, 0.02)`
            }}
          >
            <Heading size="sm" color={colors.text} mb={4} fontWeight="extrabold" letterSpacing="0.02em">
              Launch Test
            </Heading>
            
            <LaunchWizard onLaunchSuccess={handleLaunchSuccess} />
          </Box>
        </VStack>
      </Box>

      {/* ==================== TEST RUNS TAB ==================== */}
      <Box display={activeTab === "test-runs" ? "flex" : "none"} flexDirection="column" gap={isDetailsMaximized ? 0 : 4} h="100%" width="100%">
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



      {/* ==================== SECURITY GROUPS TAB ==================== */}
      <Box display={activeTab === "security-groups" ? "block" : "none"} width="100%">
        <VStack align="stretch" gap={4}>
          <Heading size="sm" color={colors.text}>Security Groups</Heading>
          <Text fontSize="13px" color={colors.subtext}>
            Security groups act as a virtual firewall for your instances to control inbound and outbound traffic.
          </Text>

          <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} borderRadius="md" overflow="hidden">
            <Table.Root size="sm" variant="outline" border="none">
              <Table.Header bg={isDark ? "white/5" : "gray.50"}>
                <Table.Row borderColor={colors.border}>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Security Group ID</Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Name</Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Inbound Rules</Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Outbound Rules</Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Instance Bounds</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body fontSize="13px">
                <Table.Row borderColor={colors.border}>
                  <Table.Cell fontFamily="mono" color={AWS_COLORS.orange.main}>sg-0default</Table.Cell>
                  <Table.Cell fontWeight="bold">default-agent-rules</Table.Cell>
                  <Table.Cell color="slate.500">None (Inbound blocked)</Table.Cell>
                  <Table.Cell>
                    <VStack align="flex-start" gap={1}>
                      <Badge
                        variant="subtle"
                        bg={isDark ? "rgba(6, 182, 212, 0.15)" : "rgba(6, 182, 212, 0.1)"}
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
                        bg={isDark ? "rgba(6, 182, 212, 0.15)" : "rgba(6, 182, 212, 0.1)"}
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
          <Heading size="sm" color={colors.text}>Key Pairs (LLM & Runtime Credentials)</Heading>
          <Text fontSize="13px" color={colors.subtext}>
            Key pairs secure credentials used by the AI Agent to issue API calls to Claude and connect to Playwright.
          </Text>

          <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} borderRadius="md" overflow="hidden">
            <Table.Root size="sm" variant="outline" border="none">
              <Table.Header bg={isDark ? "white/5" : "gray.50"}>
                <Table.Row borderColor={colors.border}>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Key Pair ID</Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Key Name</Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Type</Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Key Fingerprint</Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Status</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body fontSize="13px">
                <Table.Row borderColor={colors.border}>
                  <Table.Cell fontFamily="mono" color={AWS_COLORS.orange.main}>key-0claude</Table.Cell>
                  <Table.Cell fontWeight="bold">claude-anthropic-key</Table.Cell>
                  <Table.Cell>API Token (RSA-like auth)</Table.Cell>
                  <Table.Cell fontFamily="mono" color="slate.500">sk-ant-us-east-1-*************</Table.Cell>
                  <Table.Cell><Badge colorPalette="green">Authorized</Badge></Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table.Root>
          </Box>
        </VStack>
      </Box>
    </ConsoleLayout>
  );
}
