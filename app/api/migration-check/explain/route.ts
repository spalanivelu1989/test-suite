import { NextResponse } from "next/server";
import { createClaudeClient } from "@/src/claude/client";
import { explainFailure, type ExplainInput } from "@/src/migration/explain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/migration-check/explain — plain-language summary of why a migrated
 * test failed (what, why, suggested fix). Uses the LLM when ANTHROPIC_API_KEY is
 * set; otherwise returns a deterministic heuristic. Always returns 200.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON" },
      { status: 400 },
    );
  }
  const b = body as Partial<ExplainInput>;
  if (!b || typeof b.file !== "string") {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const input: ExplainInput = {
    title: b.title ?? null,
    file: b.file,
    failureReason: b.failureReason,
    code: b.code,
    sourceOutcome: b.sourceOutcome ?? "unknown",
    targetOutcome: b.targetOutcome ?? "failed",
    classification: b.classification ?? "behavioral",
    buildMismatch: b.buildMismatch,
    sourceUrl: b.sourceUrl,
    targetUrl: b.targetUrl,
  };

  // createClaudeClient never throws here; explainFailure falls back to the
  // heuristic if there's no API key or the call fails.
  const claude = createClaudeClient();
  const explanation = await explainFailure(input, claude);
  return NextResponse.json({ explanation });
}
