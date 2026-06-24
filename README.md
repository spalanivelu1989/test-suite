# AI UI Testing Tool

This is an AI-powered tool that tests websites for you, on its own.

You give it a URL. It opens the site in a real browser, clicks around to understand what the app does, figures out the important user journeys, writes real Playwright tests for them, runs those tests, and — when a test breaks — tries to fix it by itself. At the end you get a clear report showing what passed, what failed, and what could be made more reliable.

The whole thing is driven by a small team of Claude (Sonnet) AI agents working one after another, the same way a human QA team would: one plans, one writes the tests, one runs and repairs them, and one writes up the results.

![AI Test Suite Workflow](docs/ai-test-suite-workflow.png)

## Why this is useful

Writing and maintaining UI tests by hand is slow and tedious. Tests also break constantly — a button gets renamed, a layout shifts, and suddenly your suite is red even though nothing is actually broken. This tool takes that work off your plate:

- **No test writing.** It discovers the flows and writes the Playwright code itself.
- **Self-healing.** When a test fails because the UI changed, it attempts a repair instead of just reporting red.
- **It gets smarter over time.** Every run is remembered. The next time you test the same app, it reuses what it already knows instead of starting from scratch.
- **You stay in the loop.** You watch every step happen live in the browser-based console, with screenshots of each stage.

## How it works

Under the hood, four AI agents run in sequence, each handing off to the next:

1. **Discoverer** — crawls the site, looks at the pages, logs in if there's a login wall, and decides which user flows are worth testing. If it has tested this app before, it remembers prior coverage and only plans what's new.
2. **Designer** — turns that plan into actual Playwright test files.
3. **Tester** — runs the tests. If something fails, it tries to repair it and re-runs. Anything it genuinely can't fix gets quarantined rather than silently dropped.
4. **Reporter** — writes up the results in plain language: success rate, what worked, what needs attention.

A non-AI quality gate (the **Validator**) sits between the Designer and the Tester to catch broken test code before it ever runs. The agents drive a real headless browser through Microsoft's `@playwright/cli`, and the whole pipeline is orchestrated by the Claude Agent SDK.

## The memory (Knowledge Platform)

What makes this more than a one-shot test generator is its long-term memory, backed by PostgreSQL.

- **It remembers past runs**, so the Discoverer doesn't re-plan flows it has already covered.
- **It matches tests semantically** using local embeddings + pgvector, so it can tell "this new flow is basically the same as one I tested last week" and reuse it.
- **It learns from repairs.** When the Tester fixes something, that fix is distilled into a reusable "playbook" and fed back to the agents on future runs — so the system gets better at healing the more it's used.

The memory is optional. If you don't set up a database, the tool still works fine — it just won't carry knowledge between runs.

## Prerequisites

- Node.js (v18+)
- An Anthropic API key (`ANTHROPIC_API_KEY`)
- _(Optional)_ A PostgreSQL database with the `pgvector` extension, if you want the long-term memory features.

## Setup & Installation

### 1. Install Dependencies

Install all package dependencies via npm:

```bash
npm install
```

### 2. Initialize Playwright CLI & Skills

The agent pipeline uses Microsoft's token-efficient `@playwright/cli` to drive browser actions. You **must** initialize the workspace and install the agent skills:

```bash
npx playwright-cli install --skills
```

This initializes the workspace and outputs the skill definitions to `.claude/skills/playwright-cli/SKILL.md` so the AI subagents can discover and correctly execute browser commands without errors.

### 3. Environment Variables

Create a `.env.local` file at the root of the project and set your Anthropic API Key:

```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

If you want the long-term memory features, also point it at your database:

```env
KNOWLEDGE_DATABASE_URL=postgres://user:password@host:5432/dbname
```

Leave this out and the tool runs without memory — everything else still works.

## Running the Application

### Run the Web UI locally

Start the Next.js development server:

```bash
npm run dev
```

Then open `http://localhost:3000`, paste in the URL of the app you want to test, and watch it work.

### Run from the command line (CI)

For headless / continuous-integration use, the CI entry point runs a full test cycle and writes JSON, Markdown, and HTML reports. It exits with a non-zero code if the run fails, so it plugs straight into a pipeline:

```bash
npm run ci
```

### Run the unit tests

```bash
npm run test:unit
```

### Build for production

```bash
npm run build
```

## A quick tour of the project

| Folder   | What's in it                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`   | The Next.js front-end — the console UI, the launch wizard, report views, and the backend API routes that start and stream runs.                     |
| `src/`   | The engine: the agent orchestrator, the crawler, the Discoverer/Designer/Tester/Reporter logic, the knowledge/memory layer, and observability.      |
| `bin/`   | Command-line scripts — the CI runner, report rendering, and database/knowledge maintenance tools.                                                   |
| `specs/` | The design history. Each major feature was built with the C.R.A.F.T. method, so you'll find the Brief, Spec, Plan, and Review for every phase here. |
| `docs/`  | Architecture overviews, diagrams, the tech-stack reference, and how-it-works guides.                                                                |

## Want more detail?

- **`docs/tech-stack.md`** — the full technology breakdown and why each piece is there.
- **`architecture.md`** — how the system fits together.
- **`docs/`** — diagrams, the knowledge-database schema, and worked examples of how test matching actually works.
