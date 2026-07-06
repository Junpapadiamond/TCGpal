# TCGpal Competitive Brief — Pricing & Buy-Decision Tools

_Scope: how a US collector decides whether a raw Pokémon single is worth buying. Decision this informs: where TCGpal should differentiate vs. achieve parity. Date: 2026-06-28._

## Landscape

- **Direct (decision tools):** none clean. No one turns "should I buy *this* listing" into a single answer. TCGpal is creating this slot.
- **Indirect (data tools collectors stitch together):** **TCGplayer** (marketplace + market price), **PriceCharting** (price guide / API), **130point** (true eBay sold comps incl. accepted Best Offers).
- **Substitute / non-consumption:** the collector opens 4 tabs — eBay active, eBay sold, TCGplayer market, a gut check on the seller — and decides manually. This is the real competitor.
- **Adjacent threat:** eBay and TCGplayer own the data and could bolt a "best listing" recommendation on top.

## Competitor snapshots

**TCGplayer** — the US gold standard for singles pricing and inventory. Owns the industry-reference "Market Price" (compiled from completed TCGplayer sales), a huge multi-seller marketplace, buyer protection, and a strong mobile app. Optimizes for *buying on TCGplayer*, not for judging a listing elsewhere.

**PriceCharting** — broad price guide across collectibles with ungraded + PSA/graded history and a developer API (token-authed JSON, `/api/product`). Strong reference data; not a marketplace and not a per-listing decision. (TCGpal already integrates it as an optional reference.)

**130point** — the trusted free tool for *realized* eBay prices, including hidden accepted-Best-Offer amounts, via API-plus-scrape; spans eBay, PWCC, Goldin, Heritage, etc., with a mobile app. Answers "what did this actually sell for" better than anyone — but stops at comps; it doesn't pick a listing or score a seller.

## Feature comparison

| Capability (what the buyer cares about) | TCGpal | TCGplayer | PriceCharting | 130point |
|---|---|---|---|---|
| Exact-version / reprint disambiguation | Adequate | Strong | Adequate | Weak |
| Live active listings to actually buy | Adequate | Strong | Absent | Adequate |
| Realized sold comps (incl. Best Offer) | Absent (links out, by design) | Adequate | Strong | Strong |
| **Landed cost (price + shipping + tax)** | **Strong** | Weak | Absent | Absent |
| **Seller trust signals scored** | **Strong** | Adequate | Absent | Absent |
| **Condition / photo-evidence scoring** | **Strong** | Absent | Absent | Absent |
| **Single buy recommendation** | **Strong** | Absent | Absent | Absent |
| Anti-hype guardrails (no grade promise) | Strong | n/a | n/a | n/a |
| Catalog breadth (many TCGs/categories) | Weak (Pokémon raw, US) | Strong | Strong | Strong |
| Mobile app | Absent (web) | Strong | Adequate | Strong |

Ratings are honest, buyer-weighted, and will date quickly — revisit per release.

## Positioning

Everyone else hands you **data**; TCGpal hands you a **decision**. The unclaimed position TCGpal can own: *"The fastest way to know which raw single is actually worth buying — landed cost, seller safety, and condition evidence in one answer."* TCGplayer owns "where to buy," 130point owns "what it really sold for," PriceCharting owns "the reference value." None own "which listing should I buy, and why."

## Opportunities (gaps to exploit)

- **Decision, not data** — the three-lens recommendation is genuinely unclaimed. This is the Proven workflow made *Better* by removing the 4-tab stitch-together.
- **Landed cost** — shipping + tax is invisible on every competitor yet decides real cost. Make it the headline number (TCGpal already computes it).
- **Trust + evidence scoring** — no competitor scores the seller or the photo evidence. This is defensible product logic, not just data resale.

## Threats

- **Data moat** — TCGplayer/eBay could add a recommendation on top of data you have to fetch. TCGpal's moat must be decision quality, trust framing, and speed — not owning the data.
- **The "is this a fair price?" gap** — 130point and PriceCharting answer realized value better. TCGpal links out for sold comps; that's a credibility seam a skeptical buyer will feel.

## Strategic implications

- **Differentiate (double down):** landed cost, seller-trust + evidence scoring, and the single recommendation. These are the *Better* and *New* axes — the reason to exist.
- **Reach parity (just enough):** the realized-price reference. Make the PriceCharting reference and the eBay sold-search link more prominent so the "fair price?" loop closes inside TCGpal instead of sending users to 130point. Parity, not leadership.
- **Deprioritize (kill hope until the wedge proves out):** catalog breadth beyond Pokémon-US-raw and a native mobile app. Don't spread until decision-change rate proves the wedge.
- **Monitor:** any "recommended listing / best deal" feature shipping from TCGplayer or eBay — that's the nightmare move; respond on UX and trust, not data volume.
