# How the AI Test-Suite Works — One-Page Overview

A board-level view of the four AI agents, what each one does, when they look at the
database, and where the real browser (Playwright) is driven.

```mermaid
sequenceDiagram
    actor User as 👤 User<br/>(gives a website URL)
    participant DB as 🗄️ Knowledge Database<br/>(past plans · past test scripts · past fixes)
    participant A1 as 🔍 Discoverer
    participant A2 as ✍️ Designer
    participant A3 as 🔧 Tester
    participant A4 as 📊 Reporter
    participant PW as 🌐 Playwright<br/>(real browser on the live site)

    User->>A1: 1. "Test this website"

    rect rgb(232, 245, 233)
    Note over A1,PW: STEP 1 — Explore the live site, THEN write a plan
    DB-->>A1: Its own previous plan for this site (memory / a head-start)
    A1->>PW: Open the site and click through it
    PW-->>A1: Pages + screenshots
    A1->>A1: Write a plain-English Test Plan<br/>(the user flows worth testing)
    end

    rect rgb(227, 242, 253)
    Note over A2,DB: STEP 2 — Reuse what already works, write the rest
    A1->>A2: Hand over the Test Plan
    DB-->>A2: Matching test scripts from past runs → REUSE them
    A2->>A2: Write brand-new scripts for everything not yet covered<br/>(test spec files only — does NOT run them)
    end

    rect rgb(255, 243, 224)
    Note over A3,PW: STEP 3 — Hand over to the Tester, run for real, then self-heal
    A2->>A3: Hand over the finished test spec files
    A3->>PW: Run every test in the browser
    PW-->>A3: Pass / fail results
    DB-->>A3: Fixes that worked before for similar failures
    A3->>A3: Repair what failed · park the unfixable
    end

    rect rgb(243, 229, 245)
    Note over A4,DB: STEP 4 — Explain the results, then remember them
    A3->>A4: Final results + screenshots
    A4->>A4: Write a human-readable report<br/>(summary · issues · recommended fixes)
    A4-->>User: 📄 Test Report
    A4->>DB: Save this run → makes the next run smarter
    end
```

## The five questions this answers

| Question                                                       | Answer                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Does an agent plan first, or explore first?**                | The **Discoverer explores the live site first** (clicking through it and taking screenshots) and **writes the plan afterwards**. It is not fully blind — it gets its _own previous plan_ from the database as a head-start, but it always re-checks the real site. |
| **How do agents get past plans from the database?**            | The **Discoverer** asks the Knowledge Database for the most recent plan it wrote for the same site and uses it as memory.                                                                                                                                          |
| **How do agents get matching test scripts from the database?** | The **Designer** asks the database for past test scripts that match the new plan. Confident matches are **reused as-is**; only the gaps get newly written.                                                                                                         |
| **Where is Playwright (the real browser) used?**               | In **two places** — the **Discoverer** drives it to explore the site, and the **Tester** **runs** the tests in it and then repairs any failures.                                                                                                                  |
| **What does each agent do?**                                   | **Discoverer** → explore + plan · **Designer** → write the tests (reusing past ones) · **Tester** → run + fix · **Reporter** → explain + store for next time.                                                                                                     |

> The database is **optional**: with no database connected, the same four agents still
> run start-to-finish — they just run "cold," without the memory boost.
