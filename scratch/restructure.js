import fs from 'fs';
import path from 'path';

const filePath = '/Users/senthilpalanivelu/Programme/test-suite/app/explore/PatternExplorer.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Declare cardShadow at the top of the PatternExplorer component
const targetShadowDecl = '  const isDark = theme === "dark";';
const shadowDecl = `  const isDark = theme === "dark";

  const cardShadow = isDark
    ? "0 10px 30px rgba(0,0,0,0.35)"
    : "0 10px 30px rgba(15,23,42,0.06)";`;

if (content.includes(targetShadowDecl) && !content.includes('const cardShadow =')) {
  content = content.replace(targetShadowDecl, shadowDecl);
  console.log('Successfully added cardShadow declaration.');
} else {
  console.log('Skipping cardShadow declaration (already exists or target not found).');
}

// 2. Identify the Dual-Pane split layout region and replace it
const startMarker = '{/* ── Dual-Pane split layout ─────────────────────────────────── */}';
const endMarker = '{/* ── Interactive Spec Code Viewer Modal ────────────────────── */}';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error('Error: Could not find markers in file.');
  process.exit(1);
}

console.log(`Found start marker at index ${startIndex} and end marker at index ${endIndex}`);

const newLayout = `      {/* ── Side-by-Side Playground Composer ──────────────────────── */}
      <Grid templateColumns={{ base: "1fr", xl: "1fr 1fr" }} gap={5} width="100%" mb={6}>
        {/* 1. Scenario Input Card */}
        <Box
          bg={colors.cardBg}
          borderRadius="16px"
          border={\`1px solid \${colors.border}\`}
          boxShadow={cardShadow}
          display="flex"
          flexDirection="column"
          overflow="hidden"
        >
          {/* Header */}
          <Flex align="center" justify="space-between" px={4} py={3} borderBottom={\`1px solid \${colors.border}\`}>
            <Flex align="center" gap={2}>
              <Sliders size={15} color={c.sapphire} />
              <Text fontSize="13px" fontWeight="bold" color={colors.text} letterSpacing="0.05em">
                1. SCENARIO INPUT CONSOLE
              </Text>
            </Flex>
          </Flex>

          {/* Textarea */}
          <Box p={3} flex="1">
            <Box
              borderRadius="12px"
              border={\`1px solid \${colors.border}\`}
              bg={colors.subBg}
              p={1}
              position="relative"
            >
              <Textarea
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
                placeholder="Describe a test scenario (e.g. Add 'Acme Pro Plan' to cart on http://mysite.com for $99)..."
                rows={4}
                bg="transparent"
                border="none"
                outline="none"
                _focus={{ boxShadow: "none" }}
                fontSize="sm"
                color={colors.text}
                _placeholder={{ color: colors.subtext }}
                pb="34px"
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    setIsKeyboardEnterPressed(true);
                    setTimeout(() => setIsKeyboardEnterPressed(false), 200);
                    run();
                  }
                }}
              />
              <Flex
                position="absolute"
                bottom="10px"
                right="10px"
                align="center"
                gap={1.5}
                color={isKeyboardEnterPressed ? c.sapphire : colors.subtext}
                fontSize="10px"
                pointerEvents="none"
                bg={isKeyboardEnterPressed ? catppuccinAlpha(c.sapphire, 0.15) : "transparent"}
                px={2}
                py={0.5}
                borderRadius="4px"
              >
                <CornerDownLeft size={10} /> ⌘ + Enter
              </Flex>
            </Box>
          </Box>

          {/* Presets List */}
          <Box px={4} pb={4}>
            <Text fontSize="10.5px" fontWeight="bold" color={colors.subtext} mb={2.5} letterSpacing="0.05em">
              PRESET SCENARIOS
            </Text>
            <Flex flexWrap="wrap" gap={2}>
              {EXAMPLES.map((ex) => (
                <MotionBox
                  key={ex}
                  as="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSeedText(ex)}
                  px={3}
                  py={1.5}
                  borderRadius="8px"
                  fontSize="11px"
                  bg={colors.subBg}
                  color={colors.subtext}
                  border="1px solid"
                  borderColor={colors.border}
                  cursor="pointer"
                  transition={{ duration: 0.12 }}
                  _hover={{
                    bg: colors.rowHover,
                    color: colors.text,
                    borderColor: c.sapphire,
                  }}
                  textAlign="left"
                  lineHeight="1.4"
                >
                  <HStack gap={1.5} align="center">
                    <Sparkles size={10} color={c.sapphire} style={{ flexShrink: 0 }} />
                    <Text maxW="220px" isTruncated>{ex}</Text>
                  </HStack>
                </MotionBox>
              ))}
            </Flex>
          </Box>

          {/* Target URL & Controls */}
          <Box px={4} pb={4}>
            <Grid templateColumns={{ base: "1fr", md: "1fr 120px" }} gap={3} alignContent="end">
              <Box>
                <Flex align="center" justify="space-between" gap={2} mb={1.5}>
                  <Flex align="center" gap={1.5}>
                    <Globe size={12} color={c.sapphire} />
                    <Text fontSize="10.5px" fontWeight="700" color={colors.subtext}>
                      TARGET URL
                    </Text>
                  </Flex>
                  {appId.trim() && (
                    <Box
                      as="button"
                      onClick={() => setAppId("")}
                      fontSize="10px"
                      color={colors.subtext}
                      _hover={{ color: c.sapphire }}
                    >
                      clear
                    </Box>
                  )}
                </Flex>
                <input
                  list="known-apps"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="https://your-app.com (or pick a known app)"
                  style={{
                    width: "100%",
                    height: "36px",
                    padding: "0 12px",
                    borderRadius: "8px",
                    border: \`1px solid \${colors.border}\`,
                    background: colors.subBg,
                    color: colors.text,
                    fontSize: "12px",
                    outline: "none",
                  }}
                />
                <datalist id="known-apps">
                  {apps.map((a) => (
                    <option key={a.appId} value={a.appId}>
                      {appLabel(a.appId)} · {a.specCount} specs
                    </option>
                  ))}
                </datalist>
              </Box>

              <Box>
                <Text fontSize="10.5px" fontWeight="700" color={colors.subtext} mb={1.5}>
                  LIMIT (K)
                </Text>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={k}
                  onChange={(e) => setK(Number(e.target.value) || 10)}
                  bg={colors.subBg}
                  borderColor={colors.border}
                  borderRadius="8px"
                  h="36px"
                  fontSize="xs"
                  color={colors.text}
                  _focus={{ borderColor: c.sapphire }}
                />
              </Box>
            </Grid>

            {/* Target URL Helper Status */}
            <Flex align="center" gap={1.5} mt={2} fontSize="10px">
              {!appId.trim() ? (
                <Text color={colors.subtext}>
                  <Globe size={10} style={{ display: "inline", marginRight: 4 }} />
                  No URL — searches all apps (cross-app only).
                </Text>
              ) : knownApp ? (
                <Text color={c.green}>
                  <Check size={10} style={{ display: "inline", marginRight: 4 }} />
                  Known app · {knownApp.specCount} specs — local reuse available.
                </Text>
              ) : (
                <Text color={c.mauve}>
                  <Sparkles size={10} style={{ display: "inline", marginRight: 4 }} />
                  New app — goes straight to cross-app patterns.
                </Text>
              )}
            </Flex>
          </Box>

          {/* Bottom Controls Bar */}
          <Flex
            align="center"
            justify="space-between"
            px={4}
            py={3}
            borderTop={\`1px solid \${colors.border}\`}
            bg={colors.subBg}
          >
            <Flex align="center" gap={1.5} color={colors.subtext} fontSize="11px">
              <CornerDownLeft size={12} />
              <Text>
                <Text as="span" fontWeight="600">
                  ⌘ + Enter
                </Text>{" "}
                to search
              </Text>
            </Flex>
            <HStack gap={2}>
              <Button
                onClick={clearAll}
                disabled={!seedText.trim() && !appId.trim() && !result && !error}
                variant="outline"
                borderColor={c.red}
                color={c.red}
                bg="transparent"
                fontWeight="bold"
                h="36px"
                px={4}
                fontSize="xs"
                borderRadius="8px"
                transition="all 0.18s ease"
                _hover={{
                  bg: c.red,
                  color: isDark ? c.crust : "#ffffff",
                  transform: "translateY(-1.5px) scale(1.02)",
                  boxShadow: \`0 0 16px \${catppuccinAlpha(c.red, 0.4)}\`,
                }}
                _active={{ transform: "translateY(0) scale(0.98)" }}
                _disabled={{
                  opacity: 0.4,
                  cursor: "not-allowed",
                  transform: "none",
                  boxShadow: "none",
                  bg: "transparent",
                  borderColor: colors.border,
                  color: colors.subtext,
                }}
              >
                <X size={14} style={{ marginRight: 6 }} />
                Clear
              </Button>
              <Button
                onClick={run}
                loading={loading}
                disabled={!seedText.trim()}
                variant="outline"
                borderColor={c.sapphire}
                color={c.sapphire}
                bg="transparent"
                fontWeight="bold"
                h="36px"
                px={5}
                fontSize="xs"
                borderRadius="8px"
                transition="all 0.18s ease"
                _hover={{
                  bg: c.sapphire,
                  color: isDark ? c.crust : "#ffffff",
                  transform: "translateY(-1.5px) scale(1.02)",
                  boxShadow: \`0 0 16px \${catppuccinAlpha(c.sapphire, 0.4)}\`,
                }}
                _active={{ transform: "translateY(0) scale(0.98)" }}
                _disabled={{
                  opacity: 0.4,
                  cursor: "not-allowed",
                  transform: "none",
                  boxShadow: "none",
                  bg: "transparent",
                  borderColor: colors.border,
                  color: colors.subtext,
                }}
              >
                <Search size={14} style={{ marginRight: 6 }} />
                Search
              </Button>
            </HStack>
          </Flex>
        </Box>

        {/* 2. Pattern Abstraction / Tokenizer Card */}
        <Box
          bg={colors.cardBg}
          borderRadius="16px"
          border={\`1px solid \${colors.border}\`}
          boxShadow={cardShadow}
          display="flex"
          flexDirection="column"
          overflow="hidden"
        >
          {/* Header */}
          <Flex align="center" justify="space-between" px={4} py={3} bg={isDark ? "#252638" : colors.cardBg} borderBottom={\`1px solid \${colors.border}\`}>
            <Flex align="center" gap={3} minW={0}>
              <Flex gap={1.5} align="center">
                <Box w="10px" h="10px" borderRadius="full" bg="#ed8796" />
                <Box w="10px" h="10px" borderRadius="full" bg="#eed49f" />
                <Box w="10px" h="10px" borderRadius="full" bg="#a6da95" />
              </Flex>
              <Flex align="center" gap={1.5} ml={2} minW={0}>
                <Wand2 size={14} color={colors.subtext} />
                <Text fontSize="12.5px" fontWeight="bold" color={colors.text} whiteSpace="nowrap">
                  PATTERN COMPILER --LIVE
                </Text>
              </Flex>
            </Flex>

            {seedText.trim() && (
              <IconButton
                aria-label="Toggle stripping rules"
                variant="ghost"
                size="xs"
                h="24px"
                w="24px"
                color={showRulesTable ? c.sapphire : c.overlay1}
                _hover={{ color: colors.text, bg: colors.rowHover }}
                onClick={() => setShowRulesTable(!showRulesTable)}
              >
                <Info size={12} />
              </IconButton>
            )}
          </Flex>

          {/* Compiler Body */}
          <Box p={4} flex="1" display="flex" flexDirection="column" gap={4} bg={isDark ? "#1e1e2e" : colors.subBg}>
            {!seedText.trim() ? (
              <Flex
                direction="column"
                align="center"
                justify="center"
                flex="1"
                gap={3}
                py={12}
                color={colors.subtext}
              >
                <Wand2 size={32} color={colors.border} />
                <Text fontSize="xs" fontWeight="bold">
                  Waiting for scenario description...
                </Text>
                <Text fontSize="2xs" maxW="280px" textAlign="center" lineHeight="1.4">
                  Describe a scenario in the console on the left. The live compiler will tokenize and abstract it here.
                </Text>
              </Flex>
            ) : (
              <Flex direction="column" gap={4} h="100%">
                {/* 2a. Live Tokenizer Stream */}
                <Box>
                  <Text fontSize="10px" fontWeight="bold" color={colors.subtext} mb={2} letterSpacing="0.05em">
                    LIVE TOKENIZER STREAM
                  </Text>
                  
                  <AnimatePresence>
                    {showRulesTable && (
                      <MotionBox
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        bg={isDark ? "#181825" : colors.cardBg}
                        p={2.5}
                        mb={2.5}
                        borderRadius="md"
                        fontSize="9px"
                        fontFamily="mono"
                        color={colors.subtext}
                        border={\`1px solid \${colors.border}\`}
                      >
                        <Grid templateColumns="1fr 1fr" gap={1}>
                          <Text color={c.mauve}>URLs:</Text>
                          <Text color={c.red}>[Stripped]</Text>
                          <Text color={c.mauve}>PII/Emails:</Text>
                          <Text color={c.red}>[Stripped]</Text>
                          <Text color={c.mauve}>Quotes/Strings:</Text>
                          <Text color={c.red}>[Stripped]</Text>
                          <Text color={c.mauve}>Prices/Numbers:</Text>
                          <Text color={c.red}>[Stripped]</Text>
                        </Grid>
                      </MotionBox>
                    )}
                  </AnimatePresence>

                  <Flex
                    flexWrap="wrap"
                    gap={1.5}
                    p={3}
                    bg={isDark ? "#181825" : colors.cardBg}
                    borderRadius="10px"
                    border={\`1px solid \${colors.border}\`}
                    maxH="130px"
                    overflowY="auto"
                    className="glass-scroll-area"
                  >
                    {tokenizeText(seedText).map((token, idx) => (
                      <InteractiveToken key={idx} token={token} c={c} />
                    ))}
                  </Flex>
                </Box>

                {/* 2b. Abstracted Playbook Shape */}
                <Box flex="1" display="flex" flexDirection="column">
                  <Text fontSize="10px" fontWeight="bold" color={colors.subtext} mb={2} letterSpacing="0.05em">
                    ABSTRACTED PLAYBOOK SHAPE
                  </Text>
                  <Box
                    flex="1"
                    p={3.5}
                    bg={isDark ? "#181825" : colors.cardBg}
                    border={\`1px solid \${colors.border}\`}
                    borderRadius="10px"
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, monospace"
                    fontSize="12px"
                    color={c.mauve}
                    overflowY="auto"
                    className="glass-scroll-area"
                    minH="80px"
                  >
                    {loading ? (
                      <Flex align="center" gap={2} color={colors.subtext}>
                        <Spinner size="xs" color={c.mauve} />
                        <Text fontSize="11px">Compiling and running vector search...</Text>
                      </Flex>
                    ) : result ? (
                      <Flex align="center" gap={2}>
                        <Text fontWeight="700">{result.abstracted}</Text>
                      </Flex>
                    ) : (
                      <Text color={colors.subtext} fontStyle="italic">
                        Click "Search" to view the finalized abstraction shape used for matching.
                      </Text>
                    )}
                  </Box>
                </Box>
              </Flex>
            )}
          </Box>
        </Box>
      </Grid>

      {/* ── Results Workbench (Full Width) ─────────────────────────── */}
      <Box
        w="100%"
        bg={colors.cardBg}
        border={\`1px solid \${colors.border}\`}
        borderRadius="24px"
        p={{ base: 4, md: 5 }}
        boxShadow={cardShadow}
        display="flex"
        flexDirection="column"
        gap={4}
      >
        {/* Tabs Header */}
        <Flex
          borderBottom={\`1px solid \${colors.border}\`}
          pb={2.5}
          gap={2}
          overflowX="auto"
        >
          {[
            {
              id: "patterns" as const,
              label: "Matches Feed",
              count: result
                ? result.inApp.length + result.crossApp.length
                : undefined,
            },
            { id: "journey" as const, label: "Pipeline Journey" },
            {
              id: "specs" as const,
              label: "Specs Database",
              count: specs.length,
            },
            {
              id: "apps" as const,
              label: "Apps Directory",
              count: apps.length,
            },
          ].map((tab) => {
            const isSelected = activeResultsTab === tab.id;
            return (
              <Button
                key={tab.id}
                onClick={() => setActiveResultsTab(tab.id)}
                variant="outline"
                size="sm"
                h="32px"
                borderRadius="8px"
                bg={isSelected ? catppuccinAlpha(c.sapphire, 0.08) : "transparent"}
                borderColor={isSelected ? catppuccinAlpha(c.sapphire, 0.3) : "transparent"}
                color={isSelected ? c.sapphire : colors.subtext}
                fontWeight="bold"
                transition="all 0.15s ease"
                _hover={{ bg: colors.rowHover, color: colors.text }}
                px={4}
                flexShrink={0}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <Text
                    as="span"
                    ml={1.5}
                    px={1.5}
                    py={0.25}
                    bg={isSelected ? catppuccinAlpha(c.sapphire, 0.12) : colors.subBg}
                    borderRadius="full"
                    fontSize="9px"
                    fontFamily="mono"
                    color={isSelected ? c.sapphire : colors.subtext}
                  >
                    {tab.count}
                  </Text>
                )}
              </Button>
            );
          })}
        </Flex>

        {/* Tab content wrapper */}
        <Box flex="1">
          {/* Tab 1: Matches Feed */}
          {activeResultsTab === "patterns" && (
            <VStack align="stretch" gap={5}>
              {error && (
                <Box
                  bg={colors.cardBg}
                  border={\`1px solid \${c.red}\`}
                  borderRadius="12px"
                  p={4}
                  color={c.red}
                  fontSize="sm"
                >
                  {error}
                </Box>
              )}

              {loading && !result && (
                <LoadingState c={c} colors={colors} apps={apps.length} />
              )}

              {!loading && !result && !error && (
                <EmptyState c={c} colors={colors} />
              )}

              {result &&
                (() => {
                  const hasHistory = result.inApp.length > 0;
                  const inAppTop = result.inApp[0]?.score ?? 0;
                  const reuseFires =
                    hasHistory && inAppTop >= result.thresholds.reuse;
                  const branch: "reuse" | "fallback" | "new-app" = !hasHistory
                    ? "new-app"
                    : reuseFires
                      ? "reuse"
                      : "fallback";

                  const InApp = (
                    <TierPanel
                      icon={<Building2 size={14} />}
                      accent={c.sapphire}
                      title="In-App Matches"
                      caption={
                        result.appId
                          ? \`Scoped to \${appLabel(result.appId)}\`
                          : "Select context origin app"
                      }
                      thresholdLabel={\`reuse ≥ \${result.thresholds.reuse.toFixed(2)}\`}
                      rows={result.inApp}
                      threshold={result.thresholds.reuse}
                      c={c}
                      colors={colors}
                      queryText={seedText}
                      isAppScoped={true}
                      empty="No local memory matches."
                      markTopSent={branch === "reuse"}
                    />
                  );
                  const CrossApp = (
                    <TierPanel
                      accent={c.mauve}
                      title="Cross-App Patterns"
                      caption="Passing global workflow shapes"
                      thresholdLabel={\`advisory ≥ \${result.thresholds.pattern.toFixed(2)}\`}
                      rows={result.crossApp}
                      threshold={result.thresholds.pattern}
                      c={c}
                      colors={colors}
                      queryText={seedText}
                      isAppScoped={false}
                      showApp
                      empty="No global workflow matches."
                      markTopSent={branch !== "reuse"}
                    />
                  );

                  return (
                    <VStack align="stretch" gap={5}>
                      <DecisionVerdict
                        branch={branch}
                        inAppTop={inAppTop}
                        reuseThreshold={result.thresholds.reuse}
                        appId={result.appId}
                        matchedTitle={result.inApp[0]?.title ?? null}
                        c={c}
                        colors={colors}
                      />

                      {/* Step 1 — in-app, only when the app has prior tests */}
                      {hasHistory && InApp}

                      {/* Step 2 — cross-app */}
                      {branch === "reuse" ? (
                        <SkippedCrossApp
                          revealed={revealSkippedCrossApp}
                          onToggle={() => setRevealSkippedCrossApp((v) => !v)}
                          c={c}
                          colors={colors}
                        >
                          {CrossApp}
                        </SkippedCrossApp>
                      ) : (
                        CrossApp
                      )}
                    </VStack>
                  );
                })()}
            </VStack>
          )}

          {/* Tab 2: Pipeline Journey */}
          {activeResultsTab === "journey" && (
            <PipelineJourney
              seedText={seedText}
              result={result}
              c={c}
              colors={colors}
            />
          )}

          {/* Tab 3: Specs Database */}
          {activeResultsTab === "specs" && (
            <Flex
              direction={{ base: "column", lg: "row" }}
              gap={5}
              align="stretch"
              minH="500px"
            >
              {/* Left Explorer Tree Pane (Fixed Width 300px on desktop) */}
              <Box
                w={{ base: "100%", lg: "300px" }}
                display="flex"
                flexDirection="column"
                gap={3}
                flexShrink={0}
              >
                <Input
                  placeholder="Search database specs by title, file, or domain..."
                  size="xs"
                  value={specsSearchQuery}
                  onChange={(e) => setSpecsSearchQuery(e.target.value)}
                  bg={colors.subBg}
                  borderColor={colors.border}
                  borderRadius="8px"
                  px={3}
                  h="32px"
                  color={colors.text}
                  _focus={{ borderColor: c.sapphire }}
                />

                {loadingSpecs ? (
                  <Flex
                    justify="center"
                    align="center"
                    py={12}
                    gap={2}
                    color={colors.subtext}
                  >
                    <Spinner size="sm" color={c.sapphire} />
                    <Text fontSize="xs">Loading spec database index...</Text>
                  </Flex>
                ) : (
                  (() => {
                    const filtered = specs.filter((s) => {
                      const q = specsSearchQuery.toLowerCase();
                      return (
                        (s.title ?? "").toLowerCase().includes(q) ||
                        s.file.toLowerCase().includes(q) ||
                        s.appId.toLowerCase().includes(q)
                      );
                    });

                    // Group by base domain
                    const grouped: Record<string, SpecInfo[]> = {};
                    for (const spec of filtered) {
                      const baseDomain = getBaseDomain(spec.appId);
                      if (!grouped[baseDomain]) {
                        grouped[baseDomain] = [];
                      }
                      grouped[baseDomain].push(spec);
                    }

                    const baseDomains = Object.keys(grouped).sort();

                    if (baseDomains.length === 0) {
                      return (
                        <Flex
                          direction="column"
                          align="center"
                          gap={2}
                          py={12}
                          color={colors.subtext}
                        >
                          <Database size={24} />
                          <Text fontSize="xs">No matching specs found.</Text>
                        </Flex>
                      );
                    }

                    return (
                      <VStack
                        align="stretch"
                        gap={2}
                        maxH="460px"
                        overflowY="auto"
                        className="glass-scroll-area"
                        pr={1}
                      >
                        {baseDomains.map((baseDomain) => {
                          const appSpecs = grouped[baseDomain];
                          const isExpanded = specsSearchQuery.trim()
                            ? true
                            : expandedApps[baseDomain] !== false;
                          return (
                            <Box key={baseDomain}>
                              {/* Folder Header */}
                              <Flex
                                align="center"
                                justify="space-between"
                                py={1.5}
                                px={2.5}
                                cursor="pointer"
                                borderRadius="lg"
                                _hover={{ bg: colors.rowHover }}
                                onClick={() => {
                                  setExpandedApps((prev) => ({
                                    ...prev,
                                    [baseDomain]: !isExpanded,
                                  }));
                                }}
                              >
                                <HStack gap={2.5} truncate>
                                  {isExpanded ? (
                                    <FolderOpen
                                      size={14}
                                      color={c.sapphire}
                                      style={{ flexShrink: 0 }}
                                    />
                                  ) : (
                                    <FolderClosed
                                      size={14}
                                      color={colors.subtext}
                                      style={{ flexShrink: 0 }}
                                    />
                                  )}
                                  <Text
                                    fontSize="xs"
                                    fontWeight="bold"
                                    color={
                                      isExpanded
                                        ? colors.text
                                        : colors.subtext
                                    }
                                    truncate
                                  >
                                    {baseDomain}
                                  </Text>
                                </HStack>
                                <Text
                                  fontSize="10px"
                                  color={colors.subtext}
                                  px={1.5}
                                  py={0.25}
                                  bg={colors.subBg}
                                  borderRadius="full"
                                  border={\`1px solid \${colors.border}\`}
                                >
                                  {appSpecs.length}
                                </Text>
                              </Flex>

                              {/* Folder Children */}
                              {isExpanded && (
                                <VStack
                                  align="stretch"
                                  gap={1}
                                  pl={4}
                                  mt={1}
                                  borderLeft={\`1px solid \${colors.border}\`}
                                >
                                  {appSpecs.map((spec, specIdx) => {
                                    const isSelected =
                                      selectedDbSpec?.file === spec.file &&
                                      selectedDbSpec?.runId === spec.runId;
                                    return (
                                      <Flex
                                        key={specIdx}
                                        align="center"
                                        gap={2}
                                        py={1.5}
                                        px={2.5}
                                        cursor="pointer"
                                        borderRadius="md"
                                        bg={
                                          isSelected
                                            ? catppuccinAlpha(
                                                c.sapphire,
                                                0.12,
                                              )
                                            : "transparent"
                                        }
                                        borderLeft="2px solid"
                                        borderColor={
                                          isSelected
                                            ? c.sapphire
                                            : "transparent"
                                        }
                                        color={
                                          isSelected
                                            ? colors.text
                                            : colors.subtext
                                        }
                                        _hover={{
                                          bg: colors.rowHover,
                                          color: colors.text,
                                        }}
                                        onClick={() =>
                                          setSelectedDbSpec(spec)
                                        }
                                      >
                                        <FileCode2
                                          size={12}
                                          color={
                                            isSelected
                                              ? c.sapphire
                                              : colors.subtext
                                          }
                                          style={{ flexShrink: 0 }}
                                        />
                                        <Box truncate flex="1">
                                          <Text
                                            fontSize="11px"
                                            fontWeight={
                                              isSelected ? "bold" : "medium"
                                            }
                                            truncate
                                          >
                                            {spec.title ??
                                              spec.file.split("/").pop() ??
                                              "(untitled)"}
                                          </Text>
                                        </Box>
                                      </Flex>
                                    );
                                  })}
                                </VStack>
                              )}
                            </Box>
                          );
                        })}
                      </VStack>
                    );
                  })()
                )}
              </Box>

              {/* Vertical Divider */}
              <Box
                w="1px"
                bg={colors.border}
                display={{ base: "none", lg: "block" }}
                alignSelf="stretch"
              />

              {/* Right Code Viewer Pane (Fills remaining space) */}
              <Box
                flex="1"
                bg={colors.subBg}
                border={\`1px solid \${colors.border}\`}
                borderRadius="20px"
                overflow="hidden"
                display="flex"
                flexDirection="column"
                h="500px"
              >
                {!selectedDbSpec ? (
                  <Flex
                    direction="column"
                    align="center"
                    justify="center"
                    flex="1"
                    gap={3}
                    p={6}
                    color={colors.subtext}
                  >
                    <Database size={32} color={colors.border} />
                    <Text fontSize="xs" fontWeight="bold">
                      No spec selected
                    </Text>
                    <Text
                      fontSize="2xs"
                      maxW="280px"
                      textAlign="center"
                      lineHeight="1.4"
                    >
                      Select a test specification from the tree explorer on
                      the left to inspect its Playwright source code.
                    </Text>
                  </Flex>
                ) : loadingDbSpecCode ? (
                  <Flex
                    direction="column"
                    align="center"
                    justify="center"
                    flex="1"
                    gap={3}
                    p={6}
                    color={colors.subtext}
                  >
                    <Spinner size="md" color={c.sapphire} />
                    <Text fontSize="xs">Loading spec code...</Text>
                  </Flex>
                ) : (
                  <Flex direction="column" h="100%">
                    {/* Editor Header */}
                    <Flex
                      align="center"
                      justify="space-between"
                      p={3.5}
                      borderBottom={\`1px solid \${colors.border}\`}
                      bg={isDark ? "#252638" : colors.cardBg}
                    >
                      <Flex align="center" gap={2.5} minW={0} flex="1">
                        <Flex gap={1.5} align="center">
                          <Box w="8px" h="8px" borderRadius="full" bg="#ed8796" />
                          <Box w="8px" h="8px" borderRadius="full" bg="#eed49f" />
                          <Box w="8px" h="8px" borderRadius="full" bg="#a6da95" />
                        </Flex>
                        <Flex align="center" gap={1.5} ml={2} minW={0}>
                          <FileCode2 size={13} color={colors.subtext} />
                          <Text fontSize="11.5px" fontWeight="bold" color={colors.text} truncate>
                            {selectedDbSpec.title ?? "(untitled)"}
                          </Text>
                          <Text fontSize="10px" color={colors.subtext} truncate display={{ base: "none", md: "block" }}>
                            · {selectedDbSpec.file}
                          </Text>
                        </Flex>
                      </Flex>

                      {/* Actions */}
                      <HStack gap={2} flexShrink={0}>
                        <Button
                          size="xs"
                          variant="outline"
                          borderColor={c.green}
                          color={c.green}
                          bg="transparent"
                          transition="all 0.18s ease"
                          _hover={{
                            bg: c.green,
                            color: isDark ? c.crust : "#ffffff",
                            transform: "translateY(-1.5px) scale(1.02)",
                            boxShadow: \`0 0 12px \${catppuccinAlpha(c.green, 0.4)}\`,
                          }}
                          _active={{ transform: "scale(0.97)" }}
                          onClick={() => {
                            if (selectedDbSpec.title) {
                              setSeedText(selectedDbSpec.title);
                              run();
                            }
                          }}
                          fontSize="10px"
                          h="26px"
                          px={2.5}
                        >
                          <Sparkles size={11} style={{ marginRight: 4 }} />
                          Analyze
                        </Button>

                        <Button
                          size="xs"
                          variant="outline"
                          borderColor={c.sapphire}
                          color={c.sapphire}
                          bg="transparent"
                          transition="all 0.18s ease"
                          _hover={{
                            bg: c.sapphire,
                            color: isDark ? c.crust : "#ffffff",
                            transform: "translateY(-1.5px) scale(1.02)",
                            boxShadow: \`0 0 12px \${catppuccinAlpha(c.sapphire, 0.4)}\`,
                          }}
                          _active={{ transform: "scale(0.97)" }}
                          onClick={() => {
                            if (selectedDbSpecCode) {
                              navigator.clipboard.writeText(selectedDbSpecCode);
                            }
                          }}
                          fontSize="10px"
                          h="26px"
                          px={2.5}
                        >
                          <Copy size={11} style={{ marginRight: 4 }} />
                          Copy Code
                        </Button>
                      </HStack>
                    </Flex>

                    {/* Editor Code Body */}
                    <Box flex="1" overflow="hidden" p={2} bg="#1e1e2e">
                      <CodeHighlighter
                        code={selectedDbSpecCode ?? ""}
                        c={c}
                        colors={colors}
                      />
                    </Box>
                  </Flex>
                )}
              </Box>
            </Flex>
          )}

          {/* Tab 4: Apps Directory */}
          {activeResultsTab === "apps" && (
            <Grid
              templateColumns={{
                base: "1fr",
                sm: "repeat(2, 1fr)",
                md: "repeat(3, 1fr)",
              }}
              gap={2.5}
              maxH="420px"
              overflowY="auto"
              className="glass-scroll-area"
              pr={1}
            >
              {apps.map((app) => (
                <Flex
                  key={app.appId}
                  p={3}
                  bg={colors.subBg}
                  borderRadius="xl"
                  align="center"
                  justify="space-between"
                  border={\`1px solid \${colors.border}\`}
                  fontSize="xs"
                  cursor="pointer"
                  _hover={{ borderColor: c.sapphire, bg: colors.rowHover }}
                  onClick={() => {
                    setSpecsSearchQuery(appLabel(app.appId));
                    setActiveResultsTab("specs");
                  }}
                >
                  <HStack gap={2} truncate>
                    <Globe size={13} color={c.mauve} />
                    <Text
                      fontFamily="mono"
                      color={colors.text}
                      fontWeight="bold"
                      truncate
                    >
                      {appLabel(app.appId)}
                    </Text>
                  </HStack>
                  <Text
                    px={2}
                    py={0.5}
                    bg={colors.cardBg}
                    color={c.sapphire}
                    borderRadius="full"
                    fontWeight="bold"
                    fontSize="10px"
                    border={\`1px solid \${colors.border}\`}
                    flexShrink={0}
                  >
                    {app.specCount}
                  </Text>
                </Flex>
              ))}
            </Grid>
          )}
        </Box>
      </Box>
`;

const result = content.substring(0, startIndex) + newLayout + content.substring(endIndex);
fs.writeFileSync(filePath, result, 'utf8');
console.log('Successfully replaced the layout block!');
