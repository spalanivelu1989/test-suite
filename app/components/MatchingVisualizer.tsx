"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Text,
  VStack,
  HStack,
  Grid,
  IconButton,
  Badge,
  Code,
  Separator,
} from "@chakra-ui/react";
import {
  Workflow,
  Sliders,
  Play,
  RotateCcw,
  Plus,
  Trash2,
  HelpCircle,
  Sparkles,
  Calculator,
  Percent,
  TrendingUp,
  CheckCircle,
  XCircle,
  Layers,
  ArrowRight,
  Info,
  Database,
} from "lucide-react";
import { getCatppuccinColors, catppuccinAlpha } from "../theme/catppuccin";
import { getAWSColors } from "../theme/aws";
import { useThemeMode } from "../providers";

// 9 Concept Axis Labels
const CONCEPT_AXES = [
  "cart / add-to-cart",
  "checkout / order / purchase",
  "scroll / smooth-scrolling behaviour",
  "topic = 'about'",
  "topic = 'contact'",
  "discount / promo code",
  "shipment / tracking",
  "generic form-filling steps",
  "history / past records",
];

interface Spec {
  id: string;
  app: string;
  title: string;
  outcome: "passed" | "healed" | "failed";
  /** Flow/page this spec belongs to (Fix 2 cross-flow guard). Optional. */
  flowId?: string | null;
  title_vec: number[] | null;
  intent_vec: number[];
  pattern_vec: number[] | null;
}

interface Scenario {
  id: string;
  name: string;
  q: number[];
  qp: number[];
  /** Flow/page this scenario targets (Fix 2). When set, reuse is refused across flows. */
  flowId?: string;
}

// Initial Data matched to demo/how_matching_works.py
const INITIAL_KNOWLEDGE_BASE: Spec[] = [
  {
    id: "spec-1",
    app: "https://shop.example",
    title: "Add item to cart",
    outcome: "passed",
    title_vec: [1, 0, 0, 0, 0, 0, 0, 0, 0],
    intent_vec: [1, 0.3, 0, 0, 0, 0, 0, 0.7, 0],
    pattern_vec: [1, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "spec-2",
    app: "https://shop.example",
    title: "Complete checkout",
    outcome: "passed",
    title_vec: [0.2, 1, 0, 0, 0, 0, 0, 0, 0],
    intent_vec: [0.3, 1, 0, 0, 0, 0, 0, 0.6, 0],
    pattern_vec: [0, 1, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "spec-3",
    app: "https://shop.example",
    title: "Contact page scrolls smoothly",
    outcome: "passed",
    title_vec: [0, 0, 2, 0, 1, 0, 0, 0, 0],
    intent_vec: [0, 0, 2, 0, 1, 0, 0, 0.8, 0],
    pattern_vec: [0, 0, 2, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "spec-4",
    app: "https://shop.example",
    title: "Apply discount code",
    outcome: "failed",
    title_vec: [0, 0, 0, 0, 0, 1, 0, 0, 0],
    intent_vec: [0, 0, 0, 0, 0, 1, 0, 0.6, 0],
    pattern_vec: [0, 0, 0, 0, 0, 1, 0, 0, 0],
  },
  {
    id: "spec-5",
    app: "https://shop.example",
    title: "Past purchases",
    outcome: "passed",
    title_vec: null, // un-backfilled
    intent_vec: [0, 0, 0, 0, 0, 0, 0, 0.4, 1.0],
    pattern_vec: [0, 0, 0, 0, 0, 0, 0, 0, 0.9],
  },
  {
    id: "spec-6",
    app: "https://bank.example",
    title: "Track transaction status",
    outcome: "passed",
    title_vec: null,
    intent_vec: [0, 0, 0, 0, 0, 0, 1, 0, 0], // fallback
    pattern_vec: [0, 0, 0, 0, 0, 0, 1, 0, 0],
  },
  {
    id: "spec-7",
    app: "https://bank.example",
    title: "Track shipment (beta)",
    outcome: "failed",
    title_vec: null,
    intent_vec: [0, 0, 0, 0, 0, 0, 1, 0, 0],
    pattern_vec: [0, 0, 0, 0, 0, 0, 1, 0, 0],
  },
  {
    id: "spec-8",
    app: "https://tax.example",
    title: "Apply exemption code",
    outcome: "passed",
    title_vec: null,
    intent_vec: [0, 0, 0, 0, 0, 0.9, 0, 0, 0],
    pattern_vec: [0, 0, 0, 0, 0, 0.9, 0, 0, 0],
  },
  {
    id: "spec-9",
    app: "https://tax.example",
    title: "Track refund status",
    outcome: "passed",
    title_vec: null,
    intent_vec: [0, 0, 0, 0, 0, 0, 0.8, 0.5, 0],
    pattern_vec: [0, 0, 0, 0, 0, 0, 0.8, 0.5, 0],
  },
  {
    id: "spec-10",
    app: "https://loan.example",
    title: "Fill loan application form",
    outcome: "passed",
    title_vec: null,
    intent_vec: [0, 0, 0, 0, 0, 0, 0, 1, 0],
    pattern_vec: [0, 0, 0, 0, 0, 0, 0, 1, 0],
  },
  {
    // Fix 2 demo: same title as the sc-7 scenario, but a DIFFERENT flow. A passing,
    // exact-title match that the cross-flow guard must REFUSE to reuse.
    id: "spec-11",
    app: "https://shop.example",
    title: "Submit the form",
    outcome: "passed",
    flowId: "newsletter-signup",
    title_vec: [0, 0, 0, 0, 0, 0, 0, 1, 0],
    intent_vec: [0, 0, 0, 0, 0, 0, 0, 1, 0],
    pattern_vec: [0, 0, 0, 0, 0, 0, 0, 1, 0],
  },
];

const INITIAL_SCENARIOS: Scenario[] = [
  {
    id: "sc-1",
    name: "Add item to cart",
    q: [1, 0, 0, 0, 0, 0, 0, 0, 0],
    qp: [1, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "sc-2",
    name: "Place an order",
    q: [0, 1, 0, 0, 0, 0, 0, 0, 0],
    qp: [0, 1, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "sc-3",
    name: "About page scrolls smoothly",
    q: [0, 0, 2, 1, 0, 0, 0, 0, 0],
    qp: [0, 0, 2, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "sc-4",
    name: "Apply discount code",
    q: [0, 0, 0, 0, 0, 1, 0, 0, 0],
    qp: [0, 0, 0, 0, 0, 1, 0, 0, 0],
  },
  {
    id: "sc-5",
    name: "Track my shipment",
    q: [0, 0, 0, 0, 0, 0, 1, 0, 0],
    qp: [0, 0, 0, 0, 0, 0, 1, 0, 0],
  },
  {
    id: "sc-6",
    name: "View order history",
    q: [0, 0, 0, 0, 0, 0, 0, 0, 1],
    qp: [0, 0, 0, 0, 0, 0, 0, 0, 1],
  },
  {
    // Fix 2 demo: same title as spec-11 (lexical 1.0 → clears the bar) but on a
    // DIFFERENT flow → the cross-flow guard blocks reuse → NEW.
    id: "sc-7",
    name: "Submit the form",
    q: [0, 0, 0, 0, 0, 0, 0, 1, 0],
    qp: [0, 0, 0, 0, 0, 0, 0, 1, 0],
    flowId: "support-ticket",
  },
];

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "and",
  "with",
  "via",
  "is",
  "for",
  "my",
  "me",
]);

// Helper for Cosine Similarity
function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, idx) => sum + val * (b[idx] || 0), 0);
}

function magnitude(a: number[]): number {
  return Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

// Normalize a flow key the same way the backend's norm() does, so flow comparison
// is case/punctuation-insensitive (e.g. "Newsletter Signup" ≡ "newsletter-signup").
function normFlow(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function MatchingVisualizer() {
  const { theme } = useThemeMode();
  const c = getCatppuccinColors(theme);
  const colors = getAWSColors(theme);
  const isDark = theme === "dark";

  // State: Parameters.
  // Defaults mirror the SOURCE OF TRUTH:
  //   src/knowledge/retrieve/coverageDecision.ts — REUSE_THRESHOLD (0.80),
  //     SEM_REUSE (0.82), SEM_TITLE_WEIGHT (0.5)
  //   src/knowledge/retrieve/globalPatterns.ts  — PATTERN_RELEVANCE (0.70),
  //     PATTERN_K (1), PATTERN_BUDGET (8)
  // The sliders let you explore; "reset" returns to these calibrated values.
  const [reuseThreshold, setReuseThreshold] = useState(0.8);
  const [semReuse, setSemReuse] = useState(0.82);
  const [semTitleWeight, setSemTitleWeight] = useState(0.5);
  const [patternRelevance, setPatternRelevance] = useState(0.7);
  const [patternK, setPatternK] = useState(1);
  const [patternBudget, setPatternBudget] = useState(8);
  const [globalPatternsEnabled, setGlobalPatternsEnabled] = useState(true);
  const [currentApp, setCurrentApp] = useState("https://shop.example");

  // State: Knowledge Base & Scenarios
  const [knowledgeBase, setKnowledgeBase] = useState<Spec[]>(
    INITIAL_KNOWLEDGE_BASE,
  );
  const [scenarios, setScenarios] = useState<Scenario[]>(INITIAL_SCENARIOS);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("sc-1");
  const [selectedSpecMathId, setSelectedSpecMathId] = useState<string | null>(
    null,
  );

  // Editing / Creation Temp states
  const [newSpecTitle, setNewSpecTitle] = useState("");
  const [newSpecApp, setNewSpecApp] = useState("https://shop.example");
  const [newSpecOutcome, setNewSpecOutcome] = useState<
    "passed" | "healed" | "failed"
  >("passed");
  const [newSpecIntentVec, setNewSpecIntentVec] = useState<number[]>([
    0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);

  const [newScenarioName, setNewScenarioName] = useState("");
  const [newScenarioQ, setNewScenarioQ] = useState<number[]>([
    0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);

  // Active Tab
  const [activeSubTab, setActiveSubTab] = useState<
    "visualizer" | "knowledge-base" | "scenarios"
  >("visualizer");

  // Real DB mode states
  const [isRealDbMode, setIsRealDbMode] = useState<boolean>(true);
  const [scenarioInput, setScenarioInput] =
    useState<string>("Add item to cart");
  const [apiResult, setApiResult] = useState<any>(null);
  const [isLoadingPatterns, setIsLoadingPatterns] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apps, setApps] = useState<any[]>([]);

  // Fetch apps on mount
  useEffect(() => {
    fetch("/api/knowledge/apps")
      .then((r) => r.json())
      .then((d) => setApps(d.apps ?? []))
      .catch(() => setApps([]));
  }, []);

  const fetchRealDbPatterns = async () => {
    if (!scenarioInput.trim()) return;
    setIsLoadingPatterns(true);
    setApiError(null);
    try {
      const res = await fetch("/api/knowledge/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seedText: scenarioInput.trim(),
          appId: currentApp.trim() || undefined,
          k: 20,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setApiError(data.error);
        setApiResult(null);
      } else {
        setApiResult(data);
        // Default selectedSpecMathId
        if (data.inApp && data.inApp.length > 0) {
          setSelectedSpecMathId(`${data.inApp[0].file}-${data.inApp[0].runId}`);
        } else if (data.crossApp && data.crossApp.length > 0) {
          setSelectedSpecMathId(
            `${data.crossApp[0].file}-${data.crossApp[0].runId}`,
          );
        } else {
          setSelectedSpecMathId(null);
        }
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Request failed");
      setApiResult(null);
    } finally {
      setIsLoadingPatterns(false);
    }
  };

  // Run automatically when mode changes
  useEffect(() => {
    if (isRealDbMode) {
      fetchRealDbPatterns();
    }
  }, [isRealDbMode]);

  // Reset to default configuration
  const handleReset = () => {
    setReuseThreshold(0.8);
    setSemReuse(0.82);
    setSemTitleWeight(0.5);
    setPatternRelevance(0.7);
    setPatternK(1);
    setPatternBudget(8);
    setGlobalPatternsEnabled(true);
    setCurrentApp("https://shop.example");
    setKnowledgeBase(INITIAL_KNOWLEDGE_BASE);
    setScenarios(INITIAL_SCENARIOS);
    setSelectedScenarioId("sc-1");
  };

  // Run Calculations
  const simulationResults = useMemo(() => {
    let globalHintsUsed = 0;

    return scenarios.map((scenario) => {
      const name = scenario.name;
      const q = scenario.q;
      const qp = scenario.qp;

      // 1. Tokenize query
      const queryTokens = new Set<string>(
        name
          .toLowerCase()
          .split(/\s+/)
          .map((w) => w.replace(/[^a-z0-9]/g, ""))
          .filter((w) => w.length > 0 && !STOPWORDS.has(w)),
      );

      // Score against in-app specs
      const inAppMatches = knowledgeBase
        .filter((spec) => spec.app === currentApp)
        .map((spec) => {
          // Lexical Overlap
          const specTokens = new Set<string>(
            spec.title
              .toLowerCase()
              .split(/\s+/)
              .map((w) => w.replace(/[^a-z0-9]/g, ""))
              .filter((w) => w.length > 0 && !STOPWORDS.has(w)),
          );

          const shared = new Set<string>(
            [...queryTokens].filter((w) => specTokens.has(w)),
          );
          const smaller = Math.min(queryTokens.size, specTokens.size);
          const lexical = smaller > 0 ? shared.size / smaller : 0.0;

          // Semantic Blend
          const semIntent = cosineSimilarity(q, spec.intent_vec);
          let semTitle = semIntent;
          let hasTitleEmbedding = false;

          if (spec.title_vec !== null) {
            semTitle = cosineSimilarity(q, spec.title_vec);
            hasTitleEmbedding = true;
          }

          const sem =
            semTitleWeight * semTitle + (1 - semTitleWeight) * semIntent;
          const combined = Math.max(lexical, sem);

          return {
            specId: spec.id,
            title: spec.title,
            outcome: spec.outcome,
            flowId: spec.flowId ?? null,
            lexical,
            shared: [...shared],
            queryTokensCount: queryTokens.size,
            specTokensCount: specTokens.size,
            semIntent,
            semTitle,
            hasTitleEmbedding,
            sem,
            combined,
          };
        });

      // Sort by combined desc
      inAppMatches.sort((a, b) => b.combined - a.combined);
      const bestInApp = inAppMatches[0] || null;

      // Decision
      let decision: "REUSE" | "NEW" = "NEW";
      let reason = "";

      if (!bestInApp) {
        decision = "NEW";
        reason = "No prior specs exist for this app";
      } else {
        const clearsBar =
          bestInApp.lexical >= reuseThreshold || bestInApp.sem >= semReuse;
        const passed =
          bestInApp.outcome === "passed" || bestInApp.outcome === "healed";
        // Fix 2 — cross-flow guard. A confident, passing match is still NOT reused
        // when it belongs to a DIFFERENT flow/page (same title, different workflow).
        // Only blocks when both flows are known. Mirrors decideForSpecs.
        const sameFlow =
          !scenario.flowId ||
          !bestInApp.flowId ||
          normFlow(scenario.flowId) === normFlow(bestInApp.flowId);

        if (clearsBar && passed && sameFlow) {
          decision = "REUSE";
          reason = `Best match "${bestInApp.title}" clears the bar (lexical ${bestInApp.lexical.toFixed(
            3,
          )} >= ${reuseThreshold} OR sem ${bestInApp.sem.toFixed(3)} >= ${semReuse}) and last run passed.`;
        } else if (clearsBar && passed && !sameFlow) {
          decision = "NEW";
          reason = `Best match "${bestInApp.title}" clears the bar and last run passed, but it belongs to a DIFFERENT flow ("${scenario.flowId}" ≠ "${bestInApp.flowId}") — Fix 2 blocks cross-flow reuse.`;
        } else if (clearsBar && !passed) {
          decision = "NEW";
          reason = `Best match "${bestInApp.title}" clears the bar but failed last run — never reuse a broken test.`;
        } else {
          decision = "NEW";
          reason = `Best match "${bestInApp.title}" is below both bars (lexical ${bestInApp.lexical.toFixed(
            3,
          )} < ${reuseThreshold}, sem ${bestInApp.sem.toFixed(3)} < ${semReuse}).`;
        }
      }

      // 2. Cross-App retrieval if NEW and enabled
      let crossAppCandidates: any[] = [];
      let globalHint: any = null;

      if (decision === "NEW" && globalPatternsEnabled) {
        if (globalHintsUsed < patternBudget) {
          crossAppCandidates = knowledgeBase
            .filter((spec) => spec.app !== currentApp)
            .map((spec) => {
              const specPattern = spec.pattern_vec;
              let isSkipped = false;
              let skipReason = "";

              if (spec.outcome !== "passed" && spec.outcome !== "healed") {
                isSkipped = true;
                skipReason = "Last run failed/not passed";
              } else if (!specPattern) {
                isSkipped = true;
                skipReason = "No pattern embedding available";
              }

              const score = specPattern
                ? cosineSimilarity(qp, specPattern)
                : 0.0;
              const relevanceOk = score >= patternRelevance;

              return {
                specId: spec.id,
                title: spec.title,
                app: spec.app,
                outcome: spec.outcome,
                score,
                isSkipped,
                skipReason: isSkipped
                  ? skipReason
                  : !relevanceOk
                    ? `Below relevance threshold (${score.toFixed(3)} < ${patternRelevance})`
                    : "",
                relevanceOk: !isSkipped && relevanceOk,
              };
            });

          // Filter kept candidates (only relevant ones, not skipped)
          const validCandidates = crossAppCandidates
            .filter((c) => c.relevanceOk)
            .sort((a, b) => b.score - a.score);

          // Top matches based on PATTERN_K
          const keptCandidates = validCandidates.slice(0, patternK);

          if (keptCandidates.length > 0) {
            globalHint = keptCandidates[0];
            globalHintsUsed++;
          }
        }
      }

      return {
        id: scenario.id,
        name,
        queryTokens: [...queryTokens],
        inAppMatches,
        bestInApp,
        decision,
        reason,
        crossAppCandidates,
        globalHint,
        globalHintsLimitReached:
          globalHintsUsed >= patternBudget &&
          decision === "NEW" &&
          globalPatternsEnabled,
      };
    });
  }, [
    scenarios,
    knowledgeBase,
    currentApp,
    reuseThreshold,
    semReuse,
    semTitleWeight,
    patternRelevance,
    patternK,
    patternBudget,
    globalPatternsEnabled,
  ]);

  // Real DB match results processed on the client
  const realDbResult = useMemo(() => {
    if (!apiResult) return null;

    const name = apiResult.seedText || scenarioInput;
    const queryTokens = new Set<string>(
      name
        .toLowerCase()
        .split(/\s+/)
        .map((w: string) => w.replace(/[^a-z0-9]/g, ""))
        .filter((w: string) => w.length > 0 && !STOPWORDS.has(w)),
    );

    // Process In-App
    const inAppMatches = (apiResult.inApp || []).map((s: any) => {
      const specTokens = new Set<string>(
        s.title
          .toLowerCase()
          .split(/\s+/)
          .map((w: string) => w.replace(/[^a-z0-9]/g, ""))
          .filter((w: string) => w.length > 0 && !STOPWORDS.has(w)),
      );

      const shared = new Set<string>(
        [...queryTokens].filter((w: string) => specTokens.has(w)),
      );
      const smaller = Math.min(queryTokens.size, specTokens.size);
      const lexical = smaller > 0 ? shared.size / smaller : 0.0;

      const semIntent = s.semIntent ?? 0.0;
      const semTitle = s.semTitle ?? semIntent;
      const sem = semTitleWeight * semTitle + (1 - semTitleWeight) * semIntent;
      const combined = Math.max(lexical, sem);

      return {
        specId: `${s.file}-${s.runId}`,
        title: s.title || "Untitled Spec",
        outcome: "passed" as const,
        lexical,
        shared: [...shared],
        queryTokensCount: queryTokens.size,
        specTokensCount: specTokens.size,
        semIntent,
        semTitle,
        hasTitleEmbedding: s.semTitle !== undefined,
        sem,
        combined,
      };
    });

    inAppMatches.sort((a: any, b: any) => b.combined - a.combined);
    const bestInApp = inAppMatches[0] || null;

    let decision: "REUSE" | "NEW" = "NEW";
    let reason = "";

    if (!currentApp.trim()) {
      decision = "NEW";
      reason = "No target URL provided (skipping local reuse check).";
    } else if (!bestInApp) {
      decision = "NEW";
      reason = "No prior specs exist for this app in database.";
    } else if (apiResult.decision) {
      // AUTHORITATIVE verdict from the API, which runs the pipeline's own
      // decideForSpecs — lexical OR semantic, the last-outcome gate, AND the
      // Fix 2 flow guard. Never re-derive it from the blend alone here: that drops
      // the passed/flow checks and can disagree with the real pipeline.
      decision = apiResult.decision.action === "reuse" ? "REUSE" : "NEW";
      const lo = apiResult.decision.lastOutcome
        ? ` (matched spec last run: ${apiResult.decision.lastOutcome})`
        : "";
      reason =
        decision === "REUSE"
          ? `Reuse: "${bestInApp.title}" is a confident, passing, same-flow match${lo}.`
          : `New: no confident + passing + same-flow match${lo}. Best blended sem ${bestInApp.sem.toFixed(3)}, lexical ${bestInApp.lexical.toFixed(3)}.`;
    } else {
      // Fallback only if the API didn't send a decision (older API build).
      const clearsBar =
        bestInApp.lexical >= reuseThreshold || bestInApp.sem >= semReuse;
      if (clearsBar) {
        decision = "REUSE";
        reason = `Best match "${bestInApp.title}" clears the bar (lexical ${bestInApp.lexical.toFixed(3)} >= ${reuseThreshold} OR sem ${bestInApp.sem.toFixed(3)} >= ${semReuse}).`;
      } else {
        decision = "NEW";
        reason = `Best match "${bestInApp.title}" is below both bars (lexical ${bestInApp.lexical.toFixed(3)} < ${reuseThreshold}, sem ${bestInApp.sem.toFixed(3)} < ${semReuse}).`;
      }
    }

    // Process Cross-App candidates
    const crossAppCandidates = (apiResult.crossApp || []).map((s: any) => {
      const relevanceOk = s.score >= patternRelevance;
      return {
        specId: `${s.file}-${s.runId}`,
        title: s.title || "Untitled Spec",
        app: s.appId,
        outcome: "passed" as const,
        score: s.score,
        isSkipped: false,
        skipReason: !relevanceOk
          ? `Below relevance threshold (${s.score.toFixed(3)} < ${patternRelevance})`
          : "",
        relevanceOk,
      };
    });

    const validCandidates = crossAppCandidates
      .filter((c: any) => c.relevanceOk)
      .sort((a: any, b: any) => b.score - a.score);

    const keptCandidates = validCandidates.slice(0, patternK);
    const globalHint = keptCandidates[0] || null;

    return {
      id: "real-db-run",
      name,
      queryTokens: [...queryTokens],
      inAppMatches,
      bestInApp,
      decision,
      reason,
      crossAppCandidates,
      globalHint,
      globalHintsLimitReached: false,
    };
  }, [
    apiResult,
    scenarioInput,
    currentApp,
    semTitleWeight,
    reuseThreshold,
    semReuse,
    patternRelevance,
    patternK,
  ]);

  // Selected scenario results
  const selectedResult = useMemo(() => {
    if (isRealDbMode) {
      return realDbResult;
    } else {
      return simulationResults.find((r) => r.id === selectedScenarioId) || null;
    }
  }, [isRealDbMode, realDbResult, simulationResults, selectedScenarioId]);

  // Sync selectedSpecMathId when selectedScenarioId changes
  useEffect(() => {
    if (selectedResult) {
      if (selectedResult.bestInApp) {
        setSelectedSpecMathId(selectedResult.bestInApp.specId);
      } else if (selectedResult.crossAppCandidates.length > 0) {
        const eligible = selectedResult.crossAppCandidates.find(
          (c: any) => c.relevanceOk,
        );
        setSelectedSpecMathId(
          eligible
            ? eligible.specId
            : selectedResult.crossAppCandidates[0].specId,
        );
      } else {
        setSelectedSpecMathId(null);
      }
    } else {
      setSelectedSpecMathId(null);
    }
  }, [selectedScenarioId, selectedResult]);

  const selectedScenario = useMemo(() => {
    if (isRealDbMode) return null;
    return scenarios.find((s) => s.id === selectedScenarioId) || null;
  }, [isRealDbMode, scenarios, selectedScenarioId]);

  const selectedSpecMath = useMemo(() => {
    if (!selectedSpecMathId) return null;

    if (isRealDbMode) {
      if (!apiResult) return null;
      // Search in-app matches
      const localMatch = (apiResult.inApp || []).find(
        (s: any) => `${s.file}-${s.runId}` === selectedSpecMathId,
      );
      if (localMatch) {
        return {
          id: selectedSpecMathId,
          app: apiResult.appId || currentApp,
          title: localMatch.title || "Untitled Spec",
          outcome: "passed" as const,
          title_vec: null,
          intent_vec: [],
          pattern_vec: null,
          semTitle: localMatch.semTitle,
          semIntent: localMatch.semIntent,
          score: localMatch.score,
        };
      }
      // Search cross-app matches
      const globalMatch = (apiResult.crossApp || []).find(
        (s: any) => `${s.file}-${s.runId}` === selectedSpecMathId,
      );
      if (globalMatch) {
        return {
          id: selectedSpecMathId,
          app: globalMatch.appId,
          title: globalMatch.title || "Untitled Spec",
          outcome: "passed" as const,
          title_vec: null,
          intent_vec: [],
          pattern_vec: null,
          score: globalMatch.score,
        };
      }
      return null;
    } else {
      return knowledgeBase.find((s) => s.id === selectedSpecMathId) || null;
    }
  }, [isRealDbMode, apiResult, knowledgeBase, selectedSpecMathId, currentApp]);

  const mathBreakdown = useMemo(() => {
    if (isRealDbMode) {
      if (!apiResult || !selectedSpecMath) return null;

      const name = apiResult.seedText || scenarioInput;

      // Tokenization step
      const queryTokens = new Set<string>(
        name
          .toLowerCase()
          .split(/\s+/)
          .map((w: string) => w.replace(/[^a-z0-9]/g, ""))
          .filter((w: string) => w.length > 0 && !STOPWORDS.has(w)),
      );

      const specTokens = new Set<string>(
        selectedSpecMath.title
          .toLowerCase()
          .split(/\s+/)
          .map((w: string) => w.replace(/[^a-z0-9]/g, ""))
          .filter((w: string) => w.length > 0 && !STOPWORDS.has(w)),
      );

      const shared = new Set<string>(
        [...queryTokens].filter((w: string) => specTokens.has(w)),
      );
      const smaller = Math.min(queryTokens.size, specTokens.size);
      const lexical = smaller > 0 ? shared.size / smaller : 0.0;

      const cos_intent = (selectedSpecMath as any).semIntent ?? 0.0;
      const cos_title = (selectedSpecMath as any).semTitle ?? cos_intent;
      const has_tv = (selectedSpecMath as any).semTitle !== undefined;

      const sem =
        semTitleWeight * cos_title + (1 - semTitleWeight) * cos_intent;
      const combined = Math.max(lexical, sem);
      const cos_pattern = (selectedSpecMath as any).score ?? 0.0;

      return {
        queryTokens: [...queryTokens],
        specTokens: [...specTokens],
        shared: [...shared],
        smaller,
        lexical,
        dot_i: 0.0,
        mag_q: 0.0,
        mag_i: 0.0,
        cos_intent,
        has_tv,
        dot_t: 0.0,
        mag_t: 0.0,
        cos_title,
        sem,
        combined,
        dot_p: 0.0,
        mag_qp: 0.0,
        mag_p: 0.0,
        cos_pattern,
      };
    } else {
      if (!selectedResult || !selectedSpecMath) return null;

      const name = selectedResult.name;
      const scenario = selectedScenario;
      if (!scenario) return null;
      const q = scenario.q;
      const qp = scenario.qp;

      // Tokenization step
      const queryTokens = new Set<string>(
        name
          .toLowerCase()
          .split(/\s+/)
          .map((w: string) => w.replace(/[^a-z0-9]/g, ""))
          .filter((w: string) => w.length > 0 && !STOPWORDS.has(w)),
      );

      const specTokens = new Set<string>(
        selectedSpecMath.title
          .toLowerCase()
          .split(/\s+/)
          .map((w: string) => w.replace(/[^a-z0-9]/g, ""))
          .filter((w: string) => w.length > 0 && !STOPWORDS.has(w)),
      );

      const shared = new Set<string>(
        [...queryTokens].filter((w: string) => specTokens.has(w)),
      );
      const smaller = Math.min(queryTokens.size, specTokens.size);
      const lexical = smaller > 0 ? shared.size / smaller : 0.0;

      // Cosine Intent calculations
      const iv = selectedSpecMath.intent_vec;
      const dot_i = dotProduct(q, iv);
      const mag_q = magnitude(q);
      const mag_i = magnitude(iv);
      const cos_intent = mag_q && mag_i ? dot_i / (mag_q * mag_i) : 0.0;

      // Cosine Title calculations
      const tv = selectedSpecMath.title_vec;
      const has_tv = tv !== null;
      const dot_t = tv ? dotProduct(q, tv) : dot_i;
      const mag_t = tv ? magnitude(tv) : mag_i;
      const cos_title = mag_q && mag_t ? dot_t / (mag_q * mag_t) : 0.0;

      // Semantic Blend
      const sem =
        semTitleWeight * cos_title + (1 - semTitleWeight) * cos_intent;
      const combined = Math.max(lexical, sem);

      // Cross-App Pattern calculations
      const pv = selectedSpecMath.pattern_vec;
      const dot_p = pv ? dotProduct(qp, pv) : 0.0;
      const mag_qp = magnitude(qp);
      const mag_p = pv ? magnitude(pv) : 0.0;
      const cos_pattern = mag_qp && mag_p ? dot_p / (mag_qp * mag_p) : 0.0;

      return {
        queryTokens: [...queryTokens],
        specTokens: [...specTokens],
        shared: [...shared],
        smaller,
        lexical,
        dot_i,
        mag_q,
        mag_i,
        cos_intent,
        has_tv,
        dot_t,
        mag_t,
        cos_title,
        sem,
        combined,
        dot_p,
        mag_qp,
        mag_p,
        cos_pattern,
      };
    }
  }, [
    isRealDbMode,
    apiResult,
    selectedSpecMath,
    selectedResult,
    selectedScenario,
    semTitleWeight,
    scenarioInput,
  ]);

  // Concept vector mini component
  const VectorBar = ({
    vec,
    color = c.sapphire,
  }: {
    vec: number[] | null;
    color?: string;
  }) => {
    if (!vec) {
      return (
        <Text fontSize="11px" color={colors.subtext} fontStyle="italic">
          (No embedding / null)
        </Text>
      );
    }
    return (
      <HStack gap={1} width="100%">
        {vec.map((val, idx) => (
          <Box
            key={idx}
            flex={1}
            height="18px"
            bg={val > 0 ? color : isDark ? "white/5" : "gray.100"}
            borderRadius="sm"
            position="relative"
            title={`${CONCEPT_AXES[idx]}: ${val}`}
            opacity={val > 0 ? Math.min(0.2 + val * 0.8, 1) : 1}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {val > 0 && (
              <Text fontSize="8px" fontWeight="bold" color="white">
                {val}
              </Text>
            )}
          </Box>
        ))}
      </HStack>
    );
  };

  const handleAddSpec = () => {
    if (!newSpecTitle.trim()) return;
    const newSpec: Spec = {
      id: `spec-${Date.now()}`,
      app: newSpecApp,
      title: newSpecTitle,
      outcome: newSpecOutcome,
      title_vec: [...newSpecIntentVec], // let's align title vector same as intent vec
      intent_vec: [...newSpecIntentVec],
      pattern_vec: [...newSpecIntentVec],
    };
    setKnowledgeBase((prev) => [...prev, newSpec]);
    setNewSpecTitle("");
  };

  const handleDeleteSpec = (id: string) => {
    setKnowledgeBase((prev) => prev.filter((s) => s.id !== id));
  };

  const handleAddScenario = () => {
    if (!newScenarioName.trim()) return;
    const newSc: Scenario = {
      id: `sc-${Date.now()}`,
      name: newScenarioName,
      q: [...newScenarioQ],
      qp: [...newScenarioQ],
    };
    setScenarios((prev) => [...prev, newSc]);
    setNewScenarioName("");
  };

  const handleDeleteScenario = (id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <Box w="100%" color={colors.text}>
      {/* Page Header */}
      <Flex
        align="center"
        justify="space-between"
        mb={5}
        flexWrap="wrap"
        gap={3}
      >
        <VStack align="start" gap={1}>
          <HStack gap={2}>
            <Workflow size={22} color={isDark ? c.sapphire : "#1d4ed8"} />
            <Heading size="md" fontWeight="bold">
              Knowledge-Layer Matching Simulator
            </Heading>
          </HStack>
          <Text fontSize="xs" color={colors.subtext}>
            Interactive simulator modeling app-scoped (in-app) reuse and global
            (cross-app) suggestions.
          </Text>
        </VStack>
        <HStack gap={3} flexWrap="wrap">
          {/* Mode Switcher */}
          <Box
            bg={colors.cardBg}
            border="1px solid"
            borderColor={colors.border}
            borderRadius="lg"
            p="2px"
            display="flex"
            gap={1}
          >
            <Button
              size="xs"
              variant={!isRealDbMode ? "solid" : "ghost"}
              bg={
                !isRealDbMode
                  ? isDark
                    ? "white/10"
                    : "gray.200"
                  : "transparent"
              }
              color={!isRealDbMode ? colors.text : colors.subtext}
              onClick={() => setIsRealDbMode(false)}
              cursor="pointer"
              fontWeight="semibold"
              h="24px"
              px={3}
            >
              Mock Sandbox (9-Dim)
            </Button>
            <Button
              size="xs"
              variant={isRealDbMode ? "solid" : "ghost"}
              bg={
                isRealDbMode
                  ? isDark
                    ? "white/10"
                    : "gray.200"
                  : "transparent"
              }
              color={isRealDbMode ? colors.text : colors.subtext}
              onClick={() => setIsRealDbMode(true)}
              cursor="pointer"
              fontWeight="semibold"
              h="24px"
              px={3}
            >
              Real Database (384-Dim)
            </Button>
          </Box>

          <Button
            size="xs"
            variant="outline"
            borderColor={colors.border}
            onClick={handleReset}
            bg={colors.cardBg}
            cursor="pointer"
            _hover={{ bg: colors.rowHover }}
            h="28px"
          >
            <RotateCcw size={12} style={{ marginRight: 6 }} /> Reset All
          </Button>
        </HStack>
      </Flex>

      {/* Main Grid */}
      <Grid
        templateColumns={{ base: "1fr", xl: "380px 1fr" }}
        gap={6}
        width="100%"
      >
        {/* Left Side: Parameters, KB, Scenario Management */}
        <VStack align="stretch" gap={5}>
          {/* Card: Scenario Query Console */}
          {isRealDbMode && (
            <Box
              bg={colors.cardBg}
              border="1px solid"
              borderColor={colors.border}
              borderRadius="xl"
              p={4}
              shadow="sm"
            >
              <HStack mb={3} gap={2}>
                <Sparkles size={16} color={isDark ? c.sapphire : "#1d4ed8"} />
                <Heading
                  size="xs"
                  textTransform="uppercase"
                  letterSpacing="0.05em"
                >
                  Real DB Query Console
                </Heading>
              </HStack>

              <VStack gap={3} align="stretch" fontSize="xs">
                {/* Input: Test Scenario */}
                <Box>
                  <Text fontWeight="semibold" mb={1}>
                    Test Scenario Description:
                  </Text>
                  <Input
                    size="sm"
                    bg={colors.subBg}
                    borderColor={colors.border}
                    borderRadius="md"
                    placeholder="Describe the workflow (e.g. Add product to cart)..."
                    value={scenarioInput}
                    onChange={(e) => setScenarioInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        fetchRealDbPatterns();
                      }
                    }}
                  />
                </Box>

                {/* Input: Target App URL */}
                <Box>
                  <Flex justify="space-between" align="center" mb={1}>
                    <Text fontWeight="semibold">
                      Target App URL (Optional):
                    </Text>
                    {currentApp && (
                      <Text
                        as="span"
                        fontSize="9px"
                        color={colors.subtext}
                        cursor="pointer"
                        _hover={{ color: c.sapphire }}
                        onClick={() => setCurrentApp("")}
                      >
                        clear
                      </Text>
                    )}
                  </Flex>
                  <input
                    list="known-apps-mv"
                    value={currentApp}
                    onChange={(e) => setCurrentApp(e.target.value)}
                    placeholder="https://your-app.com (or select from DB)"
                    style={{
                      width: "100%",
                      height: "28px",
                      padding: "0 8px",
                      borderRadius: "6px",
                      border: `1px solid ${colors.border}`,
                      background: colors.subBg,
                      color: colors.text,
                      fontSize: "11px",
                      outline: "none",
                    }}
                  />
                  <datalist id="known-apps-mv">
                    {apps.map((a) => (
                      <option key={a.appId} value={a.appId}>
                        {a.appId.replace(/^https?:\/\//, "")} ({a.specCount}{" "}
                        specs)
                      </option>
                    ))}
                  </datalist>
                </Box>

                {/* Search Button */}
                <Button
                  size="xs"
                  colorPalette="blue"
                  onClick={fetchRealDbPatterns}
                  disabled={isLoadingPatterns || !scenarioInput.trim()}
                  cursor="pointer"
                >
                  {isLoadingPatterns
                    ? "Searching..."
                    : "Search & Match Database"}
                </Button>

                {/* Preset List */}
                <Box mt={2}>
                  <Text
                    fontSize="10px"
                    fontWeight="bold"
                    color={colors.subtext}
                    mb={1.5}
                    letterSpacing="0.05em"
                  >
                    PRESET SCENARIOS
                  </Text>
                  <Flex flexWrap="wrap" gap={1.5}>
                    {[
                      "Complete checkout",
                      "Add item to cart",
                      "Apply discount code",
                      "Track shipment status",
                      "Contact page scrolls smoothly",
                    ].map((pText) => (
                      <Box
                        key={pText}
                        as="button"
                        onClick={() => {
                          setScenarioInput(pText);
                          // Auto trigger search with new text
                          setTimeout(() => {
                            fetchRealDbPatterns();
                          }, 100);
                        }}
                        px={2}
                        py={1}
                        borderRadius="md"
                        fontSize="10px"
                        bg={colors.subBg}
                        color={colors.subtext}
                        border="1px solid"
                        borderColor={colors.border}
                        cursor="pointer"
                        _hover={{
                          bg: colors.rowHover,
                          color: colors.text,
                          borderColor: c.sapphire,
                        }}
                        textAlign="left"
                      >
                        {pText}
                      </Box>
                    ))}
                  </Flex>
                </Box>
              </VStack>
            </Box>
          )}

          {/* Card: Simulation Parameters */}
          <Box
            bg={colors.cardBg}
            border="1px solid"
            borderColor={colors.border}
            borderRadius="xl"
            p={4}
            shadow="sm"
          >
            <HStack mb={4} gap={2}>
              <Sliders size={16} color={isDark ? c.sapphire : "#1d4ed8"} />
              <Heading
                size="xs"
                textTransform="uppercase"
                letterSpacing="0.05em"
              >
                Simulation Constants
              </Heading>
            </HStack>

            <VStack gap={4} align="stretch" fontSize="xs">
              {/* Parameter: Current App */}
              {!isRealDbMode && (
                <Box>
                  <Text fontWeight="semibold" mb={1}>
                    Current App (Origin):
                  </Text>
                  <Input
                    size="xs"
                    bg={colors.subBg}
                    borderColor={colors.border}
                    value={currentApp}
                    onChange={(e) => setCurrentApp(e.target.value)}
                  />
                </Box>
              )}

              {/* Slider: In-App Lexical Threshold */}
              <Box>
                <Flex justify="space-between" mb={1}>
                  <Text fontWeight="semibold">Lexical Reuse Threshold:</Text>
                  <Text
                    fontWeight="bold"
                    color={isDark ? c.sapphire : "#1d4ed8"}
                  >
                    {reuseThreshold.toFixed(2)}
                  </Text>
                </Flex>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  style={{ width: "100%" }}
                  value={reuseThreshold}
                  onChange={(e) =>
                    setReuseThreshold(parseFloat(e.target.value))
                  }
                />
              </Box>

              {/* Slider: In-App Semantic Reuse Threshold */}
              <Box>
                <Flex justify="space-between" mb={1}>
                  <Text fontWeight="semibold">Semantic Reuse Threshold:</Text>
                  <Text
                    fontWeight="bold"
                    color={isDark ? c.sapphire : "#1d4ed8"}
                  >
                    {semReuse.toFixed(2)}
                  </Text>
                </Flex>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  style={{ width: "100%" }}
                  value={semReuse}
                  onChange={(e) => setSemReuse(parseFloat(e.target.value))}
                />
              </Box>

              {/* Slider: Title Weight in Blend */}
              <Box>
                <Flex justify="space-between" mb={1}>
                  <Text fontWeight="semibold">Title-only weight in blend:</Text>
                  <Text
                    fontWeight="bold"
                    color={isDark ? c.sapphire : "#1d4ed8"}
                  >
                    {semTitleWeight.toFixed(2)}
                  </Text>
                </Flex>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  style={{ width: "100%" }}
                  value={semTitleWeight}
                  onChange={(e) =>
                    setSemTitleWeight(parseFloat(e.target.value))
                  }
                />
              </Box>

              {/* Feature Switch: Global Patterns */}
              <Separator borderColor={colors.border} />

              <Flex align="center" justify="space-between">
                <Text fontWeight="semibold">Cross-App Patterns:</Text>
                <Box
                  as="button"
                  onClick={() =>
                    setGlobalPatternsEnabled(!globalPatternsEnabled)
                  }
                  w="38px"
                  h="20px"
                  borderRadius="full"
                  bg={
                    globalPatternsEnabled
                      ? isDark
                        ? "blue.400"
                        : "blue.600"
                      : isDark
                        ? "white/10"
                        : "gray.300"
                  }
                  p="2px"
                  cursor="pointer"
                  display="flex"
                  alignItems="center"
                  justifyContent={
                    globalPatternsEnabled ? "flex-end" : "flex-start"
                  }
                  transition="background 0.2s"
                  border="none"
                >
                  <Box
                    w="16px"
                    h="16px"
                    borderRadius="full"
                    bg="white"
                    shadow="sm"
                  />
                </Box>
              </Flex>

              {globalPatternsEnabled && (
                <>
                  {/* Slider: Cross-App Relevance Floor */}
                  <Box>
                    <Flex justify="space-between" mb={1}>
                      <Text fontWeight="semibold">
                        Cross-App Relevance Floor:
                      </Text>
                      <Text
                        fontWeight="bold"
                        color={isDark ? c.peach : "#dd6b20"}
                      >
                        {patternRelevance.toFixed(2)}
                      </Text>
                    </Flex>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      style={{ width: "100%" }}
                      value={patternRelevance}
                      onChange={(e) =>
                        setPatternRelevance(parseFloat(e.target.value))
                      }
                    />
                  </Box>

                  {/* Slider: Cross-App Budget */}
                  <Box>
                    <Flex justify="space-between" mb={1}>
                      <Text fontWeight="semibold">Pattern Budget Limit:</Text>
                      <Text
                        fontWeight="bold"
                        color={isDark ? c.peach : "#dd6b20"}
                      >
                        {patternBudget} hints
                      </Text>
                    </Flex>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="1"
                      style={{ width: "100%" }}
                      value={patternBudget}
                      onChange={(e) =>
                        setPatternBudget(parseInt(e.target.value))
                      }
                    />
                  </Box>

                  {/* Slider: Cross-App K matches */}
                  <Box>
                    <Flex justify="space-between" mb={1}>
                      <Text fontWeight="semibold">
                        Matches per scenario (K):
                      </Text>
                      <Text
                        fontWeight="bold"
                        color={isDark ? c.peach : "#dd6b20"}
                      >
                        {patternK}
                      </Text>
                    </Flex>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      style={{ width: "100%" }}
                      value={patternK}
                      onChange={(e) => setPatternK(parseInt(e.target.value))}
                    />
                  </Box>
                </>
              )}
            </VStack>
          </Box>

          {!isRealDbMode && (
            <>
              {/* Sub Navigation for Data Management */}
              <Box
                bg={colors.cardBg}
                border="1px solid"
                borderColor={colors.border}
                borderRadius="xl"
                p={3}
                shadow="sm"
              >
                <HStack gap={1} width="100%">
                  <Button
                    flex={1}
                    size="xs"
                    variant={activeSubTab === "visualizer" ? "solid" : "ghost"}
                    bg={
                      activeSubTab === "visualizer"
                        ? isDark
                          ? "white/10"
                          : "gray.200"
                        : "transparent"
                    }
                    color={colors.text}
                    onClick={() => setActiveSubTab("visualizer")}
                    cursor="pointer"
                  >
                    Output log
                  </Button>
                  <Button
                    flex={1}
                    size="xs"
                    variant={
                      activeSubTab === "knowledge-base" ? "solid" : "ghost"
                    }
                    bg={
                      activeSubTab === "knowledge-base"
                        ? isDark
                          ? "white/10"
                          : "gray.200"
                        : "transparent"
                    }
                    color={colors.text}
                    onClick={() => setActiveSubTab("knowledge-base")}
                    cursor="pointer"
                  >
                    Specs ({knowledgeBase.length})
                  </Button>
                  <Button
                    flex={1}
                    size="xs"
                    variant={activeSubTab === "scenarios" ? "solid" : "ghost"}
                    bg={
                      activeSubTab === "scenarios"
                        ? isDark
                          ? "white/10"
                          : "gray.200"
                        : "transparent"
                    }
                    color={colors.text}
                    onClick={() => setActiveSubTab("scenarios")}
                    cursor="pointer"
                  >
                    Scenarios ({scenarios.length})
                  </Button>
                </HStack>
              </Box>

              {/* Render Active Sub Tab Content */}
              {activeSubTab === "knowledge-base" && (
                <Box
                  bg={colors.cardBg}
                  border="1px solid"
                  borderColor={colors.border}
                  borderRadius="xl"
                  p={4}
                  shadow="sm"
                >
                  <Heading size="xs" mb={3}>
                    Add Spec to DB
                  </Heading>
                  <VStack gap={3} align="stretch" fontSize="xs">
                    <Box>
                      <Text mb={1}>App Origin:</Text>
                      <Input
                        size="xs"
                        value={newSpecApp}
                        onChange={(e) => setNewSpecApp(e.target.value)}
                      />
                    </Box>
                    <Box>
                      <Text mb={1}>Title:</Text>
                      <Input
                        size="xs"
                        placeholder="e.g. Apply coupons"
                        value={newSpecTitle}
                        onChange={(e) => setNewSpecTitle(e.target.value)}
                      />
                    </Box>
                    <Box>
                      <Text mb={1}>Outcome:</Text>
                      <select
                        value={newSpecOutcome}
                        onChange={(e) =>
                          setNewSpecOutcome(e.target.value as any)
                        }
                        style={{
                          width: "100%",
                          fontSize: "12px",
                          padding: "4px",
                          background: colors.subBg,
                          border: `1px solid ${colors.border}`,
                          color: colors.text,
                        }}
                      >
                        <option value="passed">Passed</option>
                        <option value="healed">Healed</option>
                        <option value="failed">Failed</option>
                      </select>
                    </Box>
                    <Box>
                      <Text mb={1} fontWeight="semibold">
                        Concept Embedding (9 axes):
                      </Text>
                      <Grid templateColumns="repeat(3, 1fr)" gap={2}>
                        {CONCEPT_AXES.map((label, idx) => (
                          <Box key={idx}>
                            <Text fontSize="8px" truncate title={label}>
                              {label}
                            </Text>
                            <Input
                              size="xs"
                              type="number"
                              step="0.1"
                              value={newSpecIntentVec[idx]}
                              onChange={(e) => {
                                const newVec = [...newSpecIntentVec];
                                newVec[idx] = parseFloat(e.target.value) || 0;
                                setNewSpecIntentVec(newVec);
                              }}
                            />
                          </Box>
                        ))}
                      </Grid>
                    </Box>
                    <Button
                      size="xs"
                      colorPalette="blue"
                      onClick={handleAddSpec}
                      cursor="pointer"
                    >
                      <Plus size={12} style={{ marginRight: 6 }} /> Add Spec
                    </Button>
                  </VStack>

                  <Separator borderColor={colors.border} my={4} />

                  <Heading size="xs" mb={3}>
                    Existing Database Specs
                  </Heading>
                  <VStack
                    gap={2}
                    align="stretch"
                    maxH="250px"
                    overflowY="auto"
                    pr={1}
                  >
                    {knowledgeBase.map((spec) => (
                      <Flex
                        key={spec.id}
                        p={2}
                        bg={colors.subBg}
                        borderRadius="md"
                        align="center"
                        justify="space-between"
                        fontSize="11px"
                      >
                        <VStack
                          align="start"
                          gap={0}
                          flex={1}
                          overflow="hidden"
                        >
                          <Text fontWeight="bold" truncate maxW="100%">
                            {spec.title}
                          </Text>
                          <Text fontSize="9px" color={colors.subtext}>
                            {spec.app} · {spec.outcome}
                          </Text>
                          <Box w="100%" mt={1}>
                            <VectorBar
                              vec={spec.intent_vec}
                              color={
                                spec.app === currentApp ? c.sapphire : c.peach
                              }
                            />
                          </Box>
                        </VStack>
                        <IconButton
                          aria-label="Delete"
                          variant="ghost"
                          size="xs"
                          colorPalette="red"
                          onClick={() => handleDeleteSpec(spec.id)}
                          cursor="pointer"
                        >
                          <Trash2 size={12} />
                        </IconButton>
                      </Flex>
                    ))}
                  </VStack>
                </Box>
              )}

              {activeSubTab === "scenarios" && (
                <Box
                  bg={colors.cardBg}
                  border="1px solid"
                  borderColor={colors.border}
                  borderRadius="xl"
                  p={4}
                  shadow="sm"
                >
                  <Heading size="xs" mb={3}>
                    Add Scenario
                  </Heading>
                  <VStack gap={3} align="stretch" fontSize="xs">
                    <Box>
                      <Text mb={1}>Scenario Title:</Text>
                      <Input
                        size="xs"
                        placeholder="e.g. Verify cart tracking"
                        value={newScenarioName}
                        onChange={(e) => setNewScenarioName(e.target.value)}
                      />
                    </Box>
                    <Box>
                      <Text mb={1} fontWeight="semibold">
                        Title Vector (9 axes):
                      </Text>
                      <Grid templateColumns="repeat(3, 1fr)" gap={2}>
                        {CONCEPT_AXES.map((label, idx) => (
                          <Box key={idx}>
                            <Text fontSize="8px" truncate title={label}>
                              {label}
                            </Text>
                            <Input
                              size="xs"
                              type="number"
                              step="0.1"
                              value={newScenarioQ[idx]}
                              onChange={(e) => {
                                const newVec = [...newScenarioQ];
                                newVec[idx] = parseFloat(e.target.value) || 0;
                                setNewScenarioQ(newVec);
                              }}
                            />
                          </Box>
                        ))}
                      </Grid>
                    </Box>
                    <Button
                      size="xs"
                      colorPalette="blue"
                      onClick={handleAddScenario}
                      cursor="pointer"
                    >
                      <Plus size={12} style={{ marginRight: 6 }} /> Add Scenario
                    </Button>
                  </VStack>

                  <Separator borderColor={colors.border} my={4} />

                  <Heading size="xs" mb={3}>
                    Active Scenarios
                  </Heading>
                  <VStack
                    gap={2}
                    align="stretch"
                    maxH="250px"
                    overflowY="auto"
                    pr={1}
                  >
                    {scenarios.map((sc) => (
                      <Flex
                        key={sc.id}
                        p={2}
                        bg={colors.subBg}
                        borderRadius="md"
                        align="center"
                        justify="space-between"
                        fontSize="11px"
                      >
                        <VStack
                          align="start"
                          gap={0}
                          flex={1}
                          overflow="hidden"
                        >
                          <Text fontWeight="bold" truncate maxW="100%">
                            {sc.name}
                          </Text>
                          <Box w="100%" mt={1}>
                            <VectorBar vec={sc.q} color={c.sapphire} />
                          </Box>
                        </VStack>
                        <IconButton
                          aria-label="Delete"
                          variant="ghost"
                          size="xs"
                          colorPalette="red"
                          onClick={() => handleDeleteScenario(sc.id)}
                          cursor="pointer"
                        >
                          <Trash2 size={12} />
                        </IconButton>
                      </Flex>
                    ))}
                  </VStack>
                </Box>
              )}

              {/* Render concept index legend */}
              <Box
                bg={colors.cardBg}
                border="1px solid"
                borderColor={colors.border}
                borderRadius="xl"
                p={4}
                shadow="sm"
              >
                <HStack mb={2} gap={2}>
                  <Info size={14} color={colors.subtext} />
                  <Heading
                    size="xs"
                    textTransform="uppercase"
                    letterSpacing="0.05em"
                  >
                    Concept Axes Index
                  </Heading>
                </HStack>
                <VStack align="stretch" gap={1.5} fontSize="9px">
                  {CONCEPT_AXES.map((label, idx) => (
                    <HStack key={idx} justify="space-between">
                      <HStack gap={1}>
                        <Box
                          w="6px"
                          h="6px"
                          bg={c.sapphire}
                          borderRadius="2px"
                          opacity={0.3 + (idx / 9) * 0.7}
                        />
                        <Text fontWeight="semibold" color={colors.subtext}>
                          Index {idx}:
                        </Text>
                      </HStack>
                      <Text color={colors.text} fontWeight="medium">
                        {label}
                      </Text>
                    </HStack>
                  ))}
                </VStack>
              </Box>
            </>
          )}
        </VStack>

        {/* Right Side: Simulation logs & formula visualizer */}
        <VStack align="stretch" gap={5} overflow="hidden">
          {/* Card: Live Simulation Run */}
          {!isRealDbMode && (
            <Box
              bg={colors.cardBg}
              border="1px solid"
              borderColor={colors.border}
              borderRadius="xl"
              p={4}
              shadow="sm"
            >
              <HStack justify="space-between" mb={3} flexWrap="wrap">
                <HStack gap={2}>
                  <Play size={16} color={isDark ? c.green : "#16a34a"} />
                  <Heading size="sm">Simulation Scenario Outputs</Heading>
                </HStack>
                <Badge colorPalette="green" variant="subtle" fontSize="9px">
                  {scenarios.length} scenarios mapped
                </Badge>
              </HStack>

              <VStack align="stretch" gap={2}>
                {simulationResults.map((res) => {
                  const isSelected = res.id === selectedScenarioId;
                  return (
                    <Flex
                      key={res.id}
                      p={3}
                      bg={
                        isSelected
                          ? isDark
                            ? "white/10"
                            : "gray.200"
                          : colors.subBg
                      }
                      borderRadius="lg"
                      align="center"
                      justify="space-between"
                      cursor="pointer"
                      transition="all 0.2s"
                      _hover={{ bg: isSelected ? undefined : colors.rowHover }}
                      onClick={() => setSelectedScenarioId(res.id)}
                      borderLeft="3px solid"
                      borderLeftColor={
                        res.decision === "REUSE"
                          ? "#1d4ed8"
                          : res.globalHint
                            ? "#e5c890"
                            : "#e78284"
                      }
                    >
                      <VStack
                        align="start"
                        gap={0.5}
                        overflow="hidden"
                        flex={1}
                      >
                        <Text
                          fontWeight="semibold"
                          fontSize="xs"
                          truncate
                          maxW="100%"
                        >
                          "{res.name}"
                        </Text>
                        <Text
                          fontSize="9px"
                          color={colors.subtext}
                          truncate
                          maxW="100%"
                        >
                          {res.decision === "REUSE"
                            ? `Reuses "${res.bestInApp?.title}"`
                            : res.globalHint
                              ? `New → Cross-App Hint: "${res.globalHint.title}" (${res.globalHint.app})`
                              : "New → Cold Generate (No cross-app matches)"}
                        </Text>
                      </VStack>

                      <HStack gap={2} flexShrink={0}>
                        {res.decision === "REUSE" ? (
                          <Badge
                            colorPalette="blue"
                            variant="solid"
                            fontSize="10px"
                          >
                            REUSE
                          </Badge>
                        ) : (
                          <Badge
                            colorPalette="red"
                            variant="subtle"
                            fontSize="10px"
                          >
                            NEW
                          </Badge>
                        )}
                        {res.globalHint && (
                          <Badge
                            colorPalette="yellow"
                            variant="solid"
                            fontSize="10px"
                          >
                            HINT BORROWED
                          </Badge>
                        )}
                      </HStack>
                    </Flex>
                  );
                })}
              </VStack>
            </Box>
          )}

          {isRealDbMode && !apiResult && (
            <Box
              bg={colors.cardBg}
              border="1px dashed"
              borderColor={colors.border}
              borderRadius="xl"
              p={8}
              textAlign="center"
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              minH="350px"
              gap={3}
            >
              <Box
                p={3}
                borderRadius="full"
                bg={isDark ? "white/5" : "gray.100"}
              >
                <Database size={32} color={isDark ? c.sapphire : "#1d4ed8"} />
              </Box>
              <Heading size="md" color={colors.text}>
                Real Database Matching Analyzer
              </Heading>
              <Text
                fontSize="xs"
                color={colors.subtext}
                maxW="450px"
                lineHeight="1.5"
              >
                Run semantic matching and lexical overlap calculations against
                live test specifications stored in your database. Enter a test
                scenario query and optional Target URL to view detailed scoring
                formulas in real-time.
              </Text>
              <Button
                size="xs"
                colorPalette="blue"
                onClick={fetchRealDbPatterns}
                disabled={isLoadingPatterns || !scenarioInput.trim()}
                mt={2}
                cursor="pointer"
              >
                <Play size={12} style={{ marginRight: 6 }} /> Run Initial Match
                Simulation
              </Button>
            </Box>
          )}

          {isRealDbMode && selectedResult && (
            <Box
              bg={colors.cardBg}
              border="1px solid"
              borderColor={colors.border}
              borderRadius="xl"
              p={4}
              shadow="sm"
            >
              <Heading
                size="xs"
                textTransform="uppercase"
                letterSpacing="0.05em"
                mb={3}
                color={colors.subtext}
              >
                Decision Verdict & Pipeline Flow
              </Heading>

              <Grid
                templateColumns={{ base: "1fr", md: "1fr auto 1fr" }}
                gap={4}
                p={3}
                bg={colors.subBg}
                borderRadius="lg"
                border="1px solid"
                borderColor={colors.border}
              >
                {/* Panel 1: Target URL context */}
                <VStack align="start" gap={1} fontSize="xs">
                  <Text fontWeight="semibold" color={colors.text}>
                    1. Input Context
                  </Text>
                  <Text fontSize="10px" color={colors.subtext} mb={2}>
                    Target App:{" "}
                    <strong>
                      {currentApp
                        ? currentApp.replace(/^https?:\/\//, "")
                        : "None"}
                    </strong>
                  </Text>
                  {currentApp ? (
                    <Badge colorPalette="blue" size="xs">
                      In-App Analysis Checked
                    </Badge>
                  ) : (
                    <Badge colorPalette="yellow" size="xs">
                      Cross-App Direct Routing
                    </Badge>
                  )}
                </VStack>

                {/* Arrow */}
                <Flex
                  align="center"
                  justify="center"
                  display={{ base: "none", md: "flex" }}
                >
                  <ArrowRight size={16} color={colors.subtext} />
                </Flex>

                {/* Panel 2: In-App Reuse Check */}
                <VStack
                  align="start"
                  gap={1}
                  fontSize="xs"
                  opacity={currentApp ? 1 : 0.4}
                >
                  <Text fontWeight="semibold" color={colors.text}>
                    2. In-App Memory check
                  </Text>
                  {currentApp ? (
                    selectedResult.bestInApp ? (
                      <>
                        <Text fontSize="10px" color={colors.subtext}>
                          Best local score:{" "}
                          <strong>
                            {selectedResult.bestInApp.combined.toFixed(3)}
                          </strong>
                        </Text>
                        <Badge
                          colorPalette={
                            selectedResult.decision === "REUSE"
                              ? "green"
                              : "red"
                          }
                          size="xs"
                        >
                          {selectedResult.decision === "REUSE"
                            ? `REUSE Clears Bar (>= ${Math.min(reuseThreshold, semReuse)})`
                            : `Below Reuse Bars (< ${Math.min(reuseThreshold, semReuse)})`}
                        </Badge>
                      </>
                    ) : (
                      <>
                        <Text fontSize="10px" color={colors.subtext}>
                          No prior local specifications found.
                        </Text>
                        <Badge colorPalette="red" size="xs">
                          No Memory
                        </Badge>
                      </>
                    )
                  ) : (
                    <>
                      <Text fontSize="10px" color={colors.subtext}>
                        Skipped (no target URL provided).
                      </Text>
                      <Badge colorPalette="gray" size="xs">
                        Skipped
                      </Badge>
                    </>
                  )}
                </VStack>

                {/* Line breaks/dividers for mobile */}
                <Separator
                  display={{ base: "block", md: "none" }}
                  borderColor={colors.border}
                />

                {/* Arrow */}
                <Flex
                  align="center"
                  justify="center"
                  display={{ base: "none", md: "flex" }}
                  opacity={selectedResult.decision === "NEW" ? 1 : 0.3}
                >
                  <ArrowRight size={16} color={colors.subtext} />
                </Flex>

                {/* Panel 3: Cross-App suggestion */}
                <VStack
                  align="start"
                  gap={1}
                  fontSize="xs"
                  opacity={selectedResult.decision === "NEW" ? 1 : 0.4}
                >
                  <Text fontWeight="semibold" color={colors.text}>
                    3. Cross-App pattern transfer
                  </Text>
                  {selectedResult.decision === "NEW" ? (
                    selectedResult.globalHint ? (
                      <>
                        <Text fontSize="10px" color={colors.subtext}>
                          Best pattern:{" "}
                          <strong>{selectedResult.globalHint.title}</strong>
                        </Text>
                        <Badge colorPalette="green" size="xs">
                          Hint Borrowed (score:{" "}
                          {selectedResult.globalHint.score.toFixed(3)})
                        </Badge>
                      </>
                    ) : (
                      <>
                        <Text fontSize="10px" color={colors.subtext}>
                          No pattern similarity &gt;= {patternRelevance}.
                        </Text>
                        <Badge colorPalette="gray" size="xs">
                          Cold Generation
                        </Badge>
                      </>
                    )
                  ) : (
                    <>
                      <Text fontSize="10px" color={colors.subtext}>
                        Skipped (local reuse succeeded).
                      </Text>
                      <Badge colorPalette="gray" size="xs">
                        Skipped
                      </Badge>
                    </>
                  )}
                </VStack>
              </Grid>

              {/* Summary Sentence Banner */}
              <Box
                mt={3}
                p={3}
                bg={
                  selectedResult.decision === "REUSE"
                    ? "rgba(46,194,113,0.1)"
                    : selectedResult.globalHint
                      ? "rgba(229,200,144,0.15)"
                      : "rgba(239,68,68,0.06)"
                }
                border="1px solid"
                borderColor={
                  selectedResult.decision === "REUSE"
                    ? "green.600"
                    : selectedResult.globalHint
                      ? "yellow.600"
                      : "red.600"
                }
                borderRadius="md"
              >
                <HStack gap={2} align="start">
                  <Box mt="2px">
                    {selectedResult.decision === "REUSE" ? (
                      <CheckCircle size={14} color="#16a34a" />
                    ) : selectedResult.globalHint ? (
                      <Sparkles size={14} color="#dd6b20" />
                    ) : (
                      <Info size={14} color="#ef4444" />
                    )}
                  </Box>
                  <VStack align="start" gap={0.5}>
                    <Text fontSize="11px" fontWeight="bold" color={colors.text}>
                      Verdict:{" "}
                      {selectedResult.decision === "REUSE"
                        ? "Local Specification Reuse"
                        : selectedResult.globalHint
                          ? "Cross-Application Hint Borrowed"
                          : "Cold Script Generation"}
                    </Text>
                    <Text
                      fontSize="10.5px"
                      color={colors.subtext}
                      lineHeight="1.4"
                    >
                      {selectedResult.decision === "REUSE"
                        ? `Clears bar on target URL. The AI engine copies the passing spec "${selectedResult.bestInApp?.title}" forward, skipping execution of new tests.`
                        : selectedResult.globalHint
                          ? `No local match found. The AI engine borrows the workflow skeleton of "${selectedResult.globalHint.title}" (from app origin ${selectedResult.globalHint.app}) to compile a fresh script for the target URL.`
                          : `No local match and no eligible cross-app patterns clear the relevance floor of ${patternRelevance}. A fresh test script will be generated from scratch.`}
                    </Text>
                  </VStack>
                </HStack>
              </Box>
            </Box>
          )}

          {/* Card: Detailed Calculation Breakdown */}
          {selectedResult && (
            <Box
              bg={colors.cardBg}
              border="1px solid"
              borderColor={colors.border}
              borderRadius="xl"
              p={5}
              shadow="sm"
            >
              <VStack align="stretch" gap={4}>
                {/* Section Header */}
                <Flex
                  align="center"
                  justify="space-between"
                  flexWrap="wrap"
                  gap={2}
                >
                  <VStack align="start" gap={0}>
                    <HStack gap={2}>
                      <Calculator
                        size={18}
                        color={isDark ? c.sapphire : "#1d4ed8"}
                      />
                      <Heading size="sm">
                        Math Breakdown: "{selectedResult.name}"
                      </Heading>
                    </HStack>
                    <Text fontSize="10px" color={colors.subtext}>
                      Real-time equations evaluated step-by-step.
                    </Text>
                  </VStack>
                  <HStack gap={2}>
                    <Badge
                      colorPalette={
                        selectedResult.decision === "REUSE" ? "blue" : "red"
                      }
                      variant="solid"
                    >
                      Decision: {selectedResult.decision}
                    </Badge>
                    {selectedResult.globalHint && (
                      <Badge colorPalette="yellow" variant="solid">
                        Hint Borrowed
                      </Badge>
                    )}
                  </HStack>
                </Flex>

                {/* Dynamic Mathematical Formulation Details */}
                {selectedSpecMath && mathBreakdown ? (
                  <Box
                    p={4}
                    bg={colors.subBg}
                    borderRadius="md"
                    border="1px solid"
                    borderColor={colors.border}
                  >
                    <Flex
                      justify="space-between"
                      align="center"
                      mb={3}
                      borderBottom="1px solid"
                      borderColor={colors.border}
                      pb={2}
                    >
                      <VStack align="start" gap={0}>
                        <Text
                          fontSize="11px"
                          fontWeight="bold"
                          color={colors.text}
                          textTransform="uppercase"
                          letterSpacing="0.05em"
                        >
                          Live Math Engine Inspection
                        </Text>
                        <Text fontSize="10px" color={colors.subtext}>
                          Evaluating vs:{" "}
                          <strong>"{selectedSpecMath.title}"</strong> (
                          {selectedSpecMath.app === currentApp
                            ? "Local Spec"
                            : "Global Spec"}
                          )
                        </Text>
                      </VStack>
                      <Badge
                        colorPalette={
                          selectedSpecMath.app === currentApp
                            ? "blue"
                            : "yellow"
                        }
                        size="xs"
                      >
                        {selectedSpecMath.app === currentApp
                          ? "In-App Match"
                          : "Cross-App Match"}
                      </Badge>
                    </Flex>

                    <VStack align="stretch" gap={4} fontSize="11px">
                      {/* Formula 1: Lexical Overlap */}
                      {selectedSpecMath.app === currentApp && (
                        <Box
                          borderLeft="2px solid"
                          borderColor="cyan.400"
                          pl={2}
                        >
                          <Text fontWeight="semibold" color={colors.text}>
                            1. Lexical Overlap Coefficient
                          </Text>
                          <Text fontSize="10px" color={colors.subtext} mb={1}>
                            Formula:{" "}
                            <code>overlap(A, B) = |A ∩ B| / min(|A|, |B|)</code>
                          </Text>
                          <VStack
                            align="stretch"
                            gap={1}
                            pl={2}
                            fontSize="10.5px"
                            fontFamily="mono"
                            bg={isDark ? "white/5" : "gray.50"}
                            p={2}
                            borderRadius="sm"
                          >
                            <Text>
                              • Query tokens (A) ={" "}
                              {`{${mathBreakdown.queryTokens.map((t) => `'${t}'`).join(", ")}}`}{" "}
                              (size: {mathBreakdown.queryTokens.length})
                            </Text>
                            <Text>
                              • Spec tokens (B) ={" "}
                              {`{${mathBreakdown.specTokens.map((t) => `'${t}'`).join(", ")}}`}{" "}
                              (size: {mathBreakdown.specTokens.length})
                            </Text>
                            <Text>
                              • Shared tokens (A ∩ B) ={" "}
                              {`{${mathBreakdown.shared.map((t) => `'${t}'`).join(", ")}}`}{" "}
                              (size: {mathBreakdown.shared.length})
                            </Text>
                            <Text>
                              • Min size = min(
                              {mathBreakdown.queryTokens.length},{" "}
                              {mathBreakdown.specTokens.length}) ={" "}
                              {mathBreakdown.smaller}
                            </Text>
                            <Text
                              fontWeight="bold"
                              color={isDark ? "cyan.300" : "cyan.800"}
                            >
                              • overlap = {mathBreakdown.shared.length} /{" "}
                              {mathBreakdown.smaller} ={" "}
                              {mathBreakdown.lexical.toFixed(3)}
                            </Text>
                          </VStack>
                        </Box>
                      )}

                      {/* Formula 2: Cosine Intent (Title+Steps) */}
                      {selectedSpecMath.app === currentApp && (
                        <Box
                          borderLeft="2px solid"
                          borderColor="teal.400"
                          pl={2}
                        >
                          <Text fontWeight="semibold" color={colors.text}>
                            2. Cosine Similarity (Intent - Title+Steps Vector)
                          </Text>
                          <Text fontSize="10px" color={colors.subtext} mb={1}>
                            Formula:{" "}
                            <code>
                              cos(q, intent) = (q · intent) / (|q| * |intent|)
                            </code>
                          </Text>
                          <VStack
                            align="stretch"
                            gap={1}
                            pl={2}
                            fontSize="10.5px"
                            fontFamily="mono"
                            bg={isDark ? "white/5" : "gray.50"}
                            p={2}
                            borderRadius="sm"
                          >
                            {selectedScenario ? (
                              <>
                                <Text>
                                  • q (Scenario vector) = [
                                  {selectedScenario?.q.join(", ")}]
                                </Text>
                                <Text>
                                  • intent (Spec intent vector) = [
                                  {selectedSpecMath.intent_vec.join(", ")}]
                                </Text>
                                <Text>
                                  • q · intent (Dot product) ={" "}
                                  {selectedScenario?.q
                                    .map(
                                      (x: number, idx: number) =>
                                        `${x}*${selectedSpecMath.intent_vec[idx] || 0}`,
                                    )
                                    .join(" + ")}{" "}
                                  = {mathBreakdown.dot_i.toFixed(3)}
                                </Text>
                                <Text>
                                  • |q| (Query magnitude) = √(
                                  {selectedScenario?.q
                                    .map((x: number) => `${x}²`)
                                    .join(" + ")}
                                  ) = {mathBreakdown.mag_q.toFixed(3)}
                                </Text>
                                <Text>
                                  • |intent| (Intent magnitude) = √(
                                  {selectedSpecMath.intent_vec
                                    .map((x: number) => `${x}²`)
                                    .join(" + ")}
                                  ) = {mathBreakdown.mag_i.toFixed(3)}
                                </Text>
                                <Text
                                  fontWeight="bold"
                                  color={isDark ? "teal.300" : "teal.800"}
                                >
                                  • cos(q, intent) ={" "}
                                  {mathBreakdown.dot_i.toFixed(3)} / (
                                  {mathBreakdown.mag_q.toFixed(3)} *{" "}
                                  {mathBreakdown.mag_i.toFixed(3)}) ={" "}
                                  {mathBreakdown.cos_intent.toFixed(3)}
                                </Text>
                              </>
                            ) : (
                              <>
                                <Text color="cyan.500" fontStyle="italic">
                                  • [Server Model] Calculated via 384-Dim dense
                                  semantic embeddings.
                                </Text>
                                <Text
                                  fontWeight="bold"
                                  color={isDark ? "teal.300" : "teal.800"}
                                >
                                  • cos(q, intent) similarity score ={" "}
                                  {mathBreakdown.cos_intent.toFixed(3)}
                                </Text>
                              </>
                            )}
                          </VStack>
                        </Box>
                      )}

                      {/* Formula 3: Cosine Title (Title Vector) */}
                      {selectedSpecMath.app === currentApp && (
                        <Box
                          borderLeft="2px solid"
                          borderColor="purple.400"
                          pl={2}
                        >
                          <Text fontWeight="semibold" color={colors.text}>
                            3. Cosine Similarity (Title-Only Vector)
                          </Text>
                          <Text fontSize="10px" color={colors.subtext} mb={1}>
                            Formula:{" "}
                            <code>
                              cos(q, title) = (q · title) / (|q| * |title|)
                            </code>
                          </Text>
                          <VStack
                            align="stretch"
                            gap={1}
                            pl={2}
                            fontSize="10.5px"
                            fontFamily="mono"
                            bg={isDark ? "white/5" : "gray.50"}
                            p={2}
                            borderRadius="sm"
                          >
                            {!mathBreakdown.has_tv ? (
                              <Text color="yellow.500" fontStyle="italic">
                                • [NOTE] Spec has no title embedding
                                (un-backfilled). Falling back to Intent vector.
                              </Text>
                            ) : selectedScenario ? (
                              <>
                                <Text>
                                  • q (Scenario vector) = [
                                  {selectedScenario?.q.join(", ")}]
                                </Text>
                                <Text>
                                  • title (Spec title vector) = [
                                  {selectedSpecMath.title_vec?.join(", ")}]
                                </Text>
                                <Text>
                                  • q · title (Dot product) ={" "}
                                  {selectedScenario?.q
                                    .map(
                                      (x: number, idx: number) =>
                                        `${x}*${selectedSpecMath.title_vec?.[idx] || 0}`,
                                    )
                                    .join(" + ")}{" "}
                                  = {mathBreakdown.dot_t.toFixed(3)}
                                </Text>
                                <Text>
                                  • |title| (Title magnitude) = √(
                                  {selectedSpecMath.title_vec
                                    ?.map((x: number) => `${x}²`)
                                    .join(" + ") || "0"}
                                  ) = {mathBreakdown.mag_t.toFixed(3)}
                                </Text>
                              </>
                            ) : (
                              <Text color="cyan.500" fontStyle="italic">
                                • [Server Model] Calculated via 384-Dim dense
                                semantic title embeddings.
                              </Text>
                            )}
                            <Text
                              fontWeight="bold"
                              color={isDark ? "purple.300" : "purple.800"}
                            >
                              • cos(q, title) ={" "}
                              {mathBreakdown.cos_title.toFixed(3)}{" "}
                              {!mathBreakdown.has_tv && "(Intent fallback)"}
                            </Text>
                          </VStack>
                        </Box>
                      )}

                      {/* Formula 4: Hybrid Semantic Blend */}
                      {selectedSpecMath.app === currentApp && (
                        <Box
                          borderLeft="2px solid"
                          borderColor="blue.400"
                          pl={2}
                        >
                          <Text fontWeight="semibold" color={colors.text}>
                            4. Hybrid Semantic Blend
                          </Text>
                          <Text fontSize="10px" color={colors.subtext} mb={1}>
                            Formula:{" "}
                            <code>
                              sem = w * semTitle + (1 - w) * semIntent
                            </code>{" "}
                            (where weight <code>w = {semTitleWeight}</code>)
                          </Text>
                          <VStack
                            align="stretch"
                            gap={1}
                            pl={2}
                            fontSize="10.5px"
                            fontFamily="mono"
                            bg={isDark ? "white/5" : "gray.50"}
                            p={2}
                            borderRadius="sm"
                          >
                            <Text>
                              • semTitle (Cosine Title) ={" "}
                              {mathBreakdown.cos_title.toFixed(3)}
                            </Text>
                            <Text>
                              • semIntent (Cosine Intent) ={" "}
                              {mathBreakdown.cos_intent.toFixed(3)}
                            </Text>
                            <Text
                              fontWeight="bold"
                              color={isDark ? "blue.300" : "blue.800"}
                            >
                              • sem = ({semTitleWeight} *{" "}
                              {mathBreakdown.cos_title.toFixed(3)}) + (
                              {(1 - semTitleWeight).toFixed(2)} *{" "}
                              {mathBreakdown.cos_intent.toFixed(3)}) ={" "}
                              {mathBreakdown.sem.toFixed(3)}
                            </Text>
                          </VStack>
                        </Box>
                      )}

                      {/* Formula 5: Combined score */}
                      {selectedSpecMath.app === currentApp && (
                        <Box
                          borderLeft="2px solid"
                          borderColor="orange.400"
                          pl={2}
                        >
                          <Text fontWeight="semibold" color={colors.text}>
                            5. Combined Reuse Score
                          </Text>
                          <Text fontSize="10px" color={colors.subtext} mb={1}>
                            Formula: <code>combined = max(lexical, sem)</code>
                          </Text>
                          <VStack
                            align="stretch"
                            gap={1}
                            pl={2}
                            fontSize="10.5px"
                            fontFamily="mono"
                            bg={isDark ? "white/5" : "gray.50"}
                            p={2}
                            borderRadius="sm"
                          >
                            <Text>
                              • lexical overlap ={" "}
                              {mathBreakdown.lexical.toFixed(3)}
                            </Text>
                            <Text>
                              • semantic blended ={" "}
                              {mathBreakdown.sem.toFixed(3)}
                            </Text>
                            <Text
                              fontWeight="bold"
                              color={isDark ? "orange.300" : "orange.800"}
                            >
                              • combined = max(
                              {mathBreakdown.lexical.toFixed(3)},{" "}
                              {mathBreakdown.sem.toFixed(3)}) ={" "}
                              {mathBreakdown.combined.toFixed(3)}
                            </Text>
                            <HStack gap={1} mt={1}>
                              <Text>• Status vs bar:</Text>
                              <Badge
                                colorPalette={
                                  mathBreakdown.combined >=
                                  Math.min(reuseThreshold, semReuse)
                                    ? "green"
                                    : "xs"
                                }
                                size="xs"
                              >
                                {mathBreakdown.combined >= reuseThreshold ||
                                mathBreakdown.combined >= semReuse
                                  ? "Clears bar!"
                                  : "Below bars"}
                              </Badge>
                              <Text fontSize="9.5px" color={colors.subtext}>
                                (Lexical bar: {reuseThreshold}, Semantic bar:{" "}
                                {semReuse})
                              </Text>
                            </HStack>
                          </VStack>
                        </Box>
                      )}

                      {/* Formula 6: Cross-App Pattern similarity */}
                      {selectedSpecMath.app !== currentApp && (
                        <Box
                          borderLeft="2px solid"
                          borderColor="yellow.400"
                          pl={2}
                        >
                          <Text fontWeight="semibold" color={colors.text}>
                            1. Cross-App Pattern Similarity
                          </Text>
                          <Text fontSize="10px" color={colors.subtext} mb={1}>
                            Formula:{" "}
                            <code>
                              pattern_score = cos(qp, pattern_vec) = (qp ·
                              pattern_vec) / (|qp| * |pattern_vec|)
                            </code>
                          </Text>
                          <VStack
                            align="stretch"
                            gap={1}
                            pl={2}
                            fontSize="10.5px"
                            fontFamily="mono"
                            bg={isDark ? "white/5" : "gray.50"}
                            p={2}
                            borderRadius="sm"
                          >
                            {selectedScenario ? (
                              <>
                                <Text>
                                  • qp (Abstracted query vector) = [
                                  {selectedScenario?.qp.join(", ")}]
                                </Text>
                                <Text>
                                  • pattern_vec (Spec pattern vector) = [
                                  {selectedSpecMath.pattern_vec?.join(", ")}]
                                </Text>
                                <Text>
                                  • qp · pattern_vec (Dot product) ={" "}
                                  {selectedScenario?.qp
                                    .map(
                                      (x: number, idx: number) =>
                                        `${x}*${selectedSpecMath.pattern_vec?.[idx] || 0}`,
                                    )
                                    .join(" + ")}{" "}
                                  = {mathBreakdown.dot_p.toFixed(3)}
                                </Text>
                                <Text>
                                  • |qp| (Query pattern magnitude) = √(
                                  {selectedScenario?.qp
                                    .map((x: number) => `${x}²`)
                                    .join(" + ")}
                                  ) = {mathBreakdown.mag_qp.toFixed(3)}
                                </Text>
                                <Text>
                                  • |pattern_vec| (Pattern magnitude) = √(
                                  {selectedSpecMath.pattern_vec
                                    ?.map((x: number) => `${x}²`)
                                    .join(" + ") || "0"}
                                  ) = {mathBreakdown.mag_p.toFixed(3)}
                                </Text>
                                <Text
                                  fontWeight="bold"
                                  color={isDark ? "yellow.300" : "yellow.800"}
                                >
                                  • pattern_score ={" "}
                                  {mathBreakdown.dot_p.toFixed(3)} / (
                                  {mathBreakdown.mag_qp.toFixed(3)} *{" "}
                                  {mathBreakdown.mag_p.toFixed(3)}) ={" "}
                                  {mathBreakdown.cos_pattern.toFixed(3)}
                                </Text>
                              </>
                            ) : (
                              <>
                                <Text color="cyan.500" fontStyle="italic">
                                  • [Server Model] Calculated via 384-Dim dense
                                  abstracted pattern embeddings.
                                </Text>
                                <Text
                                  fontWeight="bold"
                                  color={isDark ? "yellow.300" : "yellow.800"}
                                >
                                  • pattern_score ={" "}
                                  {mathBreakdown.cos_pattern.toFixed(3)}
                                </Text>
                              </>
                            )}
                            <HStack gap={1} mt={1}>
                              <Text>• Status vs bar:</Text>
                              <Badge
                                colorPalette={
                                  mathBreakdown.cos_pattern >= patternRelevance
                                    ? "green"
                                    : "xs"
                                }
                                size="xs"
                              >
                                {mathBreakdown.cos_pattern >= patternRelevance
                                  ? "Relevance Ok!"
                                  : "Below floor"}
                              </Badge>
                              <Text fontSize="9.5px" color={colors.subtext}>
                                (Relevance floor: {patternRelevance})
                              </Text>
                            </HStack>
                          </VStack>
                        </Box>
                      )}
                    </VStack>
                  </Box>
                ) : (
                  <Box
                    p={4}
                    bg={colors.subBg}
                    borderRadius="md"
                    border="1px dashed"
                    borderColor={colors.border}
                    textAlign="center"
                  >
                    <Info
                      size={20}
                      style={{ margin: "0 auto 8px", opacity: 0.5 }}
                    />
                    <Text fontSize="xs" color={colors.subtext}>
                      Select a spec row from the tables below to inspect its
                      detailed mathematical calculations.
                    </Text>
                  </Box>
                )}

                {/* Step 1: Query Tokens */}
                <Box>
                  <Heading
                    size="xs"
                    color={isDark ? c.sapphire : "#1d4ed8"}
                    textTransform="uppercase"
                    mb={2}
                  >
                    Step 1: Scenario Query Tokenization
                  </Heading>
                  <VStack
                    align="start"
                    p={3}
                    bg={colors.subBg}
                    borderRadius="md"
                    gap={2}
                  >
                    <Text fontSize="xs">
                      Filtered lowercase tokens (excluding common stopwords like{" "}
                      {`{${[...STOPWORDS].join(", ")}}`}):
                    </Text>
                    <HStack gap={1.5} flexWrap="wrap">
                      {selectedResult.queryTokens.length > 0 ? (
                        selectedResult.queryTokens.map((t, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            size="sm"
                            colorPalette="cyan"
                          >
                            {t}
                          </Badge>
                        ))
                      ) : (
                        <Text
                          fontSize="11px"
                          color={colors.subtext}
                          fontStyle="italic"
                        >
                          None (All words were filtered out as stopwords)
                        </Text>
                      )}
                    </HStack>
                  </VStack>
                </Box>

                {/* Step 2: Local App Scoring Table */}
                <Box>
                  <Heading
                    size="xs"
                    color={isDark ? c.sapphire : "#1d4ed8"}
                    textTransform="uppercase"
                    mb={2}
                  >
                    Step 2: Compare Against Local Specs (In-App)
                  </Heading>
                  <Text fontSize="11px" color={colors.subtext} mb={2}>
                    Only comparing with specs belonging to current app origin:{" "}
                    <Code>{currentApp}</Code>
                  </Text>

                  <Box
                    overflowX="auto"
                    border="1px solid"
                    borderColor={colors.border}
                    borderRadius="md"
                  >
                    <table
                      style={{
                        width: "100%",
                        fontSize: "11px",
                        borderCollapse: "collapse",
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            background: isDark
                              ? "rgba(255,255,255,0.05)"
                              : "#f1f5f9",
                            borderBottom: `1px solid ${colors.border}`,
                          }}
                        >
                          <th style={{ padding: "6px", textAlign: "left" }}>
                            Local Spec Title
                          </th>
                          <th style={{ padding: "6px", textAlign: "center" }}>
                            Outcome
                          </th>
                          <th style={{ padding: "6px", textAlign: "center" }}>
                            Lexical
                          </th>
                          <th style={{ padding: "6px", textAlign: "center" }}>
                            semTitle
                          </th>
                          <th style={{ padding: "6px", textAlign: "center" }}>
                            semIntent
                          </th>
                          <th style={{ padding: "6px", textAlign: "center" }}>
                            Blended
                          </th>
                          <th style={{ padding: "6px", textAlign: "center" }}>
                            Combined
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedResult.inAppMatches.map((m: any) => {
                          const isSelected = selectedSpecMathId === m.specId;
                          return (
                            <tr
                              key={m.specId}
                              onClick={() => setSelectedSpecMathId(m.specId)}
                              style={{
                                borderBottom: `1px solid ${colors.border}`,
                                background: isSelected
                                  ? isDark
                                    ? "rgba(59,130,246,0.25)"
                                    : "rgba(59,130,246,0.1)"
                                  : "transparent",
                                fontWeight: isSelected ? "bold" : "normal",
                                cursor: "pointer",
                              }}
                            >
                              <td style={{ padding: "6px" }}>
                                <VStack align="start" gap={0}>
                                  <Text fontSize="11px">{m.title}</Text>
                                  {!m.hasTitleEmbedding && (
                                    <Text fontSize="8px" color={colors.subtext}>
                                      (un-backfilled fallback)
                                    </Text>
                                  )}
                                </VStack>
                              </td>
                              <td
                                style={{ padding: "6px", textAlign: "center" }}
                              >
                                <Badge
                                  colorPalette={
                                    m.outcome === "failed" ? "red" : "green"
                                  }
                                  size="xs"
                                >
                                  {m.outcome}
                                </Badge>
                              </td>
                              <td
                                style={{ padding: "6px", textAlign: "center" }}
                                title={`Overlap words: [${m.shared.join(", ")}]`}
                              >
                                {m.lexical.toFixed(3)}
                              </td>
                              <td
                                style={{ padding: "6px", textAlign: "center" }}
                              >
                                {m.semTitle.toFixed(3)}
                              </td>
                              <td
                                style={{ padding: "6px", textAlign: "center" }}
                              >
                                {m.semIntent.toFixed(3)}
                              </td>
                              <td
                                style={{ padding: "6px", textAlign: "center" }}
                              >
                                {m.sem.toFixed(3)}
                              </td>
                              <td
                                style={{ padding: "6px", textAlign: "center" }}
                              >
                                <Badge
                                  colorPalette={
                                    m.lexical >= reuseThreshold ||
                                    m.sem >= semReuse
                                      ? "blue"
                                      : "gray"
                                  }
                                  size="xs"
                                >
                                  {m.combined.toFixed(3)}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                        {selectedResult.inAppMatches.length === 0 && (
                          <tr>
                            <td
                              colSpan={7}
                              style={{
                                padding: "10px",
                                textAlign: "center",
                                color: colors.subtext,
                              }}
                            >
                              No local specs found in database.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </Box>
                </Box>

                {/* Step 3: Decision Gate */}
                <Box>
                  <Heading
                    size="xs"
                    color={isDark ? c.sapphire : "#1d4ed8"}
                    textTransform="uppercase"
                    mb={2}
                  >
                    Step 3: Evaluate In-App Reuse Decision
                  </Heading>
                  <VStack
                    align="stretch"
                    p={3}
                    bg={colors.subBg}
                    borderRadius="md"
                    gap={2}
                    fontSize="xs"
                  >
                    <Text>
                      <strong>Decision Gate Logic:</strong>
                    </Text>
                    <Code
                      p={2}
                      bg={isDark ? "white/5" : "gray.200"}
                      borderRadius="md"
                      fontSize="10px"
                    >
                      REUSE &lt;=&gt; (lexical &gt;= {reuseThreshold} OR sem
                      &gt;= {semReuse}) AND spec_outcome in ('passed', 'healed')
                    </Code>
                    {selectedResult.bestInApp ? (
                      <VStack
                        align="start"
                        gap={1}
                        pl={2}
                        borderLeft="2px solid"
                        borderColor={colors.border}
                      >
                        <HStack>
                          <Text fontWeight="semibold">Best match spec:</Text>
                          <Text fontStyle="italic">
                            "{selectedResult.bestInApp.title}"
                          </Text>
                        </HStack>
                        <HStack>
                          <Text>Lexical overlap score:</Text>
                          <Text
                            fontWeight="bold"
                            color={
                              selectedResult.bestInApp.lexical >= reuseThreshold
                                ? "green"
                                : "red"
                            }
                          >
                            {selectedResult.bestInApp.lexical.toFixed(3)}{" "}
                            {selectedResult.bestInApp.lexical >= reuseThreshold
                              ? ">= (Pass)"
                              : "< (Fail)"}
                          </Text>
                        </HStack>
                        <HStack>
                          <Text>Semantic blend score:</Text>
                          <Text
                            fontWeight="bold"
                            color={
                              selectedResult.bestInApp.sem >= semReuse
                                ? "green"
                                : "red"
                            }
                          >
                            {selectedResult.bestInApp.sem.toFixed(3)}{" "}
                            {selectedResult.bestInApp.sem >= semReuse
                              ? ">= (Pass)"
                              : "< (Fail)"}
                          </Text>
                        </HStack>
                        <HStack>
                          <Text>Outcome status:</Text>
                          <Badge
                            colorPalette={
                              selectedResult.bestInApp.outcome === "failed"
                                ? "red"
                                : "green"
                            }
                          >
                            {selectedResult.bestInApp.outcome}
                          </Badge>
                        </HStack>
                      </VStack>
                    ) : (
                      <Text color={colors.subtext} fontStyle="italic">
                        No match to evaluate.
                      </Text>
                    )}
                    <Flex
                      p={2}
                      bg={
                        selectedResult.decision === "REUSE"
                          ? "rgba(59,130,246,0.15)"
                          : "rgba(239,68,68,0.1)"
                      }
                      borderRadius="md"
                      align="center"
                      gap={2}
                    >
                      {selectedResult.decision === "REUSE" ? (
                        <CheckCircle size={16} color="#1d4ed8" />
                      ) : (
                        <XCircle size={16} color="#ef4444" />
                      )}
                      <Text fontWeight="bold">
                        Result: {selectedResult.decision}
                      </Text>
                    </Flex>
                    <Text fontSize="11px" color={colors.subtext}>
                      {selectedResult.reason}
                    </Text>
                  </VStack>
                </Box>

                {/* Step 4: Cross-App suggestion */}
                {selectedResult.decision === "NEW" && (
                  <Box>
                    <Heading
                      size="xs"
                      color={isDark ? c.peach : "#dd6b20"}
                      textTransform="uppercase"
                      mb={2}
                    >
                      Step 4: Global Cross-App Pattern Lookup
                    </Heading>
                    <VStack
                      align="stretch"
                      p={3}
                      bg={colors.subBg}
                      borderRadius="md"
                      gap={3}
                      fontSize="xs"
                    >
                      {!globalPatternsEnabled ? (
                        <Text color={colors.subtext} fontStyle="italic">
                          Cross-app feature flag (KNOWLEDGE_GLOBAL_PATTERNS) is
                          turned OFF.
                        </Text>
                      ) : selectedResult.globalHintsLimitReached ? (
                        <Text color={c.red} fontWeight="bold">
                          Global hints budget limit of {patternBudget} reached.
                          Skipping.
                        </Text>
                      ) : (
                        <>
                          <Text>
                            <strong>Global Pattern Search Logic:</strong>
                          </Text>
                          <VStack
                            align="stretch"
                            gap={1}
                            fontSize="11px"
                            pl={2}
                            borderLeft="2px solid"
                            borderColor={colors.border}
                          >
                            <Text>
                              1. Filter out candidate specs belonging to current
                              app origin.
                            </Text>
                            <Text>
                              2. Exclude candidate specs whose outcome is
                              failed.
                            </Text>
                            <Text>
                              3. Calculate cosine similarity of pattern vector
                              (abstracted query).
                            </Text>
                            <Text>
                              4. Keep only candidates with similarity score
                              &gt;= {patternRelevance}.
                            </Text>
                            <Text>5. Pick top K ({patternK}) candidates.</Text>
                          </VStack>

                          <Box
                            overflowX="auto"
                            border="1px solid"
                            borderColor={colors.border}
                            borderRadius="md"
                            mt={2}
                          >
                            <table
                              style={{
                                width: "100%",
                                fontSize: "11px",
                                borderCollapse: "collapse",
                              }}
                            >
                              <thead>
                                <tr
                                  style={{
                                    background: isDark
                                      ? "rgba(255,255,255,0.05)"
                                      : "#f1f5f9",
                                    borderBottom: `1px solid ${colors.border}`,
                                  }}
                                >
                                  <th
                                    style={{
                                      padding: "6px",
                                      textAlign: "left",
                                    }}
                                  >
                                    Global Spec Title
                                  </th>
                                  <th
                                    style={{
                                      padding: "6px",
                                      textAlign: "left",
                                    }}
                                  >
                                    App Origin
                                  </th>
                                  <th
                                    style={{
                                      padding: "6px",
                                      textAlign: "center",
                                    }}
                                  >
                                    Outcome
                                  </th>
                                  <th
                                    style={{
                                      padding: "6px",
                                      textAlign: "center",
                                    }}
                                  >
                                    Cos Sim
                                  </th>
                                  <th
                                    style={{
                                      padding: "6px",
                                      textAlign: "center",
                                    }}
                                  >
                                    Status
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedResult.crossAppCandidates.map(
                                  (cCandidate: any) => {
                                    const isSelected =
                                      selectedSpecMathId === cCandidate.specId;
                                    return (
                                      <tr
                                        key={cCandidate.specId}
                                        onClick={() =>
                                          setSelectedSpecMathId(
                                            cCandidate.specId,
                                          )
                                        }
                                        style={{
                                          borderBottom: `1px solid ${colors.border}`,
                                          background: isSelected
                                            ? isDark
                                              ? "rgba(229,200,144,0.25)"
                                              : "rgba(229,200,144,0.1)"
                                            : "transparent",
                                          fontWeight: isSelected
                                            ? "bold"
                                            : "normal",
                                          cursor: "pointer",
                                        }}
                                      >
                                        <td style={{ padding: "6px" }}>
                                          {cCandidate.title}
                                        </td>
                                        <td style={{ padding: "6px" }}>
                                          <Text
                                            fontSize="10px"
                                            color={colors.subtext}
                                          >
                                            {cCandidate.app}
                                          </Text>
                                        </td>
                                        <td
                                          style={{
                                            padding: "6px",
                                            textAlign: "center",
                                          }}
                                        >
                                          <Badge
                                            colorPalette={
                                              cCandidate.outcome === "failed"
                                                ? "red"
                                                : "green"
                                            }
                                            size="xs"
                                          >
                                            {cCandidate.outcome}
                                          </Badge>
                                        </td>
                                        <td
                                          style={{
                                            padding: "6px",
                                            textAlign: "center",
                                          }}
                                        >
                                          {cCandidate.score.toFixed(3)}
                                        </td>
                                        <td
                                          style={{
                                            padding: "6px",
                                            textAlign: "center",
                                          }}
                                        >
                                          {cCandidate.relevanceOk ? (
                                            <Badge
                                              colorPalette="green"
                                              size="xs"
                                            >
                                              Eligible
                                            </Badge>
                                          ) : (
                                            <Badge
                                              colorPalette="red"
                                              size="xs"
                                              variant="outline"
                                              title={cCandidate.skipReason}
                                            >
                                              Excluded
                                            </Badge>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  },
                                )}
                              </tbody>
                            </table>
                          </Box>

                          {selectedResult.globalHint ? (
                            <Flex
                              p={3}
                              bg="rgba(229,200,144,0.15)"
                              borderRadius="md"
                              direction="column"
                              gap={1}
                              border="1px solid"
                              borderColor="yellow.600"
                            >
                              <HStack>
                                <Sparkles size={14} color="#e5c890" />
                                <Text fontWeight="bold" color="yellow.600">
                                  Global Suggestion Generated!
                                </Text>
                              </HStack>
                              <Text fontSize="11px">
                                Borrow idea from:{" "}
                                <strong>
                                  "{selectedResult.globalHint.title}"
                                </strong>{" "}
                                (App: {selectedResult.globalHint.app}, score:{" "}
                                {selectedResult.globalHint.score.toFixed(3)})
                              </Text>
                              <Text fontSize="10px" color={colors.subtext}>
                                Advisory hint will inspire the AI Designer to
                                construct a fresh test for the new scenario on
                                the target app.
                              </Text>
                            </Flex>
                          ) : (
                            <Flex
                              p={2}
                              bg="rgba(239,68,68,0.1)"
                              borderRadius="md"
                              align="center"
                              gap={2}
                            >
                              <Info size={14} color="#ef4444" />
                              <Text fontStyle="italic" color={colors.subtext}>
                                No global pattern match found above the
                                relevance threshold of {patternRelevance}.
                                Scenarios will be generated from scratch.
                              </Text>
                            </Flex>
                          )}
                        </>
                      )}
                    </VStack>
                  </Box>
                )}
              </VStack>
            </Box>
          )}
        </VStack>
      </Grid>
    </Box>
  );
}
