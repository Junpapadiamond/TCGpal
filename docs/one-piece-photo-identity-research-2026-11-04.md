# One Piece photo identity: bounded research proposal

Status: research harness prepared and tested offline. One founder-triggered live Ace pair was attempted using two explicit public images and the existing model route, with a 1,500 output-token limit. The response arrived within the deadline but failed strict JSON parsing. Its reservation remains consumed; there was no retry or production promotion. This is not an accuracy result.

## Observed gap

The November 4 task reproduced failures that text rules can repair: release-query parsing, generic promotion-category conflicts, different One Piece number prefixes and multi-copy lots. A further live winner is outside that repair:

- Confirmed print: `OP07-119_p1`, Portgas.D.Ace, official reference [OP07-119 alternate artwork](https://en.onepiece-cardgame.com/images/cardlist/card/OP07-119_p1.png). The bundled catalog records printed cost 10 and power 10000.
- [Listing 158307192401](https://www.ebay.com/itm/158307192401) names OP07-119 and the corresponding release; its item specifics also claim cost 10 and power 10000.
- The parent Codex agent's interactive browser observation at approximately **2026-11-05 01:21 UTC** shows a different illustration and printed cost **5**, power **6000**. The precise printed collector number still needs independent transcription. No seller identifier or page capture is committed here.
- The observed primary image is [the seller's eBay CDN image](https://i.ebayimg.com/images/g/SMUAAeSwEu1qrbFd/s-l500.webp). This was observed in the rendered page, not discovered through a new crawl.

This is a contradiction between seller photo and seller text. Increasing title similarity, trusting item specifics, filtering by card number or changing market-price thresholds cannot reliably resolve it. A successful API response or `best_buy` outcome is not exact-artwork accuracy. Historical Pokémon recall also does not establish an artwork-accuracy benchmark; see `PROGRESS.md`, WS-IDENTITY and OPEN/UNVERIFIED.

## Decision and challenge

The underlying goal is to stop presenting a different pictured card as the selected print. The strongest case for image inspection is that it can observe the only evidence contradicting this listing's otherwise consistent text.

Serious objections:

1. Small printed numbers, glare, sleeves, multiple cards and ambiguous foil treatments can produce false visual or OCR disagreements. A model's confidence is not calibrated proof. Wrong rejection can remove the best legitimate offer.
2. A new image/model step introduces privacy, source-rights, latency and operating-cost obligations. Existing provider configuration does not prove a known price or permission to process seller images. An unbounded image call would undermine the deterministic fallback.
3. Matching artwork still cannot prove that the physical item is genuine, that the picture is item-specific, or that a same-artwork reprint has the required finish/stamp. It must never establish grade, condition or authenticity.

Decision: evaluate a **negative contradiction check** separately before considering any production change. Do not add listing-ID blacklists, weaken print rules, substitute cheaper siblings, or turn all One Piece results into blanket abstentions. No model result may promote eligibility. Current text fixes can ship independently, with the residual photo problem stated honestly.

Owner: Codex implements and records evidence; founder reviews source-boundary/spending decisions and promotion. Review date: **November 5, 2026**, or immediately after the first approved experiment if later.

## Smallest falsifiable test

Prepared ignored manifest: `output/accuracy-eval/frontier-research/one-piece-photo-identity/proposed-cohort.json`.

It contains the Ace failure and two Gift Collection Chopper offers from the frozen user report, each paired with the selected official reference. Chopper rows are candidate controls, **not human-adjudicated positive labels**. Review their actual photographs before scoring them as correct. No target labels, titles, prices, seller identifiers, listing URLs or expected card text go into the model prompt. The model receives opaque pair numbers and the two images per pair, reducing title/answer anchoring.

Bounds:

- One founder-triggered invocation; three prepared pairs / six explicit images. Hard limit five pairs / ten images.
- Images only from exact allowlisted eBay CDN paths and official One Piece reference paths; reference filename must match the selected print ID. HTTPS, no credentials/query strings, no redirects, no HTML, no discovery, no gallery traversal.
- At most 2 MiB per image, MIME/signature checks, eight-second total image deadline. Image bytes remain in memory and are not written to disk.
- Exactly one existing Anthropic-route request, no credential/provider/model fallback, 20-second model deadline, at most 1500 output tokens, 256 KiB response limit, no automatic retry.
- A permanent atomic local reservation per frozen manifest prevents a repeated command from making a second model request, including after a lost/ambiguous response. No application or Apify counter is touched.
- This is a token/request bound, **not a verified dollar ceiling**. Configured gateway pricing and approval must be established before execution. No tariff is inferred from an upstream model name.

First-test success: the Ace pair yields a corroborated printed-value conflict; reviewed matching controls have no false conflict; unreadable fields stay null; response validation, no-retry behavior and all bounds hold. Kill this candidate mechanism if it misses the known contradiction, rejects a matching control, fabricates legible values, fails the deadline, requires a provider change or exceeds the approved spend. A successful three-pair pilot is only evidence to run a larger evaluation.

## Harness behavior

`scripts/frontier-research/one-piece-photo-identity/client.mjs` independently requests printed collector number, cost and power from seller and reference images, plus a cautious artwork relation. It does not ask for condition, grade, authenticity, eligibility or a recommendation. The request follows the documented [Anthropic image content-block format](https://platform.claude.com/docs/en/build-with-claude/vision); compatibility of the configured gateway remains untested.

Deterministic assessment retains these separate states:

| State | Meaning |
|---|---|
| `candidate_conflict` | At least two high-confidence printed-value discrepancies; reference reads agree with catalog values. Research rejection candidate only. |
| `needs_visual_review` | Different illustration reported, but no corroborated printed-value discrepancy. Not an automatic veto. |
| `invalid_reference_read` | Model reading of the reference conflicts with catalog metadata. Do not blame the seller listing. |
| `unverified` | Missing, low-confidence or insufficient evidence. |
| `no_conflict_observed` | Readable values/artwork did not reveal a contradiction. **Not proof of exact print, authenticity, condition or eligibility.** |

Every result remains `frontier-research`, `productionReady:false`, `verifiedForRanking:false`. Output records URLs, original observation time/precision, expected values, separate transcriptions, confidence and assessment reason. No raw captures, credentials, prices, seller identifiers or model prompts enter committed artifacts.

Offline preflight (no network or model access):

```powershell
node scripts/frontier-research/one-piece-photo-identity/run.mjs --manifest=output/accuracy-eval/frontier-research/one-piece-photo-identity/proposed-cohort.json
```

The runner only executes with `--execute` plus an explicit `PHOTO_IDENTITY_RESEARCH_APPROVAL` identifier and the existing Anthropic environment configuration. Set that identifier only for an actually approved experiment; it is a record, not a replacement for approval. Use the existing approved environment-loading mechanism; never paste credentials into commands or committed files.

## Production promotion remains closed

Before considering a bounded negative-only production adapter, evaluate an independently reviewed held-out cohort including different-number mislabels, same-number alternate artworks, identical-artwork reprints, stamps, glare, low resolution, card backs, cropped cards and non-card products. Include both games as controls. Pre-register zero false conflicts on reviewed matching controls, detection of every clear different-number contradiction in that cohort, useful coverage, and a measured latency/cost budget. Unclear rows count as unverified rather than successes.

Then complete the source-rights/platform-policy/privacy review for sending public seller/reference images to the configured processor, define failure behavior, enforce durable spend/request limits, add provenance-bearing Zod contracts and deterministic negative gates, and update AGENTS.md explicitly. Photo analysis must remain separate from seller claims and cannot silently override ranking math. Until all promotion gates pass, the harness is not imported by any production module.

## Verification

TDD red: module missing before implementation. Green: nine focused tests cover wrong-number/stat contradictions, no positive promotion, uncertain/single-field conflicts, bad reference reads, input/host/batch limits, blinded prompts, request counts, image failures, and mismatched model pair IDs. Focused ESLint passes. Offline preflight validates three pairs, six image requests maximum and one model call maximum; only the smaller one-pair pilot was executed. The runner did not persist the malformed model text or token counters on that failure path, so actual token cost and the precise format defect cannot be established retrospectively. Live precision, false rejection rate and reliable model compatibility remain **unmeasured**. The runtime text repairs do not solve this residual photo contradiction.
