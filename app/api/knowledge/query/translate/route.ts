import { createClaudeClient } from "@/src/claude/client";
import { KNOWLEDGE_SCHEMA_PROMPT } from "@/src/knowledge/sql/schema";

export const runtime = "nodejs";

// Translate a plain-English question into ONE read-only SQL query using the same
// Claude client the orchestrator uses. This route only GENERATES sql — it never
// touches the database. Execution happens in ../run after the user reviews it.

const SYSTEM_PROMPT = `You are a senior PostgreSQL engineer. Convert the user's question into exactly ONE read-only SQL query for the schema below.

Hard rules:
- Output ONLY the SQL, wrapped in a \`\`\`sql code block. No prose, no explanation.
- A single statement that MUST start with SELECT or WITH. Never write (no INSERT/UPDATE/DELETE/DDL) and never use semicolons except an optional trailing one.
- Prefer explicit column lists and add a sensible LIMIT (<= 200) unless the user asks for an exact count or aggregate.
- Never select the vector columns (embedding, pattern_embedding, title_embedding).
- app_id is a normalized origin with NO trailing slash and no path (e.g. 'https://example.com'). If the user gives a URL like 'https://example.com/foo/', match app_id = 'https://example.com'.

${KNOWLEDGE_SCHEMA_PROMPT}`;

/** Pull the SQL out of the model reply (fenced block preferred) and drop trailing ';'. */
function extractSql(text: string): string {
  const fenced =
    text.match(/```sql\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  return body.replace(/;\s*$/, "").trim();
}

export async function POST(request: Request) {
  if (!process.env.KNOWLEDGE_DATABASE_URL) {
    return Response.json(
      { enabled: false, error: "KNOWLEDGE_DATABASE_URL is not configured" },
      { status: 200 },
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        enabled: false,
        error:
          "ANTHROPIC_API_KEY is not configured — natural-language translation needs it.",
      },
      { status: 200 },
    );
  }

  let body: { question?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  const client = createClaudeClient();
  try {
    const out = await client.complete({
      purpose: "nl2sql",
      system: SYSTEM_PROMPT,
      prompt: question,
      maxTokens: 700,
    });
    const sql = extractSql(out);
    if (!sql) {
      return Response.json(
        { error: "the model did not return a SQL query" },
        { status: 502 },
      );
    }
    return Response.json(
      { enabled: true, sql, model: client.model },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "translation failed" },
      { status: 500 },
    );
  }
}
