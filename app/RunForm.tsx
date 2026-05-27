"use client";

import { Box, Input, Flex, Text, HStack, Spinner } from "@chakra-ui/react";
import { motion } from "framer-motion";
import { Play, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useThemeMode } from "./providers";

const MotionBox = motion.create(Box);

export function RunForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useThemeMode();
  const isDark = theme === "dark";

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
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !data.runId) {
        setError(data.error ?? "Failed to start the run");
        setSubmitting(false);
        return;
      }
      router.push(`/runs/${data.runId}`);
    } catch {
      setError("Could not reach the server. Is it running?");
      setSubmitting(false);
    }
  }

  return (
    <Box as="form" onSubmit={onSubmit} w="full" position="relative">
      <Flex
        align="center"
        gap={3}
        w="full"
        bg={isDark ? "rgba(30, 41, 59, 0.45)" : "white"}
        borderWidth="1px"
        borderColor={isDark ? "white/10" : "gray.200"}
        borderRadius="full"
        px={5}
        py={3}
        boxShadow={isDark ? "0 4px 30px rgba(0, 0, 0, 0.4)" : "0 10px 25px rgba(0, 0, 0, 0.05)"}
        transition="all 0.2s"
        _focusWithin={{
          borderColor: "cyan.500/50",
          boxShadow: isDark 
            ? "0 0 25px rgba(6, 182, 212, 0.15), 0 4px 30px rgba(0, 0, 0, 0.4)" 
            : "0 0 20px rgba(6, 182, 212, 0.1), 0 10px 25px rgba(0, 0, 0, 0.05)"
        }}
      >
        {/* Input field */}
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Test a web app URL, e.g. https://www.tarento.com"
          size="lg"
          type="url"
          aria-label="Web app URL"
          disabled={submitting}
          bg="transparent"
          borderWidth={0}
          border="none"
          outline="none"
          _focus={{ bg: "transparent", border: "none", outline: "none", boxShadow: "none" }}
          _focusVisible={{ border: "none", outline: "none", boxShadow: "none" }}
          color={isDark ? "white" : "gray.850"}
          _placeholder={{ color: isDark ? "gray.500" : "gray.400" }}
          px={1}
          py={1}
          h="auto"
          flex={1}
          fontSize="md"
        />

        {/* Action Button - Send/Play style circular button */}
        <motion.button
          type="submit"
          disabled={submitting}
          whileHover={submitting ? {} : { 
            scale: 1.1,
            backgroundColor: isDark ? "#06b6d4" : "#0891b2",
            boxShadow: "0 0 15px rgba(6, 182, 212, 0.6)"
          }}
          whileTap={submitting ? {} : { scale: 0.95 }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            borderRadius: "9999px",
            backgroundColor: isDark ? "#0891b2" : "#06b6d4",
            color: "white",
            cursor: submitting ? "not-allowed" : "pointer",
            border: "none",
            flexShrink: 0,
          }}
        >
          {submitting ? (
            <Spinner size="xs" color="white" />
          ) : (
            <Play size={15} fill="currentColor" style={{ marginLeft: "2px" }} />
          )}
        </motion.button>
      </Flex>

      {error && (
        <MotionBox
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          mt={4}
          position="absolute"
          left={0}
          right={0}
          textAlign="center"
          zIndex={10}
        >
          <Text color="red.400" display="inline-flex" alignItems="center" gap={2} fontSize="sm" bg={isDark ? "rgba(2, 6, 23, 0.9)" : "white"} px={4} py={1.5} borderRadius="full" borderWidth="1px" borderColor="red.500/20" boxShadow="md">
            <TriangleAlert size={14} /> {error}
          </Text>
        </MotionBox>
      )}
    </Box>
  );
}
