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
  HardDrive,
  ShieldCheck,
  KeyRound,
  Layers,
  AlertCircle,
  FileCode,
} from "lucide-react";
import { useThemeMode } from "@/app/providers";
import { getAWSColors, AWS_COLORS } from "@/app/theme/aws";
import { ConsoleLayout } from "@/app/components/ConsoleLayout";
import { LaunchWizard } from "@/app/components/LaunchWizard";
import { InstancesTable } from "@/app/components/InstancesTable";
import { InstanceDetailsPane } from "@/app/components/InstanceDetailsPane";
import type { Run, ProgressEvent, RunReport } from "@/src/types";

export function RunView({ id }: { id: string }) {
  const { theme } = useThemeMode();
  const colors = getAWSColors(theme);
  const isDark = theme === "dark";

  // Tab State - Defaults to instances to highlight the run
  const [activeTab, setActiveTab] = useState<string>("instances");

  // Runs State
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [isDetailsMaximized, setIsDetailsMaximized] = useState(false);

  // SSE & Report States
  const [eventsMap, setEventsMap] = useState<Record<string, ProgressEvent[]>>({});
  const [reportsMap, setReportsMap] = useState<Record<string, RunReport | null>>({});
  const [cancellingMap, setCancellingMap] = useState<Record<string, boolean>>({});

  // Spec Volumes selection
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);

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
      setActiveTab("instances");
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

  // Extract spec volumes from completed runs
  const specVolumes = runs
    .filter((r) => r.status === "completed" && r.report)
    .flatMap((run) => {
      const reportData = reportsMap[run.id] ?? run.report;
      if (!reportData || !reportData.generatedSpecs) return [];
      return reportData.generatedSpecs.map((spec) => ({
        id: `vol-${spec.file.split("/").pop()?.replace(".spec.ts", "") || run.id.slice(0, 8)}`,
        file: spec.file,
        code: spec.code,
        size: `${spec.code.length} B`,
        runId: run.id,
        url: run.config.url,
      }));
    });

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
          <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} borderRadius="md" p={4}>
            <Heading size="xs" color={colors.text} mb={4} borderBottom="1px solid" borderColor={colors.border} pb={2}>
              Resources Overview (us-east-1 Region)
            </Heading>
            
            <Grid templateColumns={{ base: "repeat(2, 1fr)", md: "repeat(5, 1fr)" }} gap={4}>
              <Box
                p={3.5}
                bg={colors.subBg}
                border="1px solid"
                borderColor={colors.border}
                borderRadius="sm"
                cursor="pointer"
                onClick={() => setActiveTab("instances")}
                _hover={{ borderColor: AWS_COLORS.orange.main }}
                transition="border-color 0.15s ease"
              >
                <Server size={18} style={{ color: AWS_COLORS.orange.main, marginBottom: "8px" }} />
                <Text fontSize="12px" color={colors.subtext} fontWeight="semibold">Running Instances</Text>
                <Text fontSize="24px" fontWeight="black" color={colors.text}>{runningCount}</Text>
              </Box>

              <Box
                p={3.5}
                bg={colors.subBg}
                border="1px solid"
                borderColor={colors.border}
                borderRadius="sm"
                cursor="pointer"
                onClick={() => setActiveTab("instances")}
                _hover={{ borderColor: AWS_COLORS.orange.main }}
                transition="border-color 0.15s ease"
              >
                <Layers size={18} style={{ color: "teal", marginBottom: "8px" }} />
                <Text fontSize="12px" color={colors.subtext} fontWeight="semibold">Total Instances</Text>
                <Text fontSize="24px" fontWeight="black" color={colors.text}>{totalCount}</Text>
              </Box>

              <Box
                p={3.5}
                bg={colors.subBg}
                border="1px solid"
                borderColor={colors.border}
                borderRadius="sm"
                cursor="pointer"
                onClick={() => setActiveTab("volumes")}
                _hover={{ borderColor: AWS_COLORS.orange.main }}
                transition="border-color 0.15s ease"
              >
                <HardDrive size={18} style={{ color: "blue.500", marginBottom: "8px" }} />
                <Text fontSize="12px" color={colors.subtext} fontWeight="semibold">EBS Volumes (Specs)</Text>
                <Text fontSize="24px" fontWeight="black" color={colors.text}>{specVolumes.length}</Text>
              </Box>

              <Box
                p={3.5}
                bg={colors.subBg}
                border="1px solid"
                borderColor={colors.border}
                borderRadius="sm"
                cursor="pointer"
                onClick={() => setActiveTab("security-groups")}
                _hover={{ borderColor: AWS_COLORS.orange.main }}
                transition="border-color 0.15s ease"
              >
                <AlertCircle size={18} style={{ color: "purple.500", marginBottom: "8px" }} />
                <Text fontSize="12px" color={colors.subtext} fontWeight="semibold">Security Groups</Text>
                <Text fontSize="24px" fontWeight="black" color={colors.text}>1</Text>
              </Box>

              <Box
                p={3.5}
                bg={colors.subBg}
                border="1px solid"
                borderColor={colors.border}
                borderRadius="sm"
                cursor="pointer"
                onClick={() => setActiveTab("key-pairs")}
                _hover={{ borderColor: AWS_COLORS.orange.main }}
                transition="border-color 0.15s ease"
              >
                <KeyRound size={18} style={{ color: "orange.500", marginBottom: "8px" }} />
                <Text fontSize="12px" color={colors.subtext} fontWeight="semibold">Key Pairs (API Keys)</Text>
                <Text fontSize="24px" fontWeight="black" color={colors.text}>1</Text>
              </Box>
            </Grid>
          </Box>

          {/* Launch Wizard Form Panel */}
          <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} borderRadius="md" p={4}>
            <Heading size="sm" color={colors.text} mb={4} borderBottom="1px solid" borderColor={colors.border} pb={2}>
              Launch Instance (Launch New AI Crawler & Tester Run)
            </Heading>
            <LaunchWizard onLaunchSuccess={handleLaunchSuccess} />
          </Box>
        </VStack>
      </Box>

      {/* ==================== INSTANCES TAB ==================== */}
      <Box display={activeTab === "instances" ? "flex" : "none"} flexDirection="column" gap={isDetailsMaximized ? 0 : 4} h="100%" width="100%">
        {!isDetailsMaximized && (
          <Heading size="sm" color={colors.text} fontWeight="extrabold">
            Instances
          </Heading>
        )}

        {!isDetailsMaximized && (
          <Box flex={1} overflow="hidden">
            <InstancesTable
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
          <InstanceDetailsPane
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

      {/* ==================== AMIs TAB ==================== */}
      <Box display={activeTab === "amis" ? "block" : "none"} width="100%">
        <VStack align="stretch" gap={4}>
          <Heading size="sm" color={colors.text}>AMIs (Amazon Machine Images)</Heading>
          <Text fontSize="13px" color={colors.subtext}>
            Pre-packaged templates with Playwright, crawl hooks, and locators recovery logic setup.
          </Text>

          <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} borderRadius="md" overflow="hidden">
            <Table.Root size="sm" variant="outline" border="none">
              <Table.Header bg={isDark ? "white/5" : "gray.50"}>
                <Table.Row borderColor={colors.border}>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">AMI Name</Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">AMI ID</Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Engine Platform</Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Status</Table.ColumnHeader>
                  <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Description</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body fontSize="13px">
                <Table.Row borderColor={colors.border}>
                  <Table.Cell fontWeight="bold">Playwright Chromium Image</Table.Cell>
                  <Table.Cell fontFamily="mono" color={AWS_COLORS.orange.main}>ami-chrome-v1.60.0</Table.Cell>
                  <Table.Cell>Linux (Chromium Headless)</Table.Cell>
                  <Table.Cell><Badge colorPalette="green">Available</Badge></Table.Cell>
                  <Table.Cell>Official Google Chrome Headless runtime for modern JavaScript SPAs and crawling.</Table.Cell>
                </Table.Row>
                <Table.Row borderColor={colors.border}>
                  <Table.Cell fontWeight="bold">Playwright Firefox Image</Table.Cell>
                  <Table.Cell fontFamily="mono" color={AWS_COLORS.orange.main}>ami-firefox-v1.60.0</Table.Cell>
                  <Table.Cell>Linux (Firefox/Gecko Headless)</Table.Cell>
                  <Table.Cell><Badge colorPalette="green">Available</Badge></Table.Cell>
                  <Table.Cell>Firefox Headless runtime for cross-browser testing of forms and locator healing.</Table.Cell>
                </Table.Row>
              </Table.Body>
            </Table.Root>
          </Box>
        </VStack>
      </Box>

      {/* ==================== VOLUMES TAB ==================== */}
      <Box display={activeTab === "volumes" ? "block" : "none"} width="100%">
        <VStack align="stretch" gap={4}>
          <Heading size="sm" color={colors.text}>Elastic Block Store - Volumes (Generated Specs)</Heading>
          <Text fontSize="13px" color={colors.subtext}>
            EBS Volumes store the generated test specifications (`.spec.ts` files) attached to completed instances.
          </Text>

          <Box display="grid" gridTemplateColumns={{ base: "1fr", lg: "3fr 2fr" }} gap={4} alignItems="stretch">
            <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} borderRadius="md" overflow="hidden">
              <Table.Root size="sm" variant="outline" border="none">
                <Table.Header bg={isDark ? "white/5" : "gray.50"}>
                  <Table.Row borderColor={colors.border}>
                    <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Volume ID</Table.ColumnHeader>
                    <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">File Path</Table.ColumnHeader>
                    <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Size</Table.ColumnHeader>
                    <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Attachment</Table.ColumnHeader>
                    <Table.ColumnHeader color={colors.subtext} fontSize="12.5px">Domain App</Table.ColumnHeader>
                  </Table.Row>
                </Table.Header>
                <Table.Body fontSize="13px">
                  {specVolumes.length === 0 ? (
                    <Table.Row>
                      <Table.Cell colSpan={5} textAlign="center" py={6} color={colors.subtext}>
                        No spec volumes generated. Launch a run and let it complete.
                      </Table.Cell>
                    </Table.Row>
                  ) : (
                    specVolumes.map((vol) => (
                      <Table.Row
                        key={vol.id}
                        borderColor={colors.border}
                        cursor="pointer"
                        bg={selectedVolumeId === vol.id ? (isDark ? "rgba(236,114,17,0.1)" : "rgba(236,114,17,0.05)") : "transparent"}
                        onClick={() => setSelectedVolumeId(vol.id)}
                        _hover={{ bg: selectedVolumeId === vol.id ? undefined : colors.rowHover }}
                      >
                        <Table.Cell fontFamily="mono" color={AWS_COLORS.orange.main}>{vol.id}</Table.Cell>
                        <Table.Cell fontWeight="medium">{vol.file.split("/").pop()}</Table.Cell>
                        <Table.Cell fontFamily="mono">{vol.size}</Table.Cell>
                        <Table.Cell fontFamily="mono" color="teal">i-{vol.runId.slice(0, 17)}</Table.Cell>
                        <Table.Cell color={colors.subtext}>{vol.url}</Table.Cell>
                      </Table.Row>
                    ))
                  )}
                </Table.Body>
              </Table.Root>
            </Box>

            <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} p={4} borderRadius="md" display="flex" flexDirection="column">
              <Heading size="xs" color={colors.text} mb={3} borderBottom="1px solid" borderColor={colors.border} pb={1.5} display="flex" alignItems="center" gap={1.5}>
                <FileCode size={13} style={{ color: AWS_COLORS.orange.main }} /> Volume Inspector
              </Heading>
              
              {selectedVolumeId ? (
                (() => {
                  const vol = specVolumes.find((v) => v.id === selectedVolumeId);
                  if (!vol) return <Text fontSize="13px" color={colors.subtext}>Volume not found.</Text>;
                  return (
                    <VStack align="stretch" gap={3} flex={1} overflow="hidden">
                      <VStack align="stretch" gap={1} fontSize="12px">
                        <Flex justify="space-between">
                          <Text color={colors.subtext}>Attached File Path:</Text>
                          <Text fontWeight="bold" fontFamily="mono">{vol.file}</Text>
                        </Flex>
                        <Flex justify="space-between">
                          <Text color={colors.subtext}>Attached Instance:</Text>
                          <Text fontWeight="bold" fontFamily="mono">i-{vol.runId.slice(0, 17)}</Text>
                        </Flex>
                      </VStack>
                      <Box
                        as="pre"
                        p={3}
                        bg="black"
                        color="emerald.400"
                        fontFamily="mono"
                        fontSize="12px"
                        maxH="320px"
                        overflowY="auto"
                        whiteSpace="pre-wrap"
                        borderRadius="sm"
                        flex={1}
                        border="1px solid"
                        borderColor={colors.border}
                      >
                        <code>{vol.code}</code>
                      </Box>
                    </VStack>
                  );
                })()
              ) : (
                <Flex align="center" justify="center" h="200px" color={colors.subtext} fontSize="13px">
                  Select a volume to inspect its contents.
                </Flex>
              )}
            </Box>
          </Box>
        </VStack>
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
