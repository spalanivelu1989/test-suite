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
import { keyframes } from "@emotion/react";
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

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

interface CustomSelectOption {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
}

interface CustomSelectProps {
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
  colors: any;
  hpe: any;
  isDark: boolean;
}

function CustomSelect({
  options,
  value,
  onChange,
  colors,
  hpe,
  isDark,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  return (
    <Box ref={ref} position="relative" w="full">
      {/* Trigger Button */}
      <Box
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            setIsOpen(!isOpen);
            e.preventDefault();
          }
        }}
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
        _focus={{
          borderColor: "#0d2b6b",
          outline: "none",
          boxShadow: "0 0 0 1px #0d2b6b",
        }}
        transition="all 0.15s ease"
      >
        <Text truncate fontWeight="medium">
          {selectedOption ? selectedOption.label : value}
        </Text>
        <ChevronDown
          size={14}
          style={{
            opacity: 0.7,
            transform: isOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.2s ease",
            flexShrink: 0,
            marginLeft: "8px",
          }}
        />
      </Box>

      {/* Options List Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <MotionBox
            position="absolute"
            top="42px"
            left={0}
            right={0}
            zIndex={100}
            bg={isDark ? "rgba(23, 31, 38, 0.95)" : "rgba(255, 255, 255, 0.98)"}
            backdropFilter="blur(16px)"
            border="1px solid"
            borderColor={hpe.border}
            borderRadius="lg"
            boxShadow={
              isDark
                ? "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)"
                : "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)"
            }
            maxH="280px"
            overflowY="auto"
            py={1.5}
            px={1.5}
            className="glass-scroll-area"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ transformOrigin: "top" }}
          >
            {options.map((opt) => {
              const isSelected = value === opt.value;
              return (
                <Box
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  role="option"
                  aria-selected={isSelected}
                  p={2.5}
                  my={0.5}
                  borderRadius="md"
                  cursor="pointer"
                  bg={
                    isSelected
                      ? isDark
                        ? "rgba(133, 193, 220, 0.12)"
                        : "rgba(0, 90, 156, 0.08)"
                      : "transparent"
                  }
                  color={
                    isSelected
                      ? isDark
                        ? "#99d1db"
                        : "#005A9C"
                      : colors.text
                  }
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  gap={3}
                  _hover={{
                    bg: isDark
                      ? "rgba(255, 255, 255, 0.06)"
                      : "rgba(0, 0, 0, 0.04)",
                  }}
                  transition="all 0.12s ease"
                >
                  <VStack align="stretch" gap={0.5} flex={1} minW={0}>
                    <HStack justify="space-between" align="center" wrap="wrap" gap={2}>
                      <Text
                        fontSize="13px"
                        fontWeight={isSelected ? "semibold" : "medium"}
                        truncate
                      >
                        {opt.label}
                      </Text>
                      {opt.badge && (
                        <Box
                          as="span"
                          fontSize="9.5px"
                          fontWeight="bold"
                          px={2}
                          py={0.5}
                          borderRadius="full"
                          border="1px solid"
                          borderColor={
                            opt.badge === "Recommended" || opt.badge === "Thorough" || opt.badge === "Exhaustive"
                              ? isDark
                                ? "rgba(153, 209, 219, 0.3)"
                                : "rgba(0, 90, 156, 0.3)"
                              : isDark
                                ? "rgba(138, 155, 168, 0.3)"
                                : "rgba(95, 107, 103, 0.3)"
                          }
                          bg={
                            opt.badge === "Recommended" || opt.badge === "Thorough" || opt.badge === "Exhaustive"
                              ? isDark
                                ? "rgba(153, 209, 219, 0.06)"
                                : "rgba(0, 90, 156, 0.04)"
                              : isDark
                                ? "rgba(138, 155, 168, 0.06)"
                                : "rgba(95, 107, 103, 0.04)"
                          }
                          color={
                            opt.badge === "Recommended" || opt.badge === "Thorough" || opt.badge === "Exhaustive"
                              ? isDark
                                ? "#99d1db"
                                : "#005A9C"
                              : isDark
                                ? "#8a9ba8"
                                : "#5f6b67"
                          }
                          letterSpacing="0.02em"
                          textTransform="uppercase"
                        >
                          {opt.badge}
                        </Box>
                      )}
                    </HStack>
                    {opt.subLabel && (
                      <Text
                        fontSize="11px"
                        color={isSelected ? (isDark ? "#8a9ba8" : "#5f6b67") : colors.subtext}
                        lineHeight="1.3"
                      >
                        {opt.subLabel}
                      </Text>
                    )}
                  </VStack>
                  {isSelected && (
                    <Box flexShrink={0}>
                      <Check
                        size={14}
                        style={{
                          color: isDark ? "#99d1db" : "#005A9C",
                        }}
                      />
                    </Box>
                  )}
                </Box>
              );
            })}
          </MotionBox>
        )}
      </AnimatePresence>
    </Box>
  );
}

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
  const urlInputRef = useRef<HTMLInputElement>(null);

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

  const depthOptions: CustomSelectOption[] = [
    {
      value: "direct",
      label: "Direct page only (depth 0)",
      subLabel: "Stays entirely on the landing page and will not follow any links.",
      badge: "Quickest",
    },
    {
      value: "standard",
      label: "Standard depth (depth 1)",
      subLabel: "Tests starting page and all pages directly linked from it.",
      badge: "Recommended",
    },
    {
      value: "deep",
      label: "Deep (depth 2)",
      subLabel: "Tests pages up to 2 clicks away from the starting page.",
    },
    {
      value: "aggressive",
      label: "Aggressive crawl",
      subLabel: "Tests pages up to 10 clicks away, scanning almost the entire site.",
    },
  ];

  const pageOptions: CustomSelectOption[] = [
    {
      value: "5",
      label: "5 pages",
      subLabel: "Quick checks during development.",
      badge: "Quick",
    },
    {
      value: "10",
      label: "10 pages",
      subLabel: "Recommended scope for standard testing.",
      badge: "Recommended",
    },
    {
      value: "20",
      label: "20 pages",
      subLabel: "Good for medium sites before a release.",
    },
    {
      value: "50",
      label: "50 pages",
      subLabel: "For full pre-release audits.",
      badge: "Thorough",
    },
    {
      value: "100",
      label: "100 pages",
      subLabel: "For thorough enterprise audits.",
    },
  ];

  const testsOptions: CustomSelectOption[] = [
    {
      value: "auto",
      label: "Auto",
      subLabel: `Derives dynamically: ${CRAWL_MODE_SCENARIOS_PER_PAGE[crawlMode as CrawlMode] ?? 8} scenarios per page.`,
      badge: "Recommended",
    },
    {
      value: "8",
      label: "8 tests per page",
      subLabel: "Faster run with fewer scenarios per page.",
      badge: "Quick",
    },
    {
      value: "12",
      label: "12 tests per page",
      subLabel: "Balanced test density.",
    },
    {
      value: "20",
      label: "20 tests per page",
      subLabel: "Detailed element validation.",
    },
    {
      value: "30",
      label: "30 tests per page",
      subLabel: "Exhaustive coverage of interactive paths.",
      badge: "Exhaustive",
    },
  ];

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
      urlInputRef.current?.focus();
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
      // Artificially hold submitting state for a moment so the premium shimmer
      // and dot animations have time to display and be perceived by the user.
      await new Promise((resolve) => setTimeout(resolve, 1200));

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
                ref={urlInputRef}
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
                  borderColor: "#0d2b6b",
                  boxShadow: "0 0 0 1px #0d2b6b",
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
                  borderColor: "#0d2b6b",
                  boxShadow: "0 0 0 1px #0d2b6b",
                }}
              />
              <Text fontSize="11.5px" color={colors.subtext}>
                Leave blank to test the whole page. Use this when several
                platforms live on one URL with no separate link — the agent will
                plan and test only the flow you describe. {focus.length}/1000
              </Text>
            </VStack>



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
                >
                  <Text
                    fontSize="12px"
                    fontWeight="bold"
                    color={colors.subtext}
                  >
                    Maximum Crawl Depth
                  </Text>
                  <CustomSelect
                    options={depthOptions}
                    value={crawlMode}
                    onChange={(val) => {
                      setCrawlMode(val);
                      // Default page scope grows with depth, so deeper
                      // modes yield more total tests out of the box.
                      setMaxPages(
                        val === "direct"
                          ? "1"
                          : val === "standard"
                            ? "10"
                            : val === "deep"
                              ? "20"
                              : "50",
                      );
                    }}
                    colors={colors}
                    hpe={hpe}
                    isDark={isDark}
                  />
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
                  >
                    <Text
                      fontSize="12px"
                      fontWeight="bold"
                      color={colors.subtext}
                    >
                      Pages to Crawl
                    </Text>
                    <CustomSelect
                      options={pageOptions}
                      value={maxPages}
                      onChange={(val) => setMaxPages(val)}
                      colors={colors}
                      hpe={hpe}
                      isDark={isDark}
                    />
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
                >
                  <Text
                    fontSize="12px"
                    fontWeight="bold"
                    color={colors.subtext}
                  >
                    Tests per Page
                  </Text>
                  <CustomSelect
                    options={testsOptions}
                    value={testsPerPage}
                    onChange={(val) => setTestsPerPage(val)}
                    colors={colors}
                    hpe={hpe}
                    isDark={isDark}
                  />
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
              bg={
                submitting
                  ? isDark
                    ? "linear-gradient(90deg, #0078D4 0%, #005A9C 50%, #0078D4 100%)"
                    : "linear-gradient(90deg, #005A9C 0%, #004578 50%, #005A9C 100%)"
                  : isDark
                    ? "linear-gradient(135deg, #0078D4 0%, #005A9C 100%)"
                    : "linear-gradient(135deg, #005A9C 0%, #004578 100%)"
              }
              backgroundSize="200% 100%"
              animation={submitting ? `${shimmer} 1.5s linear infinite` : undefined}
              color="white"
              fontSize="12.5px"
              fontWeight="bold"
              letterSpacing="0.08em"
              textTransform="uppercase"
              py={5}
              borderRadius="lg"
              border="1px solid"
              borderColor={isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)"}
              boxShadow={
                isDark
                  ? "0 4px 18px rgba(0, 120, 212, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2)"
                  : "0 4px 18px rgba(0, 90, 156, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)"
              }
              cursor={submitting ? "not-allowed" : "pointer"}
              transition="all 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
              _hover={
                submitting
                  ? {}
                  : {
                      bg: isDark
                        ? "linear-gradient(135deg, #1b8cf2 0%, #0078D4 100%)"
                        : "linear-gradient(135deg, #0078D4 0%, #005A9C 100%)",
                      transform: "translateY(-1.5px)",
                      boxShadow: isDark
                        ? "0 6px 24px rgba(0, 120, 212, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25)"
                        : "0 6px 24px rgba(0, 90, 156, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.45)",
                      "& svg": {
                        transform: "scale(1.1) translateX(1px)",
                      },
                    }
              }
              _active={
                submitting
                  ? {}
                  : {
                      transform: "translateY(0.5px) scale(0.985)",
                      boxShadow: isDark
                        ? "0 2px 10px rgba(0, 120, 212, 0.2)"
                        : "0 2px 10px rgba(0, 90, 156, 0.15)",
                    }
              }
              _disabled={{
                bg: hpe.border,
                color: hpe.subtext,
                opacity: 0.6,
                cursor: "not-allowed",
                boxShadow: "none",
                transform: "none",
              }}
              display="flex"
              alignItems="center"
              justifyContent="center"
              gap={2.5}
            >
              {submitting ? (
                <Flex align="center" gap={2}>
                  <Spinner
                    size="xs"
                    color="currentColor"
                  />
                  <HStack gap={0.5} align="center">
                    <Text as="span" fontWeight="bold" letterSpacing="0.08em">
                      Launching Test
                    </Text>
                    <motion.span
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}
                    >
                      .
                    </motion.span>
                    <motion.span
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}
                    >
                      .
                    </motion.span>
                    <motion.span
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }}
                    >
                      .
                    </motion.span>
                  </HStack>
                </Flex>
              ) : (
                <>
                  <Play
                    size={12}
                    fill="currentColor"
                    style={{
                      color: "currentColor",
                      transition: "transform 0.2s ease",
                    }}
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
