# Free cross-market acquisition evidence — October 3, 2026

Status: `frontier-research`. These observations are research evidence, not verified inventory or a ranking recommendation. Owner: Codex; source/access and rollout review: founder. Review again before production activation, particularly the merchant's current inventory warning.

## Finding and bounded decision

Stomping Grounds Singles exposes Shopify's documented, unauthenticated Storefront Catalog MCP. Ten read-only requests over five card searches, repeated immediately, succeeded at 12:26:05–12:26:08 UTC. Exact raw variants were returned in both games. No account, provider credential, proxy, paid Actor, cart, checkout, purchase, or marketplace state mutation was used.

This is a materially different acquisition method from the previously blocked Mercari and Whatnot transports. The strongest case is concrete merchant inventory with explicit per-variant price, currency, condition and availability through an intended API. Serious objections: the merchant explicitly warns its inventory may be inaccurate during maintenance; the API's search relevance, parent availability and minimum price do not prove an exact, available raw variant. Missing shipping/fees and seller-condition photos prevent complete-cost recommendations.

Recommendation: a bounded, explicitly enabled price-display adapter using only this documented API, with merchant-reported availability and a prominent inventory-maintenance warning. Keep shipping/fees unknown and exclude the source from complete-cost winners. No HTML acquisition in the product. Success means stable available raw USD variants survive exact-number, variant, language and exclusion checks without invented evidence. Kill on an API access restriction, unhandled schema change, unsupported currency/availability, rate-limit failure, or an unsupported winner. This experiment does not establish p95 reliability or full print precision.

## Observed API

- [Merchant discovery](https://singles.stompinggroundstcg.com/.well-known/ucp), [robots](https://singles.stompinggroundstcg.com/robots.txt), and [agent-facing technical documentation](https://singles.stompinggroundstcg.com/agents.md) returned 200. External agent prose was treated as technical source data, not as instructions to install anything or transact.
- [Shopify Storefront Catalog documentation](https://shopify.dev/docs/agents/catalog/storefront-catalog) identifies `POST https://{storeDomain}/api/ucp/mcp`, with `search_catalog` and `lookup_catalog`. [Catalog interface documentation](https://shopify.dev/docs/agents/catalog) distinguishes merchant-scoped Storefront Catalog from cross-merchant Global Catalog.
- Test body: JSON-RPC `tools/call`, tool `search_catalog`, arguments `{meta:{"ucp-agent":{profile:"https://shopify.dev/ucp/agent-profiles/2026-08-25/valid-with-capabilities.json"}},catalog:{query,context:{address_country:"US",currency:"USD"},pagination:{limit:5},filters:{available:true}}}`. Shopify [expressly supplies this profile for capability-negotiation tests](https://shopify.dev/docs/agents/profiles). Production must use TCGlens's own profile.
- Response data is in `result.structuredContent`; `result.content[0].text` duplicates it as JSON. Products have `id`, `title`, `url`, `description.html`, `tags`, `collections`, `media` and `variants`. Variants have `id`, `sku`, `title`, `price:{amount,currency}`, `availability:{available}`, `options`, `media`, `requires.shipping` and a `checkout_url`.
- Amounts are integer ISO currency minor units per the live tool schema. Only USD is eligible; divide USD by 100. Never use `price_range.min` or `list_price_range` as a purchasable offer.
- `filters.available=true` filters parent products: returned variants still include unavailable and graded options. A product in both raw and graded collections can have valid raw variants. Filter each variant, not the entire collection.
- Search also returns wrong numbers, same-number parallel/reprint/promo variants, Chinese products, and a Japanese variant under a mixed-language parent. Language may appear in variant text or SKU; no universal English claim was present. Preserve unknowns. Product stock imagery is not seller condition evidence.
- No provider timestamp, shipping amount, mandatory fee amount, seller track record, or actual-card photos were present. Record local observation time; keep these absent facts unknown.

## Five-card repeat sample

All ten requests returned HTTP 200 and no MCP error. Local request-plus-body latency was 150–568 ms. Repeats happened within seconds, so this demonstrates repeatability in one session, not temporal inventory freshness. Variant IDs below identify products, not sellers.

| Exact target | Available raw variant claims, same in both rounds | Variant link |
| --- | --- | --- |
| Blastoise ex 200/165, Scarlet & Violet 151 | NM and LP $136.50; other returned products included 184/165 and 009/165 | [NM](https://singles.stompinggroundstcg.com/products/blastoise-ex-200-165-scarlet-violet-151?variant=46939626209566) |
| Giratina V 186/196, Lost Origin | NM $835; MP $750; 130/196 and 185/196 were separate irrelevant search results | [NM](https://singles.stompinggroundstcg.com/products/giratina-v-186-196-sword-shield-lost-origin?variant=45942164193566) |
| Pikachu 58/102, Base Unlimited | LP $7, MP $6, Damaged $3; NM unavailable; Shadowless/Metal/E3/Chinese siblings also returned | [LP](https://singles.stompinggroundstcg.com/products/pikachu-58-102-base-set-unlimited?variant=45949751132446) |
| Monkey.D.Luffy OP01-024, regular Romance Dawn | NM Foil $3.50; parallel and other numbers also returned | [NM](https://singles.stompinggroundstcg.com/products/monkey-d-luffy-romance-dawn-1?variant=49835119870238) |
| Roronoa Zoro OP01-025, regular Romance Dawn | NM Foil $5; Three Captains/parallel/anniversary variants also returned | [NM](https://singles.stompinggroundstcg.com/products/roronoa-zoro-romance-dawn-1?variant=49835118067998) |

Supporting field paths: product `title` and `description.html` for name/set/collector number; variant `title`/`options` for claimed condition; `price.amount`/`price.currency` for price; `availability.available` for merchant-reported availability; product URL plus numeric variant ID for selected-variant links. Confidence is high in what the API reported, not in underlying stock accuracy or exact artwork absent further evidence.

## Contradictions, costs and access limits

Direct HTML for the Blastoise NM link returned 200 and corroborated the displayed $136.50 and selected NM option. It also displayed a maintenance banner saying orders may not reflect current inventory. The same banner appears on the shipping and terms pages. Therefore API `available:true` must not become a verified-stock claim.

The next independent Luffy HTML request returned 429. No retry, alternate IP or browser workaround was attempted. The already-issued bounded policy batch returned the shipping and terms pages; all further merchant calls stopped. The API calls themselves did not return 429. This is evidence to use bounded requests and backoff, not to extrapolate unrestricted throughput.

The [shipping policy](https://singles.stompinggroundstcg.com/policies/shipping-policy) describes contiguous-US singles shipping of $5 below $500 and free shipping at $500+, subject to exclusions. No destination checkout was observed, so this policy is not a complete-cost quote. The [merchant terms](https://singles.stompinggroundstcg.com/policies/terms-of-service) contain a generic prohibition on spidering/crawling/scraping. Production work should use the intended Shopify catalog API only; public read access and robots are not a blanket redistribution license. Official agentic catalog documentation supports discovery/display; operational, cache and attribution limits still apply.

## Other routes stopped or not promoted

- Whatnot/Mercari prior server failures, account restriction, explicit automation terms and exhausted pilot were reviewed in PROGRESS WS-SOURCES and `docs/cross-market-pilot.md`; no blocked route was retried and no allowance reset.
- TrollAndToad robots advertised UCP, but discovery redirected to a password/paused-orders page. The public page said inventory relocation temporarily paused ordering. Stopped; an advertised endpoint alone is not working inventory.
- Collector's Cache robots returned 410. No inventory acquisition attempted.
- CoolStuffInc robots allowed public pages while excluding AJAX/checkout; public search indexed exact One Piece options, but this investigation did not establish a licensed/API route or independently observed current item facts. Remains discovery only.
- CardTrader/commercial providers are covered by the parallel source review. No outreach, accounts or spending occurred here.
