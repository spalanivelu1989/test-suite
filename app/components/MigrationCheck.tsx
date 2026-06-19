"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Input,
  Button,
  Spinner,
  Heading,
} from "@chakra-ui/react";
import {
  GitCompare,
  ChevronRight,
  RefreshCw,
  Check,
  TriangleAlert,
  ArrowRight,
  Eye,
  History,
  Trash2,
  Clock,
} from "lucide-react";
import { useThemeMode } from "@/app/providers";
import { MigrationDiffView } from "@/app/components/MigrationDiffView";
import type {
  MigrationEnvironment,
  MigrationEvent,
  MigrationReport,
  MigrationStep,
  SourceApp,
  SourceSpec,
} from "@/src/migration/types";

// HPE Enterprise Color Palette Tokens - Using Azure Navy Blue Accents
export const HPE_COLORS = {
  blue: {
    main: "#005A9C", // Azure Navy Blue (Light Mode)
    darkAccent: "#0078D4", // Azure Blue (Dark Mode)
    hoverLight: "#004578",
    hoverDark: "#2b93ff",
  },
  dark: {
    bg: "#11161B", // Deep Slate/Navy background
    sidebarBg: "#0B0E12",
    cardBg: "#171F26", // Card surface
    subBg: "#0F1418", // Shaded areas/inner panels
    text: "#C9D1D9", // Light grey (softer than white — easier on the eyes)
    subtext: "#8A9BA8", // Slate grey text
    border: "#2E3A47", // Structural border
    rowHover: "rgba(0, 120, 212, 0.05)",
    tabSelectedBg: "#24313F",
  },
  light: {
    bg: "#F4F7F6", // HPE Light Slate/Grey background
    sidebarBg: "#FFFFFF",
    cardBg: "#FFFFFF",
    subBg: "#E4EAE8", // Shaded areas/inner panels
    text: "#333333", // Dark grey
    subtext: "#5F6B67", // Medium grey
    border: "#C0C6C4", // Cool grey border
    rowHover: "rgba(0, 90, 156, 0.04)",
    tabSelectedBg: "#E4EAE8",
  },
} as const;

export interface HPEThemeStyles {
  bg: string;
  sidebarBg: string;
  cardBg: string;
  subBg: string;
  text: string;
  subtext: string;
  border: string;
  rowHover: string;
  tabSelectedBg: string;
}

export function getHPEColors(theme: "light" | "dark"): HPEThemeStyles {
  return theme === "dark" ? HPE_COLORS.dark : HPE_COLORS.light;
}

interface MigrationStatus {
  id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  error?: string;
  events?: MigrationEvent[];
}

/** A saved migration check as returned by `GET /api/migration-check`. */
interface MigrationHistoryItem {
  id: string;
  sourceUrl: string;
  targetUrl: string;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  error?: string;
  summary?: MigrationReport["summary"];
  hasReport?: boolean;
}

type Phase = "configure" | "running" | "done" | "error";

export function MigrationCheck() {
  const { theme } = useThemeMode();
  const colors = getHPEColors(theme);
  const activeBlue =
    theme === "dark" ? HPE_COLORS.blue.darkAccent : HPE_COLORS.blue.main;
  const hoverBlue =
    theme === "dark" ? HPE_COLORS.blue.hoverDark : HPE_COLORS.blue.hoverLight;

  const [apps, setApps] = useState<SourceApp[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [sourceApp, setSourceApp] = useState<SourceApp | null>(null);

  const [specs, setSpecs] = useState<SourceSpec[]>([]);
  const [sourceRunId, setSourceRunId] = useState<string | null>(null);
  const [loadingSpecs, setLoadingSpecs] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Code Viewer State
  const [viewingSpec, setViewingSpec] = useState<SourceSpec | null>(null);

  const [targetUrl, setTargetUrl] = useState("");
  const [showUrlSuggestions, setShowUrlSuggestions] = useState(false);
  const [pathPrefix, setPathPrefix] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [idp, setIdp] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [heal, setHeal] = useState(false);

  const [envs, setEnvs] = useState<MigrationEnvironment[]>([]);
  const [allTargetUrls, setAllTargetUrls] = useState<string[]>([]);
  const [envLabel, setEnvLabel] = useState("");

  const [phase, setPhase] = useState<Phase>("configure");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [runStatus, setRunStatus] = useState<MigrationStatus | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  // Pending dashboard re-run, held while the user confirms/supplies credentials.
  // `specOverrides` carries user-edited target code to run verbatim.
  const [rerunModal, setRerunModal] = useState<{
    specFiles: string[];
    heal: boolean;
    specOverrides?: Record<string, string>;
  } | null>(null);

  // Saved migration check history (persisted across restarts on disk).
  const [history, setHistory] = useState<MigrationHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // Id of the check whose View/Remove action is currently in flight.
  const [busyId, setBusyId] = useState<string | null>(null);

  // --- data loading -------------------------------------------------------

  const loadApps = async () => {
    setLoadingApps(true);
    try {
      const res = await fetch(
        `/api/migration-check/source-apps?t=${Date.now()}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      setApps(data.apps ?? []);
    } catch {
      setApps([]);
    } finally {
      setLoadingApps(false);
    }
  };

  // Every target URL seen before — from saved profiles AND past run history —
  // for the auto-populate dropdown on the target URL field.
  const loadAllTargetUrls = async () => {
    try {
      const res = await fetch(
        `/api/migration-check/target-urls?t=${Date.now()}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      const urls: string[] = (data.targetUrls ?? []).filter(
        (u: unknown): u is string => typeof u === "string" && !!u.trim(),
      );
      setAllTargetUrls(urls);
    } catch {
      setAllTargetUrls([]);
    }
  };

  useEffect(() => {
    loadApps();
    loadAllTargetUrls();
  }, []);

  const loadEnvs = async (appId: string) => {
    try {
      const res = await fetch(
        `/api/migration-check/environments?appId=${encodeURIComponent(appId)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      setEnvs(data.environments ?? []);
    } catch {
      setEnvs([]);
    }
  };

  const applyEnv = (env: MigrationEnvironment) => {
    setTargetUrl(env.targetUrl);
    setPathPrefix(env.pathPrefix ?? "");
    setIdp(env.idp ?? "");
    setLoginUrl(env.loginUrl ?? "");
  };

  const saveEnv = async () => {
    if (!sourceApp || !envLabel.trim() || !targetUrl.trim()) return;
    await fetch("/api/migration-check/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: envLabel,
        sourceAppId: sourceApp.appId,
        targetUrl,
        ...(pathPrefix.trim() ? { pathPrefix } : {}),
        ...(idp.trim() ? { idp } : {}),
        ...(loginUrl.trim() ? { loginUrl } : {}),
      }),
    });
    setEnvLabel("");
    await loadEnvs(sourceApp.appId);
    await loadAllTargetUrls();
  };

  const pickApp = async (app: SourceApp) => {
    setSourceApp(app);
    setSpecs([]);
    setSelected(new Set());
    setViewingSpec(null); // Reset viewing spec on app switch
    setLoadingSpecs(true);
    loadEnvs(app.appId);
    try {
      const res = await fetch(
        `/api/migration-check/source-specs?url=${encodeURIComponent(app.url)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setSpecs([]);
        return;
      }
      const data = await res.json();
      setSpecs(data.specs ?? []);
      setSourceRunId(data.sourceRunId ?? null);
      // Pre-select everything that passed on the source.
      setSelected(
        new Set(
          (data.specs ?? [])
            .filter((s: SourceSpec) => s.sourceOutcome === "passed")
            .map((s: SourceSpec) => s.file),
        ),
      );
    } finally {
      setLoadingSpecs(false);
    }
  };

  const toggle = (file: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  // --- run ----------------------------------------------------------------

  // Auth is optional — some targets don't require login.
  const canRun =
    sourceApp && selected.size > 0 && /^https?:\/\//.test(targetUrl);

  // Existing target URLs to offer in the auto-populate dropdown, filtered by
  // what the user has typed so far (show everything when the field is empty).
  const urlSuggestions = useMemo(() => {
    const q = targetUrl.trim().toLowerCase();
    return allTargetUrls.filter(
      (u) => !q || (u.toLowerCase().includes(q) && u.toLowerCase() !== q),
    );
  }, [allTargetUrls, targetUrl]);

  // Start a migration check. With no arguments it uses the launch form's current
  // selection + heal toggle. `overrides` lets the results dashboard re-run a chosen
  // subset of failed specs (and pick straight vs. Evolver). Source/target can be
  // supplied explicitly so a re-run works from a history-loaded report too, where
  // the launch form's `sourceApp`/`targetUrl` state isn't populated.
  const run = async (overrides?: {
    specFiles?: string[];
    heal?: boolean;
    sourceUrl?: string;
    sourceRunId?: string | null;
    targetUrl?: string;
    pathPrefix?: string;
    specOverrides?: Record<string, string>;
  }) => {
    const srcUrl = overrides?.sourceUrl ?? sourceApp?.url;
    const tgtUrl = overrides?.targetUrl ?? targetUrl;
    const prefix = overrides?.pathPrefix ?? pathPrefix;
    if (!srcUrl || !tgtUrl) return;
    setError(null);
    setReport(null);
    setRunStatus(null);
    setRunId(null);
    setStopping(false);
    setPhase("running");
    try {
      const res = await fetch("/api/migration-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: srcUrl,
          sourceRunId: overrides?.sourceRunId ?? sourceRunId,
          targetUrl: tgtUrl,
          ...(prefix.trim() ? { pathPrefix: prefix } : {}),
          selectedSpecFiles: overrides?.specFiles ?? [...selected],
          ...(overrides?.specOverrides
            ? { specOverrides: overrides.specOverrides }
            : {}),
          auth: {
            ...(username.trim() ? { username } : {}),
            ...(password.trim() ? { password } : {}),
            ...(idp.trim() ? { idp } : {}),
            ...(loginUrl.trim() ? { loginUrl } : {}),
          },
          options: { heal: overrides?.heal ?? heal },
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error ?? "Failed to start migration check");
      setRunId(data.id);
      await poll(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const stopRun = async () => {
    if (!runId || stopping) return;
    setStopping(true);
    try {
      await fetch(`/api/migration-check/${runId}/cancel`, { method: "POST" });
    } catch {
      /* the poll will still pick up the terminal state */
    }
  };

  const poll = async (id: string) => {
    // Poll the status until terminal, surfacing live progress as it arrives.
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch(`/api/migration-check/${id}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        status: MigrationStatus;
        report: MigrationReport | null;
      };
      setRunStatus(data.status);
      if (data.status.status === "cancelled") {
        setError("Migration check stopped.");
        setPhase("error");
        return;
      }
      if (data.status.status === "failed") {
        setError(data.status.error ?? "Migration check failed");
        setPhase("error");
        return;
      }
      if (data.status.status === "completed" && data.report) {
        setReport(data.report);
        setPhase("done");
        return;
      }
    }
  };

  const reset = () => {
    setPhase("configure");
    setReport(null);
    setError(null);
    setStopping(false);
    setRunId(null);
  };

  // --- saved history ------------------------------------------------------

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/migration-check?t=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setHistory(data.checks ?? []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const openHistory = () => {
    setShowHistory(true);
    loadHistory();
  };

  // Load a saved result back into the report view.
  const openResult = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/migration-check/${id}?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        status: MigrationStatus;
        report: MigrationReport | null;
      };
      if (data.report) {
        setReport(data.report);
        setError(null);
        setRunId(null);
        setStopping(false);
        setPhase("done");
        setShowHistory(false);
      }
    } catch {
      /* leave the history list as-is on failure */
    } finally {
      setBusyId(null);
    }
  };

  // Permanently delete a saved result from disk.
  const removeResult = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/migration-check/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setHistory((prev) => prev.filter((h) => h.id !== id));
        // If we were viewing the one we just deleted, drop back to configure.
        if (report?.id === id) {
          setReport(null);
          setPhase("configure");
        }
      }
    } catch {
      /* keep the row; the user can retry */
    } finally {
      setBusyId(null);
    }
  };

  // --- render -------------------------------------------------------------

  if (showHistory) {
    return (
      <MigrationHistory
        history={history}
        loading={loadingHistory}
        busyId={busyId}
        viewingId={report?.id ?? null}
        onRefresh={loadHistory}
        onClose={() => setShowHistory(false)}
        onView={openResult}
        onRemove={removeResult}
        colors={colors}
        activeBlue={activeBlue}
        hoverBlue={hoverBlue}
        theme={theme}
      />
    );
  }

  if (phase === "done" && report) {
    return (
      <VStack align="stretch" gap={4} w="full" h="full">
        <Flex
          align="center"
          justify="space-between"
          borderBottom="2px solid"
          borderColor={colors.border}
          pb={3}
          flexShrink={0}
        >
          <Heading size="md" color={colors.text}>
            <Text textTransform="uppercase" letterSpacing="0.05em">
              Migration Check Results
            </Text>
          </Heading>
          <HStack gap={2}>
            <Button
              size="sm"
              variant="outline"
              borderRadius="lg"
              borderColor={colors.border}
              color={colors.text}
              bg="transparent"
              _hover={{
                borderColor: activeBlue,
                color: activeBlue,
                bg: "transparent",
              }}
              onClick={openHistory}
            >
              <HStack gap={1.5}>
                <History size={12} />
                <Text
                  fontSize="11px"
                  fontWeight="bold"
                  textTransform="uppercase"
                >
                  History
                </Text>
              </HStack>
            </Button>
            <Button
              size="sm"
              variant="outline"
              borderRadius="lg"
              borderColor={colors.border}
              color={colors.text}
              bg="transparent"
              _hover={{
                borderColor: activeBlue,
                color: activeBlue,
                bg: "transparent",
              }}
              onClick={reset}
            >
              <HStack gap={1.5}>
                <RefreshCw size={12} />
                <Text
                  fontSize="11px"
                  fontWeight="bold"
                  textTransform="uppercase"
                >
                  New check
                </Text>
              </HStack>
            </Button>
          </HStack>
        </Flex>
        <Box flex={1} overflow="hidden">
          <MigrationDiffView
            report={report}
            onRerun={(specFiles, healMode) =>
              setRerunModal({ specFiles, heal: healMode })
            }
            onRerunEdited={(file, code) =>
              setRerunModal({
                specFiles: [file],
                heal: false,
                specOverrides: { [file]: code },
              })
            }
          />
        </Box>
        {rerunModal && report && (
          <RerunModal
            specCount={rerunModal.specFiles.length}
            heal={rerunModal.heal}
            edited={!!rerunModal.specOverrides}
            sourceUrl={report.sourceUrl}
            targetUrl={report.targetUrl}
            colors={colors}
            activeBlue={activeBlue}
            username={username}
            setUsername={setUsername}
            password={password}
            setPassword={setPassword}
            idp={idp}
            setIdp={setIdp}
            loginUrl={loginUrl}
            setLoginUrl={setLoginUrl}
            onCancel={() => setRerunModal(null)}
            onConfirm={() => {
              const m = rerunModal;
              setRerunModal(null);
              void run({
                specFiles: m.specFiles,
                heal: m.heal,
                sourceUrl: report.sourceUrl,
                sourceRunId: report.sourceRunId,
                targetUrl: report.targetUrl,
                pathPrefix: report.pathPrefix ?? "",
                ...(m.specOverrides ? { specOverrides: m.specOverrides } : {}),
              });
            }}
          />
        )}
      </VStack>
    );
  }

  return (
    <Flex direction="column" gap={4} w="full" h="full">
      {/* Header Bar */}
      <Box
        borderBottom="2px solid"
        borderColor={colors.border}
        pb={3}
        flexShrink={0}
      >
        <Flex align="center" justify="space-between">
          <Heading size="md" color={colors.text}>
            <Text textTransform="uppercase" letterSpacing="0.05em">
              Migration Check Console
            </Text>
          </Heading>
          <HStack gap={2}>
            <Button
              size="xs"
              variant="outline"
              borderRadius="lg"
              borderColor={colors.border}
              color={colors.text}
              bg="transparent"
              _hover={{ borderColor: activeBlue, color: activeBlue }}
              onClick={openHistory}
              textTransform="uppercase"
            >
              <HStack gap={1.5}>
                <History size={11} />
                <Text>History</Text>
              </HStack>
            </Button>
            {phase === "error" && (
              <Button
                size="xs"
                variant="outline"
                borderRadius="lg"
                borderColor={colors.border}
                color={colors.text}
                bg="transparent"
                _hover={{ borderColor: activeBlue, color: activeBlue }}
                onClick={reset}
                textTransform="uppercase"
              >
                Configure
              </Button>
            )}
          </HStack>
        </Flex>
      </Box>

      {/* Error state alert bar */}
      {phase === "error" && error && (
        <Flex
          align="center"
          gap={3}
          bg={
            theme === "dark"
              ? "rgba(255, 64, 64, 0.08)"
              : "rgba(220, 38, 38, 0.05)"
          }
          border="1px solid"
          borderColor="#FF404066"
          borderRadius="lg"
          borderLeft={`4px solid #FF4040`}
          p={4}
          flexShrink={0}
        >
          <Box color="#FF4040">
            <TriangleAlert size={16} />
          </Box>
          <Text fontSize="12px" color={colors.text} flex={1}>
            ERROR: {error}
          </Text>
          <Button
            size="xs"
            variant="outline"
            borderRadius="lg"
            borderColor="#FF404055"
            color={colors.text}
            _hover={{ bg: "rgba(255, 64, 64, 0.15)", borderColor: "#FF4040" }}
            onClick={reset}
            textTransform="uppercase"
          >
            Retry Config
          </Button>
        </Flex>
      )}

      {/* Configure Phase Widescreen layout */}
      {phase === "configure" && (
        <Flex
          gap={5}
          flex={1}
          w="full"
          direction={{ base: "column", xl: "row" }}
          minH={0}
        >
          {/* Left panel: app list and specs selection */}
          <VStack
            align="stretch"
            gap={4}
            w={{ base: "full", xl: "380px" }}
            flexShrink={0}
            h="full"
            overflowY="auto"
            pr={{ xl: 1 }}
          >
            <Section title="01 / Source Application Select" colors={colors}>
              <Flex justify="space-between" align="center" mb={3}>
                <Text
                  fontSize="11px"
                  fontWeight="bold"
                  color={colors.subtext}
                  textTransform="uppercase"
                >
                  Previously Compiled Suites
                </Text>
                <Button
                  size="xs"
                  variant="outline"
                  borderRadius="lg"
                  borderColor={colors.border}
                  color={colors.text}
                  _hover={{ borderColor: activeBlue, color: activeBlue }}
                  onClick={loadApps}
                  h="22px"
                  px={2}
                >
                  <RefreshCw size={10} />
                </Button>
              </Flex>
              {loadingApps ? (
                <Spinner size="sm" color={activeBlue} />
              ) : apps.length === 0 ? (
                <Text fontSize="12px" color={colors.subtext} py={2}>
                  NO PREVIOUS APP EXECUTIONS DETECTED.
                </Text>
              ) : (
                <VStack
                  align="stretch"
                  gap={1.5}
                  maxH="280px"
                  overflowY="auto"
                  pr={1}
                >
                  {apps.map((app) => {
                    const active = sourceApp?.appId === app.appId;
                    return (
                      <Button
                        key={app.appId}
                        onClick={() => pickApp(app)}
                        variant="ghost"
                        display="block"
                        w="full"
                        textAlign="left"
                        h="auto"
                        py={2.5}
                        px={3.5}
                        borderRadius="lg"
                        border="1px solid"
                        borderColor={active ? activeBlue : colors.border}
                        bg={
                          active
                            ? theme === "dark"
                              ? "rgba(0, 120, 212, 0.06)"
                              : "rgba(0, 90, 156, 0.04)"
                            : "transparent"
                        }
                        _hover={{ bg: colors.rowHover }}
                        transition="all 0.15s"
                      >
                        <HStack gap={3} w="full">
                          <VStack
                            align="start"
                            gap={0.5}
                            w="full"
                            overflow="hidden"
                          >
                            <Text
                              fontSize="12px"
                              color={colors.text}
                              fontWeight="bold"
                              truncate
                              w="full"
                            >
                              {app.url}
                            </Text>
                            <Text fontSize="10px" color={colors.subtext}>
                              RUNS: {app.runCount}{" "}
                              {app.lastRunAt
                                ? ` · LAST: ${new Date(app.lastRunAt).toLocaleDateString()}`
                                : ""}
                            </Text>
                          </VStack>
                        </HStack>
                      </Button>
                    );
                  })}
                </VStack>
              )}
            </Section>

            {sourceApp && (
              <Section title="02 / Specifications Allocation" colors={colors}>
                {loadingSpecs ? (
                  <Spinner size="sm" color={activeBlue} />
                ) : specs.length === 0 ? (
                  <Text fontSize="12px" color={colors.subtext}>
                    No specifications compiled.
                  </Text>
                ) : (
                  <>
                    <Flex
                      justify="space-between"
                      align="center"
                      mb={3}
                      borderBottom="1px solid"
                      borderColor={colors.border}
                      pb={2}
                    >
                      <Text
                        fontSize="10.5px"
                        fontWeight="bold"
                        color={colors.subtext}
                        textTransform="uppercase"
                      >
                        Allocated: {selected.size} / {specs.length} specs
                      </Text>
                      <HStack gap={2}>
                        <Button
                          size="xs"
                          variant="outline"
                          borderRadius="lg"
                          borderColor={colors.border}
                          color={colors.text}
                          _hover={{
                            borderColor: activeBlue,
                            color: activeBlue,
                          }}
                          onClick={() =>
                            setSelected(new Set(specs.map((s) => s.file)))
                          }
                          fontSize="9.5px"
                          h="20px"
                        >
                          ALL
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          borderRadius="lg"
                          borderColor={colors.border}
                          color={colors.text}
                          _hover={{
                            borderColor: activeBlue,
                            color: activeBlue,
                          }}
                          onClick={() => setSelected(new Set())}
                          fontSize="9.5px"
                          h="20px"
                        >
                          NONE
                        </Button>
                      </HStack>
                    </Flex>
                    <VStack
                      align="stretch"
                      gap={1}
                      maxH="280px"
                      overflowY="auto"
                      border="1px solid"
                      borderColor={colors.border}
                      p={1}
                      bg={colors.bg}
                      borderRadius="lg"
                    >
                      {specs.map((s) => {
                        const on = selected.has(s.file);
                        return (
                          <Flex
                            key={s.file}
                            align="center"
                            gap={2}
                            px={3}
                            py={1.5}
                            borderRadius="md"
                            borderBottom="1px solid"
                            borderBottomColor={colors.border}
                            cursor="pointer"
                            bg={
                              on
                                ? theme === "dark"
                                  ? "rgba(0, 120, 212, 0.05)"
                                  : "rgba(0, 90, 156, 0.03)"
                                : "transparent"
                            }
                            _hover={{ bg: colors.rowHover }}
                            onClick={() => toggle(s.file)}
                            _last={{ borderBottom: "none" }}
                          >
                            <Box
                              w="14px"
                              h="14px"
                              borderRadius="md"
                              border="1.5px solid"
                              borderColor={on ? activeBlue : colors.border}
                              bg={on ? activeBlue : "transparent"}
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              flexShrink={0}
                            >
                              {on && (
                                <Check
                                  size={10}
                                  color="white"
                                  strokeWidth={3}
                                />
                              )}
                            </Box>
                            <Text
                              fontSize="12.5px"
                              color={colors.text}
                              truncate
                              flex={1}
                            >
                              {s.title ?? s.file}
                            </Text>

                            {/* View Source Code Button */}
                            <Button
                              size="xs"
                              variant="ghost"
                              p={1}
                              minW="auto"
                              h="auto"
                              borderRadius="md"
                              color={colors.subtext}
                              _hover={{
                                color: activeBlue,
                                bg: colors.rowHover,
                              }}
                              onClick={(e) => {
                                e.stopPropagation(); // Stop selection toggle
                                setViewingSpec(s);
                              }}
                              title="View specification source code"
                            >
                              <Eye size={13} />
                            </Button>

                            <OutcomeTag outcome={s.sourceOutcome} />
                          </Flex>
                        );
                      })}
                    </VStack>
                  </>
                )}
              </Section>
            )}
          </VStack>

          {/* Right panel: deploy config or code viewer */}
          <Box flex={1} h="full" overflowY="auto" pl={{ xl: 1 }} minH={0}>
            {viewingSpec ? (
              /* Code Viewer Workspace */
              <Box
                bg={colors.cardBg}
                border="1px solid"
                borderColor={colors.border}
                borderRadius="xl"
                overflow="hidden"
                shadow="sm"
                h="100%"
              >
                <Flex direction="column" h="100%" minH={0}>
                  {/* Code Viewer Header */}
                  <Box
                    bg={colors.subBg}
                    borderBottom="1px solid"
                    borderColor={colors.border}
                    p={3.5}
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    flexShrink={0}
                  >
                    <VStack align="start" gap={0.5}>
                      <Text
                        fontSize="10px"
                        fontWeight="bold"
                        color={colors.subtext}
                        textTransform="uppercase"
                        letterSpacing="0.05em"
                      >
                        SPECIFICATION SOURCE CODE VIEW
                      </Text>
                      <Text
                        fontSize="13px"
                        fontWeight="bold"
                        color={colors.text}
                        truncate
                        maxW="320px"
                      >
                        {viewingSpec.title ?? viewingSpec.file}
                      </Text>
                    </VStack>
                    <HStack gap={2}>
                      <Button
                        size="xs"
                        variant="outline"
                        borderRadius="lg"
                        borderColor={colors.border}
                        color={colors.text}
                        _hover={{ borderColor: activeBlue, color: activeBlue }}
                        onClick={() => toggle(viewingSpec.file)}
                        fontSize="10px"
                      >
                        {selected.has(viewingSpec.file)
                          ? "ALLOCATED (REMOVE)"
                          : "NOT ALLOCATED (ADD)"}
                      </Button>
                      <Button
                        size="xs"
                        variant="solid"
                        bg={activeBlue}
                        color="white"
                        borderRadius="lg"
                        _hover={{ bg: hoverBlue }}
                        onClick={() => setViewingSpec(null)}
                        fontSize="10px"
                      >
                        CLOSE VIEWER
                      </Button>
                    </HStack>
                  </Box>

                  {/* Path info */}
                  <Box
                    p={3}
                    borderBottom="1px solid"
                    borderColor={colors.border}
                    bg={colors.bg}
                    flexShrink={0}
                  >
                    <Text fontSize="11px" color={colors.subtext}>
                      PATH: {viewingSpec.file}
                    </Text>
                  </Box>

                  {/* Code Box */}
                  <Box
                    p={4}
                    flex={1}
                    display="flex"
                    flexDirection="column"
                    minH={0}
                  >
                    <Box
                      bg="#0B0E12"
                      border="1px solid"
                      borderColor={theme === "dark" ? "#2E3A47" : "#333333"}
                      p={4}
                      flex={1}
                      overflowY="auto"
                      borderRadius="lg"
                      css={{
                        "&::-webkit-scrollbar": { width: "8px", height: "8px" },
                        "&::-webkit-scrollbar-track": { background: "#0B0E12" },
                        "&::-webkit-scrollbar-thumb": {
                          background: theme === "dark" ? "#2E3A47" : "#333333",
                          borderRadius: "4px",
                        },
                        "&::-webkit-scrollbar-thumb:hover": {
                          background: theme === "dark" ? "#415263" : "#555555",
                        },
                      }}
                    >
                      {highlightTypeScript(viewingSpec.code || "")}
                    </Box>
                  </Box>
                </Flex>
              </Box>
            ) : sourceApp && selected.size > 0 ? (
              /* Config forms */
              <VStack align="stretch" gap={4}>
                <Section
                  title="03 / Destination Cloud Deployment & Security"
                  colors={colors}
                  bodyBg={colors.subBg}
                >
                  <VStack align="stretch" gap={4}>
                    {envs.length > 0 && (
                      <Box>
                        <Text
                          fontSize="11px"
                          fontWeight="bold"
                          color={colors.subtext}
                          mb={2}
                          textTransform="uppercase"
                        >
                          Stored Profiles
                        </Text>
                        <HStack gap={2} flexWrap="wrap">
                          {envs.map((env) => (
                            <Button
                              key={env.id}
                              size="xs"
                              variant="outline"
                              borderRadius="lg"
                              borderColor={colors.border}
                              color={colors.text}
                              bg="transparent"
                              fontSize="10px"
                              _hover={{
                                borderColor: activeBlue,
                                color: activeBlue,
                              }}
                              onClick={() => applyEnv(env)}
                            >
                              {env.label.toUpperCase()}
                            </Button>
                          ))}
                        </HStack>
                      </Box>
                    )}
                    <HStack
                      gap={3}
                      align="start"
                      flexDir={{ base: "column", md: "row" }}
                      w="full"
                    >
                      <Field
                        label="TARGET DEPLOYMENT URL (NEW ENVIRONMENT)"
                        colors={colors}
                      >
                        <Box position="relative" w="full">
                          <Input
                            value={targetUrl}
                            onChange={(e) => {
                              setTargetUrl(e.target.value);
                              setShowUrlSuggestions(true);
                            }}
                            onFocus={() => setShowUrlSuggestions(true)}
                            onBlur={() => setShowUrlSuggestions(false)}
                            placeholder="https://my-app.cfapps.hana.ondemand.com"
                            size="sm"
                            borderRadius="lg"
                            borderColor={colors.border}
                            bg={colors.cardBg}
                            autoComplete="off"
                            _hover={{ borderColor: colors.text }}
                            _focus={{
                              borderColor: activeBlue,
                              boxShadow: `0 0 0 1px ${activeBlue}`,
                            }}
                          />
                          {showUrlSuggestions && urlSuggestions.length > 0 && (
                            <VStack
                              align="stretch"
                              gap={0}
                              position="absolute"
                              top="calc(100% + 4px)"
                              left={0}
                              right={0}
                              zIndex={20}
                              maxH="220px"
                              overflowY="auto"
                              bg={colors.cardBg}
                              border="1px solid"
                              borderColor={colors.border}
                              borderRadius="lg"
                              shadow="lg"
                            >
                              <Text
                                fontSize="9.5px"
                                fontWeight="bold"
                                color={colors.subtext}
                                textTransform="uppercase"
                                letterSpacing="0.04em"
                                px={3}
                                py={2}
                                borderBottom="1px solid"
                                borderColor={colors.border}
                              >
                                Existing Target URLs
                              </Text>
                              {urlSuggestions.map((url) => (
                                <Box
                                  key={url}
                                  px={3}
                                  py={2}
                                  cursor="pointer"
                                  borderBottom="1px solid"
                                  borderBottomColor={colors.border}
                                  _last={{ borderBottom: "none" }}
                                  _hover={{ bg: colors.rowHover }}
                                  // mousedown fires before the input blur, so the
                                  // selection lands before the dropdown closes.
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setTargetUrl(url);
                                    setShowUrlSuggestions(false);
                                  }}
                                >
                                  <Text
                                    fontSize="12px"
                                    color={colors.text}
                                    wordBreak="break-all"
                                  >
                                    {url}
                                  </Text>
                                </Box>
                              ))}
                            </VStack>
                          )}
                        </Box>
                      </Field>
                      <Box w={{ base: "full", md: "200px" }} flexShrink={0}>
                        <Field label="PATH PREFIX" colors={colors}>
                          <Input
                            value={pathPrefix}
                            onChange={(e) => setPathPrefix(e.target.value)}
                            placeholder="/myapp"
                            size="sm"
                            borderRadius="lg"
                            borderColor={colors.border}
                            bg={colors.cardBg}
                            _hover={{ borderColor: colors.text }}
                            _focus={{
                              borderColor: activeBlue,
                              boxShadow: `0 0 0 1px ${activeBlue}`,
                            }}
                          />
                        </Field>
                      </Box>
                    </HStack>

                    <HStack
                      gap={3}
                      align="start"
                      flexDir={{ base: "column", md: "row" }}
                      w="full"
                    >
                      <Field
                        label="SECURITY CREDENTIAL: USERNAME"
                        colors={colors}
                      >
                        <Input
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          size="sm"
                          borderRadius="lg"
                          borderColor={colors.border}
                          bg={colors.cardBg}
                          _hover={{ borderColor: colors.text }}
                          _focus={{
                            borderColor: activeBlue,
                            boxShadow: `0 0 0 1px ${activeBlue}`,
                          }}
                          autoComplete="off"
                        />
                      </Field>
                      <Field
                        label="SECURITY CREDENTIAL: PASSWORD"
                        colors={colors}
                      >
                        <Input
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          type="password"
                          size="sm"
                          borderRadius="lg"
                          borderColor={colors.border}
                          bg={colors.cardBg}
                          _hover={{ borderColor: colors.text }}
                          _focus={{
                            borderColor: activeBlue,
                            boxShadow: `0 0 0 1px ${activeBlue}`,
                          }}
                          autoComplete="new-password"
                        />
                      </Field>
                    </HStack>

                    <HStack
                      gap={3}
                      align="start"
                      flexDir={{ base: "column", md: "row" }}
                      w="full"
                    >
                      <Field label="IDENTITY PROVIDER (IDP)" colors={colors}>
                        <Input
                          value={idp}
                          onChange={(e) => setIdp(e.target.value)}
                          placeholder="e.g. corporate SSO IdP"
                          size="sm"
                          borderRadius="lg"
                          borderColor={colors.border}
                          bg={colors.cardBg}
                          _hover={{ borderColor: colors.text }}
                          _focus={{
                            borderColor: activeBlue,
                            boxShadow: `0 0 0 1px ${activeBlue}`,
                          }}
                        />
                      </Field>
                      <Field
                        label="EXTERNAL AUTHENTICATION URL"
                        colors={colors}
                      >
                        <Input
                          value={loginUrl}
                          onChange={(e) => setLoginUrl(e.target.value)}
                          placeholder="SSO portal login endpoint"
                          size="sm"
                          borderRadius="lg"
                          borderColor={colors.border}
                          bg={colors.cardBg}
                          _hover={{ borderColor: colors.text }}
                          _focus={{
                            borderColor: activeBlue,
                            boxShadow: `0 0 0 1px ${activeBlue}`,
                          }}
                        />
                      </Field>
                    </HStack>

                    <Flex
                      align="start"
                      gap={3}
                      cursor="pointer"
                      onClick={() => setHeal((v) => !v)}
                      p={2.5}
                      border="1px solid"
                      borderColor={heal ? activeBlue : colors.border}
                      bg={
                        heal
                          ? theme === "dark"
                            ? "rgba(0, 120, 212, 0.04)"
                            : "rgba(0, 90, 156, 0.02)"
                          : "transparent"
                      }
                      borderRadius="lg"
                    >
                      <Box
                        w="14px"
                        h="14px"
                        mt="2px"
                        borderRadius="md"
                        border="1.5px solid"
                        borderColor={heal ? activeBlue : colors.border}
                        bg={heal ? activeBlue : "transparent"}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        flexShrink={0}
                      >
                        {heal && (
                          <Check size={10} color="white" strokeWidth={3} />
                        )}
                      </Box>
                      <Box>
                        <Text
                          fontSize="12.5px"
                          fontWeight="bold"
                          color={colors.text}
                          textTransform="uppercase"
                          letterSpacing="0.02em"
                        >
                          Enable Auto-Heal (AI Evolver Engine)
                        </Text>
                        <Text fontSize="11px" color={colors.subtext} mt={0.5}>
                          Instructs the recovery compiler to adapt tests for
                          selector/layout drift on target. Amends specifications
                          to healed state for verification.
                        </Text>
                      </Box>
                    </Flex>

                    <Flex
                      gap={3}
                      align="end"
                      pt={4}
                      borderTop="1px solid"
                      borderColor={colors.border}
                      flexDir={{ base: "column", md: "row" }}
                      w="full"
                    >
                      <Field
                        label="SAVE CONFIGURATION PROFILE AS"
                        colors={colors}
                      >
                        <Input
                          value={envLabel}
                          onChange={(e) => setEnvLabel(e.target.value)}
                          placeholder="e.g. BTP Staging Profile"
                          size="sm"
                          borderRadius="lg"
                          borderColor={colors.border}
                          bg={colors.cardBg}
                          _hover={{ borderColor: colors.text }}
                          _focus={{
                            borderColor: activeBlue,
                            boxShadow: `0 0 0 1px ${activeBlue}`,
                          }}
                        />
                      </Field>
                      <Button
                        size="sm"
                        variant="outline"
                        borderRadius="lg"
                        h="32px"
                        borderColor={colors.border}
                        color={colors.text}
                        fontWeight="bold"
                        textTransform="uppercase"
                        _hover={{ borderColor: activeBlue, color: activeBlue }}
                        onClick={saveEnv}
                        disabled={!envLabel.trim() || !targetUrl.trim()}
                        px={4}
                      >
                        Save Profile
                      </Button>
                    </Flex>
                  </VStack>
                </Section>

                <Flex justify="flex-end" pt={1}>
                  <Button
                    onClick={() => run()}
                    disabled={!canRun}
                    bg={activeBlue}
                    color="white"
                    borderRadius="lg"
                    textTransform="uppercase"
                    fontWeight="bold"
                    fontSize="12.5px"
                    letterSpacing="0.05em"
                    _hover={{ bg: hoverBlue }}
                    _disabled={{
                      bg: colors.border,
                      color: colors.subtext,
                      opacity: 0.6,
                      cursor: "not-allowed",
                    }}
                    px={6}
                    py={5}
                    shadow="sm"
                  >
                    <HStack gap={2}>
                      <Text>Execute check</Text>
                      <ArrowRight size={14} />
                    </HStack>
                  </Button>
                </Flex>
              </VStack>
            ) : (
              <Box
                h="100%"
                minH="360px"
                border="2px dashed"
                borderColor={colors.border}
                display="flex"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                p={8}
                textAlign="center"
                borderRadius="xl"
              >
                <GitCompare
                  size={36}
                  color={colors.subtext}
                  strokeWidth={1.5}
                />
                <Text
                  mt={4}
                  fontSize="13px"
                  fontWeight="bold"
                  color={colors.text}
                  textTransform="uppercase"
                  letterSpacing="0.05em"
                >
                  Awaiting Workspace Inputs
                </Text>
                <Text
                  mt={2}
                  fontSize="11px"
                  color={colors.subtext}
                  maxW="320px"
                >
                  Please select a source application suite and allocate test
                  specifications in the left configuration workspace to
                  initialize destination deployment settings.
                </Text>
              </Box>
            )}
          </Box>
        </Flex>
      )}

      {/* Running Phase Widescreen Layout */}
      {phase === "running" && (
        <Flex
          gap={5}
          flex={1}
          w="full"
          direction={{ base: "column", xl: "row" }}
          minH={0}
        >
          {/* Left column: queued specs list (read-only) */}
          <VStack
            align="stretch"
            gap={4}
            w={{ base: "full", xl: "380px" }}
            flexShrink={0}
            h="full"
            overflowY="auto"
            pr={{ xl: 1 }}
          >
            <Section title="Active Verification Target" colors={colors}>
              <VStack
                align="start"
                gap={2}
                mb={4}
                p={2.5}
                bg={colors.subBg}
                border="1px solid"
                borderColor={colors.border}
                borderRadius="lg"
              >
                <Text
                  fontSize="10.5px"
                  fontWeight="bold"
                  color={colors.subtext}
                >
                  TARGET CLOUD HOST
                </Text>
                <Text
                  fontSize="12.5px"
                  fontWeight="bold"
                  color={colors.text}
                  wordBreak="break-all"
                >
                  {targetUrl}
                </Text>
              </VStack>
              <Text
                fontSize="11px"
                fontWeight="bold"
                color={colors.subtext}
                mb={2}
                textTransform="uppercase"
              >
                Queued specifications ({selected.size})
              </Text>
              <VStack
                align="stretch"
                gap={1}
                border="1px solid"
                borderColor={colors.border}
                p={1}
                bg={colors.bg}
                maxH="350px"
                overflowY="auto"
                borderRadius="lg"
              >
                {[...selected].map((file) => (
                  <Flex
                    key={file}
                    align="center"
                    gap={2.5}
                    px={3}
                    py={2}
                    borderBottom="1px solid"
                    borderBottomColor={colors.border}
                    _last={{ borderBottom: "none" }}
                  >
                    <Box
                      w="6px"
                      h="6px"
                      bg={activeBlue}
                      flexShrink={0}
                      borderRadius="full"
                    />
                    <Text
                      fontSize="11.5px"
                      color={colors.text}
                      truncate
                      flex={1}
                    >
                      {file}
                    </Text>
                  </Flex>
                ))}
              </VStack>
            </Section>
          </VStack>

          {/* Right column: live monitoring checklist + console logs */}
          <Box
            flex={1}
            h="full"
            overflowY="auto"
            pl={{ xl: 1 }}
            bg={colors.cardBg}
            border="1px solid"
            borderColor={colors.border}
            p={5}
            shadow="sm"
            minH={0}
            borderRadius="xl"
          >
            <MigrationProgress
              events={runStatus?.events ?? []}
              heal={heal}
              colors={colors}
              activeBlue={activeBlue}
              theme={theme}
            />
            <Flex justify="flex-end" mt={5}>
              <Button
                size="sm"
                onClick={stopRun}
                disabled={!runId || stopping}
                bg="transparent"
                color="#FF4040"
                border="1px solid"
                borderColor="#FF404066"
                borderRadius="lg"
                _hover={{ bg: "#FF404012", borderColor: "#FF4040" }}
                _disabled={{ opacity: 0.5, cursor: "not-allowed" }}
              >
                <HStack gap={1.5}>
                  {stopping && <Spinner size="xs" />}
                  <Text>{stopping ? "Stopping…" : "Stop run"}</Text>
                </HStack>
              </Button>
            </Flex>
          </Box>
        </Flex>
      )}
    </Flex>
  );
}

function Section({
  title,
  colors,
  children,
  bodyBg,
}: {
  title: string;
  colors: ReturnType<typeof getHPEColors>;
  children: React.ReactNode;
  /** Optional subtle fill for the section body (defaults to the card surface). */
  bodyBg?: string;
}) {
  return (
    <Box
      bg={colors.cardBg}
      border="1px solid"
      borderColor={colors.border}
      borderRadius="xl"
      shadow="sm"
      overflow="hidden"
    >
      <Box
        bg={colors.subBg}
        borderBottom="1px solid"
        borderColor={colors.border}
        px={4}
        py={2.5}
        display="flex"
        alignItems="center"
        gap={2.5}
      >
        <Text
          fontSize="11.5px"
          fontWeight="bold"
          letterSpacing="0.05em"
          textTransform="uppercase"
          color={colors.text}
        >
          {title}
        </Text>
      </Box>
      <Box p={4} bg={bodyBg ?? colors.cardBg}>
        {children}
      </Box>
    </Box>
  );
}

function RerunModal({
  specCount,
  heal,
  edited,
  sourceUrl,
  targetUrl,
  colors,
  activeBlue,
  username,
  setUsername,
  password,
  setPassword,
  idp,
  setIdp,
  loginUrl,
  setLoginUrl,
  onCancel,
  onConfirm,
}: {
  specCount: number;
  heal: boolean;
  edited?: boolean;
  sourceUrl: string;
  targetUrl: string;
  colors: any;
  activeBlue: string;
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  idp: string;
  setIdp: (v: string) => void;
  loginUrl: string;
  setLoginUrl: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const inputProps = {
    size: "sm" as const,
    borderRadius: "lg",
    borderColor: colors.border,
    bg: colors.cardBg,
    _hover: { borderColor: colors.text },
    _focus: {
      borderColor: activeBlue,
      boxShadow: `0 0 0 1px ${activeBlue}`,
    },
  };
  return (
    <Box
      position="fixed"
      inset={0}
      zIndex={2000}
      bg="rgba(0,0,0,0.6)"
      display="flex"
      alignItems="center"
      justifyContent="center"
      p={4}
      onClick={onCancel}
    >
      <Box
        onClick={(e) => e.stopPropagation()}
        bg={colors.cardBg}
        border="1px solid"
        borderColor={colors.border}
        borderRadius="xl"
        shadow="2xl"
        w="full"
        maxW="460px"
        p={5}
        maxH="90vh"
        overflowY="auto"
      >
        <Text
          fontSize="13px"
          fontWeight="bold"
          color={colors.text}
          letterSpacing="0.04em"
        >
          RE-RUN {specCount} TEST{specCount > 1 ? "S" : ""}
          {edited ? " · EDITED CODE" : heal ? " · WITH EVOLVER" : ""}
        </Text>
        <Text fontSize="11px" color={colors.subtext} mt={1}>
          {sourceUrl}
        </Text>
        <Text fontSize="11px" color={activeBlue} mb={3}>
          ↳ {targetUrl}
        </Text>
        <Text fontSize="10.5px" color={colors.subtext} mb={3} lineHeight="1.5">
          Credentials aren’t saved with results — confirm or re-enter them to
          re-run. Leave blank for a target with no login.
          {heal
            ? " The Evolver will attempt to repair the selected specs before re-running."
            : ""}
        </Text>
        <VStack align="stretch" gap={3}>
          <HStack gap={3} align="start" flexDir={{ base: "column", md: "row" }}>
            <Field label="USERNAME" colors={colors}>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                {...inputProps}
              />
            </Field>
            <Field label="PASSWORD" colors={colors}>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                {...inputProps}
              />
            </Field>
          </HStack>
          <HStack gap={3} align="start" flexDir={{ base: "column", md: "row" }}>
            <Field label="IDENTITY PROVIDER (OPTIONAL)" colors={colors}>
              <Input
                value={idp}
                onChange={(e) => setIdp(e.target.value)}
                {...inputProps}
              />
            </Field>
            <Field label="LOGIN URL (OPTIONAL)" colors={colors}>
              <Input
                value={loginUrl}
                onChange={(e) => setLoginUrl(e.target.value)}
                {...inputProps}
              />
            </Field>
          </HStack>
        </VStack>
        <HStack gap={2} mt={5} justify="flex-end">
          <Button
            size="sm"
            variant="ghost"
            color={colors.subtext}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            bg={activeBlue}
            color="white"
            _hover={{ opacity: 0.9 }}
            onClick={onConfirm}
          >
            {heal ? "Heal & re-run" : "Re-run"}
          </Button>
        </HStack>
      </Box>
    </Box>
  );
}

function Field({
  label,
  colors,
  children,
}: {
  label: string;
  colors: any;
  children: React.ReactNode;
}) {
  return (
    <Box flex={1} w="full">
      <Text
        fontSize="11px"
        fontWeight="bold"
        color={colors.subtext}
        mb={1.5}
        letterSpacing="0.02em"
        textTransform="uppercase"
      >
        {label}
      </Text>
      {children}
    </Box>
  );
}

function OutcomeTag({ outcome }: { outcome: SourceSpec["sourceOutcome"] }) {
  const { theme } = useThemeMode();
  const activeBlue =
    theme === "dark" ? HPE_COLORS.blue.darkAccent : HPE_COLORS.blue.main;
  const tone =
    outcome === "passed" || outcome === "healed"
      ? activeBlue // Azure Navy Blue
      : outcome === "failed"
        ? "#FF4040" // HPE Brand Danger Red
        : "#FFAA15"; // HPE Brand Warning Orange
  return (
    <Box
      bg={`${tone}12`}
      color={tone}
      border="1px solid"
      borderColor={`${tone}25`}
      fontSize="10px"
      fontWeight="bold"
      borderRadius="md"
      px={1.5}
      py={0.5}
      flexShrink={0}
      textTransform="uppercase"
    >
      {outcome}
    </Box>
  );
}

function statusTone(
  status: MigrationHistoryItem["status"],
  activeBlue: string,
): string {
  switch (status) {
    case "completed":
      return activeBlue;
    case "running":
      return "#FFAA15";
    case "failed":
      return "#FF4040";
    default:
      return "#8A9BA8"; // cancelled
  }
}

function MigrationHistory({
  history,
  loading,
  busyId,
  viewingId,
  onRefresh,
  onClose,
  onView,
  onRemove,
  colors,
  activeBlue,
  hoverBlue,
  theme,
}: {
  history: MigrationHistoryItem[];
  loading: boolean;
  busyId: string | null;
  viewingId: string | null;
  onRefresh: () => void;
  onClose: () => void;
  onView: (id: string) => void;
  onRemove: (id: string) => void;
  colors: ReturnType<typeof getHPEColors>;
  activeBlue: string;
  hoverBlue: string;
  theme: "light" | "dark";
}) {
  // Which row is awaiting delete confirmation (two-click guard).
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <VStack align="stretch" gap={4} w="full" h="full">
      {/* Header */}
      <Flex
        align="center"
        justify="space-between"
        borderBottom="2px solid"
        borderColor={colors.border}
        pb={3}
        flexShrink={0}
      >
        <Heading size="md" color={colors.text}>
          <Text textTransform="uppercase" letterSpacing="0.05em">
            Saved Migration Checks
          </Text>
        </Heading>
        <HStack gap={2}>
          <Button
            size="sm"
            variant="outline"
            borderRadius="lg"
            borderColor={colors.border}
            color={colors.text}
            bg="transparent"
            _hover={{ borderColor: activeBlue, color: activeBlue }}
            onClick={onRefresh}
          >
            <HStack gap={1.5}>
              <RefreshCw size={12} />
              <Text fontSize="11px" fontWeight="bold" textTransform="uppercase">
                Refresh
              </Text>
            </HStack>
          </Button>
          <Button
            size="sm"
            variant="solid"
            bg={activeBlue}
            color="white"
            borderRadius="lg"
            _hover={{ bg: hoverBlue }}
            onClick={onClose}
          >
            <Text fontSize="11px" fontWeight="bold" textTransform="uppercase">
              Back to console
            </Text>
          </Button>
        </HStack>
      </Flex>

      {/* Body */}
      <Box flex={1} overflowY="auto" pr={1} minH={0}>
        {loading ? (
          <Flex align="center" gap={2} py={6}>
            <Spinner size="sm" color={activeBlue} />
            <Text fontSize="12px" color={colors.subtext}>
              Loading saved checks…
            </Text>
          </Flex>
        ) : history.length === 0 ? (
          <Box
            h="100%"
            minH="320px"
            border="2px dashed"
            borderColor={colors.border}
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            p={8}
            textAlign="center"
            borderRadius="xl"
          >
            <History size={34} color={colors.subtext} strokeWidth={1.5} />
            <Text
              mt={4}
              fontSize="13px"
              fontWeight="bold"
              color={colors.text}
              textTransform="uppercase"
              letterSpacing="0.05em"
            >
              No Saved Checks Yet
            </Text>
            <Text mt={2} fontSize="11px" color={colors.subtext} maxW="340px">
              Migration checks you run are saved automatically and will appear
              here, even after you close and reopen the app.
            </Text>
          </Box>
        ) : (
          <VStack align="stretch" gap={2.5}>
            {history.map((h) => {
              const tone = statusTone(h.status, activeBlue);
              const busy = busyId === h.id;
              const canView = h.status === "completed" && h.hasReport !== false;
              const regressions = h.summary?.behavioral ?? 0;
              return (
                <Box
                  key={h.id}
                  bg={colors.cardBg}
                  border="1px solid"
                  borderColor={viewingId === h.id ? activeBlue : colors.border}
                  borderRadius="xl"
                  shadow="sm"
                  p={4}
                >
                  <Flex
                    align={{ base: "stretch", md: "center" }}
                    justify="space-between"
                    gap={4}
                    direction={{ base: "column", md: "row" }}
                  >
                    {/* Left: route + meta */}
                    <VStack align="start" gap={2} flex={1} minW={0}>
                      <HStack gap={2} flexWrap="wrap">
                        <Box
                          bg={`${tone}12`}
                          color={tone}
                          border="1px solid"
                          borderColor={`${tone}25`}
                          fontSize="10px"
                          fontWeight="bold"
                          borderRadius="md"
                          px={1.5}
                          py={0.5}
                          textTransform="uppercase"
                        >
                          {h.status}
                        </Box>
                        {h.status === "completed" && (
                          <Box
                            bg={
                              regressions > 0 ? "#FF404012" : `${activeBlue}12`
                            }
                            color={regressions > 0 ? "#FF4040" : activeBlue}
                            border="1px solid"
                            borderColor={
                              regressions > 0 ? "#FF404025" : `${activeBlue}25`
                            }
                            fontSize="10px"
                            fontWeight="bold"
                            borderRadius="md"
                            px={1.5}
                            py={0.5}
                            textTransform="uppercase"
                          >
                            {regressions > 0
                              ? `${regressions} REGRESSION${regressions > 1 ? "S" : ""}`
                              : "NO REGRESSIONS"}
                          </Box>
                        )}
                        {(h.summary?.healed ?? 0) > 0 && (
                          <Box
                            bg={`${activeBlue}12`}
                            color={activeBlue}
                            border="1px solid"
                            borderColor={`${activeBlue}25`}
                            fontSize="10px"
                            fontWeight="bold"
                            borderRadius="md"
                            px={1.5}
                            py={0.5}
                            textTransform="uppercase"
                          >
                            {h.summary?.healed} HEALED
                          </Box>
                        )}
                      </HStack>
                      <HStack
                        gap={2}
                        w="full"
                        color={colors.text}
                        fontSize="12.5px"
                        fontWeight="bold"
                      >
                        <Text truncate maxW="40%" title={h.sourceUrl}>
                          {h.sourceUrl}
                        </Text>
                        <Box color={colors.subtext} flexShrink={0}>
                          <ArrowRight size={13} />
                        </Box>
                        <Text truncate maxW="40%" title={h.targetUrl}>
                          {h.targetUrl}
                        </Text>
                      </HStack>
                      <HStack
                        gap={1.5}
                        color={colors.subtext}
                        fontSize="10.5px"
                      >
                        <Clock size={11} />
                        <Text>
                          {new Date(h.startedAt).toLocaleString()}
                          {h.summary
                            ? ` · ${h.summary.total} SPEC${h.summary.total === 1 ? "" : "S"}`
                            : ""}
                        </Text>
                      </HStack>
                    </VStack>

                    {/* Right: actions */}
                    <HStack gap={2} flexShrink={0}>
                      <Button
                        size="xs"
                        variant="outline"
                        borderRadius="lg"
                        borderColor={colors.border}
                        color={colors.text}
                        bg="transparent"
                        _hover={{ borderColor: activeBlue, color: activeBlue }}
                        _disabled={{
                          opacity: 0.4,
                          cursor: "not-allowed",
                        }}
                        disabled={!canView || busy}
                        onClick={() => onView(h.id)}
                        title={
                          canView
                            ? "Load this saved result"
                            : "No report available for this check"
                        }
                      >
                        <HStack gap={1.5}>
                          {busy ? <Spinner size="xs" /> : <Eye size={12} />}
                          <Text
                            fontSize="10px"
                            fontWeight="bold"
                            textTransform="uppercase"
                          >
                            View
                          </Text>
                        </HStack>
                      </Button>
                      {confirmId === h.id ? (
                        <>
                          <Button
                            size="xs"
                            variant="solid"
                            bg="#FF4040"
                            color="white"
                            borderRadius="lg"
                            _hover={{ bg: "#d63333" }}
                            disabled={busy}
                            onClick={() => {
                              setConfirmId(null);
                              onRemove(h.id);
                            }}
                          >
                            <Text
                              fontSize="10px"
                              fontWeight="bold"
                              textTransform="uppercase"
                            >
                              Confirm
                            </Text>
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            borderRadius="lg"
                            borderColor={colors.border}
                            color={colors.text}
                            bg="transparent"
                            _hover={{ borderColor: colors.text }}
                            onClick={() => setConfirmId(null)}
                          >
                            <Text
                              fontSize="10px"
                              fontWeight="bold"
                              textTransform="uppercase"
                            >
                              Cancel
                            </Text>
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="xs"
                          variant="outline"
                          borderRadius="lg"
                          borderColor="#FF404055"
                          color="#FF4040"
                          bg="transparent"
                          _hover={{
                            bg: "rgba(255,64,64,0.12)",
                            borderColor: "#FF4040",
                          }}
                          _disabled={{ opacity: 0.4, cursor: "not-allowed" }}
                          disabled={busy}
                          onClick={() => setConfirmId(h.id)}
                          title="Remove this saved result"
                        >
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </HStack>
                  </Flex>
                </Box>
              );
            })}
          </VStack>
        )}
      </Box>
    </VStack>
  );
}

function MigrationProgress({
  events,
  heal,
  colors,
  activeBlue,
  theme,
}: {
  events: MigrationEvent[];
  heal: boolean;
  colors: ReturnType<typeof getHPEColors>;
  activeBlue: string;
  theme: "light" | "dark";
}) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [events.length]);

  const steps: { key: MigrationStep; label: string }[] = [
    { key: "resolve", label: "RESOLVING SOURCE SUITE SPECIFICATIONS" },
    { key: "prepare", label: "PREPARING BINDINGS & REWRITING TARGET URLS" },
    ...(heal
      ? [
          {
            key: "heal" as MigrationStep,
            label: "AI AUTOMATED AUTO-HEAL SEQUENCE",
          },
        ]
      : []),
    { key: "run", label: "EXECUTING INTEGRATION SPECS ON DESTINATION CLOUD" },
    {
      key: "fingerprint",
      label: "VERIFYING SOURCE & TARGET BUILD CONSISTENCY",
    },
    { key: "report", label: "COMPILING ENTERPRISE DIAGNOSTIC REPORT" },
    { key: "done", label: "VALIDATION SEQUENCE COMPLETED" },
  ];
  const order = steps.map((s) => s.key);

  const errored = events.some((e) => e.step === "error");
  const stepEvents = events.filter((e) => e.step !== "error");
  const currentKey = stepEvents.length
    ? stepEvents[stepEvents.length - 1].step
    : "resolve";
  const currentIndex = Math.max(0, order.indexOf(currentKey));
  const done = currentKey === "done";
  const pct = Math.round((currentIndex / (order.length - 1)) * 100);
  const barTone = errored ? "#FF4040" : activeBlue;

  return (
    <Flex direction="column" gap={4} h="100%">
      {/* Progress bar */}
      <Box flexShrink={0}>
        <Flex justify="space-between" mb={1.5} align="center">
          <Text
            fontSize="12px"
            fontWeight="bold"
            color={colors.text}
            textTransform="uppercase"
          >
            {errored
              ? "STATUS: RUN ENGINE FAILURE"
              : done
                ? "STATUS: SUCCESS"
                : `STATUS: VAL-SEQUENCE ACTIVE (CURRENT PHASE: ${currentKey.toUpperCase()})`}
          </Text>
          <Text fontSize="11px" color={colors.subtext}>
            {pct}% COMPLETED
          </Text>
        </Flex>
        <Box
          bg={colors.subBg}
          borderRadius="full"
          h="12px"
          border="1px solid"
          borderColor={colors.border}
          overflow="hidden"
          p="2px"
        >
          <Box
            bg={barTone}
            h="full"
            borderRadius="full"
            width={`${errored ? 100 : pct}%`}
            transition="width 0.4s ease"
          />
        </Box>
      </Box>

      {/* Step checklist */}
      <VStack
        align="stretch"
        gap={2}
        p={3.5}
        bg={colors.subBg}
        border="1px solid"
        borderColor={colors.border}
        flexShrink={0}
        borderRadius="lg"
      >
        {steps.map((s, i) => {
          const isDone = i < currentIndex || (done && i === currentIndex);
          const isActive = i === currentIndex && !done && !errored;
          const isErr = errored && i === currentIndex;
          return (
            <HStack key={s.key} gap={3}>
              <Box
                w="16px"
                h="16px"
                flexShrink={0}
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                {isErr ? (
                  <TriangleAlert size={13} color="#FF4040" />
                ) : isDone ? (
                  <Check size={13} color={activeBlue} strokeWidth={3} />
                ) : isActive ? (
                  <Spinner size="xs" color={activeBlue} />
                ) : (
                  <Box w="4px" h="4px" bg={colors.border} borderRadius="full" />
                )}
              </Box>
              <Text
                fontSize="11px"
                color={
                  isDone || isActive || isErr ? colors.text : colors.subtext
                }
                fontWeight={isActive ? "bold" : "normal"}
              >
                {s.label}
              </Text>
            </HStack>
          );
        })}
      </VStack>

      {/* Live log */}
      {events.length > 0 && (
        <Box
          ref={logRef}
          bg="#0B0E12" // Solid terminal dark background
          border="1px solid"
          borderColor={theme === "dark" ? "#2E3A47" : "#333333"}
          borderRadius="lg"
          p={3.5}
          flex={1}
          overflowY="auto"
          fontFamily="mono"
          minH="120px"
        >
          {events.map((e, i) => (
            <Flex
              key={i}
              gap={4}
              fontSize="11px"
              lineHeight="1.5"
              borderBottom="1px solid rgba(255,255,255,0.02)"
              py={0.5}
            >
              <Text color={activeBlue} flexShrink={0}>
                [{new Date(e.at).toLocaleTimeString()}]
              </Text>
              <Text
                color={e.step === "error" ? "#FF4040" : "#F3F4F6"}
                flex={1}
                whiteSpace="pre-wrap"
              >
                {e.message}
              </Text>
            </Flex>
          ))}
        </Box>
      )}
    </Flex>
  );
}

export function highlightTypeScript(code: string) {
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
        fontSize="11.5px"
      >
        <Text
          w="30px"
          minW="30px"
          color="#8A9BA8"
          textAlign="right"
          pr={2.5}
          userSelect="none"
          borderRight="1px solid"
          borderColor="#2E3A47"
          mr={3}
        >
          {idx + 1}
        </Text>
        <Box
          flex={1}
          whiteSpace="pre-wrap"
          wordBreak="break-all"
          color="#F3F4F6"
          dangerouslySetInnerHTML={{ __html: html || " " }}
        />
      </Flex>
    );
  });
}
