# Implementation Notes — Knowledge Platform · Phase 1 (Forge)

Live log maintained during Stage 4 (Forge). Each entry: a decision made the
moment it happened — gaps, tradeoffs, changes vs the Plan, assumptions.

---

### [2026-06-05] Local Postgres environment (homebrew on port 5433)

**Type:** Decision · **Task:** T1 / Forge setup

No Postgres was configured at Forge start (no `KNOWLEDGE_DATABASE_URL`, no `pg`).
The user started `postgresql@18` (homebrew), but it errored: an **EDB PostgreSQL
18** (`/Library/PostgreSQL/18/`, password-protected) already held port **5432**.
Resolved by starting the **homebrew** cluster (`trust` auth, no secret) on port
**5433** via `pg_ctl -D /opt/homebrew/var/postgresql@18 -o "-p 5433"` and creating
a `knowledge` database. Connection string used for the build/tests:
`postgres://senthilpalanivelu@localhost:5433/knowledge`. This is a **local-dev**
arrangement; production uses managed Neon per ADR-0001 (D1) — the env var is the
only thing that changes.
