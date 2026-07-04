# TCGpal Validation Plan

## Question

Will U.S. Pokémon and One Piece raw-single buyers trust TCGpal to replace part of their manual pre-purchase comparison workflow?

## Pilot

- Recruit 10 people who bought a Pokémon single in the last 30 days.
- Test 30 real listings, not hypothetical cards.
- Include eBay and exact user-supplied examples from TCGplayer, Facebook/Reddit, and local shops.
- Cover NM/LP/MP/HP/damaged, unknown shipping, wrong versions, novelty items, and multiple price bands.
- Observe the first comparison before explaining the product.
- Ask users to bring a second listing naturally during the following 14 days.

## Instrumented funnel

1. `comparison_started`
2. `source_detected`
3. `card_identity_confirmed`
4. `comparison_completed`
5. `choice_opened`
6. `decision_feedback_submitted`
7. `second_comparison_started`
8. `lens_selected`
9. `comparison_receipt_copied`

Add abstention reason, Ask use, identity correction, and condition coverage only after each event has an explicit property allowlist.

Track completion rate, time bucket, identity corrections, decision-change feedback, outbound choice role, demo/live mode, and return behavior.

Do not collect listing text, URLs, seller names, or images in analytics.

## Interview prompts

- Walk me through what you would normally check for this listing.
- Which part of this result did you verify yourself?
- What, if anything, changed your next action?
- Which lens felt most useful: Best Value, cost, seller safety, or listing evidence?
- What evidence was still missing?
- What would make you distrust this result?

Avoid asking whether the idea sounds useful. Record observed behavior, corrections, time saved, repeat use, and concrete actions.

## Decision gates

Correctness gates come first:

- Cheapest equals the minimum complete comparable total.
- Safest equals the maximum safety score.
- Documented equals the maximum evidence score.
- Best Value never crosses the requested condition boundary.
- Unknown shipping never becomes free.
- One listing may lead multiple lenses.
- TCGCSV and web-discovery rows never enter listing ranking.

Continue self-serve investment when:

- A human-adjudicated 30-listing corpus reaches at least 90% expert agreement, with zero known invariant violations.
- At least 8 of 10 buyers complete a comparison within 60 seconds.
- At least 9 comparisons change the next action.
- At least 4 of 10 users return with another listing.
- Identity correction stays below 10%.
- At least three users share a comparison receipt.

If users want evidence but reject ranking, reposition around a neutral comparison ledger. If they only want a price, do not build more agent complexity. If exact identity or recommendation correctness misses the gate, stop marketplace expansion and fix the core before distribution spend.
