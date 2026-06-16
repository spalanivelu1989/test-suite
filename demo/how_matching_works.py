"""
===============================================================================
HOW THE KNOWLEDGE-LAYER MATCHING WORKS  —  a runnable, step-by-step explainer
===============================================================================

PURPOSE
    A teaching script for the team. Run it (`python3 docs/how_matching_works.py`)
    and read the printed steps top-to-bottom. It reproduces, with real arithmetic,
    the two decisions our agents make when generating tests:

      1. IN-APP  (App-Scoped) : "Have I already tested THIS workflow on THIS app —
                                 can I just REUSE that test?"
      2. CROSS-APP (Global)   : "This workflow is NEW here. How did OTHER apps test
                                 a similar workflow? Borrow the idea (never the code)."

    There are NO function definitions on purpose — every formula is spelled out
    inline so you can follow the math without jumping around.

THE EMBEDDINGS USED HERE ARE A TEACHING STAND-IN
    In production, text is turned into a 384-number vector by a local model
    (Xenova/bge-small-en-v1.5) and compared with cosine similarity. You can't
    reproduce 384-dim vectors by hand, so here every phrase carries a tiny,
    hand-built vector over 9 "concept" axes. The MATH is identical to production;
    only the vectors are simplified so the numbers are checkable by hand.

    The 9 concept axes (what each position in a vector roughly "means"):
        index 0 : cart / add-to-cart
        index 1 : checkout / order / purchase
        index 2 : scroll / smooth-scrolling behaviour
        index 3 : topic = "about"
        index 4 : topic = "contact"
        index 5 : discount / promo code
        index 6 : shipment / tracking
        index 7 : generic form-filling steps
        index 8 : history / past records

THE FORMULAS (all used below)
    Lexical word overlap (overlap coefficient):
        overlap(A, B) = |A ∩ B| / min(|A|, |B|)
        (A, B are the sets of meaningful words in two titles; robust to length.)

    Cosine similarity between two vectors a and b:
        cos(a, b) = (a · b) / (|a| · |b|)
        where  a · b = Σ aᵢ·bᵢ   and   |a| = sqrt(Σ aᵢ²)

    Hybrid semantic score (the reuse query is always a bare TITLE):
        semTitle  = cos(query, spec.title_embedding)   # title-only  → exact title ≈ 1.0
        semIntent = cos(query, spec.embedding)          # title+steps → keeps look-alikes apart
        sem       = SEM_TITLE_WEIGHT·semTitle + (1 − SEM_TITLE_WEIGHT)·semIntent
        (If a spec has NO title_embedding — pre-migration / un-backfilled —
         semTitle falls back to semIntent, i.e. the old title+steps-only behaviour.)

    Per-spec score the in-app decision ranks on:
        combined  = max(lexical, sem)

    IN-APP decision (App-Scoped):
        REUSE  ⟺  ( lexical ≥ 0.80  OR  sem ≥ 0.82 )  AND  the matched test last PASSED
        NEW    ⟺  everything else

    CROSS-APP decision (Global, only for the NEW scenarios, behind a feature flag):
        - abstract the title (strip app-specific entities) → pattern text → embed
        - cosine against OTHER apps' pattern_embedding (app_id ≠ current)
        - keep only PASSING tests, score ≥ PATTERN_RELEVANCE (0.70)
        - keep the single best match per scenario (PATTERN_K = 1), capped at
          PATTERN_BUDGET (8) hints across the whole run
        - the hint is ADVISORY: it inspires generation, it never gets reused as code
===============================================================================
"""

# ---------------------------------------------------------------------------
# Constants — these mirror the real code (coverageDecision.ts / globalPatterns.ts)
# ---------------------------------------------------------------------------
REUSE_THRESHOLD = 0.80    # lexical word-overlap bar to reuse
SEM_REUSE = 0.82          # semantic (blended cosine) bar to reuse — deliberately strict
SEM_TITLE_WEIGHT = 0.5    # weight of the title-only term in the blend

PATTERN_RELEVANCE = 0.70  # cross-app relevance floor (looser than reuse: "relevant?" not "same?")
PATTERN_K = 1             # cross-app: keep only the single best match per scenario
PATTERN_BUDGET = 8        # cross-app: max hints across the whole run
KNOWLEDGE_GLOBAL_PATTERNS = True  # feature flag: is the cross-app tier turned on?

# Words ignored when comparing titles (so "the/to/a" don't inflate overlap).
STOPWORDS = {"the", "a", "an", "to", "of", "in", "on", "and",
             "with", "via", "is", "for", "my", "me"}

# The app currently under test. In-app retrieval is locked to this origin;
# cross-app retrieval looks at every OTHER origin.
CURRENT_APP = "https://shop.example"

# ---------------------------------------------------------------------------
# The KNOWLEDGE BASE: previously generated specs (tests), each with
#   - app         : which app it belongs to (origin)
#   - title       : the human title (also the source of its "tokens")
#   - outcome     : how it did the LAST time it ran ("passed" | "healed" | "failed")
#   - title_vec   : embedding of the TITLE alone        (None = un-backfilled, pre-0005)
#   - intent_vec  : embedding of the TITLE + step comments (the "richer" vector)
#   - pattern_vec : embedding of the ABSTRACTED title (entities stripped) for cross-app
# Other-app specs only need a pattern_vec for the cross-app tier, so their
# title_vec/intent_vec are None here.
# ---------------------------------------------------------------------------
KNOWLEDGE_BASE = [
    # ---- specs that belong to the app under test (used by IN-APP retrieval) ----
    {
        "app": "https://shop.example", "title": "Add item to cart", "outcome": "passed",
        "title_vec":  [1, 0, 0, 0, 0, 0, 0, 0, 0],
        "intent_vec": [1, 0.3, 0, 0, 0, 0, 0, 0.7, 0],   # steps dilute the title
        "pattern_vec":[1, 0, 0, 0, 0, 0, 0, 0, 0],
    },
    {
        "app": "https://shop.example", "title": "Complete checkout", "outcome": "passed",
        "title_vec":  [0.2, 1, 0, 0, 0, 0, 0, 0, 0],
        "intent_vec": [0.3, 1, 0, 0, 0, 0, 0, 0.6, 0],
        "pattern_vec":[0, 1, 0, 0, 0, 0, 0, 0, 0],
    },
    {
        "app": "https://shop.example", "title": "Contact page scrolls smoothly", "outcome": "passed",
        "title_vec":  [0, 0, 2, 0, 1, 0, 0, 0, 0],
        "intent_vec": [0, 0, 2, 0, 1, 0, 0, 0.8, 0],
        "pattern_vec":[0, 0, 2, 0, 0, 0, 0, 0, 0],       # "page scrolls" (about/contact stripped)
    },
    {
        "app": "https://shop.example", "title": "Apply discount code", "outcome": "failed",  # NOTE: last run FAILED
        "title_vec":  [0, 0, 0, 0, 0, 1, 0, 0, 0],
        "intent_vec": [0, 0, 0, 0, 0, 1, 0, 0.6, 0],
        "pattern_vec":[0, 0, 0, 0, 0, 1, 0, 0, 0],
    },
    {
        "app": "https://shop.example", "title": "Past purchases", "outcome": "passed",
        "title_vec":  None,                              # un-backfilled → triggers the fallback
        "intent_vec": [0, 0, 0, 0, 0, 0, 0, 0.4, 1.0],
        "pattern_vec":[0, 0, 0, 0, 0, 0, 0, 0, 0.9],
    },
    # ---- specs that belong to OTHER apps (used by CROSS-APP retrieval) ----
    {
        "app": "https://bank.example", "title": "Track transaction status", "outcome": "passed",
        "title_vec": None, "intent_vec": None,
        "pattern_vec":[0, 0, 0, 0, 0, 0, 1, 0, 0],
    },
    {
        "app": "https://bank.example", "title": "Track shipment (beta)", "outcome": "failed",  # passing-only filter drops this
        "title_vec": None, "intent_vec": None,
        "pattern_vec":[0, 0, 0, 0, 0, 0, 1, 0, 0],
    },
    {
        "app": "https://tax.example", "title": "Apply exemption code", "outcome": "passed",
        "title_vec": None, "intent_vec": None,
        "pattern_vec":[0, 0, 0, 0, 0, 0.9, 0, 0, 0],
    },
    {
        "app": "https://tax.example", "title": "Track refund status", "outcome": "passed",
        "title_vec": None, "intent_vec": None,
        "pattern_vec":[0, 0, 0, 0, 0, 0, 0.8, 0.5, 0],   # related to tracking, but weaker → loses to bank on top-1
    },
    {
        "app": "https://loan.example", "title": "Fill loan application form", "outcome": "passed",
        "title_vec": None, "intent_vec": None,
        "pattern_vec":[0, 0, 0, 0, 0, 0, 0, 1, 0],
    },
]

# ---------------------------------------------------------------------------
# The PLANNED SCENARIOS the Discoverer proposed for the current app. Each is just
# a TITLE — that's all the matcher gets. It carries:
#   - q  : the embedding of the bare title          (used for IN-APP semTitle/semIntent)
#   - qp : the embedding of the ABSTRACTED title    (used for CROSS-APP)
# Each scenario is chosen to demonstrate a different outcome (see the labels).
# ---------------------------------------------------------------------------
SCENARIOS = [
    {"name": "Add item to cart",            # exact title already tested → REUSE (lexical + semantic)
     "q":  [1, 0, 0, 0, 0, 0, 0, 0, 0],     "qp": [1, 0, 0, 0, 0, 0, 0, 0, 0]},
    {"name": "Place an order",              # paraphrase of "Complete checkout" → REUSE (semantic only)
     "q":  [0, 1, 0, 0, 0, 0, 0, 0, 0],     "qp": [0, 1, 0, 0, 0, 0, 0, 0, 0]},
    {"name": "About page scrolls smoothly", # look-alike of "Contact page scrolls" → NEW
     "q":  [0, 0, 2, 1, 0, 0, 0, 0, 0],     "qp": [0, 0, 2, 0, 0, 0, 0, 0, 0]},
    {"name": "Apply discount code",         # matches a spec that LAST FAILED → NEW (then cross-app helps)
     "q":  [0, 0, 0, 0, 0, 1, 0, 0, 0],     "qp": [0, 0, 0, 0, 0, 1, 0, 0, 0]},
    {"name": "Track my shipment",           # nothing similar on this app → NEW (then cross-app helps)
     "q":  [0, 0, 0, 0, 0, 0, 1, 0, 0],     "qp": [0, 0, 0, 0, 0, 0, 1, 0, 0]},
    {"name": "View order history",          # best match is an UN-BACKFILLED spec → REUSE via fallback
     "q":  [0, 0, 0, 0, 0, 0, 0, 0, 1],     "qp": [0, 0, 0, 0, 0, 0, 0, 0, 1]},
]

# Scenarios that come out "new" from the in-app tier flow on to the cross-app tier.
new_scenarios = []

# ===========================================================================
# PART 1 — IN-APP (App-Scoped) RETRIEVAL
# For each planned scenario, score it against every NON-reused spec of THIS app
# and decide REUSE vs NEW.
# ===========================================================================
print("=" * 79)
print(f"PART 1 — IN-APP RETRIEVAL   (app under test: {CURRENT_APP})")
print("=" * 79)

for scenario in SCENARIOS:
    name = scenario["name"]
    q = scenario["q"]
    print("\n" + "-" * 79)
    print(f"SCENARIO: \"{name}\"")
    print("-" * 79)

    # ---- tokenize the scenario title for the lexical comparison ----
    # significantTokens = lowercase words minus stopwords.
    query_tokens = set(w for w in name.lower().split() if w not in STOPWORDS)
    print(f"  query tokens (stopwords removed): {sorted(query_tokens)}")

    # We keep the single best-scoring spec (ranked by `combined`).
    best = None  # will hold dict: title, lexical, sem, combined, outcome

    for spec in KNOWLEDGE_BASE:
        # IN-APP is locked to this app's own, originally-generated specs.
        if spec["app"] != CURRENT_APP:
            continue

        # ---------- (1) LEXICAL word overlap ----------
        #   overlap = |query ∩ spec| / min(|query|, |spec|)
        spec_tokens = set(w for w in spec["title"].lower().split() if w not in STOPWORDS)
        shared = query_tokens & spec_tokens
        smaller = min(len(query_tokens), len(spec_tokens))
        lexical = len(shared) / smaller if smaller else 0.0

        # ---------- (2) SEMANTIC blend ----------
        #   semIntent = cos(query, spec.intent_vec)   [title + steps]
        #   semTitle  = cos(query, spec.title_vec)    [title alone]; falls back to semIntent
        #   sem = 0.5·semTitle + 0.5·semIntent
        #
        # cosine(a, b) = (a·b) / (|a|·|b|)
        iv = spec["intent_vec"]
        dot_i = sum(a * b for a, b in zip(q, iv))
        nq = sum(a * a for a in q) ** 0.5
        ni = sum(b * b for b in iv) ** 0.5
        sem_intent = dot_i / (nq * ni) if nq and ni else 0.0

        if spec["title_vec"] is not None:
            tv = spec["title_vec"]
            dot_t = sum(a * b for a, b in zip(q, tv))
            nt = sum(b * b for b in tv) ** 0.5
            sem_title = dot_t / (nq * nt) if nq and nt else 0.0
            title_note = ""
        else:
            # No title embedding (pre-0005 / un-backfilled): reuse intent for BOTH
            # halves of the blend → identical to the old title+steps-only behaviour.
            sem_title = sem_intent
            title_note = "  (no title_embedding → semTitle falls back to semIntent)"

        sem = SEM_TITLE_WEIGHT * sem_title + (1 - SEM_TITLE_WEIGHT) * sem_intent

        # ---------- (3) per-spec combined score ----------
        combined = max(lexical, sem)

        print(f"  vs spec \"{spec['title']}\" [last={spec['outcome']}]{title_note}")
        print(f"       lexical : |{sorted(shared)}| / min({len(query_tokens)},{len(spec_tokens)})"
              f" = {lexical:.3f}")
        print(f"       semTitle = {sem_title:.3f}   semIntent = {sem_intent:.3f}"
              f"   sem = 0.5·{sem_title:.3f} + 0.5·{sem_intent:.3f} = {sem:.3f}")
        print(f"       combined = max(lexical, sem) = {combined:.3f}")

        if best is None or combined > best["combined"]:
            best = {"title": spec["title"], "lexical": lexical, "sem": sem,
                    "combined": combined, "outcome": spec["outcome"]}

    # ---------- (4) the REUSE vs NEW decision, on the best-matching spec ----------
    # REUSE ⟺ (lexical ≥ 0.80 OR sem ≥ 0.82) AND that spec last passed.
    if best is None:
        # The app has no specs at all (brand-new app) → nothing to reuse.
        decision = "NEW"
        reason = "no prior specs for this app (brand-new app)"
    else:
        clears_bar = best["lexical"] >= REUSE_THRESHOLD or best["sem"] >= SEM_REUSE
        passed = best["outcome"] in ("passed", "healed")
        if clears_bar and passed:
            decision = "REUSE"
            reason = (f"best match \"{best['title']}\" clears the bar "
                      f"(lexical {best['lexical']:.3f} ≥ {REUSE_THRESHOLD} "
                      f"OR sem {best['sem']:.3f} ≥ {SEM_REUSE}) AND last run passed")
        elif clears_bar and not passed:
            decision = "NEW"
            reason = (f"best match \"{best['title']}\" clears the bar but its last run "
                      f"was '{best['outcome']}' — never reuse a broken test, regenerate")
        else:
            decision = "NEW"
            reason = (f"best match \"{best['title']}\" is below both bars "
                      f"(lexical {best['lexical']:.3f} < {REUSE_THRESHOLD}, "
                      f"sem {best['sem']:.3f} < {SEM_REUSE})")

    print(f"  => DECISION: {decision}   ({reason})")

    if decision == "NEW":
        new_scenarios.append(scenario)

# ===========================================================================
# PART 2 — CROSS-APP (Global Pattern) RETRIEVAL
# Runs only for the scenarios the in-app tier marked NEW, and only when the
# feature flag is on. It borrows IDEAS from OTHER apps — never code.
# ===========================================================================
print("\n\n" + "=" * 79)
print("PART 2 — CROSS-APP (GLOBAL PATTERN) RETRIEVAL")
print("=" * 79)
print(f"new scenarios handed to this tier: {[s['name'] for s in new_scenarios]}")
print(f"feature flag KNOWLEDGE_GLOBAL_PATTERNS = {KNOWLEDGE_GLOBAL_PATTERNS}")

hints_used = 0  # counts toward PATTERN_BUDGET across the whole run

if not KNOWLEDGE_GLOBAL_PATTERNS:
    print("\nFlag is OFF → no cross-app hints are produced. (Each NEW scenario is")
    print("generated 'cold'.)")
else:
    for scenario in new_scenarios:
        name = scenario["name"]
        qp = scenario["qp"]   # the ABSTRACTED query (entities already stripped)
        print("\n" + "-" * 79)
        print(f"NEW SCENARIO: \"{name}\"  (abstracted, matched against OTHER apps)")
        print("-" * 79)

        if hints_used >= PATTERN_BUDGET:
            print(f"  PATTERN_BUDGET of {PATTERN_BUDGET} hints already used → skip.")
            continue

        # Score this scenario against every candidate, explaining each include/exclude.
        candidates = []  # list of (score, app, title)
        for spec in KNOWLEDGE_BASE:
            # Exclusion 1: same app — cross-app only learns from OTHER origins.
            if spec["app"] == CURRENT_APP:
                print(f"  - skip \"{spec['title']}\" ({spec['app']}): same app, excluded")
                continue
            # Exclusion 2: passing-only — never propagate a pattern from a failed test.
            if spec["outcome"] not in ("passed", "healed"):
                print(f"  - skip \"{spec['title']}\" ({spec['app']}): last run "
                      f"'{spec['outcome']}', not a passing pattern")
                continue
            if spec["pattern_vec"] is None:
                print(f"  - skip \"{spec['title']}\" ({spec['app']}): no pattern embedding")
                continue

            # cosine(abstracted query, spec.pattern_vec)
            pv = spec["pattern_vec"]
            dot = sum(a * b for a, b in zip(qp, pv))
            nq = sum(a * a for a in qp) ** 0.5
            np = sum(b * b for b in pv) ** 0.5
            score = dot / (nq * np) if nq and np else 0.0

            # Exclusion 3: relevance floor.
            if score >= PATTERN_RELEVANCE:
                candidates.append((score, spec["app"], spec["title"]))
                print(f"  + keep \"{spec['title']}\" ({spec['app']}): "
                      f"cos = {score:.3f} ≥ {PATTERN_RELEVANCE}")
            else:
                print(f"  - skip \"{spec['title']}\" ({spec['app']}): "
                      f"cos = {score:.3f} < {PATTERN_RELEVANCE} (below floor)")

        # Rank by similarity, keep only the single best (PATTERN_K = 1).
        candidates.sort(reverse=True)  # highest cosine first
        kept = candidates[:PATTERN_K]

        if not kept:
            print("  => no cross-app hint (nothing relevant on other apps).")
            print("     This scenario is generated from scratch.")
        else:
            score, app, title = kept[0]
            hints_used += 1
            print(f"  => HINT (advisory): \"{title}\" from {app}  (cos {score:.3f})")
            if len(candidates) > PATTERN_K:
                dropped = ", ".join(f"\"{t}\" ({s:.3f})" for s, a, t in candidates[PATTERN_K:])
                print(f"     (PATTERN_K={PATTERN_K} → kept the top match only; dropped: {dropped})")
            print(f"     The Designer uses this as an EXAMPLE to write a fresh test for")
            print(f"     \"{name}\" against this app — it never copies the other app's code.")
            print(f"     (hints used so far: {hints_used}/{PATTERN_BUDGET})")

# ===========================================================================
# WHAT EACH SCENARIO DEMONSTRATED
# ===========================================================================
print("\n\n" + "=" * 79)
print("RECAP — which concept each scenario illustrates")
print("=" * 79)
print("""\
  IN-APP (App-Scoped):
    "Add item to cart"            perfect lexical match (1.00) AND strong sem → REUSE
    "Place an order"              lexical 0.00 but sem blend ≥ 0.82 → REUSE (meaning wins)
    "About page scrolls smoothly" look-alike of a real spec, both bars missed → NEW
    "Apply discount code"         scores 1.00 but the matched test LAST FAILED → NEW
    "Track my shipment"           no similar spec on this app → NEW
    "View order history"          best match has NO title_embedding → sem falls back to
                                  the intent-only score, still ≥ 0.82 → REUSE (fallback)

  CROSS-APP (Global, for the NEW ones):
    "About page scrolls smoothly" nothing relevant on other apps (below 0.70) → no hint
    "Apply discount code"         in-app failed, but a tax app's "apply code" pattern
                                  is borrowed as an idea → hint
    "Track my shipment"           bank's passing "track" pattern wins; a FAILED bank
                                  pattern is excluded, and a weaker tax pattern is
                                  dropped by PATTERN_K=1 → single best hint
""")
