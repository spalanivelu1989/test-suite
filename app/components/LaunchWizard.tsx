"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Input,
  Textarea,
  Flex,
  Text,
  VStack,
  HStack,
  Button,
  Spinner,
  Heading,
} from "@chakra-ui/react";
import {
  Play,
  ChevronRight,
  TriangleAlert,
  ChevronDown,
  Check,
} from "lucide-react";
import { useThemeMode } from "@/app/providers";
import { getAWSColors, AWS_COLORS, SIDEBAR_GRADIENT } from "@/app/theme/aws";
import { getHPEColors, HPE_COLORS } from "@/app/components/MigrationCheck";
import { motion, AnimatePresence } from "framer-motion";
import {
  CRAWL_MODE_SCENARIOS_PER_PAGE,
  effectiveScenarioCap,
  MAX_TOTAL_TESTS,
  type CrawlMode,
} from "@/src/types";

const MotionBox = motion.create(Box);

interface LaunchWizardProps {
  onLaunchSuccess: (runId: string) => void;
}

export function LaunchWizard({ onLaunchSuccess }: LaunchWizardProps) {
  const { theme } = useThemeMode();
  const colors = getAWSColors(theme);
  // Migration Check palette — used for the section panels (header strip, body,
  // input fields) so they exactly match the "Destination Cloud Deployment &
  // Security" section over on the Migration Check tab.
  const hpe = getHPEColors(theme);
  // Same primary blue the Migration Check "Execute check" button uses.
  const activeBlue =
    theme === "dark" ? HPE_COLORS.blue.darkAccent : HPE_COLORS.blue.main;
  const hoverBlue =
    theme === "dark" ? HPE_COLORS.blue.hoverDark : HPE_COLORS.blue.hoverLight;
  const isDark = theme === "dark";

  const [url, setUrl] = useState("");
  const [focus, setFocus] = useState("");
  const [crawlMode, setCrawlMode] = useState("direct");
  const [maxPages, setMaxPages] = useState("1");
  // "auto" = derive from crawl mode × pages; a number = explicit total cap.
  const [testsPerPage, setTestsPerPage] = useState("auto");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom Dropdown states
  const [isDepthOpen, setIsDepthOpen] = useState(false);
  const [isPagesOpen, setIsPagesOpen] = useState(false);
  const [isTestsOpen, setIsTestsOpen] = useState(false);

  // Total tests = effectivePages × tests-per-page, clamped to the ceiling — the
  // SAME source of truth the backend uses (src/types), so the displayed total
  // always matches what actually runs. "auto" → the per-mode default rate.
  const perPageNum =
    testsPerPage === "auto" ? undefined : parseInt(testsPerPage);
  const getExpectedTests = (pagesVal: string) => {
    const pages = parseInt(pagesVal);
    return effectiveScenarioCap(crawlMode as CrawlMode, pages, perPageNum);
  };

  // Pieces of the total-tests formula, for the summary recap (pages × rate).
  const perPageRate =
    perPageNum ?? CRAWL_MODE_SCENARIOS_PER_PAGE[crawlMode as CrawlMode];
  const effectivePages = crawlMode === "direct" ? 1 : parseInt(maxPages);
  const rawTotalTests = effectivePages * perPageRate;
  const totalTests = getExpectedTests(maxPages);
  const totalClamped = totalTests < rawTotalTests;

  // The Pages control describes crawl breadth only. Test counts live solely in
  // the "Number of Tests" control, so the two no longer say the same thing.
  const getPagesFullLabel = (_value: string, defaultText: string) =>
    defaultText;

  const getDepthHelperText = () => {
    switch (crawlMode) {
      case "direct":
        return "This test stays entirely on the landing page and will not follow any links leading to other pages.";
      case "standard":
        return "This tests the starting page and all pages directly linked from it (1 click away). Perfect for verifying your main sections like Login, About, and Contact pages.";
      case "deep":
        return "This tests pages up to 2 clicks away from the starting page. Best for checking nested features, product catalogs, or multi-step forms.";
      case "aggressive":
        return "This tests pages up to 10 clicks away from the starting page, scanning almost the entire site. Best for comprehensive audits of large portals.";
      default:
        return "";
    }
  };

  const getPagesHelperText = () => {
    switch (maxPages) {
      case "5":
        return "How much of the site to explore — 5 pages, for fast checks during development.";
      case "10":
        return "How much of the site to explore — 10 pages, the recommended scope for standard testing.";
      case "20":
        return "How much of the site to explore — 20 pages, good for medium sites before a release.";
      case "50":
        return "How much of the site to explore — 50 pages, for full pre-release audits.";
      case "100":
        return "How much of the site to explore — 100 pages, for thorough enterprise audits.";
      default:
        return `How much of the site to explore — up to ${maxPages} pages.`;
    }
  };

  const depthRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const testsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        depthRef.current &&
        !depthRef.current.contains(event.target as Node)
      ) {
        setIsDepthOpen(false);
      }
      if (
        pagesRef.current &&
        !pagesRef.current.contains(event.target as Node)
      ) {
        setIsPagesOpen(false);
      }
      if (
        testsRef.current &&
        !testsRef.current.contains(event.target as Node)
      ) {
        setIsTestsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("URL must start with http:// or https://");
      }
    } catch {
      setError("Enter a valid http(s) URL, e.g. https://www.tarento.com");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          crawlMode,
          maxPages: parseInt(maxPages),
          ...(focus.trim() ? { focus: focus.trim() } : {}),
          ...(perPageNum ? { testsPerPage: perPageNum } : {}),
        }),
      });
      const data = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !data.runId) {
        setError(data.error ?? "Failed to start the run");
        setSubmitting(false);
        return;
      }
      onLaunchSuccess(data.runId);
      setSubmitting(false);
    } catch {
      setError("Could not reach the server. Is it running?");
      setSubmitting(false);
    }
  }

  return (
    <Box
      as="form"
      onSubmit={onSubmit}
      display="grid"
      gridTemplateColumns={{ base: "1fr", lg: "3.2fr 1.8fr" }}
      gap={6}
      w="full"
      pb="200px"
      alignItems="stretch"
    >
      {/* Left panel: unified Configuration Panel */}
      {/* No overflow:hidden here — the crawl-depth / tests-per-page dropdowns are
          absolutely positioned and would get clipped. The header/body corners are
          rounded individually instead so the card still looks clean. */}
      <Box
        position="relative"
        bg={hpe.cardBg}
        border="1px solid"
        borderColor={hpe.border}
        borderRadius="xl"
        shadow="sm"
        display="flex"
        flexDirection="column"
      >
        {/* Header strip (matches Migration Check sections) */}
        <Flex
          bg={hpe.subBg}
          borderTopRadius="xl"
          borderBottom="1px solid"
          borderColor={hpe.border}
          px={4}
          py={2.5}
          align="center"
        >
          <Text
            fontSize="11.5px"
            fontWeight="bold"
            color={colors.text}
            letterSpacing="0.05em"
            textTransform="uppercase"
          >
            Test Configuration
          </Text>
        </Flex>
        <Box bg={hpe.subBg} borderBottomRadius="xl" p={6} flex={1}>
          <VStack align="stretch" gap={6}>
            {/* Section 1: Target URL */}
            <VStack align="stretch" gap={3}>
              <Text
                fontSize="13px"
                fontWeight="extrabold"
                color={colors.text}
                letterSpacing="0.03em"
                fontFamily="mono"
                textTransform="uppercase"
              >
                Target URL
              </Text>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="e.g. https://www.tarento.com"
                fontSize="13px"
                bg={hpe.cardBg}
                borderColor={hpe.border}
                borderRadius="md"
                size="sm"
                height="36px"
                disabled={submitting}
                autoFocus
                _focus={{
                  borderColor: "#85c1dc",
                  boxShadow: "0 0 0 1px #85c1dc",
                }}
              />
              <Text fontSize="11.5px" color={colors.subtext}>
                The AI agent will crawl this URL, planning and executing test
                suites automatically.
              </Text>
            </VStack>

            {/* Section 1b: Focus (optional) */}
            <VStack align="stretch" gap={3}>
              <HStack gap={2} align="baseline">
                <Text
                  fontSize="13px"
                  fontWeight="extrabold"
                  color={colors.text}
                  letterSpacing="0.03em"
                  fontFamily="mono"
                  textTransform="uppercase"
                >
                  Focus
                </Text>
                <Text fontSize="11px" color={colors.subtext} fontFamily="mono">
                  (optional)
                </Text>
              </HStack>
              <Textarea
                value={focus}
                onChange={(e) => setFocus(e.target.value.slice(0, 1000))}
                placeholder={
                  'Scope the run to one flow on the page. e.g. "Select the Logistics platform from the platform selector, fill in its input fields, and complete only that workflow — ignore all other platforms."'
                }
                fontSize="13px"
                bg={hpe.cardBg}
                borderColor={hpe.border}
                borderRadius="md"
                size="sm"
                rows={3}
                resize="vertical"
                disabled={submitting}
                _focus={{
                  borderColor: "#85c1dc",
                  boxShadow: "0 0 0 1px #85c1dc",
                }}
              />
              <Text fontSize="11.5px" color={colors.subtext}>
                Leave blank to test the whole page. Use this when several
                platforms live on one URL with no separate link — the agent will
                plan and test only the flow you describe. {focus.length}/1000
              </Text>
            </VStack>

            {/* Separator */}
            <Box borderTop="1px solid" borderColor={hpe.border} my={1} />

            {/* Section 2: Crawl & Agent Settings */}
            <VStack align="stretch" gap={4}>
              <Text
                fontSize="13px"
                fontWeight="extrabold"
                color={colors.text}
                letterSpacing="0.03em"
                fontFamily="mono"
                textTransform="uppercase"
              >
                Crawl & Agent Settings
              </Text>

              <HStack gap={4} wrap="wrap" align="flex-start">
                <VStack
                  align="stretch"
                  gap={1.5}
                  flex={1}
                  minW="150px"
                  position="relative"
                  ref={depthRef}
                >
                  <Text
                    fontSize="12px"
                    fontWeight="bold"
                    color={colors.subtext}
                  >
                    Maximum Crawl Depth
                  </Text>
                  {/* Trigger Button */}
                  <Box
                    role="button"
                    tabIndex={0}
                    onClick={() => setIsDepthOpen(!isDepthOpen)}
                    w="full"
                    h="36px"
                    px={3}
                    bg={hpe.cardBg}
                    border="1px solid"
                    borderColor={hpe.border}
                    borderRadius="md"
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                    cursor="pointer"
                    fontSize="13px"
                    color={colors.text}
                    _hover={{
                      borderColor: isDark
                        ? "rgba(133, 193, 220, 0.5)"
                        : "rgba(59, 130, 246, 0.5)",
                    }}
                    _focus={{ borderColor: isDark ? "#85c1dc" : "#3b82f6" }}
                    transition="all 0.15s ease"
                  >
                    <Text truncate>
                      {crawlMode === "direct" && "Direct page only (depth 0)"}
                      {crawlMode === "standard" &&
                        "Standard depth — links of entry (depth 1)"}
                      {crawlMode === "deep" && "Deep — 2 levels down"}
                      {crawlMode === "aggressive" && "Aggressive crawl"}
                    </Text>
                    <ChevronDown
                      size={14}
                      style={{
                        opacity: 0.7,
                        transform: isDepthOpen ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s ease",
                        flexShrink: 0,
                      }}
                    />
                  </Box>

                  {/* Options List Menu */}
                  <AnimatePresence>
                    {isDepthOpen && (
                      <MotionBox
                        position="absolute"
                        top="58px"
                        left={0}
                        right={0}
                        zIndex={50}
                        bg={hpe.cardBg}
                        border="1px solid"
                        borderColor={hpe.border}
                        borderRadius="md"
                        boxShadow="md"
                        maxH="150px"
                        overflowY="auto"
                        py={1}
                        className="glass-scroll-area"
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.97 }}
                        transition={{ duration: 0.12, ease: "easeOut" }}
                        style={{ transformOrigin: "top" }}
                      >
                        {[
                          {
                            value: "direct",
                            label: "Direct page only (depth 0)",
                          },
                          {
                            value: "standard",
                            label: "Standard depth — links of entry (depth 1)",
                          },
                          { value: "deep", label: "Deep — 2 levels down" },
                          {
                            value: "aggressive",
                            label: "Aggressive crawl",
                          },
                        ].map((opt) => {
                          const isSelected = crawlMode === opt.value;
                          return (
                            <Box
                              key={opt.value}
                              onClick={() => {
                                setCrawlMode(opt.value);
                                // Default page scope grows with depth, so deeper
                                // modes yield more total tests out of the box.
                                setMaxPages(
                                  opt.value === "direct"
                                    ? "1"
                                    : opt.value === "standard"
                                      ? "10"
                                      : opt.value === "deep"
                                        ? "20"
                                        : "50",
                                );
                                setIsDepthOpen(false);
                              }}
                              px={3}
                              py={2}
                              fontSize="13px"
                              cursor="pointer"
                              bg={
                                isSelected
                                  ? isDark
                                    ? "rgba(133, 193, 220, 0.15)"
                                    : "rgba(59, 130, 246, 0.08)"
                                  : "transparent"
                              }
                              color={
                                isSelected
                                  ? isDark
                                    ? "#99d1db"
                                    : "#2563eb"
                                  : colors.text
                              }
                              fontWeight={isSelected ? "semibold" : "normal"}
                              display="flex"
                              alignItems="center"
                              justifyContent="space-between"
                              _hover={{
                                bg: isDark
                                  ? "rgba(255, 255, 255, 0.05)"
                                  : "rgba(0, 0, 0, 0.03)",
                              }}
                              transition="background-color 0.12s ease"
                            >
                              <Text truncate>{opt.label}</Text>
                              {isSelected && (
                                <Check
                                  size={12}
                                  style={{
                                    color: isDark ? "#99d1db" : "#2563eb",
                                  }}
                                />
                              )}
                            </Box>
                          );
                        })}
                      </MotionBox>
                    )}
                  </AnimatePresence>
                  <Text
                    fontSize="11px"
                    color={colors.subtext}
                    mt={1.5}
                    lineHeight="short"
                  >
                    {getDepthHelperText()}
                  </Text>
                </VStack>

                {crawlMode !== "direct" && (
                  <VStack
                    align="stretch"
                    gap={1.5}
                    flex={1}
                    minW="150px"
                    position="relative"
                    ref={pagesRef}
                  >
                    <Text
                      fontSize="12px"
                      fontWeight="bold"
                      color={colors.subtext}
                    >
                      Pages to Crawl
                    </Text>
                    {/* Trigger Button */}
                    <Box
                      role="button"
                      tabIndex={0}
                      onClick={() => setIsPagesOpen(!isPagesOpen)}
                      w="full"
                      h="36px"
                      px={3}
                      bg={hpe.cardBg}
                      border="1px solid"
                      borderColor={hpe.border}
                      borderRadius="md"
                      display="flex"
                      alignItems="center"
                      justifyContent="space-between"
                      cursor="pointer"
                      opacity={1}
                      fontSize="13px"
                      color={colors.text}
                      _hover={{
                        borderColor: isDark
                          ? "rgba(133, 193, 220, 0.5)"
                          : "rgba(59, 130, 246, 0.5)",
                      }}
                      _focus={{ borderColor: isDark ? "#85c1dc" : "#3b82f6" }}
                      transition="all 0.15s ease"
                    >
                      <Text truncate>
                        {maxPages === "5"
                          ? "5 pages (Quick test)"
                          : maxPages === "10"
                            ? "10 pages (recommended)"
                            : maxPages === "20"
                              ? "20 pages"
                              : maxPages === "50"
                                ? "50 pages (Thorough)"
                                : "100 pages (Large suite)"}
                      </Text>
                      <ChevronDown
                        size={14}
                        style={{
                          opacity: 0.7,
                          transform: isPagesOpen ? "rotate(180deg)" : "none",
                          transition: "transform 0.2s ease",
                          flexShrink: 0,
                        }}
                      />
                    </Box>

                    {/* Options List Menu */}
                    <AnimatePresence>
                      {isPagesOpen && (
                        <MotionBox
                          position="absolute"
                          top="58px"
                          left={0}
                          right={0}
                          zIndex={50}
                          bg={hpe.cardBg}
                          border="1px solid"
                          borderColor={hpe.border}
                          borderRadius="md"
                          boxShadow="md"
                          maxH="150px"
                          overflowY="auto"
                          py={1}
                          className="glass-scroll-area"
                          initial={{ opacity: 0, y: -6, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.97 }}
                          transition={{ duration: 0.12, ease: "easeOut" }}
                          style={{ transformOrigin: "top" }}
                        >
                          {[
                            { value: "5", label: "5 pages (Quick test)" },
                            { value: "10", label: "10 pages (recommended)" },
                            { value: "20", label: "20 pages" },
                            { value: "50", label: "50 pages (Thorough)" },
                            { value: "100", label: "100 pages (Large suite)" },
                          ].map((opt) => {
                            const isSelected = maxPages === opt.value;
                            return (
                              <Box
                                key={opt.value}
                                onClick={() => {
                                  setMaxPages(opt.value);
                                  setIsPagesOpen(false);
                                }}
                                px={3}
                                py={2}
                                fontSize="13px"
                                cursor="pointer"
                                bg={
                                  isSelected
                                    ? isDark
                                      ? "rgba(133, 193, 220, 0.15)"
                                      : "rgba(59, 130, 246, 0.08)"
                                    : "transparent"
                                }
                                color={
                                  isSelected
                                    ? isDark
                                      ? "#99d1db"
                                      : "#2563eb"
                                    : colors.text
                                }
                                fontWeight={isSelected ? "semibold" : "normal"}
                                display="flex"
                                alignItems="center"
                                justifyContent="space-between"
                                _hover={{
                                  bg: isDark
                                    ? "rgba(255, 255, 255, 0.05)"
                                    : "rgba(0, 0, 0, 0.03)",
                                }}
                                transition="background-color 0.12s ease"
                              >
                                <Text truncate>
                                  {getPagesFullLabel(opt.value, opt.label)}
                                </Text>
                                {isSelected && (
                                  <Check
                                    size={12}
                                    style={{
                                      color: isDark ? "#99d1db" : "#2563eb",
                                    }}
                                  />
                                )}
                              </Box>
                            );
                          })}
                        </MotionBox>
                      )}
                    </AnimatePresence>
                    <Text
                      fontSize="11px"
                      color={colors.subtext}
                      mt={1.5}
                      lineHeight="short"
                    >
                      {getPagesHelperText()}
                    </Text>
                  </VStack>
                )}

                {/* Number of Tests dropdown — total scenario budget for the run */}
                <VStack
                  align="stretch"
                  gap={1.5}
                  flex="1"
                  minW="150px"
                  position="relative"
                  ref={testsRef}
                >
                  <Text
                    fontSize="12px"
                    fontWeight="bold"
                    color={colors.subtext}
                  >
                    Tests per Page
                  </Text>
                  {/* Trigger Button */}
                  <Box
                    role="button"
                    tabIndex={0}
                    onClick={() => setIsTestsOpen(!isTestsOpen)}
                    w="full"
                    h="36px"
                    px={3}
                    bg={hpe.cardBg}
                    border="1px solid"
                    borderColor={hpe.border}
                    borderRadius="md"
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                    cursor="pointer"
                    fontSize="13px"
                    color={colors.text}
                    _hover={{
                      borderColor: isDark
                        ? "rgba(133, 193, 220, 0.5)"
                        : "rgba(59, 130, 246, 0.5)",
                    }}
                    _focus={{ borderColor: isDark ? "#85c1dc" : "#3b82f6" }}
                    transition="all 0.15s ease"
                  >
                    <Text truncate>
                      {testsPerPage === "auto"
                        ? `Auto (${CRAWL_MODE_SCENARIOS_PER_PAGE[crawlMode as CrawlMode]} / page)`
                        : `${testsPerPage} / page`}
                    </Text>
                    <ChevronDown
                      size={14}
                      style={{
                        opacity: 0.7,
                        transform: isTestsOpen ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s ease",
                        flexShrink: 0,
                      }}
                    />
                  </Box>

                  {/* Options List Menu */}
                  <AnimatePresence>
                    {isTestsOpen && (
                      <MotionBox
                        position="absolute"
                        top="58px"
                        left={0}
                        right={0}
                        zIndex={50}
                        bg={hpe.cardBg}
                        border="1px solid"
                        borderColor={hpe.border}
                        borderRadius="md"
                        boxShadow="md"
                        maxH="180px"
                        overflowY="auto"
                        py={1}
                        className="glass-scroll-area"
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.97 }}
                        transition={{ duration: 0.12, ease: "easeOut" }}
                        style={{ transformOrigin: "top" }}
                      >
                        {[
                          {
                            value: "auto",
                            label: `Auto — ${CRAWL_MODE_SCENARIOS_PER_PAGE[crawlMode as CrawlMode]} / page (recommended)`,
                          },
                          { value: "8", label: "8 / page (quick)" },
                          { value: "12", label: "12 / page" },
                          { value: "20", label: "20 / page" },
                          { value: "30", label: "30 / page (exhaustive)" },
                        ].map((opt) => {
                          const isSelected = testsPerPage === opt.value;
                          return (
                            <Box
                              key={opt.value}
                              onClick={() => {
                                setTestsPerPage(opt.value);
                                setIsTestsOpen(false);
                              }}
                              px={3}
                              py={2}
                              fontSize="13px"
                              cursor="pointer"
                              bg={
                                isSelected
                                  ? isDark
                                    ? "rgba(133, 193, 220, 0.15)"
                                    : "rgba(59, 130, 246, 0.08)"
                                  : "transparent"
                              }
                              color={
                                isSelected
                                  ? isDark
                                    ? "#99d1db"
                                    : "#2563eb"
                                  : colors.text
                              }
                              fontWeight={isSelected ? "semibold" : "normal"}
                              display="flex"
                              alignItems="center"
                              justifyContent="space-between"
                              _hover={{
                                bg: isDark
                                  ? "rgba(255, 255, 255, 0.05)"
                                  : "rgba(0, 0, 0, 0.03)",
                              }}
                              transition="background-color 0.12s ease"
                            >
                              <Text truncate>{opt.label}</Text>
                              {isSelected && (
                                <Check
                                  size={12}
                                  style={{
                                    color: isDark ? "#99d1db" : "#2563eb",
                                  }}
                                />
                              )}
                            </Box>
                          );
                        })}
                      </MotionBox>
                    )}
                  </AnimatePresence>
                  <Text
                    fontSize="11px"
                    color={colors.subtext}
                    mt={1.5}
                    lineHeight="short"
                  >
                    {testsPerPage === "auto"
                      ? "Scenarios generated per page crawled. Auto uses a sensible rate for this mode."
                      : `Generates up to ${testsPerPage} scenarios for each page crawled.`}
                  </Text>
                </VStack>
              </HStack>
            </VStack>
          </VStack>
        </Box>
      </Box>

      {/* Right panel: Summary card */}
      <Box
        bg={hpe.cardBg}
        border="1px solid"
        borderColor={hpe.border}
        borderRadius="xl"
        shadow="md"
        overflow="hidden"
        display="flex"
        flexDirection="column"
      >
        {/* Header strip (matches Migration Check sections) */}
        <Flex
          bg={hpe.subBg}
          borderBottom="1px solid"
          borderColor={hpe.border}
          px={4}
          py={2.5}
          align="center"
        >
          <Text
            fontSize="11.5px"
            fontWeight="bold"
            color={colors.text}
            letterSpacing="0.05em"
            textTransform="uppercase"
          >
            Summary
          </Text>
        </Flex>
        <Box
          bg={hpe.subBg}
          p={6}
          flex={1}
          display="flex"
          flexDirection="column"
          justifyContent="space-between"
        >
          <VStack align="stretch" gap={4}>
            <VStack align="stretch" gap={3} fontSize="13px">
              <Box>
                <Text fontWeight="bold" color={colors.text} mb={1}>
                  Target URL
                </Text>
                <Text color={colors.subtext} wordBreak="break-all">
                  {url || "Not specified"}
                </Text>
              </Box>

              {focus.trim() && (
                <Box borderTop="1px solid" borderColor={hpe.border} pt={2}>
                  <Text fontWeight="bold" color={colors.text} mb={1}>
                    Focus
                  </Text>
                  <Text
                    color={colors.subtext}
                    whiteSpace="pre-wrap"
                    wordBreak="break-word"
                    maxH="120px"
                    overflowY="auto"
                    className="glass-scroll-area"
                  >
                    {focus.trim()}
                  </Text>
                </Box>
              )}

              <Box borderTop="1px solid" borderColor={hpe.border} pt={2}>
                <Text fontWeight="bold" color={colors.text} mb={1}>
                  Crawl & Agent Settings
                </Text>
                <Text color={colors.subtext}>
                  Mode:{" "}
                  {crawlMode === "direct"
                    ? "Direct page only"
                    : crawlMode === "standard"
                      ? "Standard depth"
                      : crawlMode === "deep"
                        ? "Deep crawl"
                        : "Aggressive crawl"}
                </Text>
                {crawlMode !== "direct" && (
                  <Text color={colors.subtext}>
                    Pages to crawl: up to {maxPages}
                  </Text>
                )}
                <Text color={colors.subtext}>
                  Tests per page: {perPageRate}
                  {testsPerPage === "auto" ? " (auto)" : ""}
                </Text>
                <Text
                  color={colors.text}
                  fontWeight="bold"
                  mt={1}
                  pt={1.5}
                  borderTop="1px dashed"
                  borderColor={hpe.border}
                >
                  Total tests to run: up to {totalTests}
                </Text>
                <Text fontSize="11px" color={colors.subtext}>
                  {effectivePages} {effectivePages === 1 ? "page" : "pages"} ×{" "}
                  {perPageRate}/page
                  {totalClamped
                    ? ` = ${rawTotalTests}, capped at ${MAX_TOTAL_TESTS}`
                    : ""}
                </Text>
              </Box>
            </VStack>
          </VStack>

          <VStack align="stretch" gap={3} mt={4}>
            <Button
              type="submit"
              disabled={submitting}
              w="full"
              bg={activeBlue}
              color="white"
              fontSize="12.5px"
              fontWeight="bold"
              letterSpacing="0.05em"
              textTransform="uppercase"
              py={5}
              borderRadius="lg"
              shadow="sm"
              cursor={submitting ? "not-allowed" : "pointer"}
              _hover={submitting ? {} : { bg: hoverBlue }}
              _disabled={{
                bg: hpe.border,
                color: hpe.subtext,
                opacity: 0.6,
                cursor: "not-allowed",
              }}
              display="flex"
              alignItems="center"
              justifyContent="center"
              gap={2.5}
            >
              {submitting ? (
                <>
                  <Spinner size="xs" color="currentColor" />
                  <span>Launching...</span>
                </>
              ) : (
                <>
                  <Play
                    size={13}
                    fill="currentColor"
                    style={{ color: "currentColor" }}
                  />
                  <span>Launch Test</span>
                </>
              )}
            </Button>

            {error && (
              <Flex
                p={2.5}
                bg="red.500/10"
                border="1px solid"
                borderColor="red.500/20"
                borderRadius="md"
                gap={2}
                align="flex-start"
              >
                <TriangleAlert
                  size={14}
                  style={{ color: "red", flexShrink: 0, marginTop: "2px" }}
                />
                <Text fontSize="12px" color="red">
                  {error}
                </Text>
              </Flex>
            )}
          </VStack>
        </Box>
      </Box>
    </Box>
  );
}
