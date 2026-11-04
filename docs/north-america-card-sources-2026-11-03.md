# Mercari reliability and North American source review

Reviewed November 3, 2026 (public metadata fetched November 4 UTC). This is source research, not an activation or a claim of verified inventory. No new Actor was started, no paid trial was purchased, and no quota, credential or provider configuration changed.

## Mercari: two separate blockers

1. The existing acquisition path is slow and intermittent. The November 2 run took 56,748 ms; its Actor spent approximately 29 seconds in navigation with two HTTP 403 retries, then 20 seconds waiting on fallback/scroll behavior. Historical successful starts took 18–56 seconds; some failed after 90 seconds or returned no rows. These are observed prior runs, not a new benchmark. [Run and timing evidence](cross-market-latency-2026-11-02.md).
2. Recent application requests stopped at the pilot allowance gate. Current Production metadata still sets Mercari to Apify, enables the previously approved proxy, and permits nine application starts. The no-expiry flag removes only the date restriction. The previous Console audit saw one manual plus nine API starts; this review did not read or alter the private Redis counter. Existing evidence supports allowance exhaustion, not a new successful Mercari fetch.

The current public Actor is build 0.3.4, while production deliberately pins tested build 0.3.3. No verified changelog or measurement establishes that upgrading fixes latency. Moving the app server cannot eliminate an upstream Actor's navigation waits. Shortening its timeout alone would trade slow results for more failures.

## Repairs within existing authorization

Code inspection found account-level maximum-charge reservations occurred before the application pilot check. A known-exhausted pilot could therefore create unnecessary internal account reservations without starting an Actor. A read-only pilot precheck now runs after the result cache and before pricing/account selection. The original atomic reservation still runs immediately before acquisition; concurrent callers cannot use a precheck as permission to spend. A race can still conservatively retain an account reservation if another request consumes the final pilot start. No previous reservation is refunded or reset.

The buyer-facing status distinguishes a known pause from a temporary provider failure: `Search paused` / `查询已暂停`, retaining the manual search link and technical details. This repairs misleading status and wasted internal reservations; it does **not** restore Mercari acquisition or prove faster live search.

## Source shortlist

These priorities concern TCGlens's U.S. raw-single comparison use case, not measured marketplace popularity.

| Source | Available integration | Fit and next decision |
| --- | --- | --- |
| TCGplayer | [SolidCode Actor](https://apify.com/solidcode/tcgplayer-scraper), [Crawloop seller-listing Actor](https://apify.com/crawloop/tcgplayer-listings-scraper) | First research priority: concrete seller offers with condition/printing and reported shipping. Keep separate from the existing aggregate TCGCSV anchor. TCGplayer's [official onboarding](https://docs.tcgplayer.com/docs/getting-started) says new API access is not currently granted. |
| CardTrader | [Official marketplace product API](https://www.cardtrader.com/en-US/docs/api/full/reference?embedded=true) | Prefer its documented `GET /marketplace/products?blueprint_id=...` over an unofficial scraper. Needs a separately authorized token, exact blueprint mapping, currency/delivery checks and output-use review. No current integration is claimed. |
| Mercari US | Existing GetAScraper; [Automation Craft alternative](https://apify.com/automation_craft/mercari-us-scraper); [Jongoose alternative](https://apify.com/jongoose/mercari-scraper) | Automation Craft claims no browser and offers explicit search/status fields; worth a bounded research test. Jongoose documents anonymous GraphQL and omits seller names on search rows; author recommends changing proxy IPs on blocks, which this project must not follow. Neither alternative is verified here. |
| Fanatics Collect | [Crawloop Actor](https://apify.com/crawloop/fanatics-collect-scraper) | Auction/Buy Now lots, grade and certification fields. Lower priority for the current raw-single flow; bids and sold prices must not become active fixed-price offers. |
| Facebook Marketplace | [Apify-maintained Actor](https://apify.com/apify/facebook-marketplace-scraper) | Useful local discovery candidate, with location and asking-price data. Exact print, shipping, availability and seller evidence need separate validation. Keep outside production ranking. |
| COMC | [Official supported-card guide](https://comc.zendesk.com/hc/en-us/articles/41833238092699-COMC-Supported-Trading-Cards) | Specialist card-market research candidate. This review found no dedicated Actor it could verify; do not imply none exists. |
| Canadian merchants, e.g. 401 Games | [Official One Piece singles catalog](https://store.401games.ca/collections/one-piece-singles) | Merchant catalogs may add useful stock. Currency, U.S. delivery and merchant permission must be checked; do not silently compare CAD to USD. No verified dedicated Actor is proposed. |
| eBay / Whatnot / Stomping Grounds | Existing bounded adapters | Retain official eBay Browse and the merchant-owned catalog interface. An extra scraper would not itself improve these sources. |

## Current Actor metadata and actual billing units

Read-only public Apify API metadata is more current than some indexed Store pages. The following are FREE-tier event prices at observation time, not Store headline minimums. Startup is per GB (minimum one); proxy/other plan charges and future changes must still pass a preflight. Successful job counts do not prove correct rows, low latency or marketplace permission.

| Actor / current public build | Event charges in USD | Public 30-day runs |
| --- | --- | --- |
| [getascraper/mercari-us-scraper](https://api.apify.com/v2/acts/getascraper~mercari-us-scraper) / 0.3.4 | $0.04/search + $0.00275/listing + $0.00005/start-GB; three rows at 2 GB = $0.04835 | 178 succeeded / 182 total |
| [automation_craft/mercari-us-scraper](https://api.apify.com/v2/acts/automation_craft~mercari-us-scraper) / 0.1.14 | $0.006/start-GB + $0.00133/listing + $0.0006/results-page; optional details add $0.0014/listing | 271 / 271; only four monthly users |
| [jongoose/mercari-scraper](https://api.apify.com/v2/acts/jongoose~mercari-scraper) / 0.1.3 | $0.00005/start-GB + $0.001/result | 287 / 303 |
| [solidcode/tcgplayer-scraper](https://api.apify.com/v2/acts/solidcode~tcgplayer-scraper) / 1.0.13 | $0.00005/start-GB + $0.00355/product result; seller offers nested within product | 2,134 / 2,145 |
| [crawloop/tcgplayer-listings-scraper](https://api.apify.com/v2/acts/crawloop~tcgplayer-listings-scraper) / 1.0.4 | $0.00005/start-GB + $0.00279/seller listing | 220 / 222; one monthly user |
| [crawloop/fanatics-collect-scraper](https://api.apify.com/v2/acts/crawloop~fanatics-collect-scraper) / 0.2.1 | $0.00005/start-GB + $0.00119/lot | 1,088 / 1,092 |

Do not select Parsebird Mercari as a recovery shortcut: its published browser/challenge-solving mechanism needs a different review and conflicts with the present no-bypass boundary. An Apify Store listing is not evidence of a marketplace collection license or permission for customer-product reuse.

## Recommended falsifiable experiment (not executed)

Underlying need: reliable offers for the exact card, quickly. Strongest case for switching tools: a structured search path can avoid the present browser navigation waits, and TCGplayer offers richer print/condition structure. Two serious objections: the replacement may also depend on fragile private endpoints; a completed cheap run may still return wrong prints or incomplete costs. Public author claims and run completion counts are hypotheses, not our measurements.

Recommend a separately approved, isolated nine-start research pilot: three cards (Giratina V 186/196, Base Charizard 4/102 with explicit edition review, and Luffy OP01-024 (Romance Dawn base artwork)), each through SolidCode TCGplayer, Crawloop TCGplayer and Automation Craft Mercari. At most $0.10 per start / $0.90 total, three offers per query, one page, 30 seconds, no automatic retry, no schedules, no account switching. Exact TCGplayer URLs must come from the reviewed existing catalog mapping, never a guessed slug. Leave sales history, monitor mode, seller profiles and personal-data enrichment off. Existing Mercari and Whatnot production allowances are not borrowed for this new experiment.

Prepared input shapes from author documentation (confirm against the pinned build before any start):

```json
{
  "solidcode/tcgplayer-scraper": {
    "productUrls": ["REVIEWED_EXACT_PRODUCT_URL"],
    "maxResults": 1,
    "maxListingsPerProduct": 3,
    "includeSalesHistory": false
  },
  "crawloop/tcgplayer-listings-scraper": {
    "startUrls": [{ "url": "REVIEWED_EXACT_PRODUCT_URL" }],
    "maxItems": 3,
    "maxPages": 1,
    "includeSalesHistory": false,
    "monitorMode": false
  },
  "automation_craft/mercari-us-scraper": {
    "keywords": ["Giratina V 186/196"],
    "statuses": ["on_sale"],
    "sort": "best_match",
    "maxItems": 3,
    "includeDetails": false,
    "includePersonalData": false,
    "includeSellerProfiles": false,
    "includeSellerReviews": false,
    "priceSummary": false
  }
}
```

This small trial is a smoke screen, not a reliability estimate. Advancement requires all returned facts traceable, zero accepted merchandise/wrong-print/sold/graded rows, at least two of three searches per Actor yielding a relevant active offer, median latency under 10 seconds and no run over 30 seconds. Unknown fees/shipping remain null and offers remain research-only. Stop that Actor on an access restriction, a required challenge/bypass, unbounded pagination, an unexplained price unit, a cap failure or an invented field. A complete-cost winner additionally requires seller-specific checkout charges and a permitted stable outbound destination; a product URL alone is not proof of a particular seller offer.

Owner: TCGlens maintainer/Codex. Review date: November 6, 2026, or immediately after an approved smoke test. A larger held-out evaluation, source-rights/privacy review, bounded adapter, deterministic tests and AGENTS.md promotion gate remain necessary before production activation.

## UI follow-up in the same release

Restored the automatic typed placeholder in an isolated input component; it stops during direct interaction, when the page is hidden, or when reduced motion is requested. Removed the quoted long empty-search sentence, using native required-field validation instead. Removed the landing subtitle and example caption, placed example controls on one row, and kept the repeated cross-market section heading accessible without displaying it again. Card rail motion and marketplace brand icons are retained.

Local verification: failing regressions preceded implementation; lint, typecheck, 2,001 tests (five optional skips), metadata audit and production build pass. Five sequential synthetic browser comparisons cover Pikachu, Giratina, Luffy, Charizard (cross) and Zoro, including Edit, New Search and print selection. Native empty-input validation prevents submission without the removed sentence. The in-app preview displayed a stale loading frame after its URL reached result; the same flow completed normally in Chrome via the built-in CUA tools. No standalone Playwright or new paid acquisition was used. Graphify CLI is unavailable on this Windows installation, so no graph update is claimed. An additional fully parallel run hit one existing UI test's five-second runner deadline under concurrent build/browser load; rerunning the whole suite with four workers passed all 2,001 tests without changing the test or its timeout.


Production release `e842af6` is READY as `dpl_AX6stCtzzTBU2AFxtwefCwvDbcR8`, with `lenstcg.com` assigned. Live English and Chinese desktop plus 390px mobile views verify the removed captions and restored typewriter (observed frames `Mew` then `Umbre`); mobile document width is 375px within the 390px viewport, with no console errors. Screenshots remain local under `output/qa/mercari-research-2026-11-03/live-{en,zh,mobile}.png`. No new Actor starts, settings changes or quota extension were made.
