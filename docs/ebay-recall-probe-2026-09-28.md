# Bounded eBay recall check

## Decision and falsifiable test

The useful instinct is to make missing supply observable. The mechanism is one independent price-sorted Browse sample, not a promise to retrieve every listing. Its strongest case is a cheap, attributable incremental discovery. Serious objections: the first ten cheapest results can be dominated by excluded novelty products; search summaries often lack condition or shipping evidence; comparing against Best Value would mislabel an intentional tradeoff as a recall miss. Passing automated gates is not human confirmation of artwork or availability.

Observed before this change: the primary ladder already prefers a resolved ePID; both canonical `232/91` and seller-style `232/091` have been searched since `8902924`. Catalog access and usable ePID coverage are not established by that code. The historical July Catalog smoke reported HTTP 403; its Browse-consensus description is historical, not the current resolver. No local eBay credentials were available for this change. ePID association is not proof of exhaustive inventory.

Decision: retain the existing primary search and lens winners, publish the bounded check in both live and shared receipts. Owner: Codex implementation/measurement; founder adjudicates hits. Review: 2026-10-05. Initial test: 20 fixed cards, using each report's original pipeline and separately observed probe. Continue evaluation if at least one new gate-passing cheaper result is human-confirmed. Stop this version after 50 conclusive samples with no confirmed gain. Failures, disabled probes and unresolved evidence are separate strata, never successful negative samples; an unusably high inconclusive rate is itself a reason to stop/revise. This measures incremental yield, not population recall or a random sample of buyer demand.

## Acquisition and interpretation

- Only the existing official eBay Browse adapter fetches data. After a successful primary search, one `sort=price`, `limit=10` request reuses the latest successful contributing query (the padded form when it contributed rows; ePID when that was the successful lane). If every successful query was empty, use the last successful query. Primary Best Match queries and filters are unchanged.
- One request, no pagination, no item details and no 401 retry. A two-second timer includes token wait, request and response-body parsing. It cannot fail the completed primary search. OAuth acquisition, if necessary, is separate from the Browse-call cap.
- API summaries are validated, capped, restricted to USD and deduplicated by eBay item ID. Existing IDs never count as new discoveries. Query counts reflect each executed primary rung before identity filtering, with separate USD counts; they are not coverage percentages.
- The same confirmed card, final market anchor, buyer context, exact-print/novelty/condition/fee/price-review gates and deterministic ranker assess the new rows. Compare complete **pre-tax** costs against the original Cheapest lens, not Best Value. Equal prices do not trigger a cheaper alert. An abstaining baseline produces `additional_match`, not `cheaper_found`.
- Unknown evidence produces `inconclusive`; exhausted/blocked/invalid/timeout requests produce `failed`. `no_cheaper_found` describes only this small sample. Summary-only checks cannot discover facts requiring item details, and cannot detect every miss.
- Probe rows remain outside the recommendation candidate set. A qualifying additional result is inspectable from the receipt with its observation time, exact source URL and cost breakdown. Up to three excluded probe rows are ordered by item price (unknown charges never become zero). The original receipt also shows its three lowest item-price exclusions.
- `EBAY_RECALL_PROBE_ENABLED=false` stops new probes and changes the live-report cache key. Existing immutable snapshots keep their original observations. No query, URL, title, ZIP, seller or image is sent to analytics. Pasted-listing logging is deferred.

## Verification and rollout

TDD covers new-ID detection, shipping-inclusive comparisons, ties, unknown condition/shipping/fees, product/print/price exclusions, an abstaining baseline, disabled probes, request counts, capped duplicate/non-USD results, response-body deadlines and primary-result preservation. Integration checks preserve lens winners and snapshot privacy. Browser QA uses explicitly synthetic marketplace fixtures through the existing local harness; it does not establish live recall improvement.

Release verification and actual production observations are recorded below after deployment. Graphify CLI is unavailable on this Windows host; the existing AST graph was used for navigation, but regeneration is not claimed.

Run `node scripts/measure-recall-probe.mjs` for the fixed 20-card readout (Bubble Mew, nine Pokémon and ten One Piece cases from the existing stress set). `LIMIT=1` provides the bounded smoke. Requests are paced at least 31 seconds apart, never retried automatically; unresolved identity and request failures stay separate. Minimal observations go to ignored `output/recall-probe/`. A found URL is an adjudication queue entry, not a claim of human validation.

The release is based on `origin/main` (`af3c14a`), without the separate unmerged natural-language-search changes. Lint, typecheck, metadata audit, build and plugin validation passed; 1,599 tests passed and five optional live tests were skipped. Built-in browser QA exercised Mew ex 232/091, Charizard 4/102, Pikachu 58/102, Luffy ST01-001 and Nami OP01-016 in one session, including Edit, New search and Nami base-art confirmation. The two One Piece fixture titles omit the character name and correctly retain `inspect_first`; they are not asserted as successful inventory acquisition. English/中文 desktop and 390px mobile screenshots are in the September 28 Codex visualization folder under `recall-probe/`.

`104006f` deployed READY as `dpl_EHzaiLbeX9fMZY1Ho8n7wfaJ5bE9`, aliased to [lenstcg.com](https://lenstcg.com). Live Bubble Mew returned 50 canonical + 50 padded summaries, 98 unique primary candidates and 15 eligible rows. The probe found 10 new IDs and zero comparable rows; its three lowest item-price exclusions named FAN ART ($2.79, $2.79 and $3.99). These facts support bounded operation and visible exclusions, not improved recall. The production browser error console and scoped error/fatal log scan were empty. Chinese live QA exposed one untranslated language-review reason; the copy follow-up translates it and passed the same full gate.

`810d4de` deployed READY as `dpl_9aFgYVD91TsHaCHiJUNoRAg2sNoW`, aliased to lenstcg.com. The corrected Chinese reason was verified live. English/中文 desktop and 390px mobile views also reproduced the Luffy cheaper-match receipt; mobile had no horizontal overflow and the browser error console was empty. The scoped error/fatal runtime scan was empty. Whatnot still reports its existing exhausted allowance; Mercari remains a manual check. No pilot quota or provider activation changed.

## Fixed 20-card production readout

Run: 2026-09-28 06:26:05–06:37:09 UTC, ten Pokémon and ten One Piece cards. All twenty produced a probe observation: 200 summaries, 156 new IDs relative to their own primary candidate sets, nine comparable new rows and eight rows with unresolved evidence. There were no failed/disabled probes or unresolved card selections. Report-level status was 17 complete / 3 partial; report status is distinct from probe status.

| Probe result | Cards | Interpretation |
| --- | ---: | --- |
| `cheaper_found` | 3 | Rule-passing discoveries; all await founder adjudication. |
| `inconclusive` | 4 | Missing evidence prevents a negative conclusion. |
| `no_cheaper_found` | 13 | Twelve had an original complete-cost Cheapest baseline. Ace OP02-013 alt had none and does not count toward the negative kill denominator. |

The ten Pokémon samples all returned `no_cheaper_found`. All three cheaper discoveries were One Piece base prints. Every probe used keywords (Mew used its padded rung); this run establishes no ePID coverage. Keep this bounded version under evaluation, with zero human-confirmed gains so far. Neither the human-confirmed success criterion nor the 50-conclusive-sample kill criterion has been reached. Counts are incremental discoveries within this fixed stress set, not a population recall rate.

| Human review queue | Observed UTC | Original cheapest, pre-tax | Probe, pre-tax | Difference | Review |
| --- | --- | ---: | ---: | ---: | --- |
| [Luffy OP05-119 base](https://www.ebay.com/itm/198615396354) | 06:33:18 | $38.98 | $5.02 | $33.96 | Pending |
| [Law OP05-069 base](https://www.ebay.com/itm/198615397819) | 06:35:30 | $1.75 | $1.73 | $0.02 | Pending |
| [Shanks OP09-001 base](https://www.ebay.com/itm/257717391009) | 06:36:03 | $1.59 | $0.99 | $0.60 | Pending |

The API reported NM claims and zero shipping/mandatory fees for these three summaries. The deterministic print state was `compatible`; physical artwork, language, current availability and checkout have not been independently human-verified. A separate browser run of the live app reproduced the same Luffy URL and $5.02 versus $38.98 at 06:35:31 UTC; the original recommendation remained unchanged. No marketplace page was fetched for this review. The two-cent Law result meets the literal cheaper criterion but does not establish material buyer benefit.

Minimal raw observations remain in ignored `output/recall-probe/latest.json`. Screenshots are in `C:/Users/徐晨濬/.codex/visualizations/2026/09/28/01a0e69e-7cdb-7182-ab38-0757e71061e3/recall-probe/` (`production-hit-en-desktop.png`, `production-hit-zh-desktop.png`, `production-hit-zh-mobile.png`). The temporary fixture proxy was stopped; the pre-existing development server on port 3000 was retained. No scheduled evaluation or ongoing harvesting was created.
