"use client";

import {
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Spinner,
  Text,
  Textarea,
  VStack,
  HStack,
  Grid,
  IconButton,
} from "@chakra-ui/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Building2,
  CornerDownLeft,
  FileCode2,
  Globe,
  Layers,
  Search,
  Sparkles,
  Target,
  Wand2,
  Info,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  Sliders,
  Database,
  HelpCircle,
  FolderClosed,
  FolderOpen,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getCatppuccinColors, catppuccinAlpha } from "../theme/catppuccin";
import { getAWSColors } from "../theme/aws";
import { useThemeMode } from "../providers";
import { normalizeOrigin } from "@/src/knowledge/appId";

const MotionBox = motion.create(Box);

interface InAppMatch {
  runId: string;
  file: string;
  title: string | null;
  score: number;
  /** Hybrid breakdown (in-app only): the two cosines blended into `score`. */
  semTitle?: number;
  semIntent?: number;
}
interface CrossAppMatch extends InAppMatch {
  appId: string;
  flowId: string | null;
  /** Abstracted, selector-free workflow skeleton the Designer receives. */
  workflow?: string;
}
interface ExploreResult {
  enabled: boolean;
  error?: string;
  seedText: string;
  abstracted: string;
  appId: string | null;
  thresholds: { reuse: number; pattern: number };
  inApp: InAppMatch[];
  crossApp: CrossAppMatch[];
}
interface AppOption {
  appId: string;
  specCount: number;
}
interface SpecInfo {
  appId: string;
  file: string;
  title: string | null;
  runId: string;
}

type Palette = ReturnType<typeof getCatppuccinColors>;

const EXAMPLES = [
  "Migration Cost Interface Calculator",
  "Licensing Tab Fields and TCO Calculation",
  "Contact navigation link scrolls to contact section",
  "ROI Treatment Per Year Changes TCO Structure",
  "Platform Selector — Entry Page Structure and SAP PI/PO Card Visibility",
];

/** Strip scheme/trailing slash so app URLs read as short labels. */
function appLabel(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function getBaseDomain(url: string): string {
  if (!url) return "unknown";
  let host = url
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .split(":")[0];
  const parts = host.split(".");
  if (parts.length > 2) {
    const tld2 = parts.slice(-2).join(".");
    if (["co.uk", "org.uk", "gov.uk", "com.au", "net.au"].includes(tld2)) {
      return parts.slice(-3).join(".");
    }
    return parts.slice(-2).join(".");
  }
  return host;
}

interface Token {
  text: string;
  type:
    | "url"
    | "email"
    | "quoted"
    | "price"
    | "number"
    | "punctuation"
    | "plain"
    | "space";
  stripped: boolean;
  explanation?: string;
}

function tokenizeText(text: string): Token[] {
  if (!text) return [];
  const rules = [
    { type: "url" as const, regex: /^https?:\/\/\S+/ },
    { type: "email" as const, regex: /^[\w.+-]+@[\w-]+\.[\w.-]+/ },
    { type: "quoted" as const, regex: /^["'`][^"'`]{0,60}["'`]/ },
    { type: "price" as const, regex: /^\$\s?\d[\d,.]*/ },
    { type: "number" as const, regex: /^\b\d[\w./:-]*\b/ },
    { type: "punctuation" as const, regex: /^[^a-zA-Z\s]+/ },
    { type: "plain" as const, regex: /^[a-zA-Z]+/ },
    { type: "space" as const, regex: /^\s+/ },
  ];

  const tokens: Token[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let matched = false;
    for (const rule of rules) {
      const match = remaining.match(rule.regex);
      if (match) {
        const val = match[0];
        const isStripped = !["plain", "space"].includes(rule.type);

        let explanation = undefined;
        if (isStripped) {
          if (rule.type === "url")
            explanation =
              "URLs are stripped to enable cross-application matching.";
          else if (rule.type === "email")
            explanation =
              "Emails are stripped to protect PII and generalize workflows.";
          else if (rule.type === "quoted")
            explanation =
              "Quoted literals (strings) are stripped to generalize app-specific entity names.";
          else if (rule.type === "price")
            explanation =
              "Prices are stripped to align transactional workflows.";
          else if (rule.type === "number")
            explanation =
              "Numbers, dates, and version IDs are stripped to capture workflow shapes.";
          else if (rule.type === "punctuation")
            explanation = "Punctuation and special characters are stripped.";
        }

        tokens.push({
          text: val,
          type: rule.type,
          stripped: isStripped,
          explanation,
        });

        remaining = remaining.slice(val.length);
        matched = true;
        break;
      }
    }

    if (!matched) {
      tokens.push({
        text: remaining[0],
        type: "punctuation",
        stripped: true,
        explanation: "Punctuation and special characters are stripped.",
      });
      remaining = remaining.slice(1);
    }
  }
  return tokens;
}

export function PatternExplorer() {
  const { theme } = useThemeMode();
  const c = getCatppuccinColors(theme);
  const colors = getAWSColors(theme);
  const isDark = theme === "dark";

  const cardShadow = isDark
    ? "0 10px 30px rgba(0,0,0,0.35)"
    : "0 10px 30px rgba(15,23,42,0.06)";

  const [seedText, setSeedText] = useState("");
  const [appId, setAppId] = useState("");
  const [k, setK] = useState(10);
  const [apps, setApps] = useState<AppOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExploreResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Custom UI states
  const [showRulesTable, setShowRulesTable] = useState(false);
  // When in-app reuse fires, cross-app isn't consulted in the real pipeline — but
  // the explorer lets you reveal it anyway for inspection.
  const [revealSkippedCrossApp, setRevealSkippedCrossApp] = useState(false);
  const [isKeyboardEnterPressed, setIsKeyboardEnterPressed] = useState(false);

  const [specs, setSpecs] = useState<SpecInfo[]>([]);
  const [loadingSpecs, setLoadingSpecs] = useState(false);
  const [specsSearchQuery, setSpecsSearchQuery] = useState("");
  const [expandedApps, setExpandedApps] = useState<Record<string, boolean>>({});

  // Workspace Tabs and Spec Viewer States
  const [activeResultsTab, setActiveResultsTab] = useState<
    "patterns" | "journey" | "specs" | "apps"
  >("patterns");
  const [viewingSpec, setViewingSpec] = useState<SpecInfo | null>(null);
  const [viewingSpecCode, setViewingSpecCode] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);

  // Inline Database Spec Viewer States
  const [selectedDbSpec, setSelectedDbSpec] = useState<SpecInfo | null>(null);
  const [selectedDbSpecCode, setSelectedDbSpecCode] = useState<string | null>(
    null,
  );
  const [loadingDbSpecCode, setLoadingDbSpecCode] = useState(false);

  useEffect(() => {
    if (!selectedDbSpec) {
      setSelectedDbSpecCode(null);
      return;
    }
    setLoadingDbSpecCode(true);
    fetch(`/api/runs/${selectedDbSpec.runId}/report?format=json`)
      .then((res) => res.json())
      .then((data) => {
        const specs = data.generatedSpecs ?? [];
        const match = specs.find((s: any) => s.file === selectedDbSpec.file);
        if (match) {
          setSelectedDbSpecCode(match.code);
        } else {
          setSelectedDbSpecCode("// Spec code not found in run report.");
        }
      })
      .catch(() => {
        setSelectedDbSpecCode("// Failed to load spec code from run report.");
      })
      .finally(() => {
        setLoadingDbSpecCode(false);
      });
  }, [selectedDbSpec]);

  useEffect(() => {
    fetch("/api/knowledge/apps")
      .then((r) => r.json())
      .then((d) => setApps(d.apps ?? []))
      .catch(() => setApps([]));

    // Pre-fetch specs on load
    setLoadingSpecs(true);
    fetch("/api/knowledge/specs")
      .then((r) => r.json())
      .then((d) => setSpecs(d.specs ?? []))
      .catch(() => setSpecs([]))
      .finally(() => setLoadingSpecs(false));
  }, []);

  useEffect(() => {
    if (!viewingSpec) {
      setViewingSpecCode(null);
      return;
    }
    setLoadingCode(true);
    fetch(`/api/runs/${viewingSpec.runId}/report?format=json`)
      .then((res) => res.json())
      .then((data) => {
        const specs = data.generatedSpecs ?? [];
        const match = specs.find((s: any) => s.file === viewingSpec.file);
        if (match) {
          setViewingSpecCode(match.code);
        } else {
          setViewingSpecCode("// Spec code not found in run report.");
        }
      })
      .catch(() => {
        setViewingSpecCode("// Failed to load spec code from run report.");
      })
      .finally(() => {
        setLoadingCode(false);
      });
  }, [viewingSpec]);

  async function run() {
    if (!seedText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge/patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seedText,
          appId: normalizedAppId || undefined,
          k,
        }),
      });
      const data: ExploreResult = await res.json();
      if (data.error) {
        setError(data.error);
        setResult(null);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setLoading(false);
    }
  }

  /** Reset every search input + result back to a blank slate. */
  function clearAll() {
    setSeedText("");
    setAppId("");
    setK(10);
    setResult(null);
    setError(null);
    setRevealSkippedCrossApp(false);
  }

  const totalSpecs = apps.reduce((n, a) => n + a.specCount, 0);
  // The user types any Target URL. Normalize it to an app id (origin) and check
  // whether it's a known app with prior specs — which decides in-app vs new-app.
  const normalizedAppId = appId.trim() ? normalizeOrigin(appId) : "";
  const knownApp = normalizedAppId
    ? (apps.find((a) => a.appId === normalizedAppId) ?? null)
    : null;

  return (
    <Box w="100%" px={0} py={2} color={colors.text}>
      {/* ── Stats Grid ───────────────────────────────────────────── */}
      <Grid
        templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}
        gap={4}
        mb={6}
        w="100%"
      >
        <MotionBox
          whileHover={{ y: -2 }}
          bg={
            isDark
              ? "linear-gradient(135deg, rgba(133, 193, 220, 0.08) 0%, rgba(35, 38, 52, 0.9) 100%)"
              : "linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(241, 245, 249, 0.9) 100%)"
          }
          border="1px solid"
          borderColor={colors.border}
          borderRadius="xl"
          p={3.5}
          textAlign="center"
          cursor="pointer"
          onClick={() => setActiveResultsTab("apps")}
          position="relative"
          overflow="hidden"
        >
          <Flex justify="center" color={c.mauve} mb={1}>
            <Globe size={16} />
          </Flex>
          <Text
            fontSize="xl"
            fontWeight="bold"
            fontFamily="mono"
            color={colors.text}
          >
            {apps.length}
          </Text>
          <Text
            fontSize="2xs"
            color={colors.subtext}
            fontWeight="bold"
            textTransform="uppercase"
          >
            Apps
          </Text>
        </MotionBox>

        <MotionBox
          whileHover={{ y: -2 }}
          bg={
            isDark
              ? "linear-gradient(135deg, rgba(133, 193, 220, 0.08) 0%, rgba(35, 38, 52, 0.9) 100%)"
              : "linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(241, 245, 249, 0.9) 100%)"
          }
          border="1px solid"
          borderColor={colors.border}
          borderRadius="xl"
          p={3.5}
          textAlign="center"
          cursor="pointer"
          onClick={() => setActiveResultsTab("specs")}
          position="relative"
          overflow="hidden"
        >
          <Flex justify="center" color={c.sapphire} mb={1}>
            <Database size={16} />
          </Flex>
          <Text
            fontSize="xl"
            fontWeight="bold"
            fontFamily="mono"
            color={colors.text}
          >
            {totalSpecs}
          </Text>
          <Text
            fontSize="2xs"
            color={colors.subtext}
            fontWeight="bold"
            textTransform="uppercase"
          >
            Specs
          </Text>
        </MotionBox>

        <MotionBox
          whileHover={{ y: -2 }}
          bg={
            isDark
              ? "linear-gradient(135deg, rgba(133, 193, 220, 0.08) 0%, rgba(35, 38, 52, 0.9) 100%)"
              : "linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(241, 245, 249, 0.9) 100%)"
          }
          border="1px solid"
          borderColor={colors.border}
          borderRadius="xl"
          p={3.5}
          textAlign="center"
        >
          <Flex justify="center" color={c.green} mb={1}>
            <Sliders size={16} />
          </Flex>
          <Text
            fontSize="sm"
            fontWeight="bold"
            fontFamily="mono"
            color={c.green}
            mt="2px"
            mb="1px"
          >
            0.82 / 0.70
          </Text>
          <Text
            fontSize="2xs"
            color={colors.subtext}
            fontWeight="bold"
            textTransform="uppercase"
          >
            Thresholds
          </Text>
        </MotionBox>
      </Grid>

            {/* ── Side-by-Side Playground Composer ──────────────────────── */}
      <Grid templateColumns={{ base: "1fr", xl: "1fr 1fr" }} gap={5} width="100%" mb={6}>
        {/* 1. Scenario Input Card */}
        <Box
          bg={colors.cardBg}
          borderRadius="16px"
          border={`1px solid ${colors.border}`}
          boxShadow={cardShadow}
          display="flex"
          flexDirection="column"
          overflow="hidden"
        >
          {/* Header */}
          <Flex align="center" justify="space-between" px={4} py={3} borderBottom={`1px solid ${colors.border}`}>
            <Flex align="center" gap={2}>
              <Sliders size={15} color={c.sapphire} />
              <Text fontSize="13px" fontWeight="bold" color={colors.text} letterSpacing="0.05em">
                1. SCENARIO INPUT CONSOLE
              </Text>
            </Flex>
          </Flex>

          {/* Textarea */}
          <Box p={3} flex="1">
            <Box
              borderRadius="12px"
              border={`1px solid ${colors.border}`}
              bg={colors.subBg}
              p={1}
              position="relative"
            >
              <Textarea
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
                placeholder="Describe a test scenario (e.g. Add 'Acme Pro Plan' to cart on http://mysite.com for $99)..."
                rows={4}
                bg="transparent"
                border="none"
                outline="none"
                _focus={{ boxShadow: "none" }}
                fontSize="sm"
                color={colors.text}
                _placeholder={{ color: colors.subtext }}
                pb="34px"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    setIsKeyboardEnterPressed(true);
                    setTimeout(() => setIsKeyboardEnterPressed(false), 200);
                    run();
                  }
                }}
              />
              <Flex
                position="absolute"
                bottom="10px"
                right="10px"
                align="center"
                gap={1.5}
                color={isKeyboardEnterPressed ? c.sapphire : colors.subtext}
                fontSize="10px"
                pointerEvents="none"
                bg={isKeyboardEnterPressed ? catppuccinAlpha(c.sapphire, 0.15) : "transparent"}
                px={2}
                py={0.5}
                borderRadius="4px"
              >
                <CornerDownLeft size={10} /> ⌘ + Enter
              </Flex>
            </Box>
          </Box>

          {/* Presets List */}
          <Box px={4} pb={4}>
            <Text fontSize="10.5px" fontWeight="bold" color={colors.subtext} mb={2.5} letterSpacing="0.05em">
              PRESET SCENARIOS
            </Text>
            <Flex flexWrap="wrap" gap={2}>
              {EXAMPLES.map((ex) => (
                <MotionBox
                  key={ex}
                  as="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSeedText(ex)}
                  px={3}
                  py={1.5}
                  borderRadius="8px"
                  fontSize="11px"
                  bg={colors.subBg}
                  color={colors.subtext}
                  border="1px solid"
                  borderColor={colors.border}
                  cursor="pointer"
                  transition={{ duration: 0.12 }}
                  _hover={{
                    bg: colors.rowHover,
                    color: colors.text,
                    borderColor: c.sapphire,
                  }}
                  textAlign="left"
                  lineHeight="1.4"
                >
                  <Text maxW="220px" truncate>{ex}</Text>
                </MotionBox>
              ))}
            </Flex>
          </Box>

          {/* Target URL & Controls */}
          <Box px={4} pb={4}>
            <Grid templateColumns={{ base: "1fr", md: "1fr 120px" }} gap={3} alignContent="end">
              <Box>
                <Flex align="center" justify="space-between" gap={2} mb={1.5}>
                  <Flex align="center" gap={1.5}>
                    <Globe size={12} color={c.sapphire} />
                    <Text fontSize="10.5px" fontWeight="700" color={colors.subtext}>
                      TARGET URL
                    </Text>
                  </Flex>
                  {appId.trim() && (
                    <Box
                      as="button"
                      onClick={() => setAppId("")}
                      fontSize="10px"
                      color={colors.subtext}
                      _hover={{ color: c.sapphire }}
                    >
                      clear
                    </Box>
                  )}
                </Flex>
                <input
                  list="known-apps"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="https://your-app.com (or pick a known app)"
                  style={{
                    width: "100%",
                    height: "36px",
                    padding: "0 12px",
                    borderRadius: "8px",
                    border: `1px solid ${colors.border}`,
                    background: colors.subBg,
                    color: colors.text,
                    fontSize: "12px",
                    outline: "none",
                  }}
                />
                <datalist id="known-apps">
                  {apps.map((a) => (
                    <option key={a.appId} value={a.appId}>
                      {appLabel(a.appId)} · {a.specCount} specs
                    </option>
                  ))}
                </datalist>
              </Box>

              <Box>
                <Text fontSize="10.5px" fontWeight="700" color={colors.subtext} mb={1.5}>
                  LIMIT (K)
                </Text>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={k}
                  onChange={(e) => setK(Number(e.target.value) || 10)}
                  bg={colors.subBg}
                  borderColor={colors.border}
                  borderRadius="8px"
                  h="36px"
                  fontSize="xs"
                  color={colors.text}
                  _focus={{ borderColor: c.sapphire }}
                />
              </Box>
            </Grid>

            {/* Target URL Helper Status */}
            <Flex align="center" gap={1.5} mt={2} fontSize="10px">
              {!appId.trim() ? (
                <Text color={colors.subtext}>
                  <Globe size={10} style={{ display: "inline", marginRight: 4 }} />
                  No URL — searches all apps (cross-app only).
                </Text>
              ) : knownApp ? (
                <Text color={c.green}>
                  <Check size={10} style={{ display: "inline", marginRight: 4 }} />
                  Known app · {knownApp.specCount} specs — local reuse available.
                </Text>
              ) : (
                <Text color={c.mauve}>
                  <Sparkles size={10} style={{ display: "inline", marginRight: 4 }} />
                  New app — goes straight to cross-app patterns.
                </Text>
              )}
            </Flex>
          </Box>

          {/* Bottom Controls Bar */}
          <Flex
            align="center"
            justify="space-between"
            px={4}
            py={3}
            borderTop={`1px solid ${colors.border}`}
            bg={colors.subBg}
          >
            <Flex align="center" gap={1.5} color={colors.subtext} fontSize="11px">
              <CornerDownLeft size={12} />
              <Text>
                <Text as="span" fontWeight="600">
                  ⌘ + Enter
                </Text>{" "}
                to search
              </Text>
            </Flex>
            <HStack gap={2}>
              <Button
                onClick={clearAll}
                disabled={!seedText.trim() && !appId.trim() && !result && !error}
                variant="outline"
                borderColor={c.red}
                color={c.red}
                bg="transparent"
                fontWeight="bold"
                h="36px"
                px={4}
                fontSize="xs"
                borderRadius="8px"
                transition="all 0.18s ease"
                _hover={{
                  bg: c.red,
                  color: isDark ? c.crust : "#ffffff",
                  transform: "translateY(-1.5px) scale(1.02)",
                  boxShadow: `0 0 16px ${catppuccinAlpha(c.red, 0.4)}`,
                }}
                _active={{ transform: "translateY(0) scale(0.98)" }}
                _disabled={{
                  opacity: 0.4,
                  cursor: "not-allowed",
                  transform: "none",
                  boxShadow: "none",
                  bg: "transparent",
                  borderColor: colors.border,
                  color: colors.subtext,
                }}
              >
                <X size={14} style={{ marginRight: 6 }} />
                Clear
              </Button>
              <Button
                onClick={run}
                loading={loading}
                disabled={!seedText.trim()}
                variant="outline"
                borderColor={c.sapphire}
                color={c.sapphire}
                bg="transparent"
                fontWeight="bold"
                h="36px"
                px={5}
                fontSize="xs"
                borderRadius="8px"
                transition="all 0.18s ease"
                _hover={{
                  bg: c.sapphire,
                  color: isDark ? c.crust : "#ffffff",
                  transform: "translateY(-1.5px) scale(1.02)",
                  boxShadow: `0 0 16px ${catppuccinAlpha(c.sapphire, 0.4)}`,
                }}
                _active={{ transform: "translateY(0) scale(0.98)" }}
                _disabled={{
                  opacity: 0.4,
                  cursor: "not-allowed",
                  transform: "none",
                  boxShadow: "none",
                  bg: "transparent",
                  borderColor: colors.border,
                  color: colors.subtext,
                }}
              >
                <Search size={14} style={{ marginRight: 6 }} />
                Search
              </Button>
            </HStack>
          </Flex>
        </Box>

        {/* 2. Pattern Abstraction / Tokenizer Card */}
        <Box
          bg={colors.cardBg}
          borderRadius="16px"
          border={`1px solid ${colors.border}`}
          boxShadow={cardShadow}
          display="flex"
          flexDirection="column"
          overflow="hidden"
        >
          {/* Header */}
          <Flex align="center" justify="space-between" px={4} py={3} bg={isDark ? "#252638" : colors.cardBg} borderBottom={`1px solid ${colors.border}`}>
            <Flex align="center" gap={3} minW={0}>
              <Flex gap={1.5} align="center">
                <Box w="10px" h="10px" borderRadius="full" bg="#ed8796" />
                <Box w="10px" h="10px" borderRadius="full" bg="#eed49f" />
                <Box w="10px" h="10px" borderRadius="full" bg="#a6da95" />
              </Flex>
              <Flex align="center" gap={1.5} ml={2} minW={0}>
                <Wand2 size={14} color={colors.subtext} />
                <Text fontSize="12.5px" fontWeight="bold" color={colors.text} whiteSpace="nowrap">
                  PATTERN COMPILER --LIVE
                </Text>
              </Flex>
            </Flex>

            {seedText.trim() && (
              <IconButton
                aria-label="Toggle stripping rules"
                variant="ghost"
                size="xs"
                h="24px"
                w="24px"
                color={showRulesTable ? c.sapphire : c.overlay1}
                _hover={{ color: colors.text, bg: colors.rowHover }}
                onClick={() => setShowRulesTable(!showRulesTable)}
              >
                <Info size={12} />
              </IconButton>
            )}
          </Flex>

          {/* Compiler Body */}
          <Box p={4} flex="1" display="flex" flexDirection="column" gap={4} bg={isDark ? "#1e1e2e" : colors.subBg}>
            {!seedText.trim() ? (
              <Flex
                direction="column"
                align="center"
                justify="center"
                flex="1"
                gap={3}
                py={12}
                color={colors.subtext}
              >
                <Wand2 size={32} color={colors.border} />
                <Text fontSize="xs" fontWeight="bold">
                  Waiting for scenario description...
                </Text>
                <Text fontSize="2xs" maxW="280px" textAlign="center" lineHeight="1.4">
                  Describe a scenario in the console on the left. The live compiler will tokenize and abstract it here.
                </Text>
              </Flex>
            ) : (
              <Flex direction="column" gap={4} h="100%">
                {/* 2a. Live Tokenizer Stream */}
                <Box>
                  <Text fontSize="10px" fontWeight="bold" color={colors.subtext} mb={2} letterSpacing="0.05em">
                    LIVE TOKENIZER STREAM
                  </Text>
                  
                  <AnimatePresence>
                    {showRulesTable && (
                      <MotionBox
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        bg={isDark ? "#181825" : colors.cardBg}
                        p={2.5}
                        mb={2.5}
                        borderRadius="md"
                        fontSize="9px"
                        fontFamily="mono"
                        color={colors.subtext}
                        border={`1px solid ${colors.border}`}
                      >
                        <Grid templateColumns="1fr 1fr" gap={1}>
                          <Text color={c.mauve}>URLs:</Text>
                          <Text color={c.red}>[Stripped]</Text>
                          <Text color={c.mauve}>PII/Emails:</Text>
                          <Text color={c.red}>[Stripped]</Text>
                          <Text color={c.mauve}>Quotes/Strings:</Text>
                          <Text color={c.red}>[Stripped]</Text>
                          <Text color={c.mauve}>Prices/Numbers:</Text>
                          <Text color={c.red}>[Stripped]</Text>
                        </Grid>
                      </MotionBox>
                    )}
                  </AnimatePresence>

                  <Flex
                    flexWrap="wrap"
                    gap={1.5}
                    p={3}
                    bg={isDark ? "#181825" : colors.cardBg}
                    borderRadius="10px"
                    border={`1px solid ${colors.border}`}
                    maxH="130px"
                    overflowY="auto"
                    className="glass-scroll-area"
                  >
                    {tokenizeText(seedText).map((token, idx) => (
                      <InteractiveToken key={idx} token={token} c={c} />
                    ))}
                  </Flex>
                </Box>

                {/* 2b. Abstracted Playbook Shape */}
                <Box flex="1" display="flex" flexDirection="column">
                  <Text fontSize="10px" fontWeight="bold" color={colors.subtext} mb={2} letterSpacing="0.05em">
                    ABSTRACTED PLAYBOOK SHAPE
                  </Text>
                  <Box
                    flex="1"
                    p={3.5}
                    bg={isDark ? "#181825" : colors.cardBg}
                    border={`1px solid ${colors.border}`}
                    borderRadius="10px"
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, monospace"
                    fontSize="12px"
                    color={c.mauve}
                    overflowY="auto"
                    className="glass-scroll-area"
                    minH="80px"
                  >
                    {loading ? (
                      <Flex align="center" gap={2} color={colors.subtext}>
                        <Spinner size="xs" color={c.mauve} />
                        <Text fontSize="11px">Compiling and running vector search...</Text>
                      </Flex>
                    ) : result ? (
                      <Flex align="center" gap={2}>
                        <Text fontWeight="700">{result.abstracted}</Text>
                      </Flex>
                    ) : (
                      <Text color={colors.subtext} fontStyle="italic">
                        Click "Search" to view the finalized abstraction shape used for matching.
                      </Text>
                    )}
                  </Box>
                </Box>
              </Flex>
            )}
          </Box>
        </Box>
      </Grid>

      {/* ── Results Workbench (Full Width) ─────────────────────────── */}
      <Box
        w="100%"
        bg={colors.cardBg}
        border={`1px solid ${colors.border}`}
        borderRadius="24px"
        p={{ base: 4, md: 5 }}
        boxShadow={cardShadow}
        display="flex"
        flexDirection="column"
        gap={4}
      >
        {/* Tabs Header */}
        <Flex
          borderBottom={`1px solid ${colors.border}`}
          pb={2.5}
          gap={2}
          overflowX="auto"
        >
          {[
            {
              id: "patterns" as const,
              label: "Matches Feed",
              count: result
                ? result.inApp.length + result.crossApp.length
                : undefined,
            },
            { id: "journey" as const, label: "Pipeline Journey" },
            {
              id: "specs" as const,
              label: "Specs Database",
              count: specs.length,
            },
            {
              id: "apps" as const,
              label: "Apps Directory",
              count: apps.length,
            },
          ].map((tab) => {
            const isSelected = activeResultsTab === tab.id;
            return (
              <Button
                key={tab.id}
                onClick={() => setActiveResultsTab(tab.id)}
                variant="outline"
                size="sm"
                h="32px"
                borderRadius="8px"
                bg={isSelected ? catppuccinAlpha(c.sapphire, 0.08) : "transparent"}
                borderColor={isSelected ? catppuccinAlpha(c.sapphire, 0.3) : "transparent"}
                color={isSelected ? c.sapphire : colors.subtext}
                fontWeight="bold"
                transition="all 0.15s ease"
                _hover={{ bg: colors.rowHover, color: colors.text }}
                px={4}
                flexShrink={0}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <Text
                    as="span"
                    ml={1.5}
                    px={1.5}
                    py={0.25}
                    bg={isSelected ? catppuccinAlpha(c.sapphire, 0.12) : colors.subBg}
                    borderRadius="full"
                    fontSize="9px"
                    fontFamily="mono"
                    color={isSelected ? c.sapphire : colors.subtext}
                  >
                    {tab.count}
                  </Text>
                )}
              </Button>
            );
          })}
        </Flex>

        {/* Tab content wrapper */}
        <Box flex="1">
          {/* Tab 1: Matches Feed */}
          {activeResultsTab === "patterns" && (
            <VStack align="stretch" gap={5}>
              {error && (
                <Box
                  bg={colors.cardBg}
                  border={`1px solid ${c.red}`}
                  borderRadius="12px"
                  p={4}
                  color={c.red}
                  fontSize="sm"
                >
                  {error}
                </Box>
              )}

              {loading && !result && (
                <LoadingState c={c} colors={colors} apps={apps.length} />
              )}

              {!loading && !result && !error && (
                <EmptyState c={c} colors={colors} />
              )}

              {result &&
                (() => {
                  const hasHistory = result.inApp.length > 0;
                  const inAppTop = result.inApp[0]?.score ?? 0;
                  const reuseFires =
                    hasHistory && inAppTop >= result.thresholds.reuse;
                  const branch: "reuse" | "fallback" | "new-app" = !hasHistory
                    ? "new-app"
                    : reuseFires
                      ? "reuse"
                      : "fallback";

                  const InApp = (
                    <TierPanel
                      icon={<Building2 size={14} />}
                      accent={c.sapphire}
                      title="In-App Matches"
                      caption={
                        result.appId
                          ? `Scoped to ${appLabel(result.appId)}`
                          : "Select context origin app"
                      }
                      thresholdLabel={`reuse ≥ ${result.thresholds.reuse.toFixed(2)}`}
                      rows={result.inApp}
                      threshold={result.thresholds.reuse}
                      c={c}
                      colors={colors}
                      queryText={seedText}
                      isAppScoped={true}
                      empty="No local memory matches."
                      markTopSent={branch === "reuse"}
                    />
                  );
                  const CrossApp = (
                    <TierPanel
                      accent={c.mauve}
                      title="Cross-App Patterns"
                      caption="Passing global workflow shapes"
                      thresholdLabel={`advisory ≥ ${result.thresholds.pattern.toFixed(2)}`}
                      rows={result.crossApp}
                      threshold={result.thresholds.pattern}
                      c={c}
                      colors={colors}
                      queryText={seedText}
                      isAppScoped={false}
                      showApp
                      empty="No global workflow matches."
                      markTopSent={branch !== "reuse"}
                    />
                  );

                  return (
                    <VStack align="stretch" gap={5}>
                      <DecisionVerdict
                        branch={branch}
                        inAppTop={inAppTop}
                        reuseThreshold={result.thresholds.reuse}
                        appId={result.appId}
                        matchedTitle={result.inApp[0]?.title ?? null}
                        c={c}
                        colors={colors}
                      />

                      {/* Step 1 — in-app, only when the app has prior tests */}
                      {hasHistory && InApp}

                      {/* Step 2 — cross-app */}
                      {branch === "reuse" ? (
                        <SkippedCrossApp
                          revealed={revealSkippedCrossApp}
                          onToggle={() => setRevealSkippedCrossApp((v) => !v)}
                          c={c}
                          colors={colors}
                        >
                          {CrossApp}
                        </SkippedCrossApp>
                      ) : (
                        CrossApp
                      )}
                    </VStack>
                  );
                })()}
            </VStack>
          )}

          {/* Tab 2: Pipeline Journey */}
          {activeResultsTab === "journey" && (
            <PipelineJourney
              seedText={seedText}
              result={result}
              c={c}
              colors={colors}
            />
          )}

          {/* Tab 3: Specs Database */}
          {activeResultsTab === "specs" && (
            <Flex
              direction={{ base: "column", lg: "row" }}
              gap={5}
              align="stretch"
              minH="500px"
            >
              {/* Left Explorer Tree Pane (Fixed Width 300px on desktop) */}
              <Box
                w={{ base: "100%", lg: "300px" }}
                display="flex"
                flexDirection="column"
                gap={3}
                flexShrink={0}
              >
                <Input
                  placeholder="Search database specs by title, file, or domain..."
                  size="xs"
                  value={specsSearchQuery}
                  onChange={(e) => setSpecsSearchQuery(e.target.value)}
                  bg={colors.subBg}
                  borderColor={colors.border}
                  borderRadius="8px"
                  px={3}
                  h="32px"
                  color={colors.text}
                  _focus={{ borderColor: c.sapphire }}
                />

                {loadingSpecs ? (
                  <Flex
                    justify="center"
                    align="center"
                    py={12}
                    gap={2}
                    color={colors.subtext}
                  >
                    <Spinner size="sm" color={c.sapphire} />
                    <Text fontSize="xs">Loading spec database index...</Text>
                  </Flex>
                ) : (
                  (() => {
                    const filtered = specs.filter((s) => {
                      const q = specsSearchQuery.toLowerCase();
                      return (
                        (s.title ?? "").toLowerCase().includes(q) ||
                        s.file.toLowerCase().includes(q) ||
                        s.appId.toLowerCase().includes(q)
                      );
                    });

                    // Group by base domain
                    const grouped: Record<string, SpecInfo[]> = {};
                    for (const spec of filtered) {
                      const baseDomain = getBaseDomain(spec.appId);
                      if (!grouped[baseDomain]) {
                        grouped[baseDomain] = [];
                      }
                      grouped[baseDomain].push(spec);
                    }

                    const baseDomains = Object.keys(grouped).sort();

                    if (baseDomains.length === 0) {
                      return (
                        <Flex
                          direction="column"
                          align="center"
                          gap={2}
                          py={12}
                          color={colors.subtext}
                        >
                          <Database size={24} />
                          <Text fontSize="xs">No matching specs found.</Text>
                        </Flex>
                      );
                    }

                    return (
                      <VStack
                        align="stretch"
                        gap={2}
                        maxH="460px"
                        overflowY="auto"
                        className="glass-scroll-area"
                        pr={1}
                      >
                        {baseDomains.map((baseDomain) => {
                          const appSpecs = grouped[baseDomain];
                          const isExpanded = specsSearchQuery.trim()
                            ? true
                            : expandedApps[baseDomain] !== false;
                          return (
                            <Box key={baseDomain}>
                              {/* Folder Header */}
                              <Flex
                                align="center"
                                justify="space-between"
                                py={1.5}
                                px={2.5}
                                cursor="pointer"
                                borderRadius="lg"
                                _hover={{ bg: colors.rowHover }}
                                onClick={() => {
                                  setExpandedApps((prev) => ({
                                    ...prev,
                                    [baseDomain]: !isExpanded,
                                  }));
                                }}
                              >
                                <HStack gap={2.5} truncate>
                                  {isExpanded ? (
                                    <FolderOpen
                                      size={14}
                                      color={c.sapphire}
                                      style={{ flexShrink: 0 }}
                                    />
                                  ) : (
                                    <FolderClosed
                                      size={14}
                                      color={colors.subtext}
                                      style={{ flexShrink: 0 }}
                                    />
                                  )}
                                  <Text
                                    fontSize="xs"
                                    fontWeight="bold"
                                    color={
                                      isExpanded
                                        ? colors.text
                                        : colors.subtext
                                    }
                                    truncate
                                  >
                                    {baseDomain}
                                  </Text>
                                </HStack>
                                <Text
                                  fontSize="10px"
                                  color={colors.subtext}
                                  px={1.5}
                                  py={0.25}
                                  bg={colors.subBg}
                                  borderRadius="full"
                                  border={`1px solid ${colors.border}`}
                                >
                                  {appSpecs.length}
                                </Text>
                              </Flex>

                              {/* Folder Children */}
                              {isExpanded && (
                                <VStack
                                  align="stretch"
                                  gap={1}
                                  pl={4}
                                  mt={1}
                                  borderLeft={`1px solid ${colors.border}`}
                                >
                                  {appSpecs.map((spec, specIdx) => {
                                    const isSelected =
                                      selectedDbSpec?.file === spec.file &&
                                      selectedDbSpec?.runId === spec.runId;
                                    return (
                                      <Flex
                                        key={specIdx}
                                        align="center"
                                        gap={2}
                                        py={1.5}
                                        px={2.5}
                                        cursor="pointer"
                                        borderRadius="md"
                                        bg={
                                          isSelected
                                            ? catppuccinAlpha(
                                                c.sapphire,
                                                0.12,
                                              )
                                            : "transparent"
                                        }
                                        borderLeft="2px solid"
                                        borderColor={
                                          isSelected
                                            ? c.sapphire
                                            : "transparent"
                                        }
                                        color={
                                          isSelected
                                            ? colors.text
                                            : colors.subtext
                                        }
                                        _hover={{
                                          bg: colors.rowHover,
                                          color: colors.text,
                                        }}
                                        onClick={() =>
                                          setSelectedDbSpec(spec)
                                        }
                                      >
                                        <FileCode2
                                          size={12}
                                          color={
                                            isSelected
                                              ? c.sapphire
                                              : colors.subtext
                                          }
                                          style={{ flexShrink: 0 }}
                                        />
                                        <Box truncate flex="1">
                                          <Text
                                            fontSize="11px"
                                            fontWeight={
                                              isSelected ? "bold" : "medium"
                                            }
                                            truncate
                                          >
                                            {spec.title ??
                                              spec.file.split("/").pop() ??
                                              "(untitled)"}
                                          </Text>
                                        </Box>
                                      </Flex>
                                    );
                                  })}
                                </VStack>
                              )}
                            </Box>
                          );
                        })}
                      </VStack>
                    );
                  })()
                )}
              </Box>

              {/* Vertical Divider */}
              <Box
                w="1px"
                bg={colors.border}
                display={{ base: "none", lg: "block" }}
                alignSelf="stretch"
              />

              {/* Right Code Viewer Pane (Fills remaining space) */}
              <Box
                flex="1"
                bg={colors.subBg}
                border={`1px solid ${colors.border}`}
                borderRadius="20px"
                overflow="hidden"
                display="flex"
                flexDirection="column"
                h="500px"
              >
                {!selectedDbSpec ? (
                  <Flex
                    direction="column"
                    align="center"
                    justify="center"
                    flex="1"
                    gap={3}
                    p={6}
                    color={colors.subtext}
                  >
                    <Database size={32} color={colors.border} />
                    <Text fontSize="xs" fontWeight="bold">
                      No spec selected
                    </Text>
                    <Text
                      fontSize="2xs"
                      maxW="280px"
                      textAlign="center"
                      lineHeight="1.4"
                    >
                      Select a test specification from the tree explorer on
                      the left to inspect its Playwright source code.
                    </Text>
                  </Flex>
                ) : loadingDbSpecCode ? (
                  <Flex
                    direction="column"
                    align="center"
                    justify="center"
                    flex="1"
                    gap={3}
                    p={6}
                    color={colors.subtext}
                  >
                    <Spinner size="md" color={c.sapphire} />
                    <Text fontSize="xs">Loading spec code...</Text>
                  </Flex>
                ) : (
                  <Flex direction="column" h="100%">
                    {/* Editor Header */}
                    <Flex
                      align="center"
                      justify="space-between"
                      p={3.5}
                      borderBottom={`1px solid ${colors.border}`}
                      bg={isDark ? "#252638" : colors.cardBg}
                    >
                      <Flex align="center" gap={2.5} minW={0} flex="1">
                        <Flex gap={1.5} align="center">
                          <Box w="8px" h="8px" borderRadius="full" bg="#ed8796" />
                          <Box w="8px" h="8px" borderRadius="full" bg="#eed49f" />
                          <Box w="8px" h="8px" borderRadius="full" bg="#a6da95" />
                        </Flex>
                        <Flex align="center" gap={1.5} ml={2} minW={0}>
                          <FileCode2 size={13} color={colors.subtext} />
                          <Text fontSize="11.5px" fontWeight="bold" color={colors.text} truncate>
                            {selectedDbSpec.title ?? "(untitled)"}
                          </Text>
                          <Text fontSize="10px" color={colors.subtext} truncate display={{ base: "none", md: "block" }}>
                            · {selectedDbSpec.file}
                          </Text>
                        </Flex>
                      </Flex>

                      {/* Actions */}
                      <HStack gap={2} flexShrink={0}>
                        <Button
                          size="xs"
                          variant="outline"
                          borderColor={c.green}
                          color={c.green}
                          bg="transparent"
                          transition="all 0.18s ease"
                          _hover={{
                            bg: c.green,
                            color: isDark ? c.crust : "#ffffff",
                            transform: "translateY(-1.5px) scale(1.02)",
                            boxShadow: `0 0 12px ${catppuccinAlpha(c.green, 0.4)}`,
                          }}
                          _active={{ transform: "scale(0.97)" }}
                          onClick={() => {
                            if (selectedDbSpec.title) {
                              setSeedText(selectedDbSpec.title);
                              run();
                            }
                          }}
                          fontSize="10px"
                          h="26px"
                          px={2.5}
                        >
                          <Sparkles size={11} style={{ marginRight: 4 }} />
                          Analyze
                        </Button>

                        <Button
                          size="xs"
                          variant="outline"
                          borderColor={c.sapphire}
                          color={c.sapphire}
                          bg="transparent"
                          transition="all 0.18s ease"
                          _hover={{
                            bg: c.sapphire,
                            color: isDark ? c.crust : "#ffffff",
                            transform: "translateY(-1.5px) scale(1.02)",
                            boxShadow: `0 0 12px ${catppuccinAlpha(c.sapphire, 0.4)}`,
                          }}
                          _active={{ transform: "scale(0.97)" }}
                          onClick={() => {
                            if (selectedDbSpecCode) {
                              navigator.clipboard.writeText(selectedDbSpecCode);
                            }
                          }}
                          fontSize="10px"
                          h="26px"
                          px={2.5}
                        >
                          <Copy size={11} style={{ marginRight: 4 }} />
                          Copy Code
                        </Button>
                      </HStack>
                    </Flex>

                    {/* Editor Code Body */}
                    <Box flex="1" overflow="hidden" p={2} bg="#1e1e2e">
                      <CodeHighlighter
                        code={selectedDbSpecCode ?? ""}
                        c={c}
                        colors={colors}
                      />
                    </Box>
                  </Flex>
                )}
              </Box>
            </Flex>
          )}

          {/* Tab 4: Apps Directory */}
          {activeResultsTab === "apps" && (
            <Grid
              templateColumns={{
                base: "1fr",
                sm: "repeat(2, 1fr)",
                md: "repeat(3, 1fr)",
              }}
              gap={2.5}
              maxH="420px"
              overflowY="auto"
              className="glass-scroll-area"
              pr={1}
            >
              {apps.map((app) => (
                <Flex
                  key={app.appId}
                  p={3}
                  bg={colors.subBg}
                  borderRadius="xl"
                  align="center"
                  justify="space-between"
                  border={`1px solid ${colors.border}`}
                  fontSize="xs"
                  cursor="pointer"
                  _hover={{ borderColor: c.sapphire, bg: colors.rowHover }}
                  onClick={() => {
                    setSpecsSearchQuery(appLabel(app.appId));
                    setActiveResultsTab("specs");
                  }}
                >
                  <HStack gap={2} truncate>
                    <Globe size={13} color={c.mauve} />
                    <Text
                      fontFamily="mono"
                      color={colors.text}
                      fontWeight="bold"
                      truncate
                    >
                      {appLabel(app.appId)}
                    </Text>
                  </HStack>
                  <Text
                    px={2}
                    py={0.5}
                    bg={colors.cardBg}
                    color={c.sapphire}
                    borderRadius="full"
                    fontWeight="bold"
                    fontSize="10px"
                    border={`1px solid ${colors.border}`}
                    flexShrink={0}
                  >
                    {app.specCount}
                  </Text>
                </Flex>
              ))}
            </Grid>
          )}
        </Box>
      </Box>
{/* ── Interactive Spec Code Viewer Modal ────────────────────── */}
      <AnimatePresence>
        {viewingSpec && (
          <Box
            position="fixed"
            top={0}
            left={0}
            right={0}
            bottom={0}
            zIndex={500}
            display="flex"
            alignItems="center"
            justifyContent="center"
            p={4}
          >
            {/* Backdrop */}
            <MotionBox
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              bg="rgba(10, 12, 18, 0.75)"
              backdropFilter="blur(5px)"
              onClick={() => setViewingSpec(null)}
            />

            {/* Modal Card */}
            <MotionBox
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              position="relative"
              w="100%"
              maxW="800px"
              bg={colors.cardBg}
              border={`1px solid ${colors.border}`}
              borderRadius="24px"
              boxShadow="2xl"
              overflow="hidden"
              zIndex={510}
            >
              {/* Header */}
              <Flex
                align="center"
                justify="space-between"
                p={4}
                borderBottom={`1px solid ${colors.border}`}
                bg={colors.subBg}
              >
                <HStack gap={3} overflow="hidden">
                  <Box
                    color={c.sapphire}
                    p={2}
                    bg={catppuccinAlpha(c.sapphire, 0.12)}
                    borderRadius="lg"
                  >
                    <FileCode2 size={20} />
                  </Box>
                  <VStack align="stretch" gap={0.5} overflow="hidden">
                    <Text
                      fontSize="sm"
                      fontWeight="bold"
                      color={colors.text}
                      truncate
                    >
                      {viewingSpec.title ?? "(untitled)"}
                    </Text>
                    <Text
                      fontSize="10px"
                      fontFamily="mono"
                      color={colors.subtext}
                      truncate
                    >
                      {viewingSpec.file}
                    </Text>
                  </VStack>
                </HStack>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setViewingSpec(null)}
                  color={colors.subtext}
                  _hover={{ color: colors.text, bg: colors.rowHover }}
                >
                  Close
                </Button>
              </Flex>

              {/* Body */}
              <Box p={4}>
                {loadingCode ? (
                  <Flex
                    direction="column"
                    align="center"
                    justify="center"
                    py={20}
                    gap={3}
                    color={colors.subtext}
                  >
                    <Spinner size="md" color={c.sapphire} />
                    <Text fontSize="xs">
                      Decompressing spec code from database report...
                    </Text>
                  </Flex>
                ) : viewingSpecCode ? (
                  <VStack align="stretch" gap={3.5}>
                    <CodeHighlighter
                      code={viewingSpecCode}
                      c={c}
                      colors={colors}
                    />
                    <Flex justify="flex-end" gap={3}>
                      <Button
                        size="xs"
                        variant="outline"
                        borderColor={colors.border}
                        color={colors.text}
                        _hover={{ bg: colors.subBg }}
                        onClick={() => {
                          navigator.clipboard.writeText(viewingSpecCode);
                        }}
                      >
                        Copy Spec Code
                      </Button>
                    </Flex>
                  </VStack>
                ) : (
                  <Flex
                    py={16}
                    justify="center"
                    align="center"
                    color={colors.subtext}
                  >
                    <Text fontSize="xs">Failed to load spec code details.</Text>
                  </Flex>
                )}
              </Box>
            </MotionBox>
          </Box>
        )}
      </AnimatePresence>
    </Box>
  );
}

/* ── Interactive Token Component ── */
function InteractiveToken({ token, c }: { token: Token; c: Palette }) {
  const [hovered, setHovered] = useState(false);

  if (token.type === "space") {
    return (
      <Text as="span" px={0.5}>
        {" "}
      </Text>
    );
  }

  const isStripped = token.stripped;

  return (
    <Box position="relative" display="inline-block" my={0.5}>
      <MotionBox
        as="span"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        px={1.5}
        py={0.5}
        borderRadius="4px"
        bg={
          isStripped
            ? catppuccinAlpha(c.red, 0.12)
            : catppuccinAlpha(c.green, 0.1)
        }
        color={isStripped ? c.red : c.green}
        border="1px dashed"
        borderColor={
          isStripped
            ? catppuccinAlpha(c.red, 0.3)
            : catppuccinAlpha(c.green, 0.2)
        }
        textDecoration={isStripped ? "line-through" : "none"}
        cursor={isStripped ? "help" : "default"}
        whileHover={{ scale: 1.05, y: -1 }}
        transition={{ duration: 0.15 }}
        fontSize="sm"
        fontFamily="mono"
      >
        {token.text}
      </MotionBox>

      <AnimatePresence>
        {hovered && isStripped && (
          <MotionBox
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            position="absolute"
            bottom="130%"
            left="50%"
            transform="translateX(-50%)"
            bg={c.mantle}
            border={`1px solid ${c.surface2}`}
            borderRadius="8px"
            p={3}
            boxShadow="0 4px 16px rgba(0,0,0,0.3)"
            zIndex={200}
            w="240px"
          >
            <Flex align="center" gap={1.5} mb={1}>
              <Layers size={12} color={c.red} />
              <Text
                fontSize="10px"
                fontWeight="bold"
                color={c.red}
                textTransform="uppercase"
              >
                {token.type} Stripped
              </Text>
            </Flex>
            <Text fontSize="xs" color={c.text} lineHeight="1.4">
              {token.explanation}
            </Text>
            <Box
              mt={1.5}
              pt={1}
              borderTop={`1px solid ${c.surface1}`}
              fontSize="9px"
              color={c.overlay1}
            >
              Normalized to space in abstracted embedding vector.
            </Box>
          </MotionBox>
        )}
      </AnimatePresence>
    </Box>
  );
}

/* ── Raw → abstracted transform banner ──────────────────────── */
function TransformBanner({
  raw,
  abstracted,
  c,
  colors,
}: {
  raw: string;
  abstracted: string;
  c: Palette;
  colors: any;
}) {
  return (
    <Flex
      align="center"
      gap={3}
      bg={colors.cardBg}
      border={`1px solid ${colors.border}`}
      borderRadius="14px"
      p={4}
      mb={5}
      flexWrap="wrap"
      boxShadow="sm"
    >
      <Flex align="center" gap={2} color={colors.subtext} flexShrink={0}>
        <Layers size={14} />
        <Text fontSize="xs" fontWeight="700" textTransform="uppercase">
          Workflow Shape
        </Text>
      </Flex>
      <Text
        fontFamily="mono"
        fontSize="xs"
        color={colors.subtext}
        textDecoration="line-through"
        textDecorationColor={c.red}
      >
        {raw}
      </Text>
      <ArrowRight size={16} color={c.mauve} />
      <Flex align="center" gap={1.5}>
        <Wand2 size={12} color={c.mauve} />
        <Text fontFamily="mono" fontSize="sm" color={c.mauve} fontWeight="700">
          {abstracted || "—"}
        </Text>
      </Flex>
    </Flex>
  );
}

/* ── Decision verdict — which branch the Designer takes ──────── */
function DecisionVerdict({
  branch,
  inAppTop,
  reuseThreshold,
  appId,
  matchedTitle,
  c,
  colors,
}: {
  branch: "reuse" | "fallback" | "new-app";
  inAppTop: number;
  reuseThreshold: number;
  appId: string | null;
  matchedTitle: string | null;
  c: Palette;
  colors: any;
}) {
  const cfg =
    branch === "reuse"
      ? {
          accent: c.green,
          icon: <Check size={16} />,
          title: "Reuse the existing test",
          body: (
            <>
              In-app match{" "}
              <b style={{ color: c.green }}>{inAppTop.toFixed(3)}</b> ≥{" "}
              {reuseThreshold.toFixed(2)} — the Designer copies{" "}
              {matchedTitle ? <b>“{matchedTitle}”</b> : "the prior test"}{" "}
              forward.{" "}
              <Text as="span" color={colors.subtext}>
                Cross-app search is not performed.
              </Text>
            </>
          ),
        }
      : branch === "fallback"
        ? {
            accent: c.mauve,
            icon: <CornerDownLeft size={16} />,
            title: "Fall back to cross-app search",
            body: (
              <>
                Best in-app match{" "}
                <b style={{ color: c.mauve }}>{inAppTop.toFixed(3)}</b> &lt;{" "}
                {reuseThreshold.toFixed(2)} — no local test clears the reuse
                bar, so the Designer searches global patterns and generates a
                fresh test from them.
              </>
            ),
          }
        : {
            accent: c.mauve,
            icon: <Globe size={16} />,
            title: "New app — go straight to cross-app search",
            body: (
              <>
                No in-app history{appId ? "" : " (no context app selected)"} —
                the Designer skips in-app reuse and searches global cross-app
                patterns to inform a fresh test.
              </>
            ),
          };

  // Which tier the decision lands on — drives the highlighted route below.
  const inAppState: "active" | "muted" =
    branch === "reuse" ? "active" : "muted";
  const crossState: "active" | "skipped" | "muted" =
    branch === "reuse" ? "skipped" : "active";
  const inAppSub =
    branch === "reuse"
      ? "reused"
      : branch === "fallback"
        ? "no match"
        : "no history";
  const crossSub = branch === "reuse" ? "skipped" : "used";

  const chip = (
    label: string,
    sub: string,
    state: "active" | "muted" | "skipped",
    color: string,
  ) => {
    const active = state === "active";
    const skipped = state === "skipped";
    return (
      <Flex
        direction="column"
        align="center"
        gap={0}
        px={3}
        py={1.5}
        minW="92px"
        borderRadius="10px"
        border={`1px ${skipped ? "dashed" : "solid"} ${active ? color : colors.border}`}
        bg={active ? catppuccinAlpha(color, 0.13) : "transparent"}
        opacity={active ? 1 : 0.6}
      >
        <Text
          fontSize="11px"
          fontWeight="800"
          letterSpacing="0.04em"
          color={active ? color : colors.subtext}
          textDecoration={skipped ? "line-through" : undefined}
        >
          {label}
        </Text>
        <Text
          fontSize="9px"
          fontWeight="600"
          textTransform="uppercase"
          letterSpacing="0.05em"
          color={active ? color : colors.subtext}
        >
          {sub}
        </Text>
      </Flex>
    );
  };

  return (
    <Flex
      align="center"
      justify="space-between"
      gap={4}
      flexWrap="wrap"
      bg={colors.cardBg}
      border={`1px solid ${colors.border}`}
      borderRadius="14px"
      p={4}
      boxShadow="sm"
    >
      <Box flex="1" minW="240px">
        <Text
          fontSize="10px"
          fontWeight="700"
          letterSpacing="0.06em"
          textTransform="uppercase"
          color={colors.subtext}
        >
          Designer decision
        </Text>
        <Text fontSize="md" fontWeight="700" color={colors.text} mt={0.5}>
          {cfg.title}
        </Text>
        <Text fontSize="sm" color={colors.text} mt={1} lineHeight="1.5">
          {cfg.body}
        </Text>
      </Box>

      {/* Highlighted route: which tier answered — in-app vs cross-app */}
      <Flex align="center" gap={2} flexShrink={0}>
        {chip("IN-APP", inAppSub, inAppState, c.sapphire)}
        <ArrowRight
          size={16}
          color={crossState === "active" ? c.mauve : colors.subtext}
          style={{ opacity: crossState === "active" ? 1 : 0.4 }}
        />
        {chip("CROSS-APP", crossSub, crossState, c.mauve)}
      </Flex>
    </Flex>
  );
}

/* ── Collapsed wrapper: cross-app not consulted when reuse fires ── */
function SkippedCrossApp({
  revealed,
  onToggle,
  c,
  colors,
  children,
}: {
  revealed: boolean;
  onToggle: () => void;
  c: Palette;
  colors: any;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Flex
        align="center"
        justify="space-between"
        gap={3}
        bg={colors.subBg}
        border={`1px dashed ${colors.border}`}
        borderRadius="14px"
        px={4}
        py={3}
        opacity={0.85}
      >
        <Flex align="center" gap={2} color={colors.subtext}>
          <Globe size={14} />
          <Text fontSize="sm">
            Cross-app search <b style={{ color: colors.text }}>not performed</b>{" "}
            — in-app reuse was satisfactory.
          </Text>
        </Flex>
        <Button
          size="xs"
          variant="ghost"
          color={c.sapphire}
          onClick={onToggle}
          flexShrink={0}
        >
          {revealed ? (
            <>
              <ChevronUp size={13} style={{ marginRight: 4 }} /> Hide
            </>
          ) : (
            <>
              <ChevronDown size={13} style={{ marginRight: 4 }} /> Inspect
              anyway
            </>
          )}
        </Button>
      </Flex>
      {revealed && <Box mt={4}>{children}</Box>}
    </Box>
  );
}

/* ── A tier panel (in-app or cross-app) ─────────────────────── */
function TierPanel({
  icon,
  accent,
  title,
  caption,
  thresholdLabel,
  rows,
  threshold,
  showApp = false,
  c,
  colors,
  queryText,
  isAppScoped,
  empty,
  flex,
  markTopSent = false,
}: {
  icon?: React.ReactNode;
  accent: string;
  title: string;
  caption: string;
  thresholdLabel: string;
  rows: (InAppMatch | CrossAppMatch)[];
  threshold: number;
  showApp?: boolean;
  c: Palette;
  colors: any;
  queryText: string;
  isAppScoped: boolean;
  empty: string;
  flex?: string;
  /** Mark the single match actually sent to the generator (top one ≥ threshold). */
  markTopSent?: boolean;
}) {
  const top = rows[0]?.score ?? 0;
  const aboveBar = rows.filter((r) => r.score >= threshold).length;
  // Rows arrive sorted by score desc, so the first one ≥ threshold is "the" match
  // the generator would receive (PATTERN_K = 1). -1 when none clears the floor.
  const sentIdx = markTopSent
    ? rows.findIndex((r) => r.score >= threshold)
    : -1;

  return (
    <Box
      flex={flex}
      bg={colors.cardBg}
      border={`1px solid ${colors.border}`}
      borderRadius="20px"
      overflow="hidden"
      alignSelf="flex-start"
      w="100%"
      boxShadow="lg"
    >
      {/* header */}
      <Box p={4} borderBottom={`1px solid ${colors.border}`}>
        <Flex align="center" justify="space-between" gap={3} mb={1}>
          <Flex align="center" gap={2}>
            {icon && <Box color={accent}>{icon}</Box>}
            <Heading size="sm" fontWeight="700" color={colors.text}>
              {title}
            </Heading>
          </Flex>
          <Box
            px={2.5}
            py={0.5}
            borderRadius="999px"
            bg={colors.subBg}
            color={colors.subtext}
            fontSize="xs"
            fontWeight="700"
            border={`1px solid ${colors.border}`}
          >
            {rows.length} {rows.length === 1 ? "match" : "matches"}
          </Box>
        </Flex>
        <Text fontSize="xs" color={colors.subtext}>
          {caption}
        </Text>

        {rows.length > 0 && (
          <Flex gap={4} mt={3}>
            <Stat
              label="Top Score"
              value={top.toFixed(3)}
              accent={accent}
              c={c}
              colors={colors}
            />
            <Stat
              label="Above Bar"
              value={`${aboveBar} / ${rows.length}`}
              accent={accent}
              c={c}
              colors={colors}
            />
            <Stat
              label="Threshold Limit"
              value={thresholdLabel}
              c={c}
              colors={colors}
            />
          </Flex>
        )}
      </Box>

      {/* rows */}
      {rows.length === 0 ? (
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap={2}
          py={12}
          color={colors.subtext}
        >
          <Target size={26} />
          <Text fontSize="sm">{empty}</Text>
        </Flex>
      ) : (
        <Box>
          {rows.map((r, i) => (
            <MatchRowInteractive
              key={`${r.runId}-${r.file}-${i}`}
              rank={i + 1}
              title={r.title}
              file={r.file}
              score={r.score}
              threshold={threshold}
              accent={accent}
              app={showApp ? appLabel((r as CrossAppMatch).appId) : undefined}
              appId={showApp ? (r as CrossAppMatch).appId : null}
              semTitle={(r as InAppMatch).semTitle}
              semIntent={(r as InAppMatch).semIntent}
              workflow={(r as CrossAppMatch).workflow}
              c={c}
              colors={colors}
              last={i === rows.length - 1}
              queryText={queryText}
              isAppScoped={isAppScoped}
              sent={i === sentIdx}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

function Stat({
  label,
  value,
  accent,
  c,
  colors,
}: {
  label: string;
  value: string;
  accent?: string;
  c: Palette;
  colors: any;
}) {
  return (
    <Box>
      <Text
        fontSize="2xs"
        color={colors.subtext}
        textTransform="uppercase"
        fontWeight="bold"
      >
        {label}
      </Text>
      <Text
        fontSize="sm"
        fontWeight="700"
        fontFamily="mono"
        color={accent ?? colors.text}
      >
        {value}
      </Text>
    </Box>
  );
}

/* ── Highlighted Title Component for Lexical Overlap ── */
function HighlightedTitle({
  title,
  query,
  c,
  colors,
  fontSize = "sm",
}: {
  title: string | null;
  query: string;
  c: Palette;
  colors: any;
  fontSize?: string;
}) {
  if (!title)
    return (
      <Text
        as="span"
        fontStyle="italic"
        color={colors.subtext}
        fontSize={fontSize}
      >
        (untitled)
      </Text>
    );
  if (!query)
    return (
      <Text as="span" color={colors.text} fontSize={fontSize}>
        {title}
      </Text>
    );

  const cleanWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

  const queryWords = new Set(
    query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean),
  );

  const words = title.split(/(\s+)/);

  return (
    <Text as="span" fontSize={fontSize} fontWeight="600" color={colors.text}>
      {words.map((part, idx) => {
        if (part.trim() === "") return part;
        const cleaned = cleanWord(part);
        const isMatched = queryWords.has(cleaned);
        return (
          <Text
            key={idx}
            as="span"
            color={isMatched ? c.green : colors.text}
            bg={isMatched ? catppuccinAlpha(c.green, 0.15) : "transparent"}
            px={isMatched ? "4px" : 0}
            py={isMatched ? "2px" : 0}
            borderRadius="4px"
            transition="all 0.2s"
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
}

/* ── Interactive Pipeline Simulator Component ── */
function EngineSimulator({
  score,
  threshold,
  isAppScoped,
  c,
  colors,
  appId,
}: {
  score: number;
  threshold: number;
  isAppScoped: boolean;
  c: Palette;
  colors: any;
  appId: string | null;
}) {
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);

  const steps = [
    {
      label: isAppScoped
        ? `Scoping by Origin ID: ${appId ? appLabel(appId) : "Unknown"}`
        : "Excluding current context app",
      delay: 500,
    },
    { label: "Retrieving intent tokens & strips...", delay: 600 },
    { label: "Generating vector search query...", delay: 700 },
    {
      label: `Cosine similarity calculation: ${score.toFixed(3)} vs threshold ${threshold.toFixed(2)}`,
      delay: 600,
    },
  ];

  const runSim = () => {
    setStep(0);
    setRunning(true);
  };

  useEffect(() => {
    if (!running) return;
    if (step >= steps.length) {
      setRunning(false);
      return;
    }
    const timer = setTimeout(() => {
      setStep((s) => s + 1);
    }, steps[step].delay);
    return () => clearTimeout(timer);
  }, [running, step]);

  const meetsBar = score >= threshold;

  return (
    <Box
      bg={colors.cardBg}
      p={3}
      borderRadius="8px"
      border={`1px solid ${colors.border}`}
      mt={3}
    >
      <Flex justify="space-between" align="center" mb={2}>
        <Text
          fontSize="10px"
          fontWeight="800"
          color={colors.subtext}
          letterSpacing="0.05em"
        >
          PIPELINE COGNITIVE SIMULATOR
        </Text>
        {!running && step === 0 ? (
          <Button
            size="xs"
            onClick={runSim}
            bg={c.sapphire}
            color={c.crust}
            _hover={{ bg: c.sky }}
          >
            Simulate Engine
          </Button>
        ) : running ? (
          <Spinner size="xs" color={c.sapphire} />
        ) : (
          <Button
            size="xs"
            variant="outline"
            borderColor={colors.border}
            onClick={runSim}
            color={colors.text}
            _hover={{ bg: colors.subBg }}
          >
            Reset Sim
          </Button>
        )}
      </Flex>

      <VStack align="stretch" gap={2} mt={1.5}>
        {steps.map((s, idx) => {
          const isDone = step > idx;
          const isCurrent = step === idx && running;
          const isPending = step <= idx && !running;

          return (
            <Flex
              key={idx}
              align="center"
              gap={2}
              opacity={isPending ? 0.35 : 1}
            >
              {isDone ? (
                <Text color={c.green} fontSize="xs" fontWeight="bold">
                  ✓
                </Text>
              ) : isCurrent ? (
                <Spinner size="xs" color={c.sapphire} />
              ) : (
                <Box w="6px" h="6px" borderRadius="full" bg={colors.subtext} />
              )}
              <Text
                fontSize="xs"
                color={isCurrent ? c.sapphire : colors.text}
                fontFamily="mono"
              >
                {s.label}
              </Text>
            </Flex>
          );
        })}

        {step === steps.length && (
          <MotionBox
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            mt={2}
            p={2.5}
            borderRadius="6px"
            bg={
              meetsBar
                ? catppuccinAlpha(c.green, 0.1)
                : catppuccinAlpha(c.yellow, 0.1)
            }
            border="1px solid"
            borderColor={
              meetsBar
                ? catppuccinAlpha(c.green, 0.3)
                : catppuccinAlpha(c.yellow, 0.3)
            }
          >
            <Text
              fontSize="xs"
              fontWeight="700"
              color={meetsBar ? c.green : c.yellow}
            >
              {meetsBar
                ? isAppScoped
                  ? "✅ DECISION: DETERMINISTIC REUSE (verbatim spec copy skipped LLM generation)"
                  : "ℹ️ DECISION: GLOBAL PATTERN ADVISORY (injected into prompt few-shot context)"
                : "⚠️ DECISION: RE-GENERATE SPEC (score below retrieval bars)"}
            </Text>
          </MotionBox>
        )}
      </VStack>
    </Box>
  );
}

/* ── A single interactive match row with a score bar and collapsible details ── */
function MatchRowInteractive({
  rank,
  title,
  file,
  score,
  threshold,
  accent,
  app,
  appId = null,
  semTitle,
  semIntent,
  workflow,
  c,
  colors,
  last,
  queryText,
  isAppScoped,
  sent = false,
}: {
  rank: number;
  title: string | null;
  file: string;
  score: number;
  threshold: number;
  accent: string;
  app?: string;
  appId?: string | null;
  semTitle?: number;
  semIntent?: number;
  workflow?: string;
  c: Palette;
  colors: any;
  last: boolean;
  queryText: string;
  isAppScoped: boolean;
  /** This is the single match actually passed to the generator. */
  sent?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const clears = score >= threshold;
  const near = !clears && score >= threshold - 0.05;
  const barColor = clears ? c.green : near ? c.yellow : c.overlay0;

  // In-app rows carry the hybrid breakdown: score = 0.5·title + 0.5·intent.
  const hasBreakdown =
    isAppScoped && semTitle !== undefined && semIntent !== undefined;

  const copyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(file);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Lexical overlap parsing
  const clean = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);
  const qWords = clean(queryText);
  const tWords = clean(title ?? "");
  const qSet = new Set(qWords);
  const overlap = tWords.filter((w) => qSet.has(w));
  const uniqueOverlap = Array.from(new Set(overlap));

  return (
    <Box
      px={4}
      py={3}
      borderBottom={last ? "none" : `1px solid ${colors.border}`}
      borderLeft={sent ? `3px solid ${accent}` : "3px solid transparent"}
      bg={sent ? catppuccinAlpha(accent, 0.08) : undefined}
      transition="all 0.15s"
      _hover={{ bg: sent ? catppuccinAlpha(accent, 0.12) : colors.rowHover }}
      cursor="pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <Flex align="center" gap={3}>
        {/* Toggle arrow indicator */}
        <Box
          color={colors.subtext}
          transition="transform 0.2s"
          style={{ transform: expanded ? "rotate(90deg)" : "none" }}
        >
          <ArrowRight size={14} />
        </Box>

        <Text
          fontSize="xs"
          fontFamily="mono"
          color={colors.subtext}
          w="18px"
          flexShrink={0}
        >
          {rank}
        </Text>
        <Box flex="1" minW={0}>
          {sent && (
            <Flex
              align="center"
              gap={1}
              mb={1}
              px={1.5}
              py={0.5}
              borderRadius="999px"
              bg={catppuccinAlpha(accent, 0.18)}
              border={`1px solid ${catppuccinAlpha(accent, 0.4)}`}
              color={accent}
              w="fit-content"
            >
              {isAppScoped ? (
                <Copy size={10} />
              ) : (
                <ArrowRight size={10} style={{ transform: "rotate(-45deg)" }} />
              )}
              <Text fontSize="9px" fontWeight="800" letterSpacing="0.05em">
                {isAppScoped ? "RE-USED BY DESIGNER" : "SENT TO DESIGNER"}
              </Text>
            </Flex>
          )}
          <HighlightedTitle
            title={title}
            query={queryText}
            c={c}
            colors={colors}
          />
          <Flex align="center" gap={2} mt={0.5} color={colors.subtext}>
            {app && (
              <Flex align="center" gap={1} flexShrink={0}>
                <Globe size={11} />
                <Text fontSize="xs" fontWeight="bold">
                  {app}
                </Text>
              </Flex>
            )}
            <FileCode2 size={11} />
            <Text
              fontSize="xs"
              fontFamily="mono"
              truncate
              color={colors.subtext}
            >
              {file}
            </Text>
          </Flex>
          {hasBreakdown && (
            <Flex align="center" gap={1.5} mt={1} flexWrap="wrap">
              <ScorePill
                label="title"
                value={semTitle as number}
                color={c.sapphire}
                colors={colors}
              />
              <Text fontSize="10px" color={colors.subtext} fontWeight="bold">
                +
              </Text>
              <ScorePill
                label="intent"
                value={semIntent as number}
                color={c.mauve}
                colors={colors}
              />
              <Text fontSize="10px" color={colors.subtext}>
                → blend {score.toFixed(3)}
              </Text>
            </Flex>
          )}
          {workflow && (
            <Flex align="flex-start" gap={1.5} mt={1.5}>
              <Box color={c.mauve} mt="1px" flexShrink={0}>
                <Workflow size={11} />
              </Box>
              <Text
                fontSize="11px"
                color={colors.subtext}
                fontStyle="italic"
                lineHeight="1.45"
              >
                {workflow}
              </Text>
            </Flex>
          )}
        </Box>

        {/* Score Radial Gauge with hover popover */}
        <Box
          position="relative"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          flexShrink={0}
        >
          <RadialGauge score={score} threshold={threshold} c={c} size={40} />

          <AnimatePresence>
            {showTooltip && (
              <MotionBox
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                position="absolute"
                bottom="130%"
                right="0"
                bg={colors.cardBg}
                border={`1px solid ${colors.border}`}
                borderRadius="8px"
                p={2.5}
                boxShadow="xl"
                zIndex={100}
                w="240px"
              >
                <Text fontSize="10px" fontWeight="bold" color={colors.subtext}>
                  SIMILARITY METRIC
                </Text>
                <Text fontSize="xs" fontWeight="700" color={barColor} mt={0.5}>
                  Cosine Score: {score.toFixed(4)}
                </Text>
                <Text fontSize="2xs" color={colors.subtext} mt={1}>
                  Target Threshold: {threshold.toFixed(2)}
                </Text>
                <Text
                  fontSize="2xs"
                  color={colors.text}
                  mt={1}
                  borderTop={`1px solid ${colors.border}`}
                  pt={1}
                >
                  {clears
                    ? "✓ Meets target bar. Will trigger retrieval behavior."
                    : "✗ Below required similarity floor."}
                </Text>
              </MotionBox>
            )}
          </AnimatePresence>
        </Box>
      </Flex>

      {/* Expanded Match Details Inspector */}
      <AnimatePresence>
        {expanded && (
          <MotionBox
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            overflow="hidden"
            onClick={(e) => e.stopPropagation()} // stop toggle collapse on click inside
          >
            <Box
              mt={3}
              p={3.5}
              bg={colors.subBg}
              borderRadius="12px"
              border={`1px solid ${colors.border}`}
            >
              <Grid templateColumns={{ base: "1fr", md: "1.2fr 1fr" }} gap={4}>
                {/* Left side details */}
                <VStack align="stretch" gap={2}>
                  <Box>
                    <Text
                      fontSize="10px"
                      fontWeight="bold"
                      color={colors.subtext}
                      textTransform="uppercase"
                    >
                      File Location
                    </Text>
                    <Flex align="center" gap={2} mt={1}>
                      <Text
                        fontSize="xs"
                        fontFamily="mono"
                        color={colors.text}
                        wordBreak="break-all"
                        p={1}
                        bg={colors.cardBg}
                        borderRadius="4px"
                        border={`1px solid ${colors.border}`}
                      >
                        {file}
                      </Text>
                      <Button
                        size="xs"
                        onClick={copyPath}
                        colorPalette={copied ? "green" : "gray"}
                      >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                      </Button>
                    </Flex>
                  </Box>

                  {title && (
                    <Box>
                      <Text
                        fontSize="10px"
                        fontWeight="bold"
                        color={colors.subtext}
                        textTransform="uppercase"
                      >
                        Lexical Overlap Analysis
                      </Text>
                      <Flex flexWrap="wrap" gap={1} mt={1}>
                        {uniqueOverlap.length > 0 ? (
                          uniqueOverlap.map((word) => (
                            <Text
                              key={word}
                              px={1.5}
                              py={0.5}
                              bg={catppuccinAlpha(c.green, 0.12)}
                              color={c.green}
                              borderRadius="4px"
                              fontSize="10px"
                              fontFamily="mono"
                              border={`1px solid ${catppuccinAlpha(c.green, 0.2)}`}
                            >
                              {word}
                            </Text>
                          ))
                        ) : (
                          <Text
                            fontSize="xs"
                            fontStyle="italic"
                            color={colors.subtext}
                          >
                            No overlapping exact tokens.
                          </Text>
                        )}
                      </Flex>
                    </Box>
                  )}

                  {hasBreakdown && (
                    <Box>
                      <Text
                        fontSize="10px"
                        fontWeight="bold"
                        color={colors.subtext}
                        textTransform="uppercase"
                      >
                        Hybrid Score Breakdown
                      </Text>
                      <VStack align="stretch" gap={1.5} mt={1.5}>
                        <ScoreTermBar
                          label="Title similarity"
                          hint="query vs spec title"
                          value={semTitle as number}
                          color={c.sapphire}
                          colors={colors}
                        />
                        <ScoreTermBar
                          label="Intent similarity"
                          hint="query vs title + steps"
                          value={semIntent as number}
                          color={c.mauve}
                          colors={colors}
                        />
                        <Flex
                          align="center"
                          justify="space-between"
                          pt={1.5}
                          borderTop={`1px solid ${colors.border}`}
                        >
                          <Text fontSize="10px" color={colors.subtext}>
                            0.5 · title + 0.5 · intent
                          </Text>
                          <Text
                            fontSize="xs"
                            fontFamily="mono"
                            fontWeight="700"
                            color={barColor}
                          >
                            = {score.toFixed(4)}
                          </Text>
                        </Flex>
                      </VStack>
                    </Box>
                  )}
                </VStack>

                {/* Right side simulator */}
                <Box>
                  <EngineSimulator
                    score={score}
                    threshold={threshold}
                    isAppScoped={isAppScoped}
                    c={c}
                    colors={colors}
                    appId={appId || app || null}
                  />
                </Box>
              </Grid>
            </Box>
          </MotionBox>
        )}
      </AnimatePresence>
    </Box>
  );
}

/* ── Hybrid score breakdown pieces (in-app rows) ────────────── */
function ScorePill({
  label,
  value,
  color,
  colors,
}: {
  label: string;
  value: number;
  color: string;
  colors: any;
}) {
  return (
    <Flex
      align="center"
      gap={1}
      px={1.5}
      py={0.5}
      borderRadius="999px"
      bg={catppuccinAlpha(color, 0.12)}
      border={`1px solid ${catppuccinAlpha(color, 0.25)}`}
    >
      <Text fontSize="9px" color={colors.subtext} textTransform="uppercase">
        {label}
      </Text>
      <Text fontSize="10px" fontFamily="mono" fontWeight="700" color={color}>
        {value.toFixed(3)}
      </Text>
    </Flex>
  );
}

function ScoreTermBar({
  label,
  hint,
  value,
  color,
  colors,
}: {
  label: string;
  hint: string;
  value: number;
  color: string;
  colors: any;
}) {
  return (
    <Box>
      <Flex align="center" justify="space-between" mb={0.5}>
        <Text fontSize="10px" color={colors.text} fontWeight="600">
          {label}{" "}
          <Text as="span" color={colors.subtext} fontWeight="400">
            ({hint})
          </Text>
        </Text>
        <Text fontSize="10px" fontFamily="mono" fontWeight="700" color={color}>
          {value.toFixed(3)}
        </Text>
      </Flex>
      <Box
        position="relative"
        h="5px"
        borderRadius="999px"
        bg={colors.subBg}
        overflow="hidden"
      >
        <Box
          position="absolute"
          left={0}
          top={0}
          h="100%"
          borderRadius="999px"
          bg={color}
          w={`${Math.max(0, Math.min(1, value)) * 100}%`}
        />
      </Box>
    </Box>
  );
}

/* ── Loading & Empty Placeholders ───────────────────────────── */
function LoadingState({
  c,
  colors,
  apps,
}: {
  c: Palette;
  colors: any;
  apps: number;
}) {
  return (
    <Flex
      direction="column"
      align="center"
      gap={3}
      py={16}
      color={colors.subtext}
    >
      <Spinner size="lg" color={c.sapphire} />
      <Text fontSize="sm" fontWeight="600">
        Tokenizing seed & calculating vectors…
      </Text>
      <Text fontSize="xs" color={colors.subtext}>
        Comparing against{" "}
        {apps > 0 ? `${apps} indexed domains` : "the global database"}. Model
        vectors require a few seconds to compute on first search.
      </Text>
    </Flex>
  );
}

function EmptyState({ c, colors }: { c: Palette; colors: any }) {
  return (
    <Flex
      direction="column"
      align="center"
      gap={3}
      py={16}
      color={colors.subtext}
      bg={colors.cardBg}
      border={`1px dashed ${colors.border}`}
      borderRadius="20px"
    >
      <HelpCircle size={36} color={colors.subtext} />
      <Text fontSize="sm" color={colors.subtext}>
        Select a preset above or type a test idea to simulate retrievability.
      </Text>
    </Flex>
  );
}

function SpecCard({
  spec,
  query,
  c,
  colors,
}: {
  spec: SpecInfo;
  query: string;
  c: Palette;
  colors: any;
}) {
  const [copied, setCopied] = useState(false);
  const copyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(spec.file);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Flex
      p={3}
      bg={colors.subBg}
      borderRadius="10px"
      direction="column"
      gap={1.5}
      border={`1px solid ${colors.border}`}
      transition="all 0.15s"
      _hover={{ borderColor: c.sapphire, bg: colors.rowHover }}
    >
      <Flex justify="space-between" align="start" gap={2}>
        <Box truncate maxW="85%">
          <HighlightedTitle
            title={spec.title}
            query={query}
            c={c}
            colors={colors}
            fontSize="xs"
          />
        </Box>
        <Button
          size="xs"
          variant="ghost"
          p={1}
          h="20px"
          w="20px"
          onClick={copyPath}
          color={copied ? c.green : colors.subtext}
          _hover={{ color: colors.text }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
        </Button>
      </Flex>
      <Flex align="center" gap={2} fontSize="10px" color={colors.subtext}>
        <Flex align="center" gap={1} flexShrink={0}>
          <Globe size={10} />
          <Text fontWeight="bold">{appLabel(spec.appId)}</Text>
        </Flex>
        <Text>·</Text>
        <Flex align="center" gap={1} truncate>
          <FileCode2 size={10} />
          <Text fontFamily="mono" truncate>
            {spec.file}
          </Text>
        </Flex>
      </Flex>
    </Flex>
  );
}

/* ── Custom SVG Radial similarity gauge ── */
function RadialGauge({
  score,
  threshold,
  c,
  size = 42,
}: {
  score: number;
  threshold: number;
  c: any;
  size?: number;
}) {
  const radius = size * 0.4;
  const stroke = size * 0.08;
  const circumference = 2 * Math.PI * radius;
  const offset =
    circumference - Math.max(0, Math.min(1, score)) * circumference;
  const clears = score >= threshold;
  const color = clears
    ? c.green
    : score >= threshold - 0.05
      ? c.yellow
      : c.overlay0;

  return (
    <Box
      position="relative"
      w={`${size}px`}
      h={`${size}px`}
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        display="flex"
        alignItems="center"
        justifyContent="center"
        fontSize="10px"
        fontFamily="mono"
        fontWeight="800"
        color={color}
      >
        {Math.round(score * 100)}
      </Box>
    </Box>
  );
}

/* ── Simple Custom Code Highlighter for TypeScript specs ── */
function CodeHighlighter({
  code,
  c,
  colors,
}: {
  code: string;
  c: any;
  colors: any;
}) {
  if (!code) return null;
  const lines = code.split("\n");
  return (
    <Box
      fontFamily="mono"
      fontSize="11px"
      bg="#1e1e2e"
      color="#c6d0f5"
      p={4}
      borderRadius="xl"
      overflowX="auto"
      maxH="380px"
      border="1px solid"
      borderColor={c.surface1}
      className="glass-scroll-area"
    >
      {lines.map((line, idx) => {
        const escapeHtml = (text: string) =>
          text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        let escapedLine = escapeHtml(line);
        if (
          escapedLine.trim().startsWith("//") ||
          escapedLine.trim().startsWith("/*") ||
          escapedLine.trim().startsWith("*")
        ) {
          escapedLine = `<span style="color: ${c.green}">${escapedLine}</span>`;
        } else {
          escapedLine = escapedLine.replace(
            /(["'`])(.*?)\1/g,
            `<span style="color: ${c.yellow}">$1$2$1</span>`,
          );
          const keywords = [
            "import",
            "from",
            "const",
            "let",
            "function",
            "return",
            "await",
            "async",
            "describe",
            "test",
            "expect",
          ];
          keywords.forEach((kw) => {
            const regex = new RegExp(`\\b(${kw})\\b`, "g");
            escapedLine = escapedLine.replace(
              regex,
              `<span style="color: ${c.mauve}; font-weight: bold;">$1</span>`,
            );
          });
          const asserts = [
            "expect",
            "toBe",
            "toContain",
            "toHaveText",
            "click",
            "goto",
            "fill",
            "locator",
          ];
          asserts.forEach((a) => {
            const regex = new RegExp(`\\b(${a})\\b`, "g");
            escapedLine = escapedLine.replace(
              regex,
              `<span style="color: ${c.sapphire}">$1</span>`,
            );
          });
        }
        return (
          <Flex key={idx} align="start" lineHeight="1.6">
            <Text
              color="#51576d"
              w="30px"
              flexShrink={0}
              userSelect="none"
              textAlign="right"
              pr={3}
              fontSize="10px"
            >
              {idx + 1}
            </Text>
            <Text
              as="pre"
              whiteSpace="pre"
              fontFamily="mono"
              dangerouslySetInnerHTML={{ __html: escapedLine }}
            />
          </Flex>
        );
      })}
    </Box>
  );
}

/* ── Pipeline Journey Component ── */
function PipelineJourney({
  seedText,
  result,
  c,
  colors,
}: {
  seedText: string;
  result: ExploreResult | null;
  c: Palette;
  colors: any;
}) {
  const steps = [
    {
      title: "1. Raw Seed Intake",
      desc: "English descriptions are received directly from the UI or generator agent.",
      active: true,
      val: seedText || "— (Waiting for input scenario) —",
      badgeColor: c.overlay0,
    },
    {
      title: "2. Deterministic Regex Stripping",
      desc: "Numbers, URLs, price figures, and quotes are normalized using regex constraints.",
      active: !!seedText.trim(),
      val: result?.abstracted ?? "— (Abstraction output) —",
      badgeColor: c.mauve,
    },
    {
      title: "3. Vector Embedding & Search",
      desc: "Abstracted scenario shapes are mapped into OpenAI embeddings and searched against the knowledge database.",
      active: !!result,
      val: result
        ? `Queried ${result.inApp.length + result.crossApp.length} candidates in database.`
        : "— Waiting for search trigger —",
      badgeColor: c.sapphire,
    },
    {
      title: "4. Cognitive Scoring & Action",
      desc: "Compares cosine scores against local reuse (0.82) and advisory pattern (0.70) bars to decide on verbatim copying.",
      active: !!result,
      val: result
        ? result.inApp.length > 0 &&
          result.inApp[0].score >= result.thresholds.reuse
          ? "✅ RESULT: Deterministic local reuse triggered."
          : result.crossApp.length > 0 &&
              result.crossApp[0].score >= result.thresholds.pattern
            ? "ℹ️ RESULT: Global playbook advisory injected."
            : "⚠️ RESULT: Below retrieval floor, generating new spec from scratch."
        : "— Decision pending —",
      badgeColor: c.green,
    },
  ];

  return (
    <VStack align="stretch" gap={4} p={1}>
      <Text
        fontSize="xs"
        fontWeight="800"
        color={colors.subtext}
        textTransform="uppercase"
      >
        Matching Engine Pipeline Journey
      </Text>

      <VStack align="stretch" gap={0} mt={2}>
        {steps.map((s, idx) => {
          const isLast = idx === steps.length - 1;
          const meetsLastActive = s.active && !isLast && steps[idx + 1].active;
          return (
            <Flex key={idx} gap={4} align="stretch">
              {/* Left Line column */}
              <Flex direction="column" align="center" flexShrink={0}>
                {/* Circle Node */}
                <Box
                  w="26px"
                  h="26px"
                  borderRadius="full"
                  border="2px solid"
                  borderColor={s.active ? s.badgeColor : colors.border}
                  bg={s.active ? s.badgeColor : "transparent"}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  zIndex={1}
                  boxShadow={s.active ? `0 0 8px ${s.badgeColor}33` : "none"}
                >
                  <Text
                    fontSize="10px"
                    fontWeight="900"
                    color={s.active ? "#1e1e2e" : colors.subtext}
                  >
                    {idx + 1}
                  </Text>
                </Box>

                {/* Vertical Line segment */}
                {!isLast && (
                  <Box
                    w="2px"
                    flex="1"
                    minH="26px"
                    bg={meetsLastActive ? s.badgeColor : colors.border}
                    my={1}
                    style={{
                      borderStyle: meetsLastActive ? "solid" : "dashed",
                    }}
                  />
                )}
              </Flex>

              {/* Content column */}
              <Box flex="1" pb={isLast ? 0 : 5}>
                <Box
                  p={4}
                  bg={s.active ? colors.subBg : "transparent"}
                  border="1px solid"
                  borderColor={s.active ? colors.border : "transparent"}
                  style={{
                    borderStyle: s.active ? "solid" : "dashed",
                  }}
                  borderRadius="xl"
                  opacity={s.active ? 1 : 0.5}
                  transition="all 0.2s"
                  _hover={
                    s.active
                      ? { borderColor: s.badgeColor, bg: colors.cardBg }
                      : {}
                  }
                >
                  <Text
                    fontSize="xs"
                    fontWeight="bold"
                    color={colors.text}
                    mb={1}
                  >
                    {s.title}
                  </Text>
                  <Text fontSize="11px" color={colors.subtext} mb={3.5}>
                    {s.desc}
                  </Text>
                  <Box
                    fontFamily="mono"
                    fontSize="xs"
                    p={2.5}
                    bg="#181825"
                    color={s.active ? "#c6d0f5" : c.overlay0}
                    borderRadius="8px"
                    border={`1px solid ${s.active ? c.surface0 : "transparent"}`}
                    wordBreak="break-all"
                    whiteSpace="pre-wrap"
                  >
                    {s.val}
                  </Box>
                </Box>
              </Box>
            </Flex>
          );
        })}
      </VStack>
    </VStack>
  );
}
