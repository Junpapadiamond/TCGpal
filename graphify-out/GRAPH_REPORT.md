# Graph Report - TCGpal-tcglens  (2026-07-11)

## Corpus Check
- 128 files · ~297,033 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1320 nodes · 2355 edges · 83 communities (75 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `74323bdf`
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
- [[_COMMUNITY_AI-Writing Patterns · English Catalog|AI-Writing Patterns · English Catalog]]
- [[_COMMUNITY_TCGpal Product Principles|TCGpal Product Principles]]
- [[_COMMUNITY_TCGpal — 5-Session User Test Guide|TCGpal — 5-Session User Test Guide]]
- [[_COMMUNITY_Language & grammar patterns|Language & grammar patterns]]
- [[_COMMUNITY_Global Constraints|Global Constraints]]
- [[_COMMUNITY_Style patterns|Style patterns]]
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
- [[_COMMUNITY_market-agent.test.ts|market-agent.test.ts]]
- [[_COMMUNITY_eslint.config.mjs|eslint.config.mjs]]
- [[_COMMUNITY_next.config.ts|next.config.ts]]
- [[_COMMUNITY_postcss.config.mjs|postcss.config.mjs]]
- [[_COMMUNITY_config.ts|config.ts]]
- [[_COMMUNITY_crosswalk.ts|crosswalk.ts]]
- [[_COMMUNITY_japan-references.ts|japan-references.ts]]
- [[_COMMUNITY_tcgcsv.test.ts|tcgcsv.test.ts]]
- [[_COMMUNITY_resolveTcgplayerProductVariants|resolveTcgplayerProductVariants]]
- [[_COMMUNITY_ComparisonExperience|ComparisonExperience]]

## God Nodes (most connected - your core abstractions)
1. `runListingComparison()` - 38 edges
2. `useT()` - 29 edges
3. `CardIdentityCandidate` - 24 edges
4. `normalizeListing()` - 19 edges
5. `logOpsEvent()` - 16 edges
6. `compilerOptions` - 16 edges
7. `resolveTcgplayerProductVariants()` - 15 edges
8. `fetchUniversalListing()` - 15 edges
9. `TCGpal Agent Guide` - 13 edges
10. `useLang()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `main()` --indirect_call--> `card()`  [INFERRED]
  scripts/build-optcg-catalog.mjs → src/lib/external/one-piece-catalog.ts
- `fetchWithTimeout()` --calls--> `fetcher`  [INFERRED]
  src/lib/external/ebay.ts → src/lib/ai/listing-compare.test.ts
- `tcgcsvFetch()` --calls--> `fetcher`  [INFERRED]
  src/lib/external/tcgcsv.ts → src/lib/ai/listing-compare.test.ts
- `postJsonWithTimeout()` --calls--> `fetcher`  [INFERRED]
  src/lib/external/web-marketplace-discovery.ts → src/lib/ai/listing-compare.test.ts
- `resolveEbayProductForCard()` --indirect_call--> `product()`  [INFERRED]
  src/lib/external/ebay.ts → src/lib/comparison/crosswalk.test.ts

## Import Cycles
- None detected.

## Communities (83 total, 8 thin omitted)

### Community 0 - "comparison-qa.ts"
Cohesion: 0.13
Nodes (25): canonicalHost(), canonicalPath(), canonicalSearch(), cleanText(), contextBlockedDomains, extractTavilyListingPage(), extractTavilyUrl(), isBlockedHost() (+17 more)

### Community 1 - "provider.ts"
Cohesion: 0.11
Nodes (22): AiConfig, getModelForStep(), AiProbeResult, AiProvider, AiProviderResult, anthropicHeaders(), AnthropicMessagesProvider, CompleteJsonInput (+14 more)

### Community 2 - "one-piece-tcg.ts"
Cohesion: 0.09
Nodes (39): GET(), card(), catalogByNumber, catalogByPrint, curated, findOnePieceCatalogCard(), findOnePieceCatalogVariant(), findOnePieceCatalogVariants() (+31 more)

### Community 3 - "ComparisonApp.tsx"
Cohesion: 0.07
Nodes (27): apiErrorMessage(), ApiResponseError, buildMarqueeItems(), buildRequest(), CardMarquee(), ComparisonApp(), conditions, evidenceVerdict() (+19 more)

### Community 4 - "ebay.ts"
Cohesion: 0.09
Nodes (43): VariantIntent, assessTitleMatch(), buildEbaySearchEndpoint(), buildMatchAspectText(), cheapestUsdShipping(), collectorNumberPattern(), EBAY_HOSTS, ebayAmountSchema (+35 more)

### Community 5 - "universal-listing.ts"
Cohesion: 0.08
Nodes (44): fetcher, AiExtraction, aiExtractionSchema, buildUniversalListingResult(), clampNullable(), conditionFromSchema(), decodeEntities(), DeterministicExtraction (+36 more)

### Community 6 - "tcgcsv.ts"
Cohesion: 0.12
Nodes (23): findTcgplayerGroup(), getTcgcsvLastUpdated(), getTcgplayerPrices(), isParallelProduct(), nameOverlap(), normalize(), productNameMatchesCard(), productVariantRank() (+15 more)

### Community 7 - "ranking.ts"
Cohesion: 0.08
Nodes (39): buyer, makeListing(), aboveMarketContext(), calculateBaseSellerTrustScore(), calculateConditionCompatibilityScore(), calculateEvidenceCompletenessScore(), calculatePriceComponent(), calculateSellerSubRatingScore() (+31 more)

### Community 8 - "web-marketplace-discovery.ts"
Cohesion: 0.06
Nodes (53): assessPrintFidelity(), classifyPokemonPrintIdentity(), classifyPrintIdentity(), explicitPrintSuffix(), isOnePiecePrint(), normalizePhrase(), PrintClass, PrintFidelityAssessment (+45 more)

### Community 9 - "dependencies"
Cohesion: 0.05
Nodes (36): dependencies, clsx, next, openai, posthog-js, react, react-dom, react-hook-form (+28 more)

### Community 10 - "24 类 AI 写作痕迹 · 改写目录"
Cohesion: 0.04
Nodes (44): 24 类 AI 写作痕迹 · 改写目录, <a id="10"></a>10. 三段式法则（凡事凑三点）, <a id="11"></a>11. 同义词循环（刻意换词）, <a id="12"></a>12. 虚假范围（"从 X 到 Y"）, <a id="13"></a>13. 破折号滥用, <a id="14"></a>14. 粗体滥用, <a id="15"></a>15. 内联小标题 + 冒号竖列, <a id="16"></a>16. 标题大小写 (+36 more)

### Community 11 - "Architecture and Data Sources"
Cohesion: 0.05
Nodes (41): <a id="10"></a>10. Rule-of-three overuse, <a id="11"></a>11. Elegant variation (synonym cycling), <a id="12"></a>12. False ranges, <a id="13"></a>13. Passive voice & subjectless fragments, <a id="14"></a>14. Em/en dashes — cut them, <a id="15"></a>15. Boldface overuse, <a id="16"></a>16. Inline-header vertical lists, <a id="17"></a>17. Title Case in headings (+33 more)

### Community 12 - "schemas.ts"
Cohesion: 0.06
Nodes (34): buyerContextSchema, CanonicalPrintIdentity, canonicalPrintIdentitySchema, CardHint, cardHintSchema, ComparisonAbstention, comparisonAbstentionSchema, comparisonNarrativeSchema (+26 more)

### Community 13 - "cache.ts"
Cohesion: 0.19
Nodes (14): CacheBackend, clearLocalCache(), getJsonCache(), getLocalValue(), JsonCacheGetOptions, JsonCacheSetOptions, localCache, LocalEntry (+6 more)

### Community 14 - "listing-compare.ts"
Cohesion: 0.24
Nodes (10): applyMarketAnchor(), buildMarketReference(), buildSoldReference(), dedupeSeeds(), formatAnchorDate(), runListingComparison(), resolveCardCrosswalk(), canonicalPrintIdentity() (+2 more)

### Community 15 - "rate-limit.ts"
Cohesion: 0.06
Nodes (28): Analytics, API, Architecture and Data Sources, Operations, Security and failure behavior, Source matrix, Validation loop, Core journey (+20 more)

### Community 16 - "pokemon-tcg.ts"
Cohesion: 0.16
Nodes (20): browsePokemonCards(), BrowsePokemonCardsOptions, buildPokemonCardQueries(), buildPokemonCardQuery(), buildSetFilter(), escapeLucenePhrase(), fetchPokemonCards(), getPokemonCard() (+12 more)

### Community 17 - "compilerOptions"
Cohesion: 0.08
Nodes (3): IconComponent, IconProps, strokeProps

### Community 18 - "i18n.tsx"
Cohesion: 0.13
Nodes (17): DecisionReceipt(), Header(), localizedCaution(), MarketFreshness(), ResultsHeader(), Dict, en, getServerSnapshot() (+9 more)

### Community 19 - "events.ts"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 20 - "useT"
Cohesion: 0.10
Nodes (25): CardKeyPreview(), CompactCandidateRow(), ComparisonQuestionBox(), ComparisonResult(), DesiredConditionField(), ErrorNotice(), Footer(), formatMoney() (+17 more)

### Community 21 - "market-agent.ts"
Cohesion: 0.12
Nodes (31): buildAbstention(), buildNarrative(), CATALOG_RETRY_DELAYS_MS, cleanCardName(), collectorNumberParts(), detectIdentityMismatch(), evaluateIdentity(), evaluateIdentityFields() (+23 more)

### Community 22 - "platforms.ts"
Cohesion: 0.12
Nodes (21): DEFAULT_AGENTS, ebayPlatformAgent, getConfiguredPlatformAgents(), getPlatformAgents(), PlatformAgent, PlatformFanout, PlatformOutcome, PlatformSearchInput (+13 more)

### Community 23 - "standard-comparison-flow.ts"
Cohesion: 0.14
Nodes (13): 1. AI 放在哪——核心判断力, 2 分钟版（问题 → 洞察 → 关键决策 → 复盘）, 2. 可信度 / 控幻觉设计, 3. 为什么是 Agent,不是一次 prompt, 4. 效果怎么评估（eval）, 5. 成本取舍 + 自我复盘, AI PM 专属追问——提前备好, Deep-dive 弹药库（5 个 STAR 故事,按 AI PM 重心排序） (+5 more)

### Community 24 - "ComparisonResult"
Cohesion: 0.21
Nodes (22): buildAction(), buildListingCatch(), buildVerdictCopy(), buildWhyNotCheapest(), cheaperTradeoffs(), chineseAlternative(), chineseCatch(), chineseCondition() (+14 more)

### Community 25 - "TCGpal Agent Guide"
Cohesion: 0.13
Nodes (14): Agent and Rules Boundary, Agent Navigation Interfaces, Analytics Privacy, Architecture, Current Status, Data Boundaries, Engineering Rules, Graphify (+6 more)

### Community 26 - "harness.ts"
Cohesion: 0.18
Nodes (13): COMMON_ALIAS_HINTS, extractFirst(), GAME_TOKENS, LANGUAGE_TOKENS, normalizeWhitespace(), parseCardQuery(), ParsedCardQuery, parsedCardQuerySchema (+5 more)

### Community 27 - "面试 talk track — 国内大厂 AI PM（TCGpal）"
Cohesion: 0.27
Nodes (8): applyIdentityFilterChange(), computeIdentityFacets(), IdentityFacets, IdentityFilters, printTypeOf(), emptyFilters, pool, uniqueSorted()

### Community 28 - "route.ts"
Cohesion: 0.15
Nodes (12): 1. Landing: kill the generic, show a concrete example, 2. Results: verdict-first hierarchy, 3. Verdict copy: judgment + the catch + the alternative, 4. Receipt block, 5. Fix the winner image on first paint, Goal: De-generic the UI — plainspoken landing, verdict-first results, Guardrails (non-negotiable), Non-goals (+4 more)

### Community 29 - "evaluateIdentityFields"
Cohesion: 0.23
Nodes (11): clearLocalRateLimitStore(), assertStandardComparisonFlowPlan(), buildStandardComparisonRequest(), runStandardComparisonFlow(), selectConfirmationId(), STANDARD_COMPARISON_FLOW_CARDS, StandardComparisonEntryMode, StandardComparisonFlowCard (+3 more)

### Community 30 - "build-optcg-catalog.mjs"
Cohesion: 0.27
Nodes (12): joinTag(), main(), OUT, parseSet(), require, setIdFromNumber(), source, titleCase() (+4 more)

### Community 31 - "price-charting.ts"
Cohesion: 0.20
Nodes (14): enforceLocalRateLimit(), enforceRateLimit(), EnforceRateLimitOptions, firstHeader(), getRateLimitIdentity(), getRateLimitRule(), getWindowReset(), LocalRateEntry (+6 more)

### Community 32 - "query-parser.ts"
Cohesion: 0.33
Nodes (10): POST(), POST(), createRequestId(), OpsRoute, rateLimitHeaders(), rateLimitRequest(), captureOperationalException(), isSentryEnabled() (+2 more)

### Community 33 - "listing-risk.ts"
Cohesion: 0.23
Nodes (11): analyzeListingRisk(), conditionClaims, getConfidence(), getRiskScore(), getSellerQuestions(), getSuitability(), getSummary(), missingPhotoSignals (+3 more)

### Community 34 - "events.ts"
Cohesion: 0.23
Nodes (9): normalizeCents(), normalizeProduct(), PriceChartingProduct, priceChartingProductSchema, priceChartingSearchResponseSchema, PriceChartingSearchResult, PriceChartingUnavailableError, SearchPriceChartingOptions (+1 more)

### Community 35 - "japan-references.ts"
Cohesion: 0.20
Nodes (7): groupIdentitiesBySet(), IdentityGroup, demoIdentities, DemoListingSeed, demoListingSeeds, CardIdentityCandidate, ListingSeed

### Community 36 - "config.ts"
Cohesion: 0.20
Nodes (9): AI and agent boundary, Council verdict, Distribution, External source notes, Launch gates, Product thesis, Proven, Better, New, TCGpal Ship-Readiness Audit (+1 more)

### Community 37 - "standard-comparison-flow.ts"
Cohesion: 0.15
Nodes (14): recordCacheBackendFailure(), consoleSink, getOperationalErrorCode(), logOpsEvent(), OperationalEvent, OperationalEventName, OperationalEventRecord, OperationalEventSink (+6 more)

### Community 38 - "raw-vs-slab.ts"
Cohesion: 0.35
Nodes (9): calculateRawVsSlab(), getBreakEvenPsa10Probability(), getExplanation(), getRecommendation(), money(), netSaleValue(), defaultRawVsSlabInput, RawVsSlabInput (+1 more)

### Community 39 - "TCGpal Ship-Readiness Audit"
Cohesion: 0.22
Nodes (8): Competitor snapshots, Feature comparison, Landscape, Opportunities (gaps to exploit), Positioning, Strategic implications, TCGpal Competitive Brief — Pricing & Buy-Decision Tools, Threats

### Community 40 - "us-sales-tax.ts"
Cohesion: 0.60
Nodes (4): estimateSalesTaxRateFromZip(), STATE_TAX_RATES, stateFromZip(), ZIP_PREFIX_RANGES

### Community 41 - "ComparisonExperience"
Cohesion: 0.43
Nodes (5): allowedProperties, initializeAnalytics(), sanitizeAnalyticsProperties(), TcgpalAnalyticsEvent, trackEvent()

### Community 42 - "listing-compare.test.ts"
Cohesion: 0.20
Nodes (12): catalogResponse, request, clearComparisonCache(), comparisonCacheKey(), getCachedComparison(), isCacheableRequest(), setCachedComparison(), pureSearch (+4 more)

### Community 43 - "route.ts"
Cohesion: 0.22
Nodes (8): Accessibility & Inclusion, Anti-references, Brand Personality, Design Principles, Product, Product Purpose, Register, Users

### Community 44 - "Texture — subtler tells"
Cohesion: 0.53
Nodes (4): buildReceiptSummaryLine(), formatAsOf(), formatMoney(), ReceiptSummaryInput

### Community 45 - "TCGpal Competitive Brief — Pricing & Buy-Decision Tools"
Cohesion: 0.25
Nodes (7): 1. Proven / Better / New (Mark Pincus), 2. Kill Hope Before Hope Kills You, 3. Instinct (≈95% right) vs Ideas (≈75% wrong), 4. Opinion vs Data — one metric that matters, 5. AI-native now, cross-platform later, Operating summary, TCGpal Product Principles

### Community 46 - "Product"
Cohesion: 0.25
Nodes (7): Global Constraints, Task 1: Deterministic verdict copy, Task 2: Replace the landing methodology grid, Task 3: Reorder results and consolidate the receipt, Task 4: Winner image loading and visual polish, Task 5: Verification, review, and integration, Verdict-First TCGpal UI Implementation Plan

### Community 47 - "comparison-form-state.ts"
Cohesion: 0.40
Nodes (5): applyParsedCardQuery(), applyQueryParser(), applyQueryParserWithAi(), hasStructuredQuerySignal(), parseCardQueryWithAi()

### Community 48 - "market-agent.test.ts"
Cohesion: 0.25
Nodes (7): Do / don't, Protocol, Read-outs / pivots (pre-committed in `validation-plan.md`), Scaled gate (pass = keep investing), Setup (per session, ~20 min), TCGpal — 5-Session User Test Guide, What to log (drops straight into the tracker)

### Community 49 - "AI-Writing Patterns · English Catalog"
Cohesion: 0.29
Nodes (10): confidenceRank(), dedupeIdentities(), errorMessage(), filterByRequestedVariant(), getPriceChartingReference(), identifyCards(), identifyOnePieceCards(), ingestSourceListing() (+2 more)

### Community 50 - "TCGpal Product Principles"
Cohesion: 0.40
Nodes (4): Done, Problems / blocked, TCGpal Session Handoff — 2026-07-09, Unfinished — goals + next steps

### Community 51 - "TCGpal — 5-Session User Test Guide"
Cohesion: 0.40
Nodes (4): Browse ePID Consensus Fallback, Current eBay Access, eBay ePID Coverage Report, Interpretation

### Community 52 - "Language & grammar patterns"
Cohesion: 0.50
Nodes (3): Procedure, Rules, Status — TCGpal session summary & handoff

### Community 54 - "Style patterns"
Cohesion: 0.40
Nodes (6): conditionInputsLine(), evidenceInputsLine(), riskFormula(), sellerInputsLine(), valueFormula(), VerdictMath()

### Community 55 - "readJsonResponse"
Cohesion: 0.18
Nodes (10): ComparisonForm, defaultComparisonFormValues, emptyLedgerRow, LedgerRow, LensRole, resetForNewCardSearch(), hostMarketplaces, ConditionClaim (+2 more)

### Community 56 - "check-tavily.mjs"
Cohesion: 0.33
Nodes (4): content, env, envText, resultUrl

### Community 58 - "layout.tsx"
Cohesion: 0.33
Nodes (4): fraunces, metadata, notoSerifSC, plexMono

### Community 60 - "CardIdentityCandidate"
Cohesion: 0.14
Nodes (23): answerComparisonQuestion(), answerWithWebContext(), asksAboutCheapest(), asksAboutRisk(), asksForOutsideContext(), asksForVerificationSources(), asksReportOnlyQuestion(), buildWebContextQuery() (+15 more)

### Community 62 - "schemas.test.ts"
Cohesion: 0.33
Nodes (4): comparisonRequestSchema, card, listing, request

### Community 63 - "market-agent.ts"
Cohesion: 0.15
Nodes (21): GET(), AGENT_SYSTEM_PROMPT, AllocatorDialect, buildPlatformTools(), getAllocatorConfig(), isComparisonAgentEnabled(), parseArgs(), parseFallbackModels() (+13 more)

### Community 64 - "check-ebay.mjs"
Cohesion: 0.50
Nodes (3): auth, env, envText

### Community 66 - "variant-fidelity.test.ts"
Cohesion: 0.12
Nodes (12): clearCrosswalkCache(), altPrint, basePrint, emptySourceListing, MIXED_TITLES, prints, spPrint, resetEbayTokenCacheForTests() (+4 more)

### Community 68 - "harness.ts"
Cohesion: 0.18
Nodes (12): AgentDecision, AgentMessage, AgentModel, AgentRun, AgentStep, AgentTool, AgentToolCall, AgentToolResult (+4 more)

### Community 69 - "market-agent.test.ts"
Cohesion: 0.16
Nodes (11): AllocatorConfig, createAgentModel(), createChatCompletionsAgentModel(), createOpenAiAgentModel(), createResponsesAgentModel(), fetchWithTimeout(), buyer, card (+3 more)

### Community 75 - "config.ts"
Cohesion: 0.26
Nodes (11): AiModelRole, AiProviderName, AiReasoningEffort, AiWireApi, getAiConfig(), normalizeAnthropicBaseUrl(), normalizeBaseUrl(), parseBoolean() (+3 more)

### Community 76 - "crosswalk.ts"
Cohesion: 0.23
Nodes (10): CacheEntry, CardCrosswalkEntry, crosswalkCache, normalizeRelease(), releaseMatches(), selectExactTcgplayerProduct(), p2, p4 (+2 more)

### Community 79 - "japan-references.ts"
Cohesion: 0.27
Nodes (9): buildJapanReferenceLinks(), buildJapanSearchQuery(), isOnePiece(), JapanReferenceLink, manualNote(), searchUrl(), onePieceCard, pokemonCard (+1 more)

### Community 80 - "tcgcsv.test.ts"
Cohesion: 0.18
Nodes (8): card, groupsPayload, onePieceCard, onePieceGroupsPayload, onePiecePricesPayload, onePieceProductsPayload, pricesPayload, productsPayload

### Community 81 - "resolveTcgplayerProductVariants"
Cohesion: 0.32
Nodes (8): product(), collectorNumberKey(), collectorPrefixKey(), inferTcgplayerCategoryId(), resolveTcgplayerProduct(), resolveTcgplayerProductVariants(), stripLeadingZeros(), toProductMatch()

### Community 82 - "ComparisonExperience"
Cohesion: 0.33
Nodes (6): ComparisonExperience(), composeCarouselCards(), isRecentCarouselCard(), readRecentCarouselCards(), safeCarouselImageUrl(), toRecentCarouselCard()

## Knowledge Gaps
- **487 isolated node(s):** `This is NOT the Next.js you know`, `Product`, `Current Status`, `Product Guardrails`, `Data Boundaries` (+482 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CardIdentityCandidate` connect `japan-references.ts` to `one-piece-tcg.ts`, `ComparisonApp.tsx`, `ebay.ts`, `market-agent.test.ts`, `tcgcsv.ts`, `ranking.ts`, `web-marketplace-discovery.ts`, `crosswalk.ts`, `schemas.ts`, `japan-references.ts`, `tcgcsv.test.ts`, `market-agent.ts`, `platforms.ts`, `面试 talk track — 国内大厂 AI PM（TCGpal）`, `market-agent.ts`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `Marketplace` connect `readJsonResponse` to `ComparisonApp.tsx`, `market-agent.test.ts`, `universal-listing.ts`, `ranking.ts`, `web-marketplace-discovery.ts`, `standard-comparison-flow.ts`, `schemas.ts`, `i18n.tsx`, `platforms.ts`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `AiConfig` connect `provider.ts` to `config.ts`, `market-agent.test.ts`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `This is NOT the Next.js you know`, `Product`, `Current Status` to the rest of the system?**
  _487 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `comparison-qa.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1282051282051282 - nodes in this community are weakly interconnected._
- **Should `provider.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11088709677419355 - nodes in this community are weakly interconnected._
- **Should `one-piece-tcg.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._