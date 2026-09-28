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
