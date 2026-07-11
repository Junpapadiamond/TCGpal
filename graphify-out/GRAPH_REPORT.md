# Graph Report - TCGpal-metadata-ingestion  (2026-07-12)

## Corpus Check
- 138 files · ~589,317 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1425 nodes · 2764 edges · 78 communities (69 shown, 9 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b6335532`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_comparison-qa.ts|comparison-qa.ts]]
- [[_COMMUNITY_provider.ts|provider.ts]]
- [[_COMMUNITY_one-piece-tcg.ts|one-piece-tcg.ts]]
- [[_COMMUNITY_ComparisonApp.tsx|ComparisonApp.tsx]]
- [[_COMMUNITY_ebay.ts|ebay.ts]]
- [[_COMMUNITY_universal-listing.ts|universal-listing.ts]]
- [[_COMMUNITY_tcgcsv.ts|tcgcsv.ts]]
- [[_COMMUNITY_ranking.ts|ranking.ts]]
- [[_COMMUNITY_web-marketplace-discovery.ts|web-marketplace-discovery.ts]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_24 类 AI 写作痕迹 · 改写目录|24 类 AI 写作痕迹 · 改写目录]]
- [[_COMMUNITY_Architecture and Data Sources|Architecture and Data Sources]]
- [[_COMMUNITY_schemas.ts|schemas.ts]]
- [[_COMMUNITY_cache.ts|cache.ts]]
- [[_COMMUNITY_listing-compare.ts|listing-compare.ts]]
- [[_COMMUNITY_rate-limit.ts|rate-limit.ts]]
- [[_COMMUNITY_pokemon-tcg.ts|pokemon-tcg.ts]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_i18n.tsx|i18n.tsx]]
- [[_COMMUNITY_events.ts|events.ts]]
- [[_COMMUNITY_useT|useT]]
- [[_COMMUNITY_market-agent.ts|market-agent.ts]]
- [[_COMMUNITY_platforms.ts|platforms.ts]]
- [[_COMMUNITY_standard-comparison-flow.ts|standard-comparison-flow.ts]]
- [[_COMMUNITY_ComparisonResult|ComparisonResult]]
- [[_COMMUNITY_TCGpal Agent Guide|TCGpal Agent Guide]]
- [[_COMMUNITY_harness.ts|harness.ts]]
- [[_COMMUNITY_面试 talk track — 国内大厂 AI PM（TCGpal）|面试 talk track — 国内大厂 AI PM（TCGpal）]]
- [[_COMMUNITY_route.ts|route.ts]]
- [[_COMMUNITY_evaluateIdentityFields|evaluateIdentityFields]]
- [[_COMMUNITY_build-optcg-catalog.mjs|build-optcg-catalog.mjs]]
- [[_COMMUNITY_price-charting.ts|price-charting.ts]]
- [[_COMMUNITY_query-parser.ts|query-parser.ts]]
- [[_COMMUNITY_listing-risk.ts|listing-risk.ts]]
- [[_COMMUNITY_events.ts|events.ts]]
- [[_COMMUNITY_japan-references.ts|japan-references.ts]]
- [[_COMMUNITY_config.ts|config.ts]]
- [[_COMMUNITY_standard-comparison-flow.ts|standard-comparison-flow.ts]]
- [[_COMMUNITY_raw-vs-slab.ts|raw-vs-slab.ts]]
- [[_COMMUNITY_TCGpal Ship-Readiness Audit|TCGpal Ship-Readiness Audit]]
- [[_COMMUNITY_us-sales-tax.ts|us-sales-tax.ts]]
- [[_COMMUNITY_ComparisonExperience|ComparisonExperience]]
- [[_COMMUNITY_listing-compare.test.ts|listing-compare.test.ts]]
- [[_COMMUNITY_route.ts|route.ts]]
- [[_COMMUNITY_Texture — subtler tells|Texture — subtler tells]]
- [[_COMMUNITY_TCGpal Competitive Brief — Pricing & Buy-Decision Tools|TCGpal Competitive Brief — Pricing & Buy-Decision Tools]]
- [[_COMMUNITY_Product|Product]]
- [[_COMMUNITY_comparison-form-state.ts|comparison-form-state.ts]]
- [[_COMMUNITY_market-agent.test.ts|market-agent.test.ts]]
- [[_COMMUNITY_assessTitleMatch|assessTitleMatch]]
- [[_COMMUNITY_TCGpal Product Principles|TCGpal Product Principles]]
- [[_COMMUNITY_TCGpal — 5-Session User Test Guide|TCGpal — 5-Session User Test Guide]]
- [[_COMMUNITY_Language & grammar patterns|Language & grammar patterns]]
- [[_COMMUNITY_Global Constraints|Global Constraints]]
- [[_COMMUNITY_readJsonResponse|readJsonResponse]]
- [[_COMMUNITY_check-tavily.mjs|check-tavily.mjs]]
- [[_COMMUNITY_register|register]]
- [[_COMMUNITY_layout.tsx|layout.tsx]]
- [[_COMMUNITY_VerdictMath|VerdictMath]]
- [[_COMMUNITY_CardIdentityCandidate|CardIdentityCandidate]]
- [[_COMMUNITY_schemas.test.ts|schemas.test.ts]]
- [[_COMMUNITY_market-agent.ts|market-agent.ts]]
- [[_COMMUNITY_check-ebay.mjs|check-ebay.mjs]]
- [[_COMMUNITY_fetch-optcg.mjs|fetch-optcg.mjs]]
- [[_COMMUNITY_variant-fidelity.test.ts|variant-fidelity.test.ts]]
- [[_COMMUNITY_instrumentation-client.ts|instrumentation-client.ts]]
- [[_COMMUNITY_harness.ts|harness.ts]]
- [[_COMMUNITY_eslint.config.mjs|eslint.config.mjs]]
- [[_COMMUNITY_next.config.ts|next.config.ts]]
- [[_COMMUNITY_postcss.config.mjs|postcss.config.mjs]]
- [[_COMMUNITY_Filler & hedging|Filler & hedging]]
- [[_COMMUNITY_TCGpal Agent Guide|TCGpal Agent Guide]]
- [[_COMMUNITY_config.ts|config.ts]]

## God Nodes (most connected - your core abstractions)
1. `runListingComparison()` - 41 edges
2. `useT()` - 29 edges
3. `CardIdentityCandidate` - 25 edges
4. `buildRecord()` - 21 edges
5. `normalizeListing()` - 19 edges
6. `getAiConfig()` - 18 edges
7. `logOpsEvent()` - 18 edges
8. `useLang()` - 16 edges
9. `fetchUniversalListing()` - 16 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `main()` --indirect_call--> `card()`  [INFERRED]
  scripts/build-optcg-catalog.mjs → src/lib/external/one-piece-catalog.ts
- `candidatePrints()` --indirect_call--> `card()`  [INFERRED]
  scripts/research-one-piece-exact-prints.mjs → src/lib/external/one-piece-catalog.ts
- `parseCachedValue()` --calls--> `validate()`  [INFERRED]
  src/lib/ops/cache.ts → scripts/research-one-piece-exact-prints.mjs
- `main()` --indirect_call--> `card()`  [INFERRED]
  scripts/research-one-piece-exact-prints.mjs → src/lib/external/one-piece-catalog.ts
- `GET()` --indirect_call--> `card()`  [INFERRED]
  src/app/api/external/one-piece/route.ts → src/lib/external/one-piece-catalog.ts

## Import Cycles
- None detected.

## Communities (78 total, 9 thin omitted)

### Community 0 - "comparison-qa.ts"
Cohesion: 0.11
Nodes (25): GET(), isComparisonAgentEnabled(), AiConfig, getModelForStep(), AiProbeResult, AiProvider, AiProviderResult, anthropicHeaders() (+17 more)

### Community 1 - "provider.ts"
Cohesion: 0.07
Nodes (50): answerComparisonQuestion(), answerWithWebContext(), asksAboutCheapest(), asksAboutRisk(), asksForOutsideContext(), asksForVerificationSources(), asksReportOnlyQuestion(), buildWebContextQuery() (+42 more)

### Community 2 - "one-piece-tcg.ts"
Cohesion: 0.11
Nodes (17): loadSnapshot(), deriveOnePieceCatalogPrintEnrichment(), deriveOnePieceReleaseMetadata(), getOnePiecePrintEnrichment(), MetadataSeed, normalizeCanonicalPrintId(), normalizedSeeds, OnePieceArtworkClass (+9 more)

### Community 3 - "ComparisonApp.tsx"
Cohesion: 0.07
Nodes (31): apiErrorMessage(), ApiResponseError, buildMarqueeItems(), CardMarquee(), conditionInputsLine(), conditions, evidenceInputsLine(), evidenceVerdict() (+23 more)

### Community 4 - "ebay.ts"
Cohesion: 0.08
Nodes (48): ingestSourceListing(), mergeSourceFacts(), assessPrintFidelity(), assessTitleMatch(), buildEbaySearchEndpoint(), buildMatchAspectText(), cheapestUsdShipping(), collectorNumberPattern() (+40 more)

### Community 5 - "universal-listing.ts"
Cohesion: 0.08
Nodes (45): detectMarketplaceFromUrl(), hostMarketplaces, AiExtraction, aiExtractionSchema, buildUniversalListingResult(), clampNullable(), conditionFromSchema(), decodeEntities() (+37 more)

### Community 6 - "tcgcsv.ts"
Cohesion: 0.06
Nodes (52): CacheEntry, CardCrosswalkEntry, crosswalkCache, exactProductIdentityMatches(), normalizeIdentityText(), normalizeRelease(), releaseMatches(), selectExactTcgplayerProduct() (+44 more)

### Community 7 - "ranking.ts"
Cohesion: 0.06
Nodes (49): buyer, makeListing(), demoIdentities, DemoListingSeed, demoListingSeeds, PrintFidelityAssessment, aboveMarketContext(), calculateBaseSellerTrustScore() (+41 more)

### Community 8 - "web-marketplace-discovery.ts"
Cohesion: 0.09
Nodes (38): buildDiscoveryQuery(), cleanText(), daysAgo(), discoverWebMarketplaceLinks(), discoveryNote(), DiscoveryProviderResult, DiscoveryTarget, discoveryTargets (+30 more)

### Community 9 - "dependencies"
Cohesion: 0.05
Nodes (40): dependencies, clsx, next, openai, posthog-js, react, react-dom, react-hook-form (+32 more)

### Community 10 - "24 类 AI 写作痕迹 · 改写目录"
Cohesion: 0.04
Nodes (44): 24 类 AI 写作痕迹 · 改写目录, <a id="10"></a>10. 三段式法则（凡事凑三点）, <a id="11"></a>11. 同义词循环（刻意换词）, <a id="12"></a>12. 虚假范围（"从 X 到 Y"）, <a id="13"></a>13. 破折号滥用, <a id="14"></a>14. 粗体滥用, <a id="15"></a>15. 内联小标题 + 冒号竖列, <a id="16"></a>16. 标题大小写 (+36 more)

### Community 11 - "Architecture and Data Sources"
Cohesion: 0.05
Nodes (41): <a id="10"></a>10. Rule-of-three overuse, <a id="11"></a>11. Elegant variation (synonym cycling), <a id="12"></a>12. False ranges, <a id="13"></a>13. Passive voice & subjectless fragments, <a id="14"></a>14. Em/en dashes — cut them, <a id="15"></a>15. Boldface overuse, <a id="16"></a>16. Inline-header vertical lists, <a id="17"></a>17. Title Case in headings (+33 more)

### Community 12 - "schemas.ts"
Cohesion: 0.06
Nodes (35): buyerContextSchema, CanonicalPrintIdentity, canonicalPrintIdentitySchema, CardHint, cardHintSchema, ComparisonAbstention, comparisonAbstentionSchema, comparisonNarrativeSchema (+27 more)

### Community 13 - "cache.ts"
Cohesion: 0.12
Nodes (19): applyParsedCardQuery(), applyQueryParser(), applyQueryParserWithAi(), hasStructuredQuerySignal(), isSimpleCardNameQuery(), COMMON_ALIAS_HINTS, extractFirst(), GAME_TOKENS (+11 more)

### Community 14 - "listing-compare.ts"
Cohesion: 0.11
Nodes (20): catalogResponse, fetcher, request, clearCrosswalkCache(), clearComparisonCache(), comparisonCacheKey(), getCachedComparison(), isCacheableRequest() (+12 more)

### Community 15 - "rate-limit.ts"
Cohesion: 0.06
Nodes (28): Analytics, API, Architecture and Data Sources, Operations, Security and failure behavior, Source matrix, Validation loop, Core journey (+20 more)

### Community 16 - "pokemon-tcg.ts"
Cohesion: 0.16
Nodes (19): browsePokemonCards(), BrowsePokemonCardsOptions, buildPokemonCardQueries(), buildPokemonCardQuery(), buildSetFilter(), escapeLucenePhrase(), fetchPokemonCards(), GetPokemonCardOptions (+11 more)

### Community 17 - "compilerOptions"
Cohesion: 0.26
Nodes (10): IdentityConfirmation(), applyIdentityFilterChange(), clearIdentityFilters(), computeIdentityFacets(), IdentityFacets, IdentityFilters, printTypeOf(), emptyFilters (+2 more)

### Community 18 - "i18n.tsx"
Cohesion: 0.09
Nodes (21): ComparisonApp(), Header(), MarketFreshness(), ParsedPreview(), PrintIdentitySummary(), ResultsHeader(), Harness(), Dict (+13 more)

### Community 19 - "events.ts"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 20 - "useT"
Cohesion: 0.11
Nodes (23): CardKeyPreview(), CompactCandidateRow(), ComparisonQuestionBox(), ComparisonResult(), DesiredConditionField(), ErrorNotice(), Footer(), formatMoney() (+15 more)

### Community 21 - "market-agent.ts"
Cohesion: 0.14
Nodes (9): consoleSink, OperationalEvent, OperationalEventName, OperationalEventRecord, OperationalEventSink, OpsLevel, opsLoggingEnabled(), OpsProvider (+1 more)

### Community 22 - "platforms.ts"
Cohesion: 0.10
Nodes (26): buildPlatformTools(), runAgentFanout(), sampleSeedsForAllocator(), DEFAULT_AGENTS, ebayPlatformAgent, getConfiguredPlatformAgents(), PlatformAgent, PlatformFanout (+18 more)

### Community 23 - "standard-comparison-flow.ts"
Cohesion: 0.14
Nodes (13): 1. AI 放在哪——核心判断力, 2 分钟版（问题 → 洞察 → 关键决策 → 复盘）, 2. 可信度 / 控幻觉设计, 3. 为什么是 Agent,不是一次 prompt, 4. 效果怎么评估（eval）, 5. 成本取舍 + 自我复盘, AI PM 专属追问——提前备好, Deep-dive 弹药库（5 个 STAR 故事,按 AI PM 重心排序） (+5 more)

### Community 24 - "ComparisonResult"
Cohesion: 0.21
Nodes (22): buildAction(), buildListingCatch(), buildVerdictCopy(), buildWhyNotCheapest(), cheaperTradeoffs(), chineseAlternative(), chineseCatch(), chineseCondition() (+14 more)

### Community 25 - "TCGpal Agent Guide"
Cohesion: 0.14
Nodes (27): applyMarketAnchor(), buildAbstention(), buildMarketReference(), buildNarrative(), buildSoldReference(), CATALOG_RETRY_DELAYS_MS, dedupeSeeds(), extractTcgplayerPricing() (+19 more)

### Community 26 - "harness.ts"
Cohesion: 0.22
Nodes (13): confidenceRank(), dedupeIdentities(), errorMessage(), evaluateIdentity(), evaluateOnePieceMatch(), formatCollectorNumber(), identifyCards(), identifyOnePieceCards() (+5 more)

### Community 27 - "面试 talk track — 国内大厂 AI PM（TCGpal）"
Cohesion: 0.27
Nodes (9): buildJapanReferenceLinks(), buildJapanSearchQuery(), isOnePiece(), JapanReferenceLink, manualNote(), searchUrl(), onePieceCard, pokemonCard (+1 more)

### Community 28 - "route.ts"
Cohesion: 0.15
Nodes (12): 1. Landing: kill the generic, show a concrete example, 2. Results: verdict-first hierarchy, 3. Verdict copy: judgment + the catch + the alternative, 4. Receipt block, 5. Fix the winner image on first paint, Goal: De-generic the UI — plainspoken landing, verdict-first results, Guardrails (non-negotiable), Non-goals (+4 more)

### Community 29 - "evaluateIdentityFields"
Cohesion: 0.13
Nodes (17): resetEbayTokenCacheForTests(), ConditionClaim, TcgGame, assertStandardComparisonFlowPlan(), buildStandardComparisonRequest(), runStandardComparisonFlow(), selectConfirmationId(), STANDARD_COMPARISON_FLOW_CARDS (+9 more)

### Community 30 - "build-optcg-catalog.mjs"
Cohesion: 0.27
Nodes (12): joinTag(), main(), OUT, parseSet(), require, setIdFromNumber(), source, titleCase() (+4 more)

### Community 31 - "price-charting.ts"
Cohesion: 0.18
Nodes (15): CacheBackend, clearLocalCache(), getJsonCache(), getLocalValue(), JsonCacheGetOptions, JsonCacheSetOptions, localCache, LocalEntry (+7 more)

### Community 32 - "query-parser.ts"
Cohesion: 0.11
Nodes (39): aliases(), assertCandidateCoverage(), buildRecord(), candidatePrints(), catalog, CHECKED_AT, chooseProduct(), classifyArtwork() (+31 more)

### Community 33 - "listing-risk.ts"
Cohesion: 0.23
Nodes (11): analyzeListingRisk(), conditionClaims, getConfidence(), getRiskScore(), getSellerQuestions(), getSuitability(), getSummary(), missingPhotoSignals (+3 more)

### Community 34 - "events.ts"
Cohesion: 0.21
Nodes (10): getPriceChartingReference(), normalizeCents(), normalizeProduct(), PriceChartingProduct, priceChartingProductSchema, priceChartingSearchResponseSchema, PriceChartingSearchResult, PriceChartingUnavailableError (+2 more)

### Community 35 - "japan-references.ts"
Cohesion: 0.08
Nodes (19): IconArrowUpRight(), IconCardFan(), IconCardSearch(), IconCaution(), IconCheck(), IconChevronDown(), IconComponent, IconExternal() (+11 more)

### Community 36 - "config.ts"
Cohesion: 0.20
Nodes (9): AI and agent boundary, Council verdict, Distribution, External source notes, Launch gates, Product thesis, Proven, Better, New, TCGpal Ship-Readiness Audit (+1 more)

### Community 37 - "standard-comparison-flow.ts"
Cohesion: 0.24
Nodes (17): canonicalPrintIdentity(), classifyPokemonPrintIdentity(), classifyPrintIdentity(), classifyResearchedOnePiecePrint(), detectResearchedPrintFacet(), explicitPrintSuffix(), isOnePiecePrint(), normalizePhrase() (+9 more)

### Community 38 - "raw-vs-slab.ts"
Cohesion: 0.35
Nodes (9): calculateRawVsSlab(), getBreakEvenPsa10Probability(), getExplanation(), getRecommendation(), money(), netSaleValue(), defaultRawVsSlabInput, RawVsSlabInput (+1 more)

### Community 39 - "TCGpal Ship-Readiness Audit"
Cohesion: 0.22
Nodes (8): Competitor snapshots, Feature comparison, Landscape, Opportunities (gaps to exploit), Positioning, Strategic implications, TCGpal Competitive Brief — Pricing & Buy-Decision Tools, Threats

### Community 40 - "us-sales-tax.ts"
Cohesion: 0.31
Nodes (8): buildRequest(), hasSubstantiveConditionNotes(), nullableInteger(), nullableNumber(), estimateSalesTaxRateFromZip(), STATE_TAX_RATES, stateFromZip(), ZIP_PREFIX_RANGES

### Community 41 - "ComparisonExperience"
Cohesion: 0.29
Nodes (8): ComparisonExperience(), composeCarouselCards(), toRecentCarouselCard(), allowedProperties, initializeAnalytics(), sanitizeAnalyticsProperties(), TcgpalAnalyticsEvent, trackEvent()

### Community 42 - "listing-compare.test.ts"
Cohesion: 0.11
Nodes (17): AgentDecision, AgentMessage, AgentModel, AgentRun, AgentStep, AgentTool, AgentToolCall, AgentToolResult (+9 more)

### Community 43 - "route.ts"
Cohesion: 0.22
Nodes (8): Accessibility & Inclusion, Anti-references, Brand Personality, Design Principles, Product, Product Purpose, Register, Users

### Community 44 - "Texture — subtler tells"
Cohesion: 0.36
Nodes (6): DecisionReceipt(), localizedCaution(), buildReceiptSummaryLine(), formatAsOf(), formatMoney(), ReceiptSummaryInput

### Community 45 - "TCGpal Competitive Brief — Pricing & Buy-Decision Tools"
Cohesion: 0.25
Nodes (7): 1. Proven / Better / New (Mark Pincus), 2. Kill Hope Before Hope Kills You, 3. Instinct (≈95% right) vs Ideas (≈75% wrong), 4. Opinion vs Data — one metric that matters, 5. AI-native now, cross-platform later, Operating summary, TCGpal Product Principles

### Community 46 - "Product"
Cohesion: 0.25
Nodes (7): Global Constraints, Task 1: Deterministic verdict copy, Task 2: Replace the landing methodology grid, Task 3: Reorder results and consolidate the receipt, Task 4: Winner image loading and visual polish, Task 5: Verification, review, and integration, Verdict-First TCGpal UI Implementation Plan

### Community 47 - "comparison-form-state.ts"
Cohesion: 0.14
Nodes (26): GET(), ALLOWED_IMAGE_HOSTS, deriveSetCode(), fetchJson(), fetchLiveAllSetCards(), getOnePieceCard(), GetOnePieceCardOptions, mapOnePieceCardToIdentity() (+18 more)

### Community 48 - "market-agent.test.ts"
Cohesion: 0.25
Nodes (7): Do / don't, Protocol, Read-outs / pivots (pre-committed in `validation-plan.md`), Scaled gate (pass = keep investing), Setup (per session, ~20 min), TCGpal — 5-Session User Test Guide, What to log (drops straight into the tracker)

### Community 49 - "assessTitleMatch"
Cohesion: 0.24
Nodes (10): cleanCardName(), collectorNumberParts(), detectIdentityMismatch(), evaluateIdentityFields(), extractCollectorNumber(), normalizeCollectorSegment(), normalizeWords(), rankLocalIdentities() (+2 more)

### Community 50 - "TCGpal Product Principles"
Cohesion: 0.32
Nodes (13): POST(), POST(), createRequestId(), getOperationalErrorCode(), logOpsEvent(), OpsRoute, sanitizeOptional(), sanitizeToken() (+5 more)

### Community 51 - "TCGpal — 5-Session User Test Guide"
Cohesion: 0.40
Nodes (4): Browse ePID Consensus Fallback, Current eBay Access, eBay ePID Coverage Report, Interpretation

### Community 52 - "Language & grammar patterns"
Cohesion: 0.50
Nodes (3): Procedure, Rules, Status — TCGpal session summary & handoff

### Community 55 - "readJsonResponse"
Cohesion: 0.31
Nodes (7): ComparisonForm, defaultComparisonFormValues, emptyLedgerRow, LedgerRow, LensRole, resetForNewCardSearch(), RankedChoice

### Community 56 - "check-tavily.mjs"
Cohesion: 0.33
Nodes (4): content, env, envText, resultUrl

### Community 58 - "layout.tsx"
Cohesion: 0.33
Nodes (4): fraunces, metadata, notoSerifSC, plexMono

### Community 60 - "CardIdentityCandidate"
Cohesion: 0.19
Nodes (15): clearLocalRateLimitStore(), enforceLocalRateLimit(), enforceRateLimit(), EnforceRateLimitOptions, firstHeader(), getRateLimitIdentity(), getRateLimitRule(), getWindowReset() (+7 more)

### Community 62 - "schemas.test.ts"
Cohesion: 0.19
Nodes (19): AGENT_SYSTEM_PROMPT, AllocatorDialect, createAgentModel(), createChatCompletionsAgentModel(), createOpenAiAgentModel(), createResponsesAgentModel(), fetchWithTimeout(), getAllocatorConfig() (+11 more)

### Community 63 - "market-agent.ts"
Cohesion: 0.14
Nodes (14): gearFivePrints, kidAndKillerPrints, namiPrints, op13LuffyPrints, card(), catalogByNumber, catalogByPrint, curated (+6 more)

### Community 64 - "check-ebay.mjs"
Cohesion: 0.50
Nodes (3): auth, env, envText

### Community 68 - "harness.ts"
Cohesion: 0.40
Nodes (4): Done, Problems / blocked, TCGpal Session Handoff — 2026-07-09, Unfinished — goals + next steps

### Community 75 - "Filler & hedging"
Cohesion: 0.19
Nodes (13): audit, checkOnly, DATASET, OUTPUT, records, auditOnePieceMetadata(), count(), duplicateCounts() (+5 more)

### Community 76 - "TCGpal Agent Guide"
Cohesion: 0.13
Nodes (14): Agent and Rules Boundary, Agent Navigation Interfaces, Analytics Privacy, Architecture, Current Status, Data Boundaries, Engineering Rules, Graphify (+6 more)

### Community 82 - "config.ts"
Cohesion: 0.26
Nodes (11): AiModelRole, AiProviderName, AiReasoningEffort, AiWireApi, getAiConfig(), normalizeAnthropicBaseUrl(), normalizeBaseUrl(), parseBoolean() (+3 more)

## Knowledge Gaps
- **511 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+506 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `card()` connect `market-agent.ts` to `query-parser.ts`, `ComparisonApp.tsx`, `ComparisonExperience`, `comparison-form-state.ts`, `evaluateIdentityFields`, `build-optcg-catalog.mjs`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `CardIdentityCandidate` connect `platforms.ts` to `variant-fidelity.test.ts`, `ComparisonApp.tsx`, `ebay.ts`, `standard-comparison-flow.ts`, `tcgcsv.ts`, `ranking.ts`, `web-marketplace-discovery.ts`, `listing-compare.test.ts`, `schemas.ts`, `comparison-form-state.ts`, `compilerOptions`, `i18n.tsx`, `TCGpal Agent Guide`, `面试 talk track — 国内大厂 AI PM（TCGpal）`, `schemas.test.ts`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `main()` connect `build-optcg-catalog.mjs` to `market-agent.ts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _511 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `comparison-qa.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10634920634920635 - nodes in this community are weakly interconnected._
- **Should `provider.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07058001397624039 - nodes in this community are weakly interconnected._
- **Should `one-piece-tcg.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10666666666666667 - nodes in this community are weakly interconnected._