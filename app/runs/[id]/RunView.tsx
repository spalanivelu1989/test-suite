"use client";

import {
  Badge,
  Box,
  Button,
  Code,
  Heading,
  HStack,
  Link,
  Spinner,
  Stack,
  Tabs,
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
import { bucketResults } from "@/src/reporter/successRate";
import type { ProgressEvent, RunReport, TestOutcome } from "@/src/types";

type Status = "running" | "completed" | "failed";

const OUTCOME_COLOR: Record<TestOutcome, string> = {
  passed: "green",
  failed: "red",
  flaky: "orange",
  healed: "blue",
  fixme: "gray",
};

const AGENTS = ["planning", "generating", "healing", "reporting"] as const;
const AGENT_LABEL: Record<string, string> = {
  planning: "Planner",
  generating: "Generator",
  healing: "Healer",
  reporting: "Reporter",
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

  const reachedStages = new Set(events.map((e) => e.stage));
  const buckets = report ? bucketResults(report.results) : null;

  return (
    <Stack gap={6}>
      <HStack justify="space-between">
        <Heading size="lg">Test run</Heading>
        <Button asChild variant="outline" size="sm">
          <NextLink href="/">New run</NextLink>
        </Button>
      </HStack>

      {/* Agent-stage progress (T19) */}
      <Box bg="white" borderWidth="1px" borderRadius="lg" p={4}>
        <HStack mb={3} gap={2} wrap="wrap">
          {status === "running" && <Spinner size="sm" />}
          {AGENTS.map((stage) => (
            <Badge
              key={stage}
              colorPalette={
                report || reachedStages.has(stage) ? "teal" : "gray"
              }
              variant={reachedStages.has(stage) || report ? "solid" : "outline"}
            >
              {AGENT_LABEL[stage]}
            </Badge>
          ))}
          <Text fontWeight="medium" ml={2}>
            {status === "running"
              ? "Running…"
              : status === "completed"
                ? "Complete"
                : "Failed"}
          </Text>
        </HStack>
        <Stack gap={1} maxH="40" overflowY="auto">
          {events.map((ev, i) => (
            <Text key={i} fontSize="sm" color="gray.600">
              <Badge mr={2}>{ev.stage}</Badge>
              {ev.message}
            </Text>
          ))}
        </Stack>
      </Box>

      {/* Failure state (T22 carried over) */}
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

      {/* Rich report with tabs (T20 + T21) */}
      {report && buckets && (
        <Box bg="white" borderWidth="1px" borderRadius="lg" p={6}>
          <Heading size="md" mb={1}>
            {Math.round(report.successRate.rate * 100)}% success rate
          </Heading>
          <Text color="gray.600" mb={4}>
            {report.successRate.passed}/{report.successRate.total} tests passed
            · {report.url} · coverage {report.coverage.percent}% · flake{" "}
            {Math.round(report.flakeRate * 100)}% · auto-heal{" "}
            {Math.round(report.healSuccessRate * 100)}% ·{" "}
            {report.claudeCallCount} Claude calls
          </Text>

          <Tabs.Root defaultValue="report">
            <Tabs.List>
              <Tabs.Trigger value="report">Report</Tabs.Trigger>
              <Tabs.Trigger value="code">Code</Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="report">
              <Breakdown
                title={`Passed (${buckets.passed.length})`}
                items={buckets.passed.map((r) => r.flowId)}
              />
              <Breakdown
                title={`Needs attention (${buckets.needsAttention.length})`}
                items={buckets.needsAttention.map(
                  (r) => `${r.flowId} — ${r.failureReason ?? r.outcome}`,
                )}
              />
              <Breakdown
                title={`Where to improve (${buckets.whereToImprove.length})`}
                items={buckets.whereToImprove.map(
                  (r) => `${r.flowId} (${r.outcome})`,
                )}
              />

              <Heading size="sm" mt={5} mb={2}>
                Test results
              </Heading>
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
                          {(r.outcome === "flaky" || r.outcome === "fixme") && (
                            <TriangleAlert size={12} />
                          )}
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

              {report.fixPrompts.length > 0 && (
                <>
                  <Heading size="sm" mt={5} mb={2}>
                    Fix prompts
                  </Heading>
                  <Stack gap={2}>
                    {report.fixPrompts.map((f, i) => (
                      <Box
                        key={i}
                        borderLeftWidth="3px"
                        borderColor="orange.300"
                        pl={3}
                      >
                        <Text fontWeight="medium">{f.test}</Text>
                        <Text fontSize="sm" color="gray.600">
                          {f.problem}
                        </Text>
                        <Text fontSize="sm">→ {f.change}</Text>
                      </Box>
                    ))}
                  </Stack>
                </>
              )}
              <Breakdown title="Issues found" items={report.issues} />
              <Breakdown
                title="Recommendations"
                items={report.recommendations}
              />

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
            </Tabs.Content>

            <Tabs.Content value="code">
              {report.planMarkdown && (
                <>
                  <Heading size="sm" mb={2}>
                    Test plan
                  </Heading>
                  <Code
                    as="pre"
                    display="block"
                    whiteSpace="pre-wrap"
                    p={3}
                    mb={5}
                    borderRadius="md"
                    w="full"
                  >
                    {report.planMarkdown}
                  </Code>
                </>
              )}
              <Heading size="sm" mb={2}>
                Generated specs ({report.generatedSpecs.length})
              </Heading>
              <Stack gap={4}>
                {report.generatedSpecs.map((s) => (
                  <Box key={s.file}>
                    <Text fontWeight="medium" fontSize="sm" mb={1}>
                      {s.file}
                    </Text>
                    <Code
                      as="pre"
                      display="block"
                      whiteSpace="pre-wrap"
                      p={3}
                      borderRadius="md"
                      w="full"
                    >
                      {s.code}
                    </Code>
                  </Box>
                ))}
              </Stack>
            </Tabs.Content>
          </Tabs.Root>
        </Box>
      )}
    </Stack>
  );
}

function Breakdown({ title, items }: { title: string; items: string[] }) {
  return (
    <Box mt={4}>
      <Heading size="sm" mb={1}>
        {title}
      </Heading>
      {items.length === 0 ? (
        <Text fontSize="sm" color="gray.500">
          None.
        </Text>
      ) : (
        <Stack gap={0.5}>
          {items.map((it, i) => (
            <Text key={i} fontSize="sm" color="gray.700">
              • {it}
            </Text>
          ))}
        </Stack>
      )}
    </Box>
  );
}
