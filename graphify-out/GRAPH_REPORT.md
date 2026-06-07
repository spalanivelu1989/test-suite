# Graph Report - .  (2026-06-07)

## Corpus Check
- 157 files · ~147,399 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 749 nodes · 1479 edges · 52 communities (48 shown, 4 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 56 edges (avg confidence: 0.84)
- Token cost: 0 input · 386,286 output

## Community Hubs (Navigation)
- [[_COMMUNITY_CLI & HTML Report Rendering|CLI & HTML Report Rendering]]
- [[_COMMUNITY_Four-Agent Testing Pipeline|Four-Agent Testing Pipeline]]
- [[_COMMUNITY_Run Request Validation & Manager|Run Request Validation & Manager]]
- [[_COMMUNITY_Project Dependencies|Project Dependencies]]
- [[_COMMUNITY_Knowledge Service CLI & Tests|Knowledge Service CLI & Tests]]
- [[_COMMUNITY_Generator Context Packs|Generator Context Packs]]
- [[_COMMUNITY_Coverage Calibration & Embedding|Coverage Calibration & Embedding]]
- [[_COMMUNITY_Crawl Gate & CLI Parsing|Crawl Gate & CLI Parsing]]
- [[_COMMUNITY_Workspace & Stage Orchestration|Workspace & Stage Orchestration]]
- [[_COMMUNITY_Console UI Layout|Console UI Layout]]
- [[_COMMUNITY_Run Ingestion & Extraction|Run Ingestion & Extraction]]
- [[_COMMUNITY_Theme Providers & UI Forms|Theme Providers & UI Forms]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Flake Detection & Result Parsing|Flake Detection & Result Parsing]]
- [[_COMMUNITY_PgKnowledgeService|PgKnowledgeService]]
- [[_COMMUNITY_Generator Knowledge & Validation|Generator Knowledge & Validation]]
- [[_COMMUNITY_Test Report View Icons|Test Report View Icons]]
- [[_COMMUNITY_Claude Client & Run Service|Claude Client & Run Service]]
- [[_COMMUNITY_Run Details Pane UI|Run Details Pane UI]]
- [[_COMMUNITY_Knowledge Platform Architecture (P1)|Knowledge Platform Architecture (P1)]]
- [[_COMMUNITY_Agent Runtime|Agent Runtime]]
- [[_COMMUNITY_Embedder Implementations|Embedder Implementations]]
- [[_COMMUNITY_Hybrid Matching & Reuse Decisions|Hybrid Matching & Reuse Decisions]]
- [[_COMMUNITY_App Identity & Disabled KB|App Identity & Disabled KB]]
- [[_COMMUNITY_Run Manager & Lifecycle Design|Run Manager & Lifecycle Design]]
- [[_COMMUNITY_AI UI Testing Spec Artifacts|AI UI Testing Spec Artifacts]]
- [[_COMMUNITY_Test Runs Table UI|Test Runs Table UI]]
- [[_COMMUNITY_Additive Matching & Coverage|Additive Matching & Coverage]]
- [[_COMMUNITY_Knowledge Platform Phase 2 Artifacts|Knowledge Platform Phase 2 Artifacts]]
- [[_COMMUNITY_Orchestrator Dependencies|Orchestrator Dependencies]]
- [[_COMMUNITY_Knowledge Store Internals|Knowledge Store Internals]]
- [[_COMMUNITY_CLI Guard|CLI Guard]]
- [[_COMMUNITY_Playwright Agent Patterns|Playwright Agent Patterns]]
- [[_COMMUNITY_pgvector Integration (P2)|pgvector Integration (P2)]]
- [[_COMMUNITY_Local Embedder (bge-small)|Local Embedder (bge-small)]]
- [[_COMMUNITY_Root Layout & Fonts|Root Layout & Fonts]]
- [[_COMMUNITY_Narrative Generation|Narrative Generation]]
- [[_COMMUNITY_Deepening Candidates|Deepening Candidates]]
- [[_COMMUNITY_pgvector Migration & Postgres|pgvector Migration & Postgres]]
- [[_COMMUNITY_Planner Memory & Seams|Planner Memory & Seams]]
- [[_COMMUNITY_Tarento Shield Logo|Tarento Shield Logo]]
- [[_COMMUNITY_CDP Navigation Listener|CDP Navigation Listener]]
- [[_COMMUNITY_Paraphrase Fixtures|Paraphrase Fixtures]]
- [[_COMMUNITY_Tarento Flows Fixture|Tarento Flows Fixture]]
- [[_COMMUNITY_Tarento Brand Identity|Tarento Brand Identity]]
- [[_COMMUNITY_Settings Permissions|Settings Permissions]]
- [[_COMMUNITY_App Identity Normalization|App Identity Normalization]]
- [[_COMMUNITY_Community 48|Community 48]]

## God Nodes (most connected - your core abstractions)
1. `RunReport` - 26 edges
2. `useThemeMode()` - 20 edges
3. `Run` - 17 edges
4. `compilerOptions` - 17 edges
5. `runPipeline()` - 16 edges
6. `PgKnowledgeService` - 15 edges
7. `generateTests()` - 15 edges
8. `getRunManager()` - 14 edges
9. `TestResult` - 14 edges
10. `getAWSColors()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `useTheme Hook` --semantically_similar_to--> `Run`  [AMBIGUOUS] [semantically similar]
  DESIGN_SYSTEM.md → CONTEXT.md
- `Spec-Driven Testing Reference (plan → generate → heal)` --semantically_similar_to--> `Four-Agent Pipeline (Planner → Generator → Healer → Reporter)`  [INFERRED] [semantically similar]
  .claude/skills/playwright-cli/references/spec-driven-testing.md → CONTEXT.md
- `Candidate A — Run Workspace Owner` --semantically_similar_to--> `Workspace (createWorkspace / .runs)`  [INFERRED] [semantically similar]
  specs/ai-ui-testing-tool/architecture-review.md → docs/improvements.md
- `AI UI Testing Tool README` --conceptually_related_to--> `Four-Agent Pipeline (Planner → Generator → Healer → Reporter)`  [INFERRED]
  README.md → CONTEXT.md
- `Additive Signal with Baseline-Equivalence Diff Test` --rationale_for--> `pgvector Semantic Reuse (Phase 2)`  [INFERRED]
  LEARNINGS.md → STATE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Four-Agent Testing Pipeline** — agents_playwright_test_planner, agents_playwright_test_generator, agents_playwright_test_healer, workflow_reporter_stage, workflow_orchestrator [EXTRACTED 1.00]
- **Spec-Driven plan → generate → heal Workflow** — references_spec_driven_testing, agents_playwright_test_planner, agents_playwright_test_generator, agents_playwright_test_healer [INFERRED 0.85]
- **CRAFT Framework Memory Files** — constitution_constitution, context_context, state_state, learnings_learnings, implementation_notes_implementation_notes [INFERRED 0.85]
- **Knowledge Layer hybrid index (structured + semantic + graph over Postgres)** — docs_knowledge_platform_architecture_knowledge_layer, docs_knowledge_platform_architecture_hybrid_retrieval_index, docs_knowledge_platform_architecture_postgresql_store, docs_knowledge_platform_architecture_event_sourced_artifacts [EXTRACTED 1.00]
- **Phase 2 semantic reuse stack (embedder, hybrid decision, pgvector HNSW)** — docs_pgvector_integration_plan_local_embedder, docs_pgvector_integration_plan_combine_decision, docs_pgvector_hnsw_index, docs_pgvector_integration_plan_find_similar_specs [EXTRACTED 0.85]
- **CRAFT artifact chain for AI UI Testing Tool (brief to tasks to review)** — ai_ui_testing_tool_brief_brief, ai_ui_testing_tool_spec_spec, ai_ui_testing_tool_plan_plan, ai_ui_testing_tool_tasks_tasks, ai_ui_testing_tool_review_report_review_report [EXTRACTED 1.00]
- **Three pipeline seams (ingest, planner pack, generator decision)** — knowledge_platform_plan_ingestrun, knowledge_platform_plan_contextpack, knowledge_platform_plan_coveragedecision, knowledge_platform_plan_stages [EXTRACTED 0.85]
- **Semantic test reuse pipeline (embed, store, hybrid-decide)** — knowledge_platform_phase_2_localembedder, knowledge_platform_phase_2_pgvector, knowledge_platform_phase_2_hybrid_decideforspecs [EXTRACTED 0.85]
- **CRAFT Phase 2 artifact chain (brief, spec, plan, tasks, review)** — knowledge_platform_phase_2_brief, knowledge_platform_phase_2_spec, knowledge_platform_phase_2_plan, knowledge_platform_phase_2_tasks, knowledge_platform_phase_2_review_report [EXTRACTED 0.85]

## Communities (52 total, 4 thin omitted)

### Community 0 - "CLI & HTML Report Rendering"
Cohesion: 0.08
Nodes (42): main(), CliArgs, main(), parseArgs(), GET(), esc(), OUTCOME_LABEL, pct() (+34 more)

### Community 1 - "Four-Agent Testing Pipeline"
Cohesion: 0.06
Nodes (53): Playwright Test Generator Agent, Playwright Test Healer Agent, Playwright Test Planner Agent, Constitution — AI UI Testing Tool, Determinism Over Flakiness, Keep It Simple, Nothing Ships Unverified, The Spec is the Contract (+45 more)

### Community 2 - "Run Request Validation & Manager"
Cohesion: 0.08
Nodes (27): ParseResult, parseRunRequest(), VALID_CRAWL_MODES, POST(), DELETE(), GET(), createRunManager(), getRunManager() (+19 more)

### Community 3 - "Project Dependencies"
Cohesion: 0.05
Nodes (40): dependencies, @anthropic-ai/claude-agent-sdk, @anthropic-ai/sdk, @chakra-ui/react, @emotion/react, framer-motion, @huggingface/transformers, lucide-react (+32 more)

### Community 4 - "Knowledge Service CLI & Tests"
Cohesion: 0.14
Nodes (17): main(), main(), createKnowledgeService(), resolveEmbedder(), opts, svc(), k1AppId(), opts (+9 more)

### Community 5 - "Generator Context Packs"
Cohesion: 0.17
Nodes (16): buildGeneratorPack(), AppProfile, ContextPack, CoverageDecision, CoverageMap, FlowCoverage, GeneratorPack, KnowledgeConfig (+8 more)

### Community 6 - "Coverage Calibration & Embedding"
Cohesion: 0.13
Nodes (14): Labeled, main(), Positive, cosineSim(), FakeEmbedder, l2normalize(), CoverageAction, decideForSpecs() (+6 more)

### Community 7 - "Crawl Gate & CLI Parsing"
Cohesion: 0.12
Nodes (19): captureScreenshot(), CrawlGate, CrawlGateConfig, createCrawlGate(), hideHighlight(), highlightElement(), INTERACTIVE_VERBS, KEY_NAMES (+11 more)

### Community 8 - "Workspace & Stage Orchestration"
Cohesion: 0.19
Nodes (18): createCliGuard(), mergeHooks(), createWorkspace(), readGeneratedSpecs(), readPlan(), buildPlannerConstraints(), GenerateResult, generateTests() (+10 more)

### Community 9 - "Console UI Layout"
Cohesion: 0.25
Nodes (15): HomePage(), useThemeMode(), ConsoleLayout(), ConsoleLayoutProps, LaunchWizard(), LaunchWizardProps, MotionBox, TestReportView() (+7 more)

### Community 10 - "Run Ingestion & Extraction"
Cohesion: 0.16
Nodes (12): ExtractedRun, extractRun(), embedSpecs(), ingestRun(), RunReport, embeddingForHash(), findNearestSpecs(), FlowRow (+4 more)

### Community 11 - "Theme Providers & UI Forms"
Cohesion: 0.17
Nodes (17): customConfig, Theme, ThemeContext, ThemeContextType, ThemeToggle(), MotionBox, RunForm(), ThreeProgressBar() (+9 more)

### Community 12 - "TypeScript Config"
Cohesion: 0.10
Nodes (20): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+12 more)

### Community 13 - "Flake Detection & Result Parsing"
Cohesion: 0.17
Nodes (14): detectFlakes(), runPipeline(), assessSuiteFlakiness(), captureResults(), flattenSpecs(), parsePlaywrightResults(), PlaywrightJsonReport, PwAnnotation (+6 more)

### Community 14 - "PgKnowledgeService"
Cohesion: 0.16
Nodes (7): newDecisions(), PgKnowledgeService, withKb(), WithKbOptions, withTimeout(), ScenarioInput, SpecMatch

### Community 15 - "Generator Knowledge & Validation"
Cohesion: 0.16
Nodes (17): applyGeneratorKnowledge(), SpecValidation, ValidationFinding, clampScore(), countTestCases(), extractTitle(), formatValidationForHealer(), KNOWN_MATCHERS (+9 more)

### Community 16 - "Test Report View Icons"
Cohesion: 0.11
Nodes (4): MotionBox, OUTCOME_EMOJI, OUTCOME_LABEL, ParsedScreenshot

### Community 17 - "Claude Client & Run Service"
Cohesion: 0.18
Nodes (11): RunAgentResult, AnthropicLike, ClaudeCallLog, ClaudeClientOptions, ClaudeCompleteArgs, createClaudeClient(), MissingApiKeyError, narrativeClient() (+3 more)

### Community 18 - "Run Details Pane UI"
Cohesion: 0.14
Nodes (11): RobotFace(), RobotFaceProps, AWSCodeViewer(), AWSCodeViewerProps, FLOW_MOCK_DETAILS, highlightTypeScript(), OUTCOME_COLOR, PIPELINE_STAGES (+3 more)

### Community 19 - "Knowledge Platform Architecture (P1)"
Cohesion: 0.21
Nodes (14): ADR-0001 PostgreSQL Knowledge Store, Knowledge-Driven Testing Platform Architecture, Event-Sourced Artifacts as Source of Truth, Execution Layer, Hybrid Retrieval Index, ingestRun Ingestion Workflow, KnowledgeService Interface, Long vs Short-Term Agent Memory (+6 more)

### Community 20 - "Agent Runtime"
Cohesion: 0.23
Nodes (7): AgentDef, AgentEvent, loadAgent(), parseAgentFile(), runAgent(), RunAgentOptions, fakeAgent

### Community 21 - "Embedder Implementations"
Cohesion: 0.18
Nodes (4): Embedder, LocalEmbedder, CountingEmbedder, KnowledgeEvent

### Community 22 - "Hybrid Matching & Reuse Decisions"
Cohesion: 0.21
Nodes (12): ADR-0002 Local Embedder (bge-small), Additive-Only Guarantee, ADR-0003 Hybrid Additive Matching, Coverage-Aware Generation, Threshold Calibration (SEM_REUSE), Embedding Cache (by content_hash), Generator Reuse Decision (reuse | new), Overlap Coefficient (Lexical Match) (+4 more)

### Community 24 - "Run Manager & Lifecycle Design"
Cohesion: 0.27
Nodes (11): Architecture Review (Deepening Opportunities), Candidate C — Reporter Composition, Candidate B — Run Lifecycle Owner, Candidate D — Stage Seam, Execution Data Model, Run Record, RunConfig & Crawl Modes, RunReport (+3 more)

### Community 25 - "AI UI Testing Spec Artifacts"
Cohesion: 0.20
Nodes (10): Brief — AI UI Testing Tool, Plan (Design) — AI UI Testing Tool, Review Report — AI UI Testing Tool, Spec — AI UI Testing Tool (v0.3.0), Deterministic Validator (R18), Tasks — AI UI Testing Tool, Knowledge Layer, AI UI Testing Tool Presentation Outline (+2 more)

### Community 26 - "Test Runs Table UI"
Cohesion: 0.24
Nodes (7): TestReportViewProps, MotionBox, TerminateRunDialog(), TerminateRunDialogProps, TestRunsTableProps, Run, getStatusStyle()

### Community 27 - "Additive Matching & Coverage"
Cohesion: 0.24
Nodes (10): Additive-only safety (never worse than Phase 1), ADR-0003 Hybrid additive matching, Hybrid decideForSpecs (lexical OR semantic), Labeled paraphrase set (fixtures/paraphrase-set.json), 2-way coverage decision (reuse|new), coverage.ts (norm/significantTokens), planCoverageDecision (reuse|extend|new), Overlap-coefficient lexical match (+2 more)

### Community 28 - "Knowledge Platform Phase 2 Artifacts"
Cohesion: 0.22
Nodes (10): Knowledge Platform Phase 2 Brief, Knowledge Platform Phase 2 Plan, Knowledge Platform Phase 2 Review Report, Knowledge Platform Phase 2 Spec, Knowledge Platform Phase 2 Tasks, ADR-0001 Postgres knowledge store, Knowledge Layer (Phase 1), withKb best-effort wrapper (+2 more)

### Community 29 - "Orchestrator Dependencies"
Cohesion: 0.36
Nodes (7): Workspace, ClaudeClient, KnowledgeService, CancelledError, OrchestratorDeps, StageError, StageDeps

### Community 30 - "Knowledge Store Internals"
Cohesion: 0.25
Nodes (9): getAppProfile / getCoverageMap, store/db.ts (pg.Pool), Event-sourced rebuildable index, ingestRun, KnowledgeService, orchestrate.ts, store/repo.ts, RunReport (+1 more)

### Community 31 - "CLI Guard"
Cohesion: 0.32
Nodes (4): CliGuard, CliGuardConfig, DEFAULT_FORBIDDEN_PREFIXES, isForbiddenTool()

### Community 32 - "Playwright Agent Patterns"
Cohesion: 0.29
Nodes (8): Claude Agent SDK, Playwright Agents Pattern, Playwright CLI, Agent Pipeline (Planner-Generator-Validator-Healer-Reporter), Screencast Overlay API, Playwright Tracing, Playwright CLI Video Recording, Playwright Test Plan (Personal Website)

### Community 33 - "pgvector Integration (P2)"
Cohesion: 0.32
Nodes (8): Cosine Distance Operator, HNSW Index, Embedding Backfill Job, Embedder Interface, findSimilarSpecs API, pgvector Integration Plan (Phase 2), Local In-Process Embedder, pgvector Explainer

### Community 34 - "Local Embedder (bge-small)"
Cohesion: 0.25
Nodes (8): ADR-0002 Local embedder, knowledge-embed-backfill, Xenova/bge-small-en-v1.5, Embedding cache by content_hash + model, Embedder interface, Knowledge Platform Phase 2 Implementation Notes, LocalEmbedder (bge-small via transformers.js), Voyage hosted embeddings contingency

### Community 35 - "Root Layout & Fonts"
Cohesion: 0.29
Nodes (5): firaCode, inter, metadata, Providers(), frappeAlpha

### Community 36 - "Narrative Generation"
Cohesion: 0.52
Nodes (5): buildNarrativePrompt(), generateNarrative(), Narrative, parseNarrative(), repairJson()

### Community 37 - "Deepening Candidates"
Cohesion: 0.33
Nodes (6): Candidate A — Run Workspace Owner, Crawl Gate, Persistent Healing Cache / Locator DB, Agent Project Improvement Assessment, Agent Runtime (bypassPermissions), Workspace (createWorkspace / .runs)

### Community 38 - "pgvector Migration & Postgres"
Cohesion: 0.33
Nodes (6): findSimilarSpecs, 0002_pgvector.sql migration, pgvector (vector(384) + HNSW), SQL migration runner, Neon managed Postgres, PostgreSQL knowledge store

### Community 39 - "Planner Memory & Seams"
Cohesion: 0.33
Nodes (6): Planner is KB-agnostic (one decision layer), Planner prior-plan memory, contextPack (token-bounded packs), Copy reused specs into the run (D4), stages.ts (Planner/Generator seams), Planner agent (history-aware)

### Community 40 - "Tarento Shield Logo"
Cohesion: 0.60
Nodes (5): Tarento Shield Logo, Tech Brand Identity, Downward Chevron Stack, Shield Emblem Shape, Teal and Navy Palette

### Community 42 - "Paraphrase Fixtures"
Cohesion: 0.50
Nodes (3): negatives, note, positives

### Community 43 - "Tarento Flows Fixture"
Cohesion: 0.50
Nodes (3): app, flows, note

### Community 44 - "Tarento Brand Identity"
Cohesion: 0.67
Nodes (4): Tarento Logo, Brand Identity, Tarento Brand Identity, Chevron / Shield Geometric Motif

### Community 46 - "App Identity Normalization"
Cohesion: 0.67
Nodes (3): appId normalizeOrigin, extract.ts (RunReport extractor), Normalized-origin App identity

## Ambiguous Edges - Review These
- `Run` → `useTheme Hook`  [AMBIGUOUS]
  DESIGN_SYSTEM.md · relation: semantically_similar_to

## Knowledge Gaps
- **182 isolated node(s):** `allow`, `MotionBox`, `ConsoleLayoutProps`, `MotionBox`, `LaunchWizardProps` (+177 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Run` and `useTheme Hook`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `RunReport` connect `Run Ingestion & Extraction` to `CLI & HTML Report Rendering`, `Run Request Validation & Manager`, `Knowledge Service CLI & Tests`, `Generator Context Packs`, `Console UI Layout`, `Test Report View Icons`, `Claude Client & Run Service`, `Run Details Pane UI`, `Test Runs Table UI`, `Orchestrator Dependencies`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `Run` connect `Test Runs Table UI` to `CLI & HTML Report Rendering`, `Run Request Validation & Manager`, `Workspace & Stage Orchestration`, `Console UI Layout`, `Test Report View Icons`, `Run Details Pane UI`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `DisabledKnowledgeService` connect `App Identity & Disabled KB` to `Embedder Implementations`, `Orchestrator Dependencies`, `Generator Context Packs`, `PgKnowledgeService`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `allow`, `MotionBox`, `ConsoleLayoutProps` to the rest of the system?**
  _199 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `CLI & HTML Report Rendering` be split into smaller, more focused modules?**
  _Cohesion score 0.08246753246753247 - nodes in this community are weakly interconnected._
- **Should `Four-Agent Testing Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.06095791001451379 - nodes in this community are weakly interconnected._