# Tech Stack

> What Test Suite is built with, and what each piece is used for.
> Source of truth: `package.json`, plus the implementation files cited inline.
> Last updated: 2026-06-08.

## At a glance

| Layer                  | Stack                                                                           |
| ---------------------- | ------------------------------------------------------------------------------- |
| **Frontend**           | Next.js · React · Chakra UI                                                     |
| **Backend**            | Next.js API routes (Node.js runtime) · Server-Sent Events                       |
| **AI**                 | Claude (Sonnet) via Agent SDK · Hugging Face transformers.js (local embeddings) |
| **Browser automation** | Playwright                                                                      |
| **Data / memory**      | PostgreSQL + pgvector                                                           |
| **Language**           | TypeScript                                                                      |

---

## Frontend

| Technology                         | Version | Used for                                                                                                    |
| ---------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| **Next.js**                        | 15.1    | Full-stack React framework — routing, server, build pipeline. Hosts both the UI and the backend API routes. |
| **React**                          | 19.0    | UI component library — the dashboard, launch wizard, drawers, report views.                                 |
| **Chakra UI** (`@chakra-ui/react`) | 3.2     | Component library — tables, drawers, badges, layout primitives.                                             |
| **Emotion** (`@emotion/react`)     | 11.13   | CSS-in-JS styling engine that powers Chakra.                                                                |
| **Framer Motion**                  | 11.13   | Animations and transitions.                                                                                 |
| **Lucide React**                   | 0.468   | Icon set.                                                                                                   |
| **Three.js** (`three`)             | 0.184   | 3D graphics / visual elements.                                                                              |

## Backend

There is **no separate backend server**. Next.js is full-stack, so the backend is a set of
**API route handlers running in the Node.js runtime**, in the same process as the frontend.
No Express/Fastify/Nest, no separate worker, no job queue.

| Technology                                  | Used for                                                                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js API routes** (`app/api/runs/...`) | Start, stop, list, and stream runs; serve reports. Runs in the `nodejs` runtime, not edge.                                                                             |
| **Server-Sent Events (SSE)**                | Live progress updates to the UI during a run (`/api/runs/[id]/stream`). The browser also polls `/api/runs` to refresh the runs table.                                  |
| **Fire-and-forget background execution**    | `POST /api/runs` validates config, returns a `runId` immediately (202), and kicks off the agent pipeline in the background so the request doesn't block on a long run. |
| **In-memory store + disk persistence**      | Run state lives in memory with best-effort async writes to `.runs/<runId>/`, so runs survive a server restart.                                                         |

**API endpoints**

| Endpoint                | Method | Purpose                                                     |
| ----------------------- | ------ | ----------------------------------------------------------- |
| `/api/runs`             | GET    | List all runs (in-memory + disk, merged).                   |
| `/api/runs`             | POST   | Validate config and start a new run (returns `runId`, 202). |
| `/api/runs/[id]`        | GET    | Fetch one complete run including its events.                |
| `/api/runs/[id]`        | DELETE | Terminate the run, remove from memory, purge disk files.    |
| `/api/runs/[id]/stream` | GET    | SSE stream of live progress events.                         |
| `/api/runs/[id]/cancel` | POST   | Stop an in-flight run (abort controller).                   |
| `/api/runs/[id]/report` | GET    | Serve the finished report as JSON / Markdown / HTML.        |

> **Scaling note:** runs execute inside the Next.js server process (single-process
> architecture). This is simple and ideal for a single-user tool or demo. Scaling to many
> concurrent runs/users would mean moving the pipeline into a dedicated worker or queue —
> reasonable future work, not a flaw for what this is today.

## AI agents & embeddings

| Technology                                                     | Version | Used for                                                                                                                                                               |
| -------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`)        | 0.3     | Orchestrates and runs the Planner / Generator / Healer / Reporter agents. Each agent runs via the SDK's `query()`, which spawns a subprocess to execute agent actions. |
| **Anthropic SDK** (`@anthropic-ai/sdk`)                        | 0.99    | Direct Claude API access. Model used: **Sonnet**. Wrapped in `src/claude/client.ts` for logging/observability.                                                         |
| **Hugging Face transformers.js** (`@huggingface/transformers`) | 4.2     | Generates the semantic embeddings used for test reuse — **locally, in-process**. No API call, no cost, and the text never leaves the environment.                      |

**Embedding model — exact details** (`src/knowledge/embeddings/embed.ts`)

| Property                | Value                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Model                   | **`Xenova/bge-small-en-v1.5`** (BGE-small, English, v1.5)                                 |
| Dimensions              | **384**                                                                                   |
| Runtime                 | Local, in-process via transformers.js `feature-extraction` pipeline                       |
| Pooling / normalization | Mean pooling + L2 normalization                                                           |
| Stored in DB as         | `embedding_model = "local:Xenova/bge-small-en-v1.5"`                                      |
| Search index            | pgvector **HNSW**, cosine similarity                                                      |
| Symmetry                | Specs and scenarios are embedded the same way (short titles — no asymmetric query prefix) |

## Browser automation

| Technology                               | Version | Used for                                                                                                                             |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Playwright**                           | 1.60    | Drives a real (headless) browser. The generated tests are Playwright specs; agents use Playwright to crawl and test the target site. |
| **Playwright Test** (`@playwright/test`) | 1.60    | Test runner for executing the generated suite.                                                                                       |
| **Playwright CLI** (`@playwright/cli`)   | 0.1     | CLI tooling the agents drive the browser through.                                                                                    |

## Database / long-term memory

| Technology                       | Version            | Used for                                                                                                                                                                                                 |
| -------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PostgreSQL** (via `pg` driver) | 8.21               | The Knowledge Platform — long-term, cross-run memory: runs, specs, results, healing events, playbooks. Optional: disabled gracefully if `KNOWLEDGE_DATABASE_URL` is not set.                             |
| **pgvector**                     | Postgres extension | Vector similarity search for semantic test matching. **Not an npm package** — it's a PostgreSQL extension installed in the database and used via SQL (`0002_pgvector.sql`). The `pg` driver talks to it. |

## Language & tooling

| Technology              | Version  | Used for                                                                          |
| ----------------------- | -------- | --------------------------------------------------------------------------------- |
| **TypeScript**          | 5.9      | Language across the entire codebase (frontend, backend, agents, knowledge layer). |
| **tsx**                 | 4.19     | Runs TypeScript directly for scripts and tests.                                   |
| **Node.js test runner** | built-in | Unit tests (`test:unit`) and DB integration tests (`test:db`).                    |

---

## Architecture summary

- **Frontend** — React 19 + Next.js serves the dashboard, launch wizard, runs list, and
  report viewer. It has no direct access to agents, Playwright, or the database — everything
  is an API call.
- **Backend** — Next.js API routes (Node.js runtime) trigger the agent orchestrator. Four
  AI agents run in sequence — **Planner → Generator → Healer → Reporter** — with a
  deterministic, non-AI **Validator** quality gate between the Generator and the Healer. The
  orchestrator is driven per-run from the route handler and emits progress into an in-memory
  store.
- **AI** — agents run via the Claude Agent SDK (Sonnet); embeddings are generated locally
  with BGE-small via transformers.js.
- **Automation** — Playwright drives the real browser server-side.
- **Data** — per-run workspaces under `.runs/<runId>/`; an optional PostgreSQL + pgvector
  knowledge layer ingests completed runs to inform future ones.
- **Live updates** — the UI opens an SSE stream for real-time run progress and polls the
  runs endpoint to refresh the list.
