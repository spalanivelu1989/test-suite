"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Input,
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
import { motion, AnimatePresence } from "framer-motion";

const MotionBox = motion.create(Box);

interface LaunchWizardProps {
  onLaunchSuccess: (runId: string) => void;
}

export function LaunchWizard({ onLaunchSuccess }: LaunchWizardProps) {
  const { theme } = useThemeMode();
  const colors = getAWSColors(theme);
  const isDark = theme === "dark";

  const [url, setUrl] = useState("");
  const [crawlMode, setCrawlMode] = useState("standard");
  const [maxPages, setMaxPages] = useState("10");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom Dropdown states
  const [isDepthOpen, setIsDepthOpen] = useState(false);
  const [isPagesOpen, setIsPagesOpen] = useState(false);

  const getExpectedTests = (pagesVal: string) => {
    const pages = parseInt(pagesVal);
    const budget = crawlMode === "direct" ? (pages === 2 ? 1.5 : 1) : pages;
    const rate = crawlMode === "direct" ? 8 : crawlMode === "standard" ? 5 : crawlMode === "deep" ? 4 : 3;
    return budget * rate;
  };

  const getPagesFullLabel = (value: string, defaultText: string) => {
    if (crawlMode === "direct") {
      return value === "2"
        ? "1 page (Entry page only — Max 12 tests)"
        : "1 page (Entry page only — Max 8 tests)";
    }
    const expected = getExpectedTests(value);
    return `${defaultText} (Max ${expected} tests)`;
  };

  const depthRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);

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
      <Box
        position="relative"
        bg={colors.subBg}
        border="1px solid"
        borderColor={colors.border}
        borderRadius="xl"
        p={6}
        display="flex"
        flexDirection="column"
        justifyContent="center"
      >
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
              bg={isDark ? "#232634" : "#ffffff"}
              borderColor={colors.border}
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

          {/* Separator */}
          <Box borderTop="1px solid" borderColor={colors.border} my={1} />

          {/* Section 2: Crawl Parameters */}
          <VStack align="stretch" gap={4}>
            <Text
              fontSize="13px"
              fontWeight="extrabold"
              color={colors.text}
              letterSpacing="0.03em"
              fontFamily="mono"
              textTransform="uppercase"
            >
              Crawl Parameters
            </Text>

            <HStack gap={4} wrap="wrap">
              <VStack
                align="stretch"
                gap={1.5}
                flex={1}
                minW="150px"
                position="relative"
                ref={depthRef}
              >
                <Text fontSize="12px" fontWeight="bold" color={colors.subtext}>
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
                  bg={isDark ? "#232634" : "#ffffff"}
                  border="1px solid"
                  borderColor={colors.border}
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
                    {crawlMode === "deep" && "Deep — 3 levels down"}
                    {crawlMode === "aggressive" &&
                      "Aggressive crawl (depth 10)"}
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
                      bg={isDark ? "#292c3c" : "#ffffff"}
                      border="1px solid"
                      borderColor={colors.border}
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
                        { value: "deep", label: "Deep — 3 levels down" },
                        {
                          value: "aggressive",
                          label: "Aggressive crawl (depth 10)",
                        },
                      ].map((opt) => {
                        const isSelected = crawlMode === opt.value;
                        return (
                          <Box
                            key={opt.value}
                            onClick={() => {
                              setCrawlMode(opt.value);
                              if (opt.value === "direct") {
                                setMaxPages("1");
                              } else if (maxPages === "1" || maxPages === "2") {
                                setMaxPages("10");
                              }
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
              </VStack>

              <VStack
                align="stretch"
                gap={1.5}
                flex={1}
                minW="150px"
                position="relative"
                ref={pagesRef}
              >
                <Text fontSize="12px" fontWeight="bold" color={colors.subtext}>
                  Maximum Crawl Pages
                </Text>
                {/* Trigger Button */}
                <Box
                  role="button"
                  tabIndex={0}
                  onClick={() => setIsPagesOpen(!isPagesOpen)}
                  w="full"
                  h="36px"
                  px={3}
                  bg={isDark ? "#232634" : "#ffffff"}
                  border="1px solid"
                  borderColor={colors.border}
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
                    {crawlMode === "direct"
                      ? getPagesFullLabel(maxPages, "")
                      : getPagesFullLabel(
                          maxPages,
                          maxPages === "5"
                            ? "5 pages (Quick test)"
                            : maxPages === "10"
                              ? "10 pages (Standard)"
                              : maxPages === "20"
                                ? "20 pages"
                                : maxPages === "50"
                                  ? "50 pages (Thorough)"
                                  : "100 pages (Large suite)"
                        )}
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
                      bg={isDark ? "#292c3c" : "#ffffff"}
                      border="1px solid"
                      borderColor={colors.border}
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
                      {(crawlMode === "direct"
                        ? [
                            { value: "1", label: "1 page (Entry page only — Max 8 tests)" },
                            { value: "2", label: "1 page (Entry page only — Max 12 tests)" },
                          ]
                        : [
                            { value: "5", label: "5 pages (Quick test)" },
                            { value: "10", label: "10 pages (Standard)" },
                            { value: "20", label: "20 pages" },
                            { value: "50", label: "50 pages (Thorough)" },
                            { value: "100", label: "100 pages (Large suite)" },
                          ]
                      ).map((opt) => {
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
                            <Text truncate>{getPagesFullLabel(opt.value, opt.label)}</Text>
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
              </VStack>
            </HStack>
          </VStack>
        </VStack>
      </Box>

      {/* Right panel: Summary card */}
      <Box
        bg={isDark ? "#2d313f" : "#eceef1"}
        border="1px solid"
        borderColor={isDark ? "#484f67" : "#cbd5e1"}
        borderRadius="xl"
        p={6}
        shadow="md"
        display="flex"
        flexDirection="column"
        justifyContent="space-between"
      >
        <VStack align="stretch" gap={4}>
          <Heading
            size="xs"
            color={colors.text}
            mb={1}
            borderBottom="1px solid"
            borderColor={colors.border}
            pb={2}
          >
            Summary
          </Heading>

          <VStack align="stretch" gap={3} fontSize="13px">
            <Box>
              <Text fontWeight="bold" color={colors.text} mb={1}>
                Target URL
              </Text>
              <Text color={colors.subtext} wordBreak="break-all">
                {url || "Not specified"}
              </Text>
            </Box>

            <Box borderTop="1px solid" borderColor={colors.border} pt={2}>
              <Text fontWeight="bold" color={colors.text} mb={1}>
                Crawl Parameters
              </Text>
              <Text color={colors.subtext}>
                Mode:{" "}
                {crawlMode === "direct"
                  ? "Direct page only"
                  : crawlMode === "standard"
                    ? "Standard depth"
                    : crawlMode === "deep"
                      ? "Deep crawl"
                      : "Aggressive crawl"}{" "}
                (
                {crawlMode === "direct"
                  ? maxPages === "2"
                    ? "entry page only — Max 12 tests"
                    : "entry page only — Max 8 tests"
                  : `${maxPages} pages max — Max ${getExpectedTests(maxPages)} tests`}
                )
              </Text>
            </Box>
          </VStack>
        </VStack>

        <VStack align="stretch" gap={3} mt={4}>
          <Button
            type="submit"
            disabled={submitting}
            w="full"
            bg="#e5e4e2"
            color="#1a263b"
            fontSize="12px"
            fontWeight="black"
            letterSpacing="0.06em"
            textTransform="uppercase"
            py={4}
            h="42px"
            borderRadius="lg"
            cursor={submitting ? "not-allowed" : "pointer"}
            border="1px solid"
            borderColor={
              isDark ? "rgba(0, 0, 0, 0.15)" : "#1a263b"
            }
            boxShadow="0 3px 12px rgba(0, 0, 0, 0.1)"
            transition="background-color 0.2s ease"
            _hover={
              submitting
                ? {}
                : {
                    bg: isDark ? "#f3f2f0" : "#dcdbd9",
                  }
            }
            _active={
              submitting
                ? {}
                : {
                    bg: isDark ? "#d2d1cf" : "#c8c7c5",
                  }
            }
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
                <Play size={13} fill="currentColor" style={{ color: "currentColor" }} />
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
  );
}
