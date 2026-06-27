# TCGpal Validation Plan

## Question

Will U.S. Pokémon raw-single buyers use TCGpal to replace part of their manual cross-platform comparison workflow?

## Pilot

- Recruit 10 people who bought a Pokémon single in the last 30 days.
- Test 30 real listings, not hypothetical cards.
- Include eBay, TCGplayer, Facebook/Reddit, and local-shop examples.
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

Track completion rate, time bucket, identity corrections, decision-change feedback, outbound choice role, demo/live mode, and return behavior.

Do not collect listing text, URLs, seller names, or images in analytics.

## Interview prompts

- Walk me through what you would normally check for this listing.
- Which part of this result did you verify yourself?
- What, if anything, changed your next action?
- Which choice felt most useful: cost, seller safety, or condition evidence?
- What evidence was still missing?
- What would make you distrust this result?

Avoid asking whether the idea sounds useful. Record observed behavior, corrections, time saved, repeat use, and concrete actions.

## Decision gates

Continue investing when:

- At least 18 of 30 comparisons complete within 90 seconds.
- At least 9 comparisons change the next action.
- At least 4 of 10 users return with another listing.
- Identity correction stays below 10%.
- At least three users share a result or ask for saved history.

If users want evidence but reject ranking, reposition around a neutral comparison ledger. If they only want a price, do not build more agent complexity. If exact identity remains unreliable, stop marketplace expansion and improve catalog matching first.
