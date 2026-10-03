# Mercari direct acquisition — October 3, 2026

**Classification: `frontier-research`.** Founder-triggered investigation; no production activation, scheduled collection, paid starts, account creation, or marketplace mutation. This observation is not a live runtime fixture and must not enter product caches or ranking.

## Observed route

The ordinary Codex in-app browser loaded one [public search for Blastoise ex 200/165](https://www.mercari.com/search/?keyword=Blastoise%20ex%20200%2F165), then one canonical listing detail. Both rendered without a login request, CAPTCHA, or access restriction. No cookies, credentials, hidden application state, private endpoints, proxies, or anti-detection settings were read or supplied.

The search reported 555 results. That number is a marketplace claim, not the number of usable offers. Visible results included wrong collector numbers, graded cards, and a sold listing. Search results were discovery only; the selected detail supplied the facts below. No pagination or further detail requests followed.

Current [robots.txt](https://www.mercari.com/robots.txt) returned HTTP 200 and did not exclude the search or canonical `/us/item/` path for the generic agent. It excludes tracking URLs containing `ref`, so the observed canonical detail omitted that parameter. Robots allowance does not establish production data rights. Mercari's [Prohibited Conduct policy](https://www.mercari.com/us/help_center/topics/listing/policies/prohibited-conduct/) restricts automated extraction through interfaces it does not provide.

## Minimal field provenance

Every row below was observed at **2026-10-03T13:01:00.651Z**, at [the same listing](https://www.mercari.com/us/item/m72930642581/), by read-only ordinary-browser DOM inspection. Matching public Product JSON-LD was corroboration; no seller identifiers or raw page captures are retained.

| Field | Observed value | Supporting public evidence | Confidence and limit |
| --- | --- | --- | --- |
| Exact card claim | Blastoise ex 200/165, Scarlet & Violet 151, Special Illustration Rare, English | `h1[data-testid="ItemName"]`; matching `Product.name` | High that the seller states this identity; no authenticity claim |
| Item ask | USD 135.00 | `[data-testid="ItemPrice"]`; matching `Product.offers.price` of `135` and `priceCurrency` of `USD` | High for the displayed amount |
| Shipping | USD 4.91 discounted; USD 5.87 also displayed as the previous charge | `[data-testid="DiscountedFee"]`; matching `Product.offers.shippingDetails.shippingRate.value` of `4.91`, currency `USD` | High for the page display; destination-specific checkout amount unverified |
| Buyer Protection fee | USD 5.03 | `[data-testid="ItemDetailPriceSummaryHeadline"]` explicitly labels that fee | High for the page display; checkout unverified |
| Availability | Apparently active at observation | Enabled `Buy now` button and matching Product `InStock` | Medium; neither a reservation nor proof inventory remains available |
| Condition claim | Like new | `[data-testid="ItemDetailsCondition"]` | High for the merchandise label; card condition stays Unknown, not NM |
| Condition qualification | Seller describes a factory spot near the bottom-left collector number | `[data-testid="ItemDetailsDescription"]`, paraphrased only | Medium; seller statement, no photo-based grading |
| Listing images | Six | Matching `Product.image` array and visible image controls | High for count; no image-based condition conclusion |
| Tax / buyer destination | Unknown / not supplied | No checkout was entered | No inferred value |

Arithmetic from the three displayed charges is **USD 144.94 before tax**. This is a page-level calculation, not a verified destination-specific checkout quote or recommendation. No seller reputation conclusion was made.

## What the observation proves

The existing DOM reader's price, discounted-shipping, fee, condition, and public JSON-LD selectors remain usable on this one current page. It does not prove recall, exact-print precision across results, repeatability, or unattended deployment reliability.

The September hosted collector failed with document HTTP 403 before it reached the parser. That failure cannot be corrected by changing DOM selectors alone. Differences between the local browser and hosted Chromium exist, but the cause of the restriction is not established; do not label it an IP, region, cookie, or headless-browser problem without evidence.

## Bounded next decision

Owner: founder/Codex. Review: October 3, 2026. Root is preparing one transparent hosted probe of the existing collector, with its normal bounds and no access workarounds. Success requires a rendered search plus at least one exact raw USD detail, traceable current fields, and no challenge or restriction. Stop immediately on HTTP 403/429, verification, account restrictions, or robots exclusion; do not repeat against alternate identities or network routes.

If the hosted probe is blocked again, the deployed direct source remains off. A user-driven local capture could be a separate, explicitly chosen product workflow for pages the user can ordinarily open, with user-supplied provenance, independent permission review, and no claim that it fixes or bypasses the server restriction. It is not an authorized fallback transport for unattended server acquisition, and no extension or bridge is implemented by this experiment.

## Collector hardening

The robots response previously called `response.text()` and checked its 64 KB size only after buffering finished. The collector now rejects a declared oversize body before reading, counts streamed bytes, and cancels on overflow or caller/deadline cancellation. No source endpoint, user agent, browser flags, navigation boundary, or production activation changed. Hermetic tests cover the size limits, cancellation, HTTP 403, and visible verification stops.
