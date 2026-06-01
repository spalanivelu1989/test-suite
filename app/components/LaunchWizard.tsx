"use client";

import React, { useState } from "react";
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
  NativeSelect,
} from "@chakra-ui/react";
import { Play, ChevronRight, TriangleAlert } from "lucide-react";
import { useThemeMode } from "@/app/providers";
import { getAWSColors, AWS_COLORS } from "@/app/theme/aws";

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
      gridTemplateColumns={{ base: "1fr", lg: "3fr 1fr" }}
      gap={6}
      w="full"
    >
      {/* Left panel: configurations */}
      <VStack align="stretch" gap={5} pb="200px">
        {/* Section 1: Name and tags */}
        <Box
          bg={colors.cardBg}
          border="1px solid"
          borderColor={colors.border}
          borderRadius="xl"
          p={4}
          backdropFilter="blur(16px)"
          shadow="md"
        >
          <VStack align="stretch" gap={2}>
            <Text fontSize="12.5px" fontWeight="bold" color={colors.text}>
              Target URL
            </Text>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g. https://www.tarento.com"
              fontSize="13px"
              bg={isDark ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.5)"}
              borderColor={colors.border}
              borderRadius="md"
              size="sm"
              disabled={submitting}
              autoFocus
            />
            <Text fontSize="12px" color={colors.subtext}>
              The AI agent will crawl this URL, planning and executing test
              suites.
            </Text>
          </VStack>
        </Box>

        {/* Section 4: Network and crawl settings */}
        <Box
          bg={colors.cardBg}
          border="1px solid"
          borderColor={colors.border}
          borderRadius="xl"
          p={4}
          backdropFilter="blur(16px)"
          shadow="md"
        >
          <Heading
            size="xs"
            color={colors.text}
            mb={3}
            borderBottom="1px solid"
            borderColor={colors.border}
            pb={2}
          >
            Crawl Parameters
          </Heading>

          <HStack gap={4} wrap="wrap">
            <VStack align="stretch" gap={1.5} flex={1} minW="150px">
              <Text fontSize="12.5px" fontWeight="bold" color={colors.text}>
                Maximum Crawl Depth
              </Text>
              <NativeSelect.Root size="sm">
                <NativeSelect.Field
                  value={crawlMode}
                  onChange={(e) => setCrawlMode(e.target.value)}
                  fontSize="13px"
                  bg={
                    isDark ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.5)"
                  }
                  borderColor={colors.border}
                  borderRadius="md"
                >
                  <option value="direct">Direct page only (depth 0)</option>
                  <option value="standard">
                    Standard depth — links of entry (depth 1)
                  </option>
                  <option value="deep">Deep — 3 levels down</option>
                  <option value="aggressive">
                    Aggressive crawl (depth 10)
                  </option>
                </NativeSelect.Field>
              </NativeSelect.Root>
            </VStack>

            <VStack align="stretch" gap={1.5} flex={1} minW="150px">
              <Text fontSize="12.5px" fontWeight="bold" color={colors.text}>
                Maximum Crawl Pages
              </Text>
              <NativeSelect.Root size="sm" disabled={crawlMode === "direct"}>
                <NativeSelect.Field
                  value={maxPages}
                  onChange={(e) => setMaxPages(e.target.value)}
                  opacity={crawlMode === "direct" ? 0.5 : 1}
                  title={
                    crawlMode === "direct"
                      ? "Direct mode tests only the entry page; page count does not apply."
                      : undefined
                  }
                  fontSize="13px"
                  bg={
                    isDark ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.5)"
                  }
                  borderColor={colors.border}
                  borderRadius="md"
                >
                  <option value="5">5 pages (Quick test)</option>
                  <option value="10">10 pages (Standard)</option>
                  <option value="20">20 pages</option>
                  <option value="50">50 pages (Thorough)</option>
                  <option value="100">100 pages (Large suite)</option>
                </NativeSelect.Field>
              </NativeSelect.Root>
            </VStack>
          </HStack>
        </Box>
      </VStack>

      {/* Right panel: Summary sticky widget */}
      <Box display="flex" flexDirection="column" gap={4}>
        <Box
          bg={colors.cardBg}
          border="1px solid"
          borderColor={colors.border}
          borderRadius="xl"
          p={4}
          position={{ lg: "sticky" }}
          top={{ lg: "70px" }}
          backdropFilter="blur(16px)"
          boxShadow="lg"
        >
          <Heading
            size="xs"
            color={colors.text}
            mb={4}
            borderBottom="1px solid"
            borderColor={colors.border}
            pb={2}
          >
            Summary
          </Heading>

          <VStack align="stretch" gap={3} mb={5} fontSize="13px">
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
                  ? "entry page only"
                  : `${maxPages} pages max`}
                )
              </Text>
            </Box>
          </VStack>

          <Button
            type="submit"
            disabled={submitting}
            w="full"
            bg="linear-gradient(135deg, var(--aws-orange-light) 0%, var(--aws-orange-main) 100%)"
            color="white"
            fontSize="13px"
            fontWeight="bold"
            py={3}
            h="auto"
            borderRadius="md"
            cursor={submitting ? "not-allowed" : "pointer"}
            border="none"
            boxShadow="0 2px 8px rgba(6, 182, 212, 0.25)"
            transition="all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
            _hover={
              submitting
                ? {}
                : {
                    bg: "linear-gradient(135deg, var(--aws-orange-light) 30%, var(--aws-orange-hover) 100%)",
                    transform: "translateY(-1px)",
                    boxShadow: "0 4px 12px rgba(6, 182, 212, 0.4)",
                  }
            }
            _active={
              submitting
                ? {}
                : {
                    transform: "translateY(0)",
                    boxShadow: "0 2px 4px rgba(6, 182, 212, 0.2)",
                  }
            }
            display="flex"
            alignItems="center"
            justifyContent="center"
            gap={2}
          >
            {submitting ? (
              <>
                <Spinner size="xs" color="white" />
                <span>Launching...</span>
              </>
            ) : (
              <>
                <Play size={13} fill="white" />
                <span>Launch Test</span>
              </>
            )}
          </Button>

          {error && (
            <Flex
              mt={4}
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
        </Box>
      </Box>
    </Box>
  );
}
