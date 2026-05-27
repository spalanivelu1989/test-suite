"use client";

import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Link,
  Spinner,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import {
  CircleCheck,
  CircleX,
  Download,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import NextLink from "next/link";
import { useEffect, useState } from "react";
import type { ProgressEvent, RunReport, TestOutcome } from "@/src/types";

type Status = "running" | "completed" | "failed";

const OUTCOME_COLOR: Record<TestOutcome, string> = {
  passed: "green",
  failed: "red",
  flaky: "orange",
  healed: "blue",
};

export function RunView({ id }: { id: string }) {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [status, setStatus] = useState<Status>("running");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/runs/${id}/stream`);
    es.addEventListener("progress", (e) => {
      setEvents((prev) => [...prev, JSON.parse((e as MessageEvent).data)]);
    });
    es.addEventListener("end", async (e) => {
      const { status: s, error: err } = JSON.parse((e as MessageEvent).data);
      es.close();
      if (s === "failed") {
        setStatus("failed");
        setError(err ?? "The run failed");
        return;
      }
      const res = await fetch(`/api/runs/${id}/report?format=json`);
      if (res.ok) setReport((await res.json()) as RunReport);
      setStatus("completed");
    });
    es.onerror = () => {
      es.close();
      setStatus((cur) => (cur === "running" ? "failed" : cur));
      setError((cur) => cur ?? "Lost connection to the run stream");
    };
    return () => es.close();
  }, [id]);

  return (
    <Stack gap={6}>
      <HStack justify="space-between">
        <Heading size="lg">Test run</Heading>
        <Button asChild variant="outline" size="sm">
          <NextLink href="/">New run</NextLink>
        </Button>
      </HStack>

      {/* Progress (T20) */}
      <Box bg="white" borderWidth="1px" borderRadius="lg" p={4}>
        <HStack mb={3}>
          {status === "running" && <Spinner size="sm" />}
          <Text fontWeight="medium">
            {status === "running"
              ? "Running…"
              : status === "completed"
                ? "Complete"
                : "Failed"}
          </Text>
        </HStack>
        <Stack gap={1}>
          {events.map((ev, i) => (
            <Text key={i} fontSize="sm" color="gray.600">
              <Badge mr={2}>{ev.stage}</Badge>
              {ev.message}
            </Text>
          ))}
        </Stack>
      </Box>

      {/* Failure state (T22) — no false "passed" */}
      {status === "failed" && (
        <Box
          bg="red.50"
          borderColor="red.200"
          borderWidth="1px"
          borderRadius="lg"
          p={4}
        >
          <Text color="red.700" display="flex" alignItems="center" gap={2}>
            <TriangleAlert size={18} /> {error}
          </Text>
        </Box>
      )}

      {/* Report (T21) */}
      {report && (
        <Box bg="white" borderWidth="1px" borderRadius="lg" p={6}>
          <Heading size="md" mb={2}>
            {report.coverage.percent}% flow coverage
          </Heading>
          <Text color="gray.600" mb={4}>
            {report.coverage.testedCount}/{report.coverage.curatedTotal} curated
            flows · flake rate {Math.round(report.flakeRate * 100)}% · auto-heal{" "}
            {Math.round(report.healSuccessRate * 100)}% ·{" "}
            {report.claudeCallCount} Claude calls
          </Text>

          <Table.Root size="sm" variant="outline">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeader>Flow</Table.ColumnHeader>
                <Table.ColumnHeader>Outcome</Table.ColumnHeader>
                <Table.ColumnHeader>Detail</Table.ColumnHeader>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {report.results.map((r) => (
                <Table.Row key={r.fileName}>
                  <Table.Cell>{r.flowId}</Table.Cell>
                  <Table.Cell>
                    <Badge colorPalette={OUTCOME_COLOR[r.outcome]}>
                      {r.outcome === "passed" && <CircleCheck size={12} />}
                      {r.outcome === "failed" && <CircleX size={12} />}
                      {r.outcome === "healed" && <Wrench size={12} />}
                      {r.outcome === "flaky" && <TriangleAlert size={12} />}
                      {r.outcome}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {r.failureReason ?? (r.healed ? "repaired" : "")}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>

          <HStack mt={5} gap={3}>
            {(["json", "md", "html"] as const).map((fmt) => (
              <Button key={fmt} asChild variant="subtle" size="sm">
                <Link
                  href={`/api/runs/${id}/report?format=${fmt}`}
                  target="_blank"
                >
                  <Download size={14} /> {fmt.toUpperCase()}
                </Link>
              </Button>
            ))}
          </HStack>
        </Box>
      )}
    </Stack>
  );
}
