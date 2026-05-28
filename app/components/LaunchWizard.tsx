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
import { Play, ShieldCheck, ChevronRight, TriangleAlert, Info } from "lucide-react";
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
  const [browser, setBrowser] = useState("chrome");
  const [instanceType, setInstanceType] = useState("t3.medium");
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
          maxPages: parseInt(maxPages)
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
    <Box as="form" onSubmit={onSubmit} display="grid" gridTemplateColumns={{ base: "1fr", lg: "3fr 1fr" }} gap={6} w="full">
      {/* Left panel: configurations */}
      <VStack align="stretch" gap={5} pb="200px">
        
        {/* Section 1: Name and tags */}
        <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} borderRadius="md" p={4}>
          <VStack align="stretch" gap={2}>
            <Text fontSize="11px" fontWeight="semibold" color={colors.text}>
              Target URL
            </Text>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g. https://www.tarento.com"
              fontSize="12px"
              bg={isDark ? "slate.900" : "white"}
              borderColor={colors.border}
              borderRadius="sm"
              size="sm"
              disabled={submitting}
              autoFocus
            />
            <Text fontSize="10px" color={colors.subtext}>
              The AI agent will crawl this URL, planning and executing test suites.
            </Text>
          </VStack>
        </Box>

        {/* Section 2: Application and OS Images (AMI) */}
        <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} borderRadius="md" p={4}>
          <Heading size="xs" color={colors.text} mb={3} borderBottom="1px solid" borderColor={colors.border} pb={2} display="flex" alignItems="center" gap={1.5}>
            Application and OS Images (Amazon Machine Image) <Info size={11} style={{ color: colors.subtext }} />
          </Heading>
          <Text fontSize="11px" color={colors.subtext} mb={4}>
            An AMI is a template that contains the software configuration (operating system, application server, and applications) required to launch your instance.
          </Text>

          <VStack align="stretch" gap={3}>
            {/* Chrome Option */}
            <Box
              border="1px solid"
              borderColor={browser === "chrome" ? AWS_COLORS.orange.main : colors.border}
              borderRadius="sm"
              p={3.5}
              bg={browser === "chrome" ? (isDark ? "rgba(236,114,17,0.05)" : "rgba(236,114,17,0.02)") : "transparent"}
              cursor="pointer"
              onClick={() => setBrowser("chrome")}
            >
              <HStack gap={3} align="flex-start">
                <Box
                  w="14px"
                  h="14px"
                  borderRadius="full"
                  border="2px solid"
                  borderColor={browser === "chrome" ? AWS_COLORS.orange.main : colors.subtext}
                  bg={browser === "chrome" ? AWS_COLORS.orange.main : "transparent"}
                  mt="3px"
                  flexShrink={0}
                />
                <VStack align="stretch" gap={0.5} flex={1}>
                  <HStack>
                    <Text fontSize="11px" fontWeight="bold" color={colors.text}>
                      Playwright Chrome Headless (Recommended)
                    </Text>
                    <Box bg="green.500/10" color="green.600" fontSize="9px" fontWeight="bold" px={1.5} py={0.1} borderRadius="sm">
                      Free tier eligible
                    </Box>
                  </HStack>
                  <Text fontSize="10px" color={colors.subtext}>
                    Playwright framework using headless chromium browser. Ideal for single-page apps (SPAs) and traditional HTML web apps.
                  </Text>
                </VStack>
              </HStack>
            </Box>

            {/* Firefox Option */}
            <Box
              border="1px solid"
              borderColor={browser === "firefox" ? AWS_COLORS.orange.main : colors.border}
              borderRadius="sm"
              p={3.5}
              bg={browser === "firefox" ? (isDark ? "rgba(236,114,17,0.05)" : "rgba(236,114,17,0.02)") : "transparent"}
              cursor="pointer"
              onClick={() => setBrowser("firefox")}
            >
              <HStack gap={3} align="flex-start">
                <Box
                  w="14px"
                  h="14px"
                  borderRadius="full"
                  border="2px solid"
                  borderColor={browser === "firefox" ? AWS_COLORS.orange.main : colors.subtext}
                  bg={browser === "firefox" ? AWS_COLORS.orange.main : "transparent"}
                  mt="3px"
                  flexShrink={0}
                />
                <VStack align="stretch" gap={0.5} flex={1}>
                  <Text fontSize="11px" fontWeight="bold" color={colors.text}>
                    Playwright Firefox Headless
                  </Text>
                  <Text fontSize="10px" color={colors.subtext}>
                    Playwright framework using headless gecko browser. Perfect for cross-browser verification.
                  </Text>
                </VStack>
              </HStack>
            </Box>
          </VStack>
        </Box>

        {/* Section 3: Instance type */}
        <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} borderRadius="md" p={4}>
          <Heading size="xs" color={colors.text} mb={3} borderBottom="1px solid" borderColor={colors.border} pb={2}>
            Instance type
          </Heading>
          <Text fontSize="11px" color={colors.subtext} mb={3}>
            Instance types comprise varying combinations of CPU, memory, storage, and networking capacity. Choose a type based on how many tokens or threads you need.
          </Text>

          <HStack gap={3}>
            <VStack align="stretch" gap={1.5} flex={1}>
              <Text fontSize="11px" fontWeight="semibold" color={colors.text}>
                Instance Type
              </Text>
              <NativeSelect.Root size="sm">
                <NativeSelect.Field
                  value={instanceType}
                  onChange={(e) => setInstanceType(e.target.value)}
                  fontSize="12px"
                  bg={isDark ? "slate.900" : "white"}
                  borderColor={colors.border}
                  borderRadius="sm"
                >
                  <option value="t3.medium">t3.medium (Standard AI Agent - 1.0x speed)</option>
                  <option value="t3.xlarge">t3.xlarge (Fast AI Agent - 2.5x speed - high concurrency)</option>
                </NativeSelect.Field>
              </NativeSelect.Root>
            </VStack>
          </HStack>
        </Box>

        {/* Section 4: Network and crawl settings */}
        <Box bg={colors.cardBg} border="1px solid" borderColor={colors.border} borderRadius="md" p={4}>
          <Heading size="xs" color={colors.text} mb={3} borderBottom="1px solid" borderColor={colors.border} pb={2}>
            Network settings (Crawl Parameters)
          </Heading>
          
          <HStack gap={4} wrap="wrap">
            <VStack align="stretch" gap={1.5} flex={1} minW="150px">
              <Text fontSize="11px" fontWeight="semibold" color={colors.text}>
                Maximum Crawl Depth
              </Text>
              <NativeSelect.Root size="sm">
                <NativeSelect.Field
                  value={crawlMode}
                  onChange={(e) => setCrawlMode(e.target.value)}
                  fontSize="12px"
                  bg={isDark ? "slate.900" : "white"}
                  borderColor={colors.border}
                  borderRadius="sm"
                >
                  <option value="direct">Direct page only (depth 0)</option>
                  <option value="standard">Standard depth — links of entry (depth 1)</option>
                  <option value="deep">Deep — 3 levels down</option>
                  <option value="aggressive">Aggressive crawl (depth 10)</option>
                </NativeSelect.Field>
              </NativeSelect.Root>
            </VStack>

            <VStack align="stretch" gap={1.5} flex={1} minW="150px">
              <Text fontSize="11px" fontWeight="semibold" color={colors.text}>
                Maximum Crawl Pages
              </Text>
              <NativeSelect.Root size="sm">
                <NativeSelect.Field
                  value={maxPages}
                  onChange={(e) => setMaxPages(e.target.value)}
                  fontSize="12px"
                  bg={isDark ? "slate.900" : "white"}
                  borderColor={colors.border}
                  borderRadius="sm"
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
          borderRadius="md"
          p={4}
          position={{ lg: "sticky" }}
          top={{ lg: "70px" }}
          boxShadow="sm"
        >
          <Heading size="xs" color={colors.text} mb={4} borderBottom="1px solid" borderColor={colors.border} pb={2}>
            Summary
          </Heading>

          <VStack align="stretch" gap={3} mb={5} fontSize="11px">
            <Flex justify="space-between">
              <Text color={colors.subtext}>Number of instances:</Text>
              <Text fontWeight="bold">1</Text>
            </Flex>
            
            <Box borderTop="1px solid" borderColor={colors.border} pt={2}>
              <Text fontWeight="bold" color={colors.text} mb={1}>
                Software Image (AMI)
              </Text>
              <Text color={colors.subtext}>
                {browser === "chrome" ? "Chrome Headless / Playwright" : "Firefox Headless / Playwright"}
              </Text>
            </Box>

            <Box borderTop="1px solid" borderColor={colors.border} pt={2}>
              <Text fontWeight="bold" color={colors.text} mb={1}>
                Instance Type
              </Text>
              <Text color={colors.subtext}>
                {instanceType === "t3.medium" ? "t3.medium (Standard)" : "t3.xlarge (Turbo)"}
              </Text>
            </Box>

            <Box borderTop="1px solid" borderColor={colors.border} pt={2}>
              <Text fontWeight="bold" color={colors.text} mb={1}>
                Firewall (Security Group)
              </Text>
              <Text color={colors.subtext}>sg-default (ports: 80, 443 outbound)</Text>
            </Box>

            <Box borderTop="1px solid" borderColor={colors.border} pt={2}>
              <Text fontWeight="bold" color={colors.text} mb={1}>
                Storage (Volumes)
              </Text>
              <Text color={colors.subtext}>1 x 8 GiB GP3 Root Volume</Text>
            </Box>
          </VStack>

          <Button
            type="submit"
            disabled={submitting}
            w="full"
            bg={AWS_COLORS.orange.main}
            color="white"
            fontSize="12px"
            fontWeight="bold"
            py={2.5}
            h="auto"
            borderRadius="sm"
            cursor={submitting ? "not-allowed" : "pointer"}
            _hover={{ bg: AWS_COLORS.orange.hover }}
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
                <span>Launch Instance</span>
              </>
            )}
          </Button>

          {error && (
            <Flex mt={4} p={2.5} bg="red.500/10" border="1px solid" borderColor="red.500/20" borderRadius="sm" gap={2} align="flex-start">
              <TriangleAlert size={14} style={{ color: "red", flexShrink: 0, marginTop: "2px" }} />
              <Text fontSize="10px" color="red">
                {error}
              </Text>
            </Flex>
          )}

          <Flex mt={4} align="center" gap={2} fontSize="10px" color="green.600" bg="green.500/5" p={2} borderRadius="sm">
            <ShieldCheck size={14} />
            <Text fontWeight="medium">IAM policies check passed</Text>
          </Flex>
        </Box>
      </Box>
    </Box>
  );
}
