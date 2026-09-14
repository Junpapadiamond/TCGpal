# CardTrader source-access candidate

Reviewed September 14, 2026. Research only; no adapter, API call, account creation or external message. The founder confirmed they have no CardTrader account. Whatnot and Mercari remain requested sources; this candidate expands the source investigation and does not complete or replace them.

## Evidence and decision

The [official API reference](https://www.cardtrader.com/en/docs/api/full/reference) documents bearer authentication, blueprint-based marketplace queries, and concrete offers with price/currency, quantity, seller country, condition properties and graded/vacation flags. Blueprints may carry TCGplayer identifiers. The marketplace response contains the cheapest 25 offers and is lightly cached. Its stated limits conflict (one versus ten requests per second); use the lower limit until clarified. Shipping methods depend on the authenticated user's destination and weight bands; cart responses expose additional fees. These documented examples are not observed inventory or complete quotes for TCGlens buyers.

The [Terms of Service, Web Services, Applications & APIs](https://static.cardtrader.com/en/pages/terms-of-service) distinguish inventory management from market-data services. They direct prospective market API users to contact staff for case-by-case evaluation. This is a documented application path, not permission already granted to TCGlens. [The contact form](https://www.cardtrader.com/en/issues/new?embedded=true) lists API and partnership topics and requires an account. API cost and public-comparison reuse terms were not established.

The strongest case is a platform-supported route to seller offers with a potential identifier crosswalk. Two material objections remain: third-party comparison needs platform evaluation, and account-dependent currency/delivery plus the cheapest-offer cap may provide poor US coverage or incomplete costs. A Blueprint association is a candidate identity mapping, not proof that every treatment matches our selected print.

**Decision:** prepare an access request; do not add an unconfigured CardTrader stub or claim another live marketplace. Access and cost clarification precede a small read-only test. Engineering owner: Codex. Account/contact owner: founder. Review date: September 21, 2026. No outreach is scheduled or sent.

## Ready-to-review access request

Destination: CardTrader support, API & synchronization / Partnerships & collaborations.

Subject: Market API access for TCGlens exact-card listing comparison

Hello CardTrader team,

TCGlens (https://lenstcg.com/) helps US buyers compare listings for a specific trading card they have already selected. We currently support Pokemon and One Piece card identity and use deterministic rules for exact-print matching, seller-stated condition and comparable pre-tax costs. We would like to evaluate CardTrader as an additional marketplace alongside eBay, Whatnot and Mercari.

Could you confirm whether you permit this third-party comparison use and advise the appropriate API access? We would display attributed, timestamped listing facts with outbound links to CardTrader. We would like to clarify:

- Permission to display and briefly cache offers, card images and seller quality indicators in a public comparison; required attribution and retention limits.
- Read-only access suitable for a service whose visitors have different US destinations, including supported price currency and a shipping/mandatory-fee quote without changing a user's cart.
- Exact-print identifiers, reliable links to specific offers and the handling of availability changes.
- Access pricing, quotas, account requirements, and whether the cheapest-offer response limit can exclude otherwise eligible US offers.

Our proposed initial evaluation is two exact cards, no more than ten read requests at one request per second, with no purchases or cart changes. We would expand only after reviewing access terms, data quality and operating cost. Please let us know if another scope is more appropriate.

Thank you,
TCGlens

## Smallest useful test after access is resolved

The initial samples are Giratina V 186/196 and the regular Monkey.D.Luffy OP01-024 print, both independently confirmed in TCGlens before querying. CardTrader identifiers must be obtained from authorized data, not guessed from these names. At most ten GETs, a 30-second deadline and one request per second cover authentication confirmation, catalog mapping, two marketplace queries and up to three shipping-method reads. Keep credentials server-side and store only minimal, non-personal evidence in the ignored frontier directory.

Success requires both card mappings to be correct and at least one active, ungraded, condition-compatible offer with a verified currency, usable destination and working listing link. The comparison must preserve any unknown fee or shipping component; only a supported complete-cost offer can win. Capture request count, latency, freshness, exact-print evidence and actual operating cost.

Stop before acquisition if the intended use is not approved or access cost is unclear. Stop the test on an access block, price-unit conflict, required cart mutation or ambiguous print mapping. A failure to obtain useful US offers ends this candidate's pilot; it must not be counted toward three marketplaces. A successful small test advances to the existing larger repeatability and production promotion gates, not straight to deployment.
