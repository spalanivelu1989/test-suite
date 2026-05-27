"use client";

import { Box, Button, Input, Stack, Text } from "@chakra-ui/react";
import { motion } from "framer-motion";
import { Play, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MotionBox = motion.create(Box);

export function RunForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side guard so obviously bad input never starts a run (T22).
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
    <Box as="form" onSubmit={onSubmit} w="full">
      <Stack direction={{ base: "column", sm: "row" }} gap={3}>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.tarento.com"
          size="lg"
          type="url"
          aria-label="Web app URL"
          disabled={submitting}
        />
        <Button
          type="submit"
          size="lg"
          colorPalette="teal"
          loading={submitting}
          loadingText="Starting"
          px={8}
        >
          <Play size={18} /> Test
        </Button>
      </Stack>
      {error && (
        <MotionBox
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          mt={3}
        >
          <Text color="red.500" display="flex" alignItems="center" gap={2}>
            <TriangleAlert size={16} /> {error}
          </Text>
        </MotionBox>
      )}
    </Box>
  );
}
