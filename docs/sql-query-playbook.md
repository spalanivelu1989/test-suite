# SQL Query Playground — Common Question Playbook

A library of the most common questions a user asks the Knowledge DB, each with a
hand-written, **ready-to-run** SQL query. Paste the SQL straight into the **SQL
Editor** panel and hit **Run Query** — no need to round-trip through the AI
translator for any of these.

## How to use this doc

- Copy the SQL into the editor, or wire these into the playground's "Quick
  Templates" so a click drops the SQL in directly (see
  [Wiring into the UI](#wiring-these-into-the-playground)).
- Wherever you see `'https://example.com'`, replace it with the app you care
  about. **`app_id` is the normalized origin**: scheme + host, lowercased, no
  `www.`, and **no trailing slash or path** (e.g. `https://tarento.com`).
- Every query runs **read-only** with guardrails:
  - Must be a single statement starting with `SELECT` or `WITH`.
  - Results are **capped at 500 rows** and time out after **5 seconds**.
  - Write/DDL/session keywords are blocked — including `SET`, `ANALYZE`, `DO`,
    `COPY`, `MERGE`. Avoid them even as column aliases.
  - Never `SELECT` the vector columns (`embedding`, `pattern_embedding`,
    `title_embedding`) — they're huge and unreadable.
- Timestamps are stored as UTC `TIMESTAMPTZ` and rendered in **IST** by the UI.

## Tables at a glance

| Table                | One row per                    | Use it to answer                               |
| -------------------- | ------------------------------ | ---------------------------------------------- |
| `apps`               | monitored app origin           | how many apps, how active, how stale           |
| `runs`               | test-suite execution           | run history, status, what URL was tested       |
| `specs`              | generated Playwright test file | how many tests, reused vs new                  |
| `plan_scenarios`     | planned scenario title         | what the planner proposed                      |
| `test_results`       | flow/file outcome in a run     | pass / heal / fail, failure reasons            |
| `coverage_snapshots` | run                            | coverage %, missing flows                      |
| `healing_events`     | self-heal repair               | what broke, what the AI fixed                  |
| `playbooks`          | distilled principle            | reusable rules, anti-patterns                  |
| `raw_reports`        | run (JSONB)                    | full report: plan, summary, success/flake rate |

---

## 1. Apps & activity

**Q: Which apps are monitored, and which are the most active?**

```sql
SELECT app_id, run_count, first_seen, last_seen
FROM apps
ORDER BY run_count DESC
```

**Q: Which apps have gone stale (not tested in the last 7 days)?**

```sql
SELECT app_id, last_seen, run_count
FROM apps
WHERE last_seen < now() - INTERVAL '7 days'
ORDER BY last_seen ASC
```

---

## 2. Runs & status

**Q: Show the 10 most recent test runs with their status.**

```sql
SELECT run_id, app_id, url, status, crawl_mode, created_at
FROM runs
ORDER BY created_at DESC
LIMIT 10
```

**Q: Show all runs for one app, newest first.**

```sql
SELECT run_id, url, status, created_at
FROM runs
WHERE app_id = 'https://example.com'
ORDER BY created_at DESC
```

**Q: How many runs are in each status?**

```sql
SELECT status, COUNT(*) AS runs
FROM runs
GROUP BY status
ORDER BY runs DESC
```

**Q: Which runs failed in the last 30 days?**

```sql
SELECT run_id, app_id, url, created_at
FROM runs
WHERE status = 'failed'
  AND created_at >= now() - INTERVAL '30 days'
ORDER BY created_at DESC
```

---

## 3. Test results (pass / heal / fail)

**Q: What was the pass / heal / fail breakdown for the most recent run?**

```sql
SELECT outcome, COUNT(*) AS total
FROM test_results
WHERE run_id = (SELECT run_id FROM runs ORDER BY created_at DESC LIMIT 1)
GROUP BY outcome
ORDER BY total DESC
```

**Q: List the tests that failed in the most recent run, with the reason.**

```sql
SELECT flow_id, file, failure_reason
FROM test_results
WHERE run_id = (SELECT run_id FROM runs ORDER BY created_at DESC LIMIT 1)
  AND outcome = 'failed'
ORDER BY flow_id
```

**Q: What is the overall pass rate per app?**

```sql
SELECT app_id,
       COUNT(*) FILTER (WHERE outcome = 'passed') AS passed,
       COUNT(*) AS total,
       ROUND(100.0 * COUNT(*) FILTER (WHERE outcome = 'passed')
             / NULLIF(COUNT(*), 0), 1) AS pass_pct
FROM test_results
GROUP BY app_id
ORDER BY pass_pct DESC
```

**Q: What are the most common failure reasons across everything?**

```sql
SELECT failure_reason, COUNT(*) AS occurrences
FROM test_results
WHERE outcome = 'failed' AND failure_reason IS NOT NULL
GROUP BY failure_reason
ORDER BY occurrences DESC
LIMIT 20
```

**Q: Which flows fail most often (flaky / fragile flows)?**

```sql
SELECT app_id, flow_id,
       COUNT(*) FILTER (WHERE outcome = 'failed') AS failures,
       COUNT(*) AS times_run
FROM test_results
GROUP BY app_id, flow_id
HAVING COUNT(*) FILTER (WHERE outcome = 'failed') > 0
ORDER BY failures DESC
LIMIT 20
```

---

## 4. Specs (generated test files)

**Q: Which apps have the most saved tests?**

```sql
SELECT app_id, COUNT(*) AS spec_count
FROM specs
GROUP BY app_id
ORDER BY spec_count DESC
```

**Q: How many specs were reused vs newly generated per app?**

```sql
SELECT app_id,
       COUNT(*) FILTER (WHERE reused) AS reused,
       COUNT(*) FILTER (WHERE NOT reused) AS newly_generated,
       COUNT(*) AS total
FROM specs
GROUP BY app_id
ORDER BY total DESC
```

**Q: List the original, reusable specs for one app (not copies).**

```sql
SELECT id, file, title, flow_id, created_at
FROM specs
WHERE app_id = 'https://example.com'
  AND reused = false
ORDER BY created_at DESC
```

**Q: What specs were produced in the most recent run?**

```sql
SELECT file, title, flow_id, reused
FROM specs
WHERE run_id = (SELECT run_id FROM runs ORDER BY created_at DESC LIMIT 1)
ORDER BY file
```

---

## 5. Coverage

**Q: What is the latest coverage % for each app?**

```sql
SELECT DISTINCT ON (app_id)
       app_id, percent, tested_count, curated_total, created_at
FROM coverage_snapshots
ORDER BY app_id, created_at DESC
```

**Q: Which runs landed below 80% coverage?**

```sql
SELECT run_id, app_id, percent, tested_count, curated_total, created_at
FROM coverage_snapshots
WHERE percent < 80
ORDER BY percent ASC
```

**Q: Which flows are still untested in the latest run for an app?**

```sql
SELECT unnest(missing_flows) AS missing_flow
FROM coverage_snapshots
WHERE run_id = (
  SELECT run_id FROM coverage_snapshots
  WHERE app_id = 'https://example.com'
  ORDER BY created_at DESC LIMIT 1
)
```

**Q: How has coverage trended over time for one app?**

```sql
SELECT created_at, percent, tested_count, curated_total
FROM coverage_snapshots
WHERE app_id = 'https://example.com'
ORDER BY created_at ASC
```

---

## 6. Self-healing

**Q: Show the 20 most recent self-healing repairs.**

```sql
SELECT created_at, app_id, flow_id, file, strategy, outcome
FROM healing_events
ORDER BY created_at DESC
LIMIT 20
```

**Q: How often does healing succeed vs get punted to fixme?**

```sql
SELECT outcome, COUNT(*) AS total
FROM healing_events
GROUP BY outcome
ORDER BY total DESC
```

**Q: What failure signatures trigger healing most often?**

```sql
SELECT failure_signature, COUNT(*) AS occurrences
FROM healing_events
GROUP BY failure_signature
ORDER BY occurrences DESC
LIMIT 20
```

**Q: Show the before/after selector fixes for one app.**

```sql
SELECT flow_id, file, strategy, outcome, before_snippet, after_snippet
FROM healing_events
WHERE app_id = 'https://example.com'
ORDER BY created_at DESC
```

---

## 7. Playbooks (distilled rules)

**Q: What are the trusted, high-confidence playbook rules?**

```sql
SELECT id, scope_kind, scope_key, principle, recommendation,
       confidence, support_count
FROM playbooks
WHERE status = 'trusted'
ORDER BY confidence DESC, support_count DESC
```

**Q: What playbook rules apply to a specific app?**

```sql
SELECT principle, antipattern, recommendation, confidence, status
FROM playbooks
WHERE scope_kind = 'app' AND scope_key = 'https://example.com'
ORDER BY confidence DESC
```

**Q: What global anti-patterns should we avoid?**

```sql
SELECT principle, antipattern, recommendation, support_count, confidence
FROM playbooks
WHERE scope_kind = 'global' AND antipattern IS NOT NULL
ORDER BY support_count DESC
```

---

## 8. Plans & report JSON (`raw_reports`)

**Q: Get the latest test plan (markdown) for a URL.**

```sql
SELECT report->>'planMarkdown' AS plan_markdown
FROM raw_reports
WHERE app_id = 'https://example.com'
ORDER BY created_at DESC
LIMIT 1
```

**Q: What is the human-readable test summary from the latest run?**

```sql
SELECT report->>'testSummary' AS test_summary
FROM raw_reports
ORDER BY created_at DESC
LIMIT 1
```

**Q: Show success rate, flake rate, and heal success rate per recent run.**

```sql
SELECT run_id,
       (report->>'successRate')::numeric      AS success_rate,
       (report->>'flakeRate')::numeric        AS flake_rate,
       (report->>'healSuccessRate')::numeric  AS heal_success_rate,
       created_at
FROM raw_reports
ORDER BY created_at DESC
LIMIT 20
```

**Q: Pull coverage percent straight from the stored report JSON.**

```sql
SELECT run_id, app_id,
       (report->'coverage'->>'percent')::numeric AS coverage_percent,
       created_at
FROM raw_reports
ORDER BY created_at DESC
LIMIT 20
```

---

## 9. Dashboard / cross-table

**Q: Give me a full health snapshot of an app's latest run (status + coverage + outcomes).**

```sql
SELECT r.run_id, r.url, r.status, r.created_at,
       cs.percent AS coverage_percent,
       COUNT(tr.id) FILTER (WHERE tr.outcome = 'passed') AS passed,
       COUNT(tr.id) FILTER (WHERE tr.outcome = 'failed') AS failed,
       COUNT(tr.id) FILTER (WHERE tr.outcome = 'healed') AS healed
FROM runs r
LEFT JOIN coverage_snapshots cs ON cs.run_id = r.run_id
LEFT JOIN test_results tr       ON tr.run_id = r.run_id
WHERE r.app_id = 'https://example.com'
GROUP BY r.run_id, r.url, r.status, r.created_at, cs.percent
ORDER BY r.created_at DESC
LIMIT 1
```

**Q: Rank apps by the pass rate of their most recent run.**

```sql
WITH latest AS (
  SELECT DISTINCT ON (app_id) app_id, run_id
  FROM runs
  ORDER BY app_id, created_at DESC
)
SELECT l.app_id,
       COUNT(tr.id) FILTER (WHERE tr.outcome = 'passed') AS passed,
       COUNT(tr.id) AS total,
       ROUND(100.0 * COUNT(tr.id) FILTER (WHERE tr.outcome = 'passed')
             / NULLIF(COUNT(tr.id), 0), 1) AS pass_pct
FROM latest l
LEFT JOIN test_results tr ON tr.run_id = l.run_id
GROUP BY l.app_id
ORDER BY pass_pct DESC NULLS LAST
```

---

## Wiring these into the playground

Today the "Quick Templates" in `app/sql-query/SqlQuery.tsx` store a plain-English
string and call `translate()` (the AI) on click. To make the common cases skip
the AI entirely, give each template an optional pre-written `sql` and, when
present, drop it straight into the editor instead of translating:

```ts
const CATEGORIZED_EXAMPLES = {
  "Runs & Status": [
    {
      label: "Show the 10 most recent test runs with their status",
      sql: "SELECT run_id, app_id, url, status, crawl_mode, created_at\nFROM runs\nORDER BY created_at DESC\nLIMIT 10",
    },
    // ...
  ],
};

function useExample(ex: { label: string; sql?: string }) {
  setQuestion(ex.label);
  setResult(null);
  setError(null);
  setExecTime(null);
  if (ex.sql)
    setSql(ex.sql); // canned: skip the AI
  else translate(ex.label); // fall back to AI for free-form questions
}
```

That keeps the AI translator for novel questions while serving every common
scenario above instantly and deterministically. Say the word and I'll implement it.

```

```
