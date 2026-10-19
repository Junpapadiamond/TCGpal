# Gateway and Mercari recovery — October 19, 2026

## Decision and bounds

The founder requested investigation of Intenext and restoration of Mercari via the already implemented Apify adapter. They explicitly approved ten new Mercari starts, $0.50 maximum total, expiring October 22 at 00:00 UTC. One Console verification counts within those ten, leaving at most nine application starts. No new account credentials from chat were stored. Existing authorized credentials and quota safeguards remain in place.

The benefit is a reusable provider path for the missing marketplace. Two serious objections remain: acquisition success does not prove exact-print accuracy, and missing checkout charges prevent complete-cost comparisons. The smallest test was one Giratina V 186/196 search, three results, 90 seconds, 2 GB, $0.05 cap. Success required active raw USD offers with canonical URLs accepted by the existing parser; kill on no useful results, access restriction, invalid money mapping, or exhausted budget. Codex owns implementation and evidence; founder owns spending authorization. Review date: October 19; automatic expiry: October 22.

## Observed Mercari evidence

- [Console run](https://console.apify.com/actors/gmvBZggymwn3svUtH/runs/AlqPoYEv3ezcdfuSD): succeeded in 33 seconds, three records, displayed cost $0.048. Build 0.3.3 was the current latest build at acquisition.
- [Official Actor metadata](https://api.apify.com/v2/acts/getascraper~mercari-us-scraper) lists the current free-tier tariff: $0.04/search, $0.00275/listing and $0.00005/GB-start. Three records / 2 GB imply $0.04835, below $0.05. An empty search is **not free** under the current tariff, despite older Store copy.
- Actual parser replay: a $500 explicitly Lightly Played English alternate-art listing had compatible print evidence but fails an NM request and has unknown shipping/fees; a $1,250 row lacks explicit print/condition evidence; a $9.99 custom card is excluded. All three fail complete-cost eligibility. This demonstrates acquisition and preserved guards, not high search precision or a new winner.
- Provider records include no shipping fields. Generic `like_new` remains Unknown card condition. No seller identifiers or raw captures are committed. Minimal ignored evidence: `output/accuracy-eval/mercari-live-20261019.json`.
- Renewal uses `tcglens:apify-pilot:2026-10-19:mercari-reserved-runs` alongside the original lifetime key. A single atomic operation checks expiry and both ledgers before incrementing both; rejection does not increment. Ambiguous reservations are never refunded.

## Observed gateway evidence

- Production GPT routes failed with HTTP 500 `do_request_failed`; allocator routes also returned 503. Intenext's own Playground reproduced an upstream request failure on its OpenAI-GPT group, independent of TCGlens.
- The local existing Intenext token belongs to the Claude group. Sending GPT requests with it returns `model_not_found`; account balance alone does not grant another group's model routes. The account's GPT official-key group showed no selectable models at inspection.
- Dated Sonnet/Haiku routes and Opus 5.5 returned 502. Opus 5 returned empty text previously. Haiku's undated route works but the founder explicitly rejected using Haiku. Sonnet 5 introduced unrelated identity text in a minimal request and was not selected.
- `claude-opus-4-8` returned a valid structured missing-cost explanation in 13.9 seconds and answered a real Whatnot target question in 18.7 seconds. It correctly called $725 item-only, retained unknown charges, and contrasted the eligible $859.72 eBay total. Model names are gateway-provided identifiers; this test does not independently attest to upstream model identity.
- Buyer-triggered Q&A receives a 30-second header timeout; comparison enrichment retains its 12-second default. Incomplete checkout subtotals are redacted from AI comparable-total fields. Prompt instructions distinguish unknown seller data, losing a lens, and actual exclusion. Ranking math is unchanged.

## Release evidence

- Code `891e22f` passed lint, typecheck, metadata validation, 1,875 tests (five skipped), and production webpack build. Graphify executable is unavailable in this Windows checkout, so graph regeneration could not run; source relationships were inspected directly.
- First READY deployment `dpl_3qt6YuMA4cbUN1dQjnu7obryQSHR` established that the pre-existing production Anthropic credential was invalid (`fallbackReason=authentication`). The already configured local Intenext credential passed Bearer authentication and was securely copied to the existing production Secret without printing its value. No credentials pasted into chat were used.
- Credential redeployment `dpl_A9woLdk4wMyLfMt4ATdDnXXsQhbx` reached READY with `lenstcg.com`. Deployed real-report Q&A returned `usedAi=true`, `model=claude-opus-4-8`, HTTP 200 in 17.9 seconds, correctly distinguishing item price from incomplete totals. This proves the explanation provider; the independently configured optional GPT search allocator was not migrated.
- A real built-in-browser cross-market Giratina search displayed eBay 50 / Whatnot 2 / Mercari 3 / Stomping Grounds 3. Mercari displayed two review offers, excluding the custom-card row; shipping/fees remain unknown. One application reservation was consumed in addition to the Console run: at most eight approved starts remain absent other traffic. Receipt: `ee57e868c20a483585e6c0856d50b146`.
- Follow-up: the deterministic missing-cost fallback also mislabeled an item price as comparable cost. English/Chinese regression cases now require item-only wording; fixed without changing ranking. Updated full suite: 1,877 passed / five skipped, lint/typecheck and production build green. Follow-up deployment pending.
