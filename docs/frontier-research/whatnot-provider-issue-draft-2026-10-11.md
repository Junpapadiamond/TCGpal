# Submitted provider issue: subscribed Whatnot API returns 404

Status: **submitted with explicit founder authorization on October 11, 2026**. [GitHub issue #1](https://github.com/omkarcloud/whatnot-scraper/issues/1) is Open in OmkarCloud's repository. The integration could not create an issue in the external repository (HTTP 403, integration permission); the normal authenticated GitHub website successfully created it, and the resulting issue title/body/status were verified. The message below is exactly what was sent. No API keys, account IDs, email, credential headers, code-snippet screenshots or private application data were included. Maintainer response or a confirmed endpoint correction is required before another bounded test; issue submission does not restore production.

## Submitted title

RapidAPI Basic subscription: documented Whatnot search endpoints return 404

## Submitted message

I subscribed to the $0 Basic plan, and RapidAPI confirmed the subscription. On October 11, 2026, the documented host `best-whatnot-scraper-free-1000-calls.p.rapidapi.com` returned HTTP 404 for authenticated requests to both documented search routes.

- At 17:05:44 UTC: `GET /search/listings?query=Charizard%20ex%20199%2F165&limit=3&buying_format=buy_it_now&is_graded=false&seller_country=US` returned `{"status":404,"message":"Not Found"}`.
- At 17:08:30 UTC: `GET /search?query=Charizard%20ex%20199%2F165` returned the same response.
- The `/whatnot/search/listings` alias present in the public source instead returned the RapidAPI gateway message that the endpoint does not exist.

Requests included the documented `x-rapidapi-host` and subscription key headers. There were four diagnostic requests total; testing stopped after confirming the route failure. No key or account identifier is included here.

Could you confirm the currently supported RapidAPI search path and whether its backend is deployed? Expected behavior is a JSON search response or a documented source failure, rather than 404 for the documented routes. I can retest one bounded three-result search after a correction is confirmed.
