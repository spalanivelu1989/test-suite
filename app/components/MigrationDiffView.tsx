"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Badge,
  Button,
  Spinner,
} from "@chakra-ui/react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  MinusCircle,
  ShieldCheck,
  ShieldAlert,
  Wrench,
  ArrowRight,
  Check,
  Play,
  Sparkles,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { useThemeMode } from "@/app/providers";
import {
  getHPEColors,
  HPE_COLORS,
  highlightTypeScript,
  MigrationLog,
} from "./MigrationCheck";
import type {
  MigrationEvent,
  MigrationReport,
  SpecClassification,
  SpecDiff,
  SourceSpec,
} from "@/src/migration/types";

interface FailureExplanation {
  summary: string;
  why: string;
  fix: string;
  source: "ai" | "heuristic";
}

// Visual treatment per classification. `behavioral` is the one that matters —
// a real regression introduced by the migration.
const GROUPS: {
  key: SpecClassification;
  label: string;
  hint: string;
  icon: React.ElementType;
  toneKey: "green" | "red" | "orange" | "blue" | "slate";
}[] = [
  {
    key: "behavioral",
    label: "REAL REGRESSIONS",
    hint: "Passed on source, fails on target — investigation required",
    icon: XCircle,
    toneKey: "red",
  },
  {
    key: "healed",
    label: "AUTO-FIXED SPECS (HEALED)",
    hint: "Test specification was updated to achieve pass on target — review diff",
    icon: Wrench,
    toneKey: "blue",
  },
  {
    key: "ok",
    label: "STILL PASSING",
    hint: "App behavior successfully preserved on target platform",
    icon: CheckCircle2,
    toneKey: "green",
  },
  {
    key: "infra",
    label: "ENVIRONMENT / NETWORKING ISSUES",
    hint: "Login or networking discrepancies — not codebase regressions",
    icon: AlertTriangle,
    toneKey: "orange",
  },
  {
    key: "flaky",
    label: "FLAKY RESULTS",
    hint: "Inconsistent behavior detected across runs — untrustworthy signal",
    icon: Activity,
    toneKey: "orange",
  },
  {
    key: "pre-existing",
    label: "PRE-EXISTING FAILURES",
    hint: "Already failing on source app — not introduced by migration",
    icon: MinusCircle,
    toneKey: "slate",
  },
];

export function MigrationDiffView({
  report,
  events = [],
  onRerun,
  onRerunEdited,
}: {
  report: MigrationReport;
  /** The run's progress/execution log, shown under the diagnostic overview. */
  events?: MigrationEvent[];
  /** Re-run a subset of failed specs. `heal` = use the Tester agent. Omitted for
   * history-loaded reports where the session's auth/source context isn't available. */
  onRerun?: (specFiles: string[], heal: boolean) => void;
  /** Re-run one spec with user-edited target code. */
  onRerunEdited?: (file: string, code: string) => void;
}) {
  const { theme } = useThemeMode();
  const colors = getHPEColors(theme);

  const [selectedSpec, setSelectedSpec] = useState<SpecDiff | null>(null);
  // Multi-select of failed specs to re-run (distinct from the single-spec detail view).
  const [rerunSel, setRerunSel] = useState<Set<string>>(new Set());
  // Target-code editor: edit mode + draft, plus saved edits keyed by spec file.
  const [editingTarget, setEditingTarget] = useState(false);
  const [draft, setDraft] = useState("");
  const [editedTarget, setEditedTarget] = useState<Record<string, string>>({});
  // Leaving a spec drops any in-progress (unsaved) edit so it can't bleed across specs.
  useEffect(() => {
    setEditingTarget(false);
  }, [selectedSpec?.file]);
  const [activeDetailsTab, setActiveDetailsTab] = useState<
    "diagnostics" | "source" | "target"
  >("diagnostics");
  const [sourceSpecs, setSourceSpecs] = useState<SourceSpec[]>([]);
  const [loadingSourceSpecs, setLoadingSourceSpecs] = useState(false);
  // Trace Viewer: which spec's trace is being probed, and which had none.
  const [traceBusy, setTraceBusy] = useState<string | null>(null);
  const [traceError, setTraceError] = useState<Record<string, boolean>>({});

  // Plain-language explanations per failing spec, fetched on demand.
  const [explanations, setExplanations] = useState<
    Record<string, FailureExplanation | "loading">
  >({});
  const requested = useRef<Set<string>>(new Set());

  // HPE Color Codes - Using Azure Navy Blue Accents
  const hpeBlueAccent = theme === "dark" ? "#0078D4" : "#005A9C";
  const hpeRed = "#FF4040";
  const hpeOrange = "#FFAA15";
  const hpeBlue = theme === "dark" ? "#008CC9" : "#00739D";
  const hpeSlate = theme === "dark" ? "#8A9BA8" : "#5F6B67";

  useEffect(() => {
    if (!report.sourceUrl) return;
    setLoadingSourceSpecs(true);
    fetch(
      `/api/migration-check/source-specs?url=${encodeURIComponent(report.sourceUrl)}&runId=${encodeURIComponent(report.sourceRunId)}`,
      { cache: "no-store" },
    )
      .then((res) => res.json())
      .then((data) => {
        setSourceSpecs(data.specs ?? []);
      })
      .catch(() => {
        setSourceSpecs([]);
      })
      .finally(() => {
        setLoadingSourceSpecs(false);
      });
  }, [report.sourceUrl, report.sourceRunId]);

  // Fetch a plain-language explanation when a failing spec is opened.
  useEffect(() => {
    const spec = selectedSpec;
    if (!spec?.failureReason) return;
    const key = spec.file;
    if (requested.current.has(key)) return;
    requested.current.add(key);
    setExplanations((p) => ({ ...p, [key]: "loading" }));

    let cancelled = false;
    (async () => {
      try {
        const codeObj =
          report.targetReport?.generatedSpecs?.find((s) => s.file === key) ||
          report.targetReport?.generatedSpecs?.find(
            (s) => s.file.endsWith(key) || key.endsWith(s.file),
          );
        const res = await fetch("/api/migration-check/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: spec.title,
            file: spec.file,
            failureReason: spec.failureReason,
            code: codeObj?.code,
            sourceOutcome: spec.sourceOutcome,
            targetOutcome: spec.targetOutcome,
            classification: spec.classification,
            buildMismatch: report.fingerprint.status === "mismatch",
            sourceUrl: report.sourceUrl,
            targetUrl: report.targetUrl,
          }),
        });
        const data = await res.json();
        if (!cancelled && data.explanation) {
          setExplanations((p) => ({ ...p, [key]: data.explanation }));
        }
      } catch {
        requested.current.delete(key);
        if (!cancelled) {
          setExplanations((p) => {
            const next = { ...p };
            delete next[key];
            return next;
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSpec?.file, report]);

  const getToneColor = (key: string) => {
    switch (key) {
      case "green":
        return hpeBlueAccent; // Replaced green with azure navy blue accent
      case "red":
        return hpeRed;
      case "orange":
        return hpeOrange;
      case "blue":
        return hpeBlue;
      default:
        return hpeSlate;
    }
  };

  const s = report.summary;
  const grouped = (key: SpecClassification) =>
    report.diff.filter((d) => d.classification === key);

  // Which classifications represent a failure the user can re-run.
  const RERUNNABLE: SpecClassification[] = [
    "behavioral",
    "infra",
    "flaky",
    "pre-existing",
  ];
  const isRerunnable = (key: SpecClassification) => RERUNNABLE.includes(key);
  const failedFiles = report.diff
    .filter((d) => isRerunnable(d.classification))
    .map((d) => d.file);
  const allFailedSelected =
    failedFiles.length > 0 && failedFiles.every((f) => rerunSel.has(f));
  const toggleRerun = (file: string) =>
    setRerunSel((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  const doRerun = (heal: boolean) => {
    if (onRerun && rerunSel.size > 0) onRerun([...rerunSel], heal);
  };

  const headline = report.setupError
    ? "EXECUTION SYSTEM ERROR"
    : s.behavioral > 0
      ? `${s.behavioral} REAL REGRESSION${s.behavioral > 1 ? "S" : ""} IDENTIFIED`
      : "COMPATIBILITY SCAN SECURE — NO REGRESSIONS FOUND";

  const accentColor = report.setupError
    ? hpeOrange
    : s.behavioral > 0
      ? hpeRed
      : hpeBlueAccent;

  // Overall migration verdict — the one-glance "can I cut over?" call, derived
  // from the diff summary, the setup state, and the build fingerprint.
  const verdict: {
    level: "safe" | "review" | "blocked" | "error";
    title: string;
    detail: string;
    tone: string;
    icon: React.ElementType;
  } = (() => {
    if (report.setupError) {
      return {
        level: "error",
        title: "Couldn't validate — the suite didn't run",
        detail: `The tests were blocked before they could execute (${report.setupError.replace(/\s+/g, " ").trim().slice(0, 140)}). No outcomes are trustworthy until this is resolved.`,
        tone: hpeOrange,
        icon: AlertTriangle,
      };
    }
    if (s.behavioral > 0) {
      return {
        level: "blocked",
        title: `Not safe to migrate — ${s.behavioral} regression${s.behavioral > 1 ? "s" : ""}`,
        detail: `${s.behavioral} test${s.behavioral > 1 ? "s" : ""} passed on the source but fail on the target. Investigate before cutting over.`,
        tone: hpeRed,
        icon: ShieldAlert,
      };
    }
    const caveats: string[] = [];
    if (s.flaky) caveats.push(`${s.flaky} flaky`);
    if (s.healed) caveats.push(`${s.healed} auto-healed`);
    if (s.infra)
      caveats.push(`${s.infra} environment issue${s.infra > 1 ? "s" : ""}`);
    if (report.fingerprint?.status === "mismatch")
      caveats.push("build fingerprint mismatch");
    if (caveats.length) {
      return {
        level: "review",
        title: "Migrate with review",
        detail: `No real regressions, but ${caveats.join(", ")} — confirm these are acceptable before cutting over.`,
        tone: hpeOrange,
        icon: AlertTriangle,
      };
    }
    return {
      level: "safe",
      title: "Safe to migrate",
      detail: `All ${s.stillPassing} carried-over test${s.stillPassing === 1 ? "" : "s"} still pass on the target. No regressions detected.`,
      tone: hpeBlueAccent,
      icon: ShieldCheck,
    };
  })();
  const VerdictIcon = verdict.icon;

  // Open the Playwright Trace Viewer for a failed spec. Both the trace.zip and
  // the viewer itself are served from THIS origin (the viewer is vendored into
  // public/trace-viewer), so the viewer's same-origin fetch of the trace avoids
  // the mixed-content / Local Network Access blocks that hosted trace.playwright.dev
  // hits against http://localhost. We probe first so a spec with no retained
  // trace gives clear feedback instead of a broken viewer tab.
  const openTrace = async (file: string) => {
    setTraceError((p) => ({ ...p, [file]: false }));
    setTraceBusy(file);
    try {
      const traceApi = `${window.location.origin}/api/migration-check/${report.id}/trace?file=${encodeURIComponent(file)}`;
      const head = await fetch(traceApi, { method: "HEAD" });
      if (!head.ok) {
        setTraceError((p) => ({ ...p, [file]: true }));
        return;
      }
      window.open(
        `${window.location.origin}/trace-viewer/index.html?trace=${encodeURIComponent(traceApi)}`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch {
      setTraceError((p) => ({ ...p, [file]: true }));
    } finally {
      setTraceBusy(null);
    }
  };

  return (
    <VStack align="stretch" gap={4} w="full" h="full" minH={0}>
      {/* Verdict banner — the one-glance migration call. */}
      <Flex
        align="center"
        gap={4}
        flexShrink={0}
        p={4}
        borderRadius="xl"
        border="1px solid"
        borderColor={`${verdict.tone}55`}
        bg={`${verdict.tone}0F`}
      >
        <VerdictIcon size={28} color={verdict.tone} strokeWidth={2.2} />
        <Box flex={1} minW={0}>
          <Text
            fontSize="15px"
            fontWeight="bold"
            color={verdict.tone}
            textTransform="uppercase"
            letterSpacing="0.03em"
          >
            {verdict.title}
          </Text>
          <Text fontSize="12px" color={colors.subtext} mt={0.5}>
            {verdict.detail}
          </Text>
        </Box>
        <HStack gap={4} flexShrink={0} display={{ base: "none", md: "flex" }}>
          <VerdictCount
            label="PASSING"
            value={s.stillPassing}
            tone={hpeBlueAccent}
          />
          <VerdictCount
            label="REGRESSIONS"
            value={s.behavioral}
            tone={hpeRed}
          />
          {s.flaky > 0 && (
            <VerdictCount label="FLAKY" value={s.flaky} tone={hpeOrange} />
          )}
          {s.healed > 0 && (
            <VerdictCount label="HEALED" value={s.healed} tone={hpeBlue} />
          )}
        </HStack>
      </Flex>

      <Flex
        gap={5}
        w="full"
        flex={1}
        direction={{ base: "column", xl: "row" }}
        overflow="hidden"
        minH={0}
      >
        {/* Left Column: Spec Lists (35% width) */}
        <VStack
          align="stretch"
          gap={3}
          w={{ base: "full", xl: "380px" }}
          flexShrink={0}
          h="full"
          overflowY="auto"
          pr={{ xl: 1 }}
          minH={0}
        >
          {onRerun && failedFiles.length > 0 && (
            <Box
              position="sticky"
              top={0}
              zIndex={2}
              bg={colors.cardBg}
              border="1px solid"
              borderColor={colors.border}
              borderRadius="xl"
              p={3}
              shadow="sm"
            >
              <Flex align="center" justify="space-between" gap={2} mb={2}>
                <Text
                  fontWeight="bold"
                  fontSize="11px"
                  color={colors.text}
                  letterSpacing="0.05em"
                >
                  RE-RUN FAILED TESTS
                </Text>
                <Button
                  size="2xs"
                  variant="ghost"
                  color={hpeBlueAccent}
                  fontSize="10px"
                  onClick={() =>
                    setRerunSel(
                      allFailedSelected ? new Set() : new Set(failedFiles),
                    )
                  }
                >
                  {allFailedSelected
                    ? "Clear"
                    : `Select all (${failedFiles.length})`}
                </Button>
              </Flex>
              <HStack gap={2}>
                <Button
                  size="xs"
                  flex={1}
                  disabled={rerunSel.size === 0}
                  bg={hpeBlueAccent}
                  color="white"
                  _hover={{ opacity: 0.9 }}
                  _disabled={{ opacity: 0.4, cursor: "not-allowed" }}
                  onClick={() => doRerun(false)}
                  title="Re-run the selected tests as-is against the target"
                >
                  <Play size={12} />
                  Re-run ({rerunSel.size})
                </Button>
                <Button
                  size="xs"
                  flex={1}
                  disabled={rerunSel.size === 0}
                  bg="transparent"
                  color={hpeBlue}
                  border="1px solid"
                  borderColor={hpeBlue}
                  _hover={{ bg: `${hpeBlue}12` }}
                  _disabled={{ opacity: 0.4, cursor: "not-allowed" }}
                  onClick={() => doRerun(true)}
                  title="Let the Tester agent auto-fix selector/state issues using its knowledge, then re-run"
                >
                  <Sparkles size={12} />
                  Re-run + Tester
                </Button>
              </HStack>
              <Text fontSize="9.5px" color={hpeSlate} mt={1.5} lineHeight="1.4">
                Straight re-run repeats the tests unchanged. “+ Tester” first
                lets the agent repair fragile selectors / state using its
                knowledge, then re-runs.
              </Text>
            </Box>
          )}
          {GROUPS.map(({ key, label, hint, icon: Icon, toneKey }) => {
            const items = grouped(key);
            if (items.length === 0) return null;
            const reRunnable = isRerunnable(key);
            const tone = getToneColor(toneKey);
            return (
              <Box
                key={key}
                bg={colors.cardBg}
                border="1px solid"
                borderColor={colors.border}
                borderRadius="xl"
                overflow="hidden"
                shadow="sm"
              >
                <Flex
                  align="center"
                  gap={2.5}
                  px={3.5}
                  py={2.5}
                  bg={colors.subBg}
                  borderBottom="1px solid"
                  borderColor={colors.border}
                >
                  <Box color={tone} flexShrink={0}>
                    <Icon size={13} />
                  </Box>
                  <Text
                    fontWeight="bold"
                    fontSize="11px"
                    color={colors.text}
                    letterSpacing="0.05em"
                    truncate
                    flex={1}
                  >
                    {label}
                  </Text>
                  <Badge
                    bg={`${tone}12`}
                    color={tone}
                    border="1px solid"
                    borderColor={`${tone}25`}
                    borderRadius="md"
                    px={1.5}
                    py={0.5}
                    fontSize="9.5px"
                    flexShrink={0}
                  >
                    {items.length}
                  </Badge>
                </Flex>
                <VStack align="stretch" gap={0}>
                  {items.map((d) => {
                    const isSelected = selectedSpec?.file === d.file;
                    return (
                      <Box
                        key={d.file}
                        px={3.5}
                        py={2}
                        borderBottom="1px solid"
                        borderColor={colors.border}
                        cursor="pointer"
                        bg={
                          isSelected
                            ? theme === "dark"
                              ? "rgba(0, 120, 212, 0.05)"
                              : "rgba(0, 90, 156, 0.03)"
                            : "transparent"
                        }
                        borderLeft="3px solid"
                        borderLeftColor={isSelected ? tone : "transparent"}
                        _hover={{ bg: colors.rowHover }}
                        _last={{ borderBottom: "none" }}
                        onClick={() => {
                          setSelectedSpec(d);
                          setActiveDetailsTab("diagnostics");
                        }}
                      >
                        <Flex align="center" gap={2.5}>
                          {onRerun && reRunnable && (
                            <Box
                              role="checkbox"
                              aria-checked={rerunSel.has(d.file)}
                              aria-label={`Select ${d.title ?? d.file} to re-run`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleRerun(d.file);
                              }}
                              w="16px"
                              h="16px"
                              flexShrink={0}
                              borderRadius="4px"
                              border="1.5px solid"
                              borderColor={
                                rerunSel.has(d.file) ? tone : colors.border
                              }
                              bg={rerunSel.has(d.file) ? tone : "transparent"}
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                            >
                              {rerunSel.has(d.file) && (
                                <Check size={11} color="white" />
                              )}
                            </Box>
                          )}
                          <Text
                            fontSize="12px"
                            color={colors.text}
                            fontWeight={isSelected ? "bold" : "medium"}
                            truncate
                            flex={1}
                            minW={0}
                          >
                            {d.title ?? d.file}
                          </Text>
                          <OutcomePill
                            label={d.targetOutcome}
                            outcome={d.targetOutcome}
                          />
                        </Flex>
                      </Box>
                    );
                  })}
                </VStack>
              </Box>
            );
          })}
        </VStack>

        {/* Right Column: Diagnostic Workspace (65% width) */}
        <Box
          flex={1}
          h="full"
          bg={colors.cardBg}
          border="1px solid"
          borderColor={colors.border}
          borderRadius="xl"
          display="flex"
          flexDirection="column"
          overflow="hidden"
          shadow="sm"
          minH={0}
        >
          {selectedSpec ? (
            /* Detailed Spec Inspector */
            <Flex direction="column" h="100%" minH={0}>
              {/* Header */}
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
                <Text
                  fontSize="11px"
                  fontWeight="bold"
                  color={colors.subtext}
                  textTransform="uppercase"
                >
                  SPECIFICATION DIAGNOSTICS INSPECTOR
                </Text>
                <Button
                  size="xs"
                  variant="outline"
                  borderRadius="lg"
                  borderColor={colors.border}
                  color={colors.text}
                  _hover={{
                    borderColor: hpeBlueAccent,
                    color: hpeBlueAccent,
                    bg: "transparent",
                  }}
                  onClick={() => setSelectedSpec(null)}
                  fontSize="10px"
                >
                  CLOSE INSPECTOR
                </Button>
              </Box>

              {/* Spec details */}
              <Box
                p={4}
                borderBottom="1px solid"
                borderColor={colors.border}
                flexShrink={0}
              >
                <Text
                  fontSize="14px"
                  fontWeight="bold"
                  color={colors.text}
                  wordBreak="break-all"
                >
                  {selectedSpec.title ?? selectedSpec.file}
                </Text>
                <Text fontSize="10.5px" color={colors.subtext} mt={1}>
                  SPECIFICATION FILE PATH: {selectedSpec.file}
                </Text>
              </Box>

              {/* Behavior Transition */}
              <Box
                p={4}
                borderBottom="1px solid"
                borderColor={colors.border}
                bg={colors.subBg}
                flexShrink={0}
              >
                <Flex align="center" gap={4} flexWrap="wrap">
                  <Box>
                    <Text
                      fontSize="9px"
                      fontWeight="bold"
                      color={colors.subtext}
                      mb={1}
                    >
                      SOURCE BEHAVIOR
                    </Text>
                    <OutcomePill
                      label={selectedSpec.sourceOutcome}
                      outcome={selectedSpec.sourceOutcome}
                    />
                  </Box>
                  <Box color={colors.subtext} mt={3}>
                    <ArrowRight size={16} />
                  </Box>
                  <Box>
                    <Text
                      fontSize="9px"
                      fontWeight="bold"
                      color={colors.subtext}
                      mb={1}
                    >
                      TARGET DEPLOYMENT BEHAVIOR
                    </Text>
                    <OutcomePill
                      label={selectedSpec.targetOutcome}
                      outcome={selectedSpec.targetOutcome}
                    />
                  </Box>
                </Flex>

                {/* Playwright Trace Viewer — a full time-travel replay of the
                    failed run (DOM snapshots, network, console, each action). */}
                {selectedSpec.targetOutcome !== "passed" && (
                  <Box mt={4}>
                    <Button
                      size="xs"
                      bg="transparent"
                      color={hpeBlueAccent}
                      border="1px solid"
                      borderColor={hpeBlueAccent}
                      borderRadius="lg"
                      _hover={{ bg: `${hpeBlueAccent}12` }}
                      _disabled={{ opacity: 0.5, cursor: "not-allowed" }}
                      disabled={traceBusy === selectedSpec.file}
                      onClick={() => openTrace(selectedSpec.file)}
                      title="Open this run's Playwright trace in the Trace Viewer (new tab)"
                    >
                      <HStack gap={1.5}>
                        {traceBusy === selectedSpec.file ? (
                          <Spinner size="xs" />
                        ) : (
                          <ExternalLink size={12} />
                        )}
                        <Text>Open Playwright Trace</Text>
                      </HStack>
                    </Button>
                    {traceError[selectedSpec.file] && (
                      <Text fontSize="10px" color={colors.subtext} mt={1.5}>
                        No trace was captured for this spec — traces are kept
                        only for tests that actually ran and failed on the
                        target.
                      </Text>
                    )}
                  </Box>
                )}

                {/* Source / target deployment URLs */}
                <VStack align="stretch" gap={2} mt={4}>
                  <Box>
                    <Text
                      fontSize="9px"
                      fontWeight="bold"
                      color={colors.subtext}
                      mb={1}
                    >
                      SOURCE URL
                    </Text>
                    <Text
                      fontSize="11px"
                      fontFamily="mono"
                      color={colors.text}
                      wordBreak="break-all"
                    >
                      {report.sourceUrl}
                    </Text>
                  </Box>
                  <Box>
                    <Text
                      fontSize="9px"
                      fontWeight="bold"
                      color={colors.subtext}
                      mb={1}
                    >
                      TARGET URL
                    </Text>
                    <Text
                      fontSize="11px"
                      fontFamily="mono"
                      color={colors.text}
                      wordBreak="break-all"
                    >
                      {report.targetUrl}
                    </Text>
                  </Box>
                </VStack>
              </Box>

              {/* Tab Selection */}
              <Box
                borderBottom="1px solid"
                borderColor={colors.border}
                bg={colors.subBg}
                px={4}
                py={2}
                flexShrink={0}
              >
                <HStack gap={3}>
                  <Button
                    size="xs"
                    variant="ghost"
                    borderRadius="lg"
                    px={3}
                    py={2.5}
                    bg={
                      activeDetailsTab === "diagnostics"
                        ? theme === "dark"
                          ? "rgba(0, 120, 212, 0.12)"
                          : "rgba(0, 90, 156, 0.08)"
                        : "transparent"
                    }
                    color={
                      activeDetailsTab === "diagnostics"
                        ? hpeBlueAccent
                        : colors.subtext
                    }
                    fontWeight="bold"
                    _hover={{ bg: colors.rowHover, color: colors.text }}
                    onClick={() => setActiveDetailsTab("diagnostics")}
                  >
                    DIAGNOSTICS & LOGS
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    borderRadius="lg"
                    px={3}
                    py={2.5}
                    bg={
                      activeDetailsTab === "source"
                        ? theme === "dark"
                          ? "rgba(0, 120, 212, 0.12)"
                          : "rgba(0, 90, 156, 0.08)"
                        : "transparent"
                    }
                    color={
                      activeDetailsTab === "source"
                        ? hpeBlueAccent
                        : colors.subtext
                    }
                    fontWeight="bold"
                    _hover={{ bg: colors.rowHover, color: colors.text }}
                    onClick={() => setActiveDetailsTab("source")}
                  >
                    SOURCE CODE
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    borderRadius="lg"
                    px={3}
                    py={2.5}
                    bg={
                      activeDetailsTab === "target"
                        ? theme === "dark"
                          ? "rgba(0, 120, 212, 0.12)"
                          : "rgba(0, 90, 156, 0.08)"
                        : "transparent"
                    }
                    color={
                      activeDetailsTab === "target"
                        ? hpeBlueAccent
                        : colors.subtext
                    }
                    fontWeight="bold"
                    _hover={{ bg: colors.rowHover, color: colors.text }}
                    onClick={() => setActiveDetailsTab("target")}
                  >
                    TARGET CODE
                  </Button>
                </HStack>
              </Box>

              {/* Tabbed Content */}
              {activeDetailsTab === "source" ? (
                <Box
                  p={4}
                  flex={1}
                  display="flex"
                  flexDirection="column"
                  minH={0}
                >
                  <Text
                    fontSize="10px"
                    fontWeight="bold"
                    color={colors.subtext}
                    mb={2}
                    textTransform="uppercase"
                  >
                    SOURCE CODE (ORIGINAL SPECIFICATION)
                  </Text>
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
                    {loadingSourceSpecs ? (
                      <Flex justify="center" align="center" h="100%" py={8}>
                        <Spinner size="sm" color={hpeBlueAccent} />
                      </Flex>
                    ) : (
                      (() => {
                        const originalSpec =
                          sourceSpecs.find(
                            (s) => s.file === selectedSpec.file,
                          ) ||
                          sourceSpecs.find(
                            (s) =>
                              s.file.endsWith(selectedSpec.file) ||
                              selectedSpec.file.endsWith(s.file),
                          );
                        const originalCode =
                          originalSpec?.code ??
                          "// Original source code not found.";
                        return highlightTypeScript(originalCode);
                      })()
                    )}
                  </Box>
                </Box>
              ) : activeDetailsTab === "target" ? (
                (() => {
                  const file = selectedSpec.file;
                  const baseSpec =
                    report.targetReport?.generatedSpecs?.find(
                      (s) => s.file === file,
                    ) ||
                    report.targetReport?.generatedSpecs?.find(
                      (s) => s.file.endsWith(file) || file.endsWith(s.file),
                    );
                  const baseCode =
                    baseSpec?.code ??
                    "// Target specification code not found in report.";
                  const savedEdit = editedTarget[file];
                  const currentCode = savedEdit ?? baseCode;
                  const canEdit = !!onRerunEdited;
                  return (
                    <Box
                      p={4}
                      flex={1}
                      display="flex"
                      flexDirection="column"
                      minH={0}
                    >
                      <Flex
                        align="center"
                        justify="space-between"
                        mb={2}
                        gap={2}
                      >
                        <Text
                          fontSize="10px"
                          fontWeight="bold"
                          color={savedEdit ? hpeOrange : colors.subtext}
                          textTransform="uppercase"
                        >
                          {savedEdit
                            ? "TARGET CODE — EDITED (NOT YET RE-RUN)"
                            : "TARGET CODE (EXECUTED SPECIFICATION)"}
                        </Text>
                        {canEdit && (
                          <HStack gap={1.5}>
                            {editingTarget ? (
                              <>
                                <Button
                                  size="2xs"
                                  variant="ghost"
                                  color={colors.subtext}
                                  onClick={() => setEditingTarget(false)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="2xs"
                                  bg={hpeBlueAccent}
                                  color="white"
                                  _hover={{ opacity: 0.9 }}
                                  onClick={() => {
                                    setEditedTarget((p) => ({
                                      ...p,
                                      [file]: draft,
                                    }));
                                    setEditingTarget(false);
                                  }}
                                >
                                  <Check size={11} />
                                  Save
                                </Button>
                              </>
                            ) : (
                              <>
                                {savedEdit && (
                                  <Button
                                    size="2xs"
                                    variant="ghost"
                                    color={colors.subtext}
                                    onClick={() =>
                                      setEditedTarget((p) => {
                                        const n = { ...p };
                                        delete n[file];
                                        return n;
                                      })
                                    }
                                  >
                                    Revert
                                  </Button>
                                )}
                                <Button
                                  size="2xs"
                                  variant="outline"
                                  borderColor={colors.border}
                                  color={colors.text}
                                  onClick={() => {
                                    setDraft(currentCode);
                                    setEditingTarget(true);
                                  }}
                                >
                                  <Pencil size={11} />
                                  Edit
                                </Button>
                                {savedEdit && (
                                  <Button
                                    size="2xs"
                                    bg={hpeBlueAccent}
                                    color="white"
                                    _hover={{ opacity: 0.9 }}
                                    onClick={() =>
                                      onRerunEdited?.(file, savedEdit)
                                    }
                                  >
                                    <Play size={11} />
                                    Re-run with edits
                                  </Button>
                                )}
                              </>
                            )}
                          </HStack>
                        )}
                      </Flex>
                      <Box
                        bg="#0B0E12"
                        border="1px solid"
                        borderColor={
                          savedEdit
                            ? hpeOrange
                            : theme === "dark"
                              ? "#2E3A47"
                              : "#333333"
                        }
                        flex={1}
                        overflowY="auto"
                        borderRadius="lg"
                        css={{
                          "&::-webkit-scrollbar": {
                            width: "8px",
                            height: "8px",
                          },
                          "&::-webkit-scrollbar-track": {
                            background: "#0B0E12",
                          },
                          "&::-webkit-scrollbar-thumb": {
                            background:
                              theme === "dark" ? "#2E3A47" : "#333333",
                            borderRadius: "4px",
                          },
                          "&::-webkit-scrollbar-thumb:hover": {
                            background:
                              theme === "dark" ? "#415263" : "#555555",
                          },
                        }}
                      >
                        {editingTarget ? (
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            spellCheck={false}
                            style={{
                              width: "100%",
                              height: "100%",
                              minHeight: "320px",
                              resize: "none",
                              background: "#0B0E12",
                              color: "#E6EDF3",
                              border: "none",
                              outline: "none",
                              padding: "16px",
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, monospace",
                              fontSize: "12px",
                              lineHeight: "1.5",
                              whiteSpace: "pre",
                              tabSize: 2,
                            }}
                          />
                        ) : (
                          <Box p={4}>{highlightTypeScript(currentCode)}</Box>
                        )}
                      </Box>
                    </Box>
                  );
                })()
              ) : selectedSpec.failureReason ? (
                <Box
                  p={4}
                  flex={1}
                  display="flex"
                  flexDirection="column"
                  minH={0}
                  overflowY="auto"
                >
                  {/* AI / plain-language issue summary */}
                  {(() => {
                    const exp = explanations[selectedSpec.file];
                    if (exp === "loading") {
                      return (
                        <Flex
                          align="center"
                          gap={2}
                          mb={4}
                          p={3}
                          flexShrink={0}
                          bg={colors.subBg}
                          border="1px solid"
                          borderColor={colors.border}
                          borderRadius="lg"
                        >
                          <Spinner size="sm" color={hpeBlueAccent} />
                          <Text fontSize="12px" color={colors.subtext}>
                            Analysing the failure…
                          </Text>
                        </Flex>
                      );
                    }
                    if (!exp) return null;
                    return (
                      <Box
                        mb={4}
                        flexShrink={0}
                        border="1px solid"
                        borderColor={colors.border}
                        borderRadius="lg"
                        overflow="hidden"
                      >
                        <Flex
                          align="center"
                          justify="space-between"
                          px={3.5}
                          py={2}
                          bg={colors.subBg}
                          borderBottom="1px solid"
                          borderColor={colors.border}
                        >
                          <Text
                            fontSize="10px"
                            fontWeight="bold"
                            color={colors.subtext}
                            textTransform="uppercase"
                            letterSpacing="0.05em"
                          >
                            Issue summary
                          </Text>
                        </Flex>
                        <VStack align="stretch" gap={3} p={3.5}>
                          <ExplainBlock
                            label="What happened"
                            text={exp.summary}
                            colors={colors}
                          />
                          <ExplainBlock
                            label="Why it failed"
                            text={exp.why}
                            colors={colors}
                          />
                          <ExplainBlock
                            label="Suggested fix"
                            text={exp.fix}
                            colors={colors}
                          />
                        </VStack>
                      </Box>
                    );
                  })()}

                  <Text
                    fontSize="10px"
                    fontWeight="bold"
                    color={colors.subtext}
                    mb={2}
                    textTransform="uppercase"
                    flexShrink={0}
                  >
                    COMPILATION / RUNTIME FAILURE LOGS
                  </Text>
                  <Box
                    bg="#0B0E12"
                    border="1px solid"
                    borderColor={theme === "dark" ? "#2E3A47" : "#333333"}
                    color="#FF4040"
                    fontFamily="mono"
                    p={4}
                    flex={1}
                    overflowY="auto"
                    fontSize="11.5px"
                    lineHeight="1.6"
                    whiteSpace="pre-wrap"
                    minH="150px"
                    borderRadius="lg"
                  >
                    {selectedSpec.failureReason}
                  </Box>
                </Box>
              ) : (
                <Box
                  p={8}
                  textAlign="center"
                  flex={1}
                  display="flex"
                  flexDirection="column"
                  alignItems="center"
                  justifyContent="center"
                >
                  <CheckCircle2 size={36} color={hpeBlueAccent} />
                  <Text
                    mt={4}
                    fontSize="13px"
                    fontWeight="bold"
                    color={colors.text}
                    textTransform="uppercase"
                    letterSpacing="0.05em"
                  >
                    SPECIFICATION VALIDATED SECURE
                  </Text>
                  <Text
                    mt={2}
                    fontSize="11.5px"
                    color={colors.subtext}
                    maxW="360px"
                  >
                    This integration test specification completed successfully
                    on the target cloud deployment environment with no
                    regressions.
                  </Text>
                </Box>
              )}
            </Flex>
          ) : (
            /* General Summary Overview Panel */
            <Flex direction="column" h="100%" minH={0}>
              {/* Header */}
              <Box
                bg={colors.subBg}
                borderBottom="1px solid"
                borderColor={colors.border}
                p={3.5}
                flexShrink={0}
              >
                <Text
                  fontSize="11px"
                  fontWeight="bold"
                  color={colors.subtext}
                  textTransform="uppercase"
                >
                  DIAGNOSTIC REPORT OVERVIEW
                </Text>
              </Box>

              <Box p={5} flex={1} overflowY="auto">
                <VStack align="stretch" gap={5}>
                  {/* Headline Banner */}
                  <Box
                    bg={colors.bg}
                    border="1px solid"
                    borderColor={colors.border}
                    borderRadius="lg"
                    p={5}
                  >
                    <Flex align="center" gap={3} mb={2}>
                      <Text
                        fontSize="15px"
                        fontWeight="bold"
                        color={colors.text}
                        textTransform="uppercase"
                      >
                        {headline}
                      </Text>
                    </Flex>
                    <Text fontSize="12px" color={colors.subtext}>
                      STATUS REPORT: {s.stillPassing} OF {s.total} PLANNED
                      SPECIFICATIONS COMPLETED SECURELY.
                    </Text>
                    <Flex
                      gap={2.5}
                      align="center"
                      mt={3}
                      bg={colors.cardBg}
                      p={2.5}
                      border="1px solid"
                      borderColor={colors.border}
                      flexWrap="wrap"
                      borderRadius="lg"
                    >
                      <Text fontSize="10.5px" color={colors.subtext}>
                        SOURCE APPLICATION URL:
                      </Text>
                      <Text
                        fontSize="10.5px"
                        color={colors.text}
                        wordBreak="break-all"
                      >
                        {report.sourceUrl}
                      </Text>
                      <Text fontSize="10.5px" color={colors.subtext}>
                        &rarr; TARGET COMPILER INSTANCE:
                      </Text>
                      <Text
                        fontSize="10.5px"
                        color={colors.text}
                        fontWeight="bold"
                        wordBreak="break-all"
                      >
                        {report.targetUrl}
                      </Text>
                    </Flex>
                  </Box>

                  {/* Stat Counters Grid */}
                  <Box>
                    <Text
                      fontSize="11px"
                      fontWeight="bold"
                      color={colors.subtext}
                      mb={3}
                      textTransform="uppercase"
                    >
                      METRIC SUMMARY INDEX
                    </Text>
                    <Flex gap={3} flexWrap="wrap" w="full">
                      <Stat
                        label="PASSING"
                        value={s.stillPassing}
                        tone={hpeBlueAccent}
                      />
                      <Stat
                        label="REGRESSIONS"
                        value={s.behavioral}
                        tone={hpeRed}
                      />
                      {s.healed > 0 && (
                        <Stat label="HEALED" value={s.healed} tone={hpeBlue} />
                      )}
                      <Stat
                        label="ENV FAILURES"
                        value={s.infra}
                        tone={hpeOrange}
                      />
                      <Stat label="FLAKY" value={s.flaky} tone={hpeOrange} />
                      <Stat
                        label="PRE-EXISTING"
                        value={s.preExisting}
                        tone={hpeSlate}
                      />
                    </Flex>
                  </Box>

                  {/* Fingerprint check banner */}
                  <FingerprintBanner
                    report={report}
                    colors={colors}
                    activeGreen={hpeBlueAccent}
                    warningColor={hpeOrange}
                  />

                  {/* AI Analysis Section */}
                  {(report.targetReport?.testSummary ||
                    report.targetReport?.better ||
                    report.targetReport?.recommendationsText) && (
                    <Box
                      bg={colors.subBg}
                      border="1px solid"
                      borderColor={colors.border}
                      borderRadius="lg"
                      p={4}
                    >
                      <Text
                        fontSize="10px"
                        fontWeight="bold"
                        color={colors.subtext}
                        mb={3}
                        textTransform="uppercase"
                        letterSpacing="0.05em"
                      >
                        AI MIGRATION ANALYSIS & SYNTHESIS
                      </Text>
                      {report.targetReport.testSummary && (
                        <Text
                          fontSize="12px"
                          color={colors.text}
                          lineHeight="1.6"
                          mb={2}
                        >
                          {report.targetReport.testSummary}
                        </Text>
                      )}
                      {(report.targetReport.better ||
                        report.targetReport.recommendationsText) && (
                        <Box
                          mt={3}
                          pt={3}
                          borderTop="1px dashed"
                          borderColor={colors.border}
                        >
                          <Text
                            fontSize="10px"
                            fontWeight="bold"
                            color={hpeBlueAccent}
                            mb={2}
                            textTransform="uppercase"
                          >
                            KEY RECOMMENDATIONS & OBSERVATIONS
                          </Text>
                          <Text
                            fontSize="11.5px"
                            color={colors.subtext}
                            lineHeight="1.5"
                            whiteSpace="pre-wrap"
                          >
                            {report.targetReport.better ||
                              report.targetReport.recommendationsText}
                          </Text>
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Console logs — how the suite was actually run and executed
                      (per-spec outcomes + the Tester's tool-by-tool steps). */}
                  {events.length > 0 && (
                    <Box
                      bg={colors.subBg}
                      border="1px solid"
                      borderColor={colors.border}
                      borderRadius="lg"
                      p={4}
                    >
                      <Text
                        fontSize="10px"
                        fontWeight="bold"
                        color={colors.subtext}
                        mb={3}
                        textTransform="uppercase"
                        letterSpacing="0.05em"
                      >
                        CONSOLE LOGS ({events.length})
                      </Text>
                      <MigrationLog
                        events={events}
                        activeBlue={hpeBlueAccent}
                        theme={theme}
                        maxH="320px"
                      />
                    </Box>
                  )}
                </VStack>
              </Box>
            </Flex>
          )}
        </Box>
      </Flex>
    </VStack>
  );
}

function VerdictCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Box textAlign="center" minW="58px">
      <Text fontSize="20px" fontWeight="bold" color={tone} lineHeight="1">
        {value}
      </Text>
      <Text
        fontSize="8.5px"
        fontWeight="bold"
        color={tone}
        letterSpacing="0.05em"
        mt={1}
      >
        {label}
      </Text>
    </Box>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Box
      bg={`${tone}07`}
      border="1px solid"
      borderColor={`${tone}22`}
      borderRadius="lg"
      px={4}
      py={2.5}
      minW="105px"
      flex={1}
    >
      <Text fontSize="18px" fontWeight="bold" color={tone} lineHeight="1">
        {value}
      </Text>
      <Text
        fontSize="9px"
        fontWeight="bold"
        color={tone}
        letterSpacing="0.05em"
        textTransform="uppercase"
        mt={2}
      >
        {label}
      </Text>
    </Box>
  );
}

function ExplainBlock({
  label,
  text,
  colors,
}: {
  label: string;
  text: string;
  colors: ReturnType<typeof getHPEColors>;
}) {
  return (
    <Box>
      <Text
        fontSize="9.5px"
        fontWeight="bold"
        color={colors.subtext}
        textTransform="uppercase"
        letterSpacing="0.05em"
        mb={0.5}
      >
        {label}
      </Text>
      <Text fontSize="12.5px" color={colors.text} lineHeight="1.55">
        {text}
      </Text>
    </Box>
  );
}

function OutcomePill({ label, outcome }: { label: string; outcome: string }) {
  const { theme } = useThemeMode();
  const tone =
    outcome === "passed" || outcome === "healed"
      ? theme === "dark"
        ? "#0078D4"
        : "#005A9C"
      : outcome === "flaky" || outcome === "unknown"
        ? "#FFAA15"
        : "#FF4040";
  return (
    <Box
      bg={`${tone}0c`}
      color={tone}
      border="1px solid"
      borderColor={`${tone}22`}
      fontSize="9.5px"
      fontWeight="bold"
      borderRadius="md"
      px={2}
      py={0.5}
      textTransform="uppercase"
    >
      {label}
    </Box>
  );
}

// Keep file path mapping monospaced for correct source code matching representation
function FingerprintBanner({
  report,
  colors,
  activeGreen,
  warningColor,
}: {
  report: MigrationReport;
  colors: ReturnType<typeof getHPEColors>;
  activeGreen: string;
  warningColor: string;
}) {
  const fp = report.fingerprint;
  // Only show a meaningful verdict. "skipped" (not run) and "error" (couldn't
  // read assets — usually because login failed) are noise; a real login/setup
  // failure is already surfaced by its own banner.
  if (fp.status !== "match" && fp.status !== "mismatch") return null;
  const ok = fp.status === "match";
  const tone = ok ? activeGreen : warningColor;
  const Icon = ok ? ShieldCheck : ShieldAlert;

  const msg = ok
    ? `VERIFICATION SECURE: Target matches source build signature (${fp.sharedAssetCount} assets shared). Asset mapping alignment holds.`
    : "INTEGRITY WARNING: Build signature mismatch detected. The source and target deployments contain differing code versions; outcomes may diverge.";

  return (
    <Flex
      align="center"
      gap={3}
      bg={`${tone}08`}
      border="1px solid"
      borderColor={`${tone}22`}
      borderRadius="lg"
      px={3.5}
      py={2.5}
    >
      <Box color={tone} flexShrink={0}>
        <Icon size={15} />
      </Box>
      <Text
        fontSize="11.5px"
        color={colors.text}
        letterSpacing="0.01em"
        lineHeight="1.4"
      >
        {msg}
      </Text>
    </Flex>
  );
}
