# Session Journal — What We Struggled With and How It Resolved

Date: 2026-08-09
Companion to: docs/next-build-brief.md (the output). This doc records the reasoning path, including the dead ends and the feelings, because the struggles explain the decisions.

## The trigger

Founder opened eBay, searched "pikachu ascended heroes," saw 988 polished results with rich TCG filters, and panicked: "I feel like my whole product just got beat down… is my product nothing? I don't have a strong reason for a guy to use my web."

## Struggle 1 — "eBay's search is insane; am I redundant?"

We tested both sides by hand. eBay returned 998 mixed listings (277/217 next to 276/217, raw next to PSA 9, $392 next to $943) with no landed cost and no opinion. Lens disambiguated to the exact print (ME2PT5 277/217 SIR) and returned one pick out of 20 with landed cost, reference position, a verdict, and "why not the cheapest."

Resolution: Lens is not competing with eBay's search. It is the layer eBay is forbidden by its own incentives from building — a marketplace can never tell a buyer "pass." Panic was misdirected: faster retrieval of ambiguous listings just helps buyers make the wrong pick sooner.

## Struggle 2 — "Maybe I need extremely accurate search, strong OCR"

First instinct under panic was to out-search eBay. Resolved: identification accuracy is table stakes Lens already wins; the moat is the verdict + evidence layer. OCR re-entered later in the session in its correct place — reading user-supplied screenshots (extraction at the edge), not as a search pivot.

## Struggle 3 — "But eBay has all those filters"

Stress-tested filters across five card profiles. Finding: the filter UI is strong; the data under it is seller-entered and dirty. For the Ascended Heroes query, 616 of 698 listings had "Set: Not Specified" and the actual set wasn't offered as a filter option. A Korean card ranked under a "japanese" query. Two of the top four "Best Match" results for "umbreon ex prismatic evolutions" were a different set (sv8a Terastal) at a different market price.

The law we extracted: eBay's quality is proportional to the precision the buyer types. Experts who know "OP05-119" do fine; everyone else gets cross-set contamination. Lens's job is carrying the precision burden for the user. Also honest: vintage graded is eBay's strongest turf (best filters, PSA culture) — raw modern singles, Lens's current scope, is where eBay's data is dirtiest. Keep that scope.

## Struggle 4 — "Does Lens actually save a hobbyist time?"

Honest answer: on the clock, no — the flow cost ~45–60s vs a 15s impulsive eBay click, and ~20–25s pipeline latency. The founding framing "reduce people's time choosing cards" broke under inspection:

- The careful $100+ buyer runs a 10–20 minute ritual (market tab, solds tab, seller feedback, photo squinting, shipping math, Discord second opinion). Lens compresses that — but only if the buyer trusts the receipt enough not to redo the checks. Trust is the currency; time is the exchange rate.
- The casual buyer doesn't spend the 20 minutes at all — they lose money quickly while feeling fast. You can't save them time, only the mistake.

Resolution: the product sells avoided mistakes and confidence, not minutes. "Know when to walk away" is the promise; time saved is a side effect. (Open decision D2: put this on the homepage.)

## Struggle 5 — "What should my north star be?"

Existing docs said decision-change rate. Flaw found: a correct "reasonable to buy" that confirms the buyer's lean scores zero on decision-change while delivering the entire product value; optimizing it pressures toward contrarian verdicts. Resolution (pending D5): repeat-check rate — % of buyers who run a second comparison within 30 days — because re-hiring at the next moment of doubt is the only behavioral signature of trust. Correctness and decision-influence become guardrails.

## Struggle 6 — "How do I get people to trust it? Trust is so hard to build"

Resolved into mechanisms, not vibes:

1. Persistent receipts — a verdict with a timestamped permalink is a record you're accountable to; a verdict that evaporates is an opinion.
2. Self-graded track record — publish how past verdicts aged against subsequent market data. Converts "trust me" into "audit me."
3. PASS verdicts as marketing — proof the tool isn't a shill. Corollary: affiliate-only monetization corrupts the pass verdict; revenue must eventually come from the buyer's side.
4. Small correct calls, repeated (the future watcher's alerts), compound trust faster than any landing page.

## Struggle 7 — "Cross-platform search is illegal — how do I interpret that?"

Reframed from hole to posture: the job is judging this purchase, not searching everywhere. eBay via licensed API is the fan-out; everywhere else the user brings the listing (paste a link; later, upload a screenshot — OCR's legal home, and it works on marketplaces that can never be scraped). Say it plainly on /method. Same posture dissolves the TCGplayer reference-price cloud: build an own Lens reference from licensed eBay actives/solds (open decision D3) — legally self-contained and proprietary.

## Struggle 8 — "My product is a toy with fancy UI, and I love it, which hurts"

The sharpest moment of the session. Diagnosis: the toy feeling comes from statelessness, not from the UI or the engine. A one-shot check that forgets you existed competes for attention at the worst moment; it isn't part of any recurring behavior. The UI is the trust surface and the best-executed part of the product; the engine (identity → eligibility → landed cost → evidence → verdict, with abstention) is real and rare. Nothing was wasted — the missing layer is persistence and a recurring moment, both cheaper than what's already built.

## Struggle 9 — The sniper, and "doesn't eBay already have alerts?"

Proposed pivot-not-pivot: watchlist alerts ("tell Lens the card, condition bar, price; it watches eBay; one message when a copy is actually worth buying"). Founder correctly flagged eBay's saved-search and auction alerts. Resolution: eBay alerts optimize recall over dirty metadata (spam by design — missed GMV costs them); a judged alert optimizes precision (silence until it matters). But the sniper raises the recall stakes for Lens too — missing a grail is unforgivable. Agreed: 2-week shadow test (5 real cards, eBay saved searches vs pipeline-on-a-timer, count spam vs missed deals) before building. Deferred behind receipts because cold-start economics favor delivering value in one shot before asking users to set a watch and wait.

## Struggle 10 — "Give me options other than the sniper" → the convergence

Field research on Reddit found demand already queued: r/PokemonCardValue (242K weekly visitors, 3.5K weekly contributions of manual price checks), r/IsMyPokemonCardFake (crowdsourced legit-checks; a fake sold for $3k), and a constant "buy now or wait" stream answered by strangers' gut feelings. Options generated: A shareable price-check receipts, B per-card market-position pages, C listing risk audits, D trade receipts, E sniper. The unexpected result: A, B, C are the same product — persistent receipt pages — pointed at three existing demand pools, and E is the retention layer on top. Three independent strategy paths demanded the same first build. When every road starts with the same brick, that's the next commit.

## Struggle 11 — "I don't understand — how is A/B a product? This is a different path from my vision"

Resolved by precision: A is the existing result page with one property changed — it stops evaporating. The founder's original user story (careful buyer, knows the card, wants the best copy without the tab ritual) remains the front door untouched. What Reddit changed is where strangers first meet the product (as an answer to a question they already asked publicly), not what the product is. The price-check asker today is the careful buyer next month.

## Struggle 12 — "Should AI agents be involved? Orchestration?"

Settled policy: AI may touch what the user can see and correct (messy query → canonical identity, screenshot/link extraction, grounded explanation); only deterministic code touches what the user pays (eligibility, cost, ranking, verdict). Reproducibility is the moat — an LLM-picked winner is a vibe with good typography. "Orchestration" for a fixed pipeline DAG means queues, retries, caches, cron — boring on purpose. Agent-style dynamism earns a place only in the paste-anything intake, and even there it feeds the deterministic judge.

## What remains genuinely unresolved

- D1–D6 in docs/next-build-brief.md (sequencing, homepage reframe, own reference, concierge-vs-Reddit, north star, docs rewrite) — founder's calls.
- The sniper shadow test — designed, not yet run.
- The TCGplayer legal gate — until D3 or counsel review, public launch stays gated.
- Cold-start trust — receipts create the conditions; only real users create the proof. The 5-user concierge round is the cheapest honest test.
- The emotional one: the founder's affection for the craft is an asset, and the session repeatedly showed the work was not wasted — but that belief only becomes durable when a stranger uses a receipt and comes back. Everything above is arranged to make that happen soon.

## One-line memory of this session

eBay being good at search was never the threat; a verdict nobody can find, share, or re-visit was. Persistence first, then proof, then reach.
