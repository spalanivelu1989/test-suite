The pattern_vec is the embedding of patternText, and patternText is derived from exactly "test title + test steps":

intentText  = title + ". " + step-comment₁ + ". " + step-comment₂ + …   (extract.ts)
patternText = abstractIntent(intentText)                                  (abstractIntent.ts)
pattern_vec = embed(patternText)                                          (embed.ts)

So the content is the title + the numbered step comments — but two things are stripped before embedding:

1. Selectors/code are never included. The "steps" are the spec's numbered // 1. … comments (what the test does), not its locators or assertions. Volatile selectors are deliberately left out.
2. App-specific entities are abstracted away by abstractIntent before embedding: URLs, emails, quoted literals (entity names like "Acme Pro Plan"), $prices, bare numbers/dates/ids, and punctuation are replaced with spaces, then lowercased.

So it's "title + steps" reduced to the workflow shape. Concretely, a spec like:

test("Add 'Acme Pro Plan' to cart", ...)
  // 1. Navigate to https://shop.acme.com/plans
  // 2. Click "Acme Pro Plan" — verify $49.99 shown
  // 3. Add to cart

becomes:
- intentText = Add 'Acme Pro Plan' to cart. Navigate to https://shop.acme.com/plans. Click "Acme Pro Plan" — verify $49.99 shown. Add to cart
- patternText ≈ add to cart navigate to click verify shown add to cart (entities/URLs/prices gone)
- pattern_vec = the 384-d unit embedding of that abstracted string.

That's the whole point of the separate column: this is the opposite of specs.embedding (the exact-reuse vector), which embeds the concrete title + steps with the entities intact so two apps' "login" tests stay distinct. pattern_vec strips them so different apps' tests collapse onto the same workflow.

One nuance worth noting: there's also a third vector, title_embedding (migration 0005), which embeds the title only — so across the three tiers it's: embedding = concrete title+steps, pattern_embedding = abstracted title+steps, title_embedding = title alone.

Test case scenario example

1)Edition Selection Updates Configure Panel with Correct Price and ACV (run it in Pattern explorer and Matching visualizer) to check for yourself




-----------------

Important clarification up front: the three vectors are not all blended into one number. They serve two separate retrieval tiers, and only two of the three are blended — within the app-scoped tier. pattern_embedding is its own standalone tier.

Tier A — App-scoped reuse decision (decideForSpecs, coverageDecision.ts)

This decides "can this planned scenario reuse an existing spec in the same app?" It blends title_embedding + embedding into a semantic score, then combines that with a lexical score.

For a scenario sc (query = the bare title sc.name, embedded → e_sc) against each candidate spec s:

1. Lexical — token overlap coefficient:
$$\text{lex} = \frac{|T_{sc} \cap T_s|}{\min(|T_{sc}|,,|T_s|)}$$

2. Semantic — the hybrid blend of two vectors (hybridSem, SEM_TITLE_WEIGHT = 0.5):
$$\text{semTitle} = \cos(e_{sc},\ s.\texttt{title_embedding})$$
$$\text{semIntent} = \cos(e_{sc},\ s.\texttt{embedding})$$
$$\text{sem} = 0.5\cdot\text{semTitle} + 0.5\cdot\text{semIntent}$$
(If s.title_embedding is null, semTitle falls back to semIntent, so the blend degrades to the pure embedding score.)

3. Combine the two scores per spec with a max, and pick the best spec:
$$\text{combined}(sc,s) = \max(\text{lex},\ \text{sem}), \qquad s^\star = \arg\max_s \text{combined}(sc,s)$$

4. Decision (the actual output) — gated, not just thresholded:
$$\text{reuse} \iff \big(\underbrace{\text{lex}^\star \ge 0.8}{\text{REUSE_THRESHOLD}} \ \lor\ \underbrace{\text{sem}^\star \ge 0.82}{\text{SEM_REUSE}}\big)\ \land\ \text{passed}(s^\star.\text{lastOutcome})\ \land\ \text{sameFlow}$$
otherwise new. Reported score = max(lex★, sem★). The extra gates: the matched spec's last run must have passed, and (Fix 2) it must belong to the same flow — a confident title match across different flows is refused.

Tier B — Cross-app pattern (findGlobalPatternSpecs, globalPatterns.ts)

This is a completely separate query using only pattern_embedding (the abstracted vector), to surface transferable patterns from other apps:
$$\text{pattern_score} = 1 - (q_p \mathbin{\texttt{<=>}} s.\texttt{pattern_embedding}) = \cos(q_p,\ s.\texttt{pattern_embedding})$$
ranked top-k by smallest cosine distance, restricted to app_id <> current, reused = false, and specs whose test passed/healed. It is not blended into Tier A's sem or score.

So, the mental model

┌────────────────────────────────┬────────────────────────┬──────────────────────────────────────────┐
│             Vector             │          Tier          │              Role in score               │
├────────────────────────────────┼────────────────────────┼──────────────────────────────────────────┤
│ embedding (title+steps)        │ A (within-app reuse)   │ semIntent, weighted 0.5 in sem           │
├────────────────────────────────┼────────────────────────┼──────────────────────────────────────────┤
│ title_embedding (title only)   │ A (within-app reuse)   │ semTitle, weighted 0.5 in sem            │
├────────────────────────────────┼────────────────────────┼──────────────────────────────────────────┤
│ pattern_embedding (abstracted) │ B (cross-app patterns) │ standalone pattern_score, separate query │
└────────────────────────────────┴────────────────────────┴──────────────────────────────────────────┘

- A's final number: score = max( lex, 0.5·cos(q,title_emb) + 0.5·cos(q,intent_emb) ), then gated by threshold + last-passed + same-flow.
- B's final number: 1 − cosine_distance(q, pattern_emb), independent.

Two design notes that explain why it's split this way:
- The hybrid (A) exists because the query is always a bare title, but embedding encodes title+steps — a different space where an exact-title query tops out ~0.79, below the 0.82 reuse threshold, so reuse never fired. Adding the symmetric title_embedding cosine (≈1.0 on an exact title) lifts the blend back to where SEM_REUSE was calibrated.
- pattern_embedding is deliberately kept out of the reuse blend: it strips app-specific entities, so it's great for "this resembles a known workflow" (cross-app) but wrong for "copy this exact spec forward" (within-app reuse).
