# Reading the Board UML Diagram — A Beginner's Guide

> **Who this is for.** Anyone who has never read a UML diagram before and wants to
> understand [`board-uml.puml`](board-uml.puml) (rendered as
> `ai-test-suite-workflow.png` / `.svg`). No prior UML knowledge is assumed. By the
> end you'll be able to read the diagram top-to-bottom and explain it to someone
> else.

---

## Table of contents

1. [What kind of diagram is this?](#1-what-kind-of-diagram-is-this)
2. [The visual grammar — the 7 things on the page](#2-the-visual-grammar--the-7-things-on-the-page)
3. [The one golden rule for reading it](#3-the-one-golden-rule-for-reading-it)
4. [The cast of players](#4-the-cast-of-players)
5. [The full read-through script (read this aloud)](#5-the-full-read-through-script-read-this-aloud)
6. [The five questions the diagram answers](#6-the-five-questions-the-diagram-answers)
7. [Tips for reading any sequence diagram](#7-tips-for-reading-any-sequence-diagram)
8. [A 30-second version for the board](#8-a-30-second-version-for-the-board)
9. [Glossary](#9-glossary)

---

## 1. What kind of diagram is this?

This is a **UML sequence diagram**.

UML ("Unified Modeling Language") is a standard visual vocabulary for describing
software. It has many diagram types; this is the **sequence** type, which answers
one specific question:

> **"Who talks to whom, in what order, over time?"**

That makes it perfect for showing a _workflow_ — a series of steps that happen one
after another. Think of it like a **comic strip** or a **theatre script**: there
are characters (the columns), and the action flows from the top of the page to the
bottom.

If you remember only one thing: **down the page = forward in time.**

---

## 2. The visual grammar — the 7 things on the page

Every mark on the diagram means something. Here is the complete legend.

| #   | What you see on the page                                                   | What it means                                                          | How to read it                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Boxes across the top** (and repeated at the bottom)                      | The **participants** — the "players" in the story.                     | They're just labels for each column. The copy at the bottom is the same players, repeated so you don't lose track on a tall diagram.                                                                                                                                  |
| 2   | **Stick figure** (User)                                                    | An **actor** — a human being, someone outside the software.            | This is where the story starts: a real person makes a request.                                                                                                                                                                                                        |
| 3   | **Cylinder** (Knowledge DB)                                                | A **database** — long-term stored memory.                              | Anything stored here outlives a single run and is available next time.                                                                                                                                                                                                |
| 4   | **Dashed vertical line** under each box                                    | A **lifeline** — that player's personal timeline.                      | Read each one as a clock ticking **downward**. Top of the line = earlier; bottom = later.                                                                                                                                                                             |
| 5   | **Arrows between lifelines**                                               | A **message** — one player contacting another.                         | **Solid arrow `──▶`** = a request or a handoff ("do this", "here you go"). **Dashed arrow `◀╌╌`** = a reply coming back ("here's your answer"). An arrow that **loops back onto the same lifeline** = that player doing its own internal work (no one else involved). |
| 6   | **Thin tall rectangle sitting on a lifeline**                              | An **activation bar** — that player is actively busy during that span. | In this diagram you'll see them on the **Playwright** lifeline, showing exactly when the real browser is working.                                                                                                                                                     |
| 7   | **Grey rounded bands** ("Step 1 — …") and the **yellow box at the bottom** | **Section dividers** and a **note**.                                   | These are _not_ UML mechanics — they're signposts added to make the diagram easier to follow. The grey bands group the action into four phases; the yellow note is a footnote with two important caveats.                                                             |

> **Solid vs. dashed is the most useful distinction to internalize:**
> **solid = "I'm asking / sending"**, **dashed = "here's the answer back."**

---

## 3. The one golden rule for reading it

> **Put your finger at the top-left of the page and move straight down.**
> Read each arrow as a sentence: _"\<this player\> sends \<this message\> to \<that
> player\>."_

You never need to jump around. The diagram is designed to be read in a single
top-to-bottom pass, exactly like reading a page of text.

---

## 4. The cast of players

From left to right across the top of the diagram:

| Player           | Symbol                     | Who/what it is                                | Its job in this story                                                          |
| ---------------- | -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| **User**         | Stick figure               | A human (e.g. a QA engineer or product owner) | Kicks everything off by giving a website URL.                                  |
| **Discoverer**   | Box                        | AI agent #1                                   | Explores the live website and writes a plain-English **test plan**.            |
| **Designer**     | Box                        | AI agent #2                                   | Turns the plan into actual **test scripts**, reusing past ones where possible. |
| **Tester**      | Box                        | AI agent #3                                   | **Runs** the tests and **repairs** the ones that fail.                         |
| **Reporter**     | Box                        | AI agent #4                                   | Writes the final human-readable **report** and stores the run as memory.       |
| **Knowledge DB** | Cylinder                   | A database                                    | The tool's long-term memory: past plans, past scripts, and past fixes.         |
| **Playwright**   | Box (with browser meaning) | The real web browser, automated               | The only thing that actually touches the live website.                         |

The four agents always run **in this left-to-right order**: Discoverer →
Designer → Tester → Reporter. The diagram's four grey "Step" bands line up with
the first three handoffs plus the final reporting phase.

---

## 5. The full read-through script (read this aloud)

This is a word-for-word narration. Read it slowly while tracing the diagram with
your finger, top to bottom. Each paragraph corresponds to one grey "Step" band.

> **Opening — orient the audience.**
> "This diagram shows what happens, in order, when someone asks our tool to test a
> website. We read it from top to bottom — that's the passage of time. The columns
> across the top are the players: on the left, the **User** — a real person. Then
> our **four AI agents** — Discoverer, Designer, Tester, and Reporter. On the far
> right, two supporting players: our **Knowledge Database**, which is the tool's
> long-term memory, and **Playwright**, which is a real web browser the software
> drives automatically."

> **The trigger.**
> "The story starts at the very top left. The **User** says _'Test this website'_
> and hands a URL to the first agent, the **Discoverer**. That solid arrow is the
> request that kicks off the whole run."

> **Step 1 — Explore the live site, THEN write a plan.**
> "First, the Discoverer asks the **Knowledge Database** whether it has tested this
> site before. The dashed arrow coming back is the Discoverer's **memory** — its own
> previous plan, used as a head-start. Crucially, it doesn't just trust that memory:
> it then drives the real browser, **Playwright** — that's the solid arrow stretching
> to the far right — to actually open the site and click through it. The browser
> sends back **pages and screenshots**. _Only after_ seeing the live site does the
> Discoverer write a plain-English **test plan** — a list of the user journeys worth
> testing. So the order is important: **it explores first, and plans second.** It is
> not working blind, but it is not blindly trusting memory either."

> **Step 2 — Reuse what works, write the rest.**
> "The Discoverer hands the finished plan to the **Designer**. Before writing
> anything from scratch, the Designer asks the **Knowledge Database** for **matching
> test scripts from past runs** — that's the dashed 'REUSE' arrow. Any confident
> matches are reused as-is, saving time and keeping things consistent. The Designer
> then writes **brand-new scripts only for the parts of the plan that aren't already
> covered.** The Designer's job ends there — it writes the **test spec files** but
> never runs them."

> **Step 3 — Hand over to the Tester, run for real, then self-heal.**
> "The Designer hands the finished **test spec files** to the **Tester**, whose job
> is to actually execute them. The Tester runs the tests in the live
> browser — that's the **second** solid arrow to **Playwright** — and the
> browser returns **pass/fail results**. For anything that failed, the **Tester**
> asks the database for **fixes that worked before** on similar failures, then
> repairs the broken tests. Anything it genuinely can't fix, it parks aside rather
> than leaving the suite broken."

> **Step 4 — Explain the results, then remember them.**
> "Finally, the Tester passes the **final results and screenshots** to the
> **Reporter**. The Reporter writes a **human-readable report** — a summary, the
> issues found, and recommended fixes — and sends it back to the **User**. As a last
> step, it **saves this entire run back into the Knowledge Database**, so the next
> time anyone tests this site, the tool is a little smarter."

> **Closing — the two things to remember.**
> "Two takeaways from the yellow note at the bottom. **First**, the real browser,
> Playwright, is used in exactly **two places** — when the Discoverer explores, and
> when the tests are run — and nowhere else. **Second**, the database is
> **optional**: without it, the same four agents still run start-to-finish; they
> just run 'cold,' without the memory boost."

---

## 6. The five questions the diagram answers

If someone asks one of these, here's exactly where to point on the diagram:

| Question                                                       | Where to look                                            | The answer                                                                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Does an agent plan first, or explore first?**                | Step 1                                                   | **Explore first.** The Discoverer drives Playwright and reads screenshots _before_ it writes the plan.        |
| **How do agents get past plans from the database?**            | Step 1, the dashed arrow from Knowledge DB to Discoverer | The **Discoverer** requests its own previous plan as memory.                                                  |
| **How do agents get matching test scripts from the database?** | Step 2, the dashed "REUSE" arrow into Designer           | The **Designer** requests matching past scripts and reuses confident matches.                                 |
| **Where is the real browser (Playwright) used?**               | The two activation bars on the Playwright lifeline       | **Two places only:** Discoverer's exploration (Step 1) and the test run (Step 3).                             |
| **What does each agent do?**                                   | The self-looping arrow under each agent                  | Discoverer = explore + plan · Designer = reuse + write · Tester = run + fix · Reporter = explain + remember. |

---

## 7. Tips for reading any sequence diagram

These habits work on _any_ sequence diagram, not just this one:

1. **Read strictly top-to-bottom.** Resist the urge to jump around. Vertical
   position _is_ the timeline.
2. **Follow one lifeline at a time when confused.** If a diagram feels busy, pick a
   single column and trace only the arrows that touch it. For example, trace
   **Playwright** alone here and you'll instantly see it's touched exactly twice —
   that single observation answers "where does the browser get used?"
3. **Pair the arrows: solid out, dashed back.** Most solid request arrows have a
   matching dashed reply arrow lower down. Pairing them tells you the full
   request → response story for each interaction.
4. **Self-loops are "thinking time."** An arrow that curves back to the same
   lifeline means that player is doing internal work alone — no collaboration, no
   network call.
5. **Read the section bands and notes first for the big picture**, then dive into
   the arrows for the detail. The grey "Step" bands here are a four-line summary of
   the whole story.

---

## 8. A 30-second version for the board

If you only have half a minute:

> "A user gives us a website. Four AI agents take turns. The **Discoverer** explores
> the live site in a real browser and writes a test plan. The **Designer** turns that
> plan into tests, reusing tests that worked before. The **Tester** runs the tests
> and automatically fixes the ones that break. The **Reporter** writes a plain-English
> report and saves everything to memory so the next run is smarter. The real browser
> is used twice — to explore and to run the tests — and the memory database makes the
> tool improve over time but isn't strictly required."

---

## 9. Glossary

| Term                         | Plain-English meaning                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| **UML**                      | A standard set of diagram styles for describing software ("Unified Modeling Language").     |
| **Sequence diagram**         | The UML diagram type that shows _who talks to whom, in what order, over time._              |
| **Participant**              | One of the "players" — a column in the diagram (a person, an agent, a database, a browser). |
| **Actor**                    | A participant that is a human (drawn as a stick figure).                                    |
| **Lifeline**                 | The dashed vertical line under a participant; its personal timeline, read downward.         |
| **Message**                  | An arrow between participants — one of them contacting another.                             |
| **Activation bar**           | The thin rectangle on a lifeline showing when that participant is actively busy.            |
| **Self-message / self-loop** | An arrow that returns to the same lifeline — a participant doing its own internal work.     |
| **Agent**                    | One of the four AI workers (Discoverer, Designer, Tester, Reporter).                       |
| **Playwright**               | The software that drives a real web browser automatically.                                  |
| **Knowledge DB**             | The database that stores past plans, scripts, and fixes — the tool's long-term memory.      |

---

> **See also:** [`board-uml.puml`](board-uml.puml) (the diagram source) and
> [`RENDER.md`](RENDER.md) (how to regenerate the image).
