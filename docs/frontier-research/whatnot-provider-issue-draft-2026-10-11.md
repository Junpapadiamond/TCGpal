# Unsent provider issue: subscribed Whatnot API returns 404

Status: prepared for founder review; **not submitted**. Intended recipient: OmkarCloud, the maintainer of [whatnot-scraper](https://github.com/omkarcloud/whatnot-scraper) and the linked [RapidAPI Whatnot API](https://rapidapi.com/OmkarCloud/api/best-whatnot-scraper-free-1000-calls). Sending this external message requires explicit founder authorization. Do not include API keys, account IDs, email, headers containing credentials, screenshots of code snippets, or private application data.

## Proposed title

RapidAPI Basic subscription: documented Whatnot search endpoints return 404

## Proposed message

I subscribed to the $0 Basic plan, and RapidAPI confirmed the subscription. On October 11, 2026, the documented host `best-whatnot-scraper-free-1000-calls.p.rapidapi.com` returned HTTP 404 for authenticated requests to both documented search routes.

- At 17:05:44 UTC: `GET /search/listings?query=Charizard%20ex%20199%2F165&limit=3&buying_format=buy_it_now&is_graded=false&seller_country=US` returned `{"status":404,"message":"Not Found"}`.
- At 17:08:30 UTC: `GET /search?query=Charizard%20ex%20199%2F165` returned the same response.
- The `/whatnot/search/listings` alias present in the public source instead returned the RapidAPI gateway message that the endpoint does not exist.

Requests included the documented `x-rapidapi-host` and subscription key headers. There were four diagnostic requests total; testing stopped after confirming the route failure. No key or account identifier is included here.

Could you confirm the currently supported RapidAPI search path and whether its backend is deployed? Expected behavior is a JSON search response or a documented source failure, rather than 404 for the documented routes. I can retest one bounded three-result search after a correction is confirmed.
