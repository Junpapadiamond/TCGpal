# Provisional Codex review — frontier-research

These are agent observations, not human adjudication or runtime curation. Condition and authenticity are not verified. The source measurement uses ZIP 10001; browser pages defaulted to 07307, so browser shipping did not replace API costs.

# One Piece buy-accuracy sample — 2026-09-06

Target https://lenstcg.com. Cards 13. Buyer context: Near Mint, ZIP 10001, English.

Open each URL and set `verdict`:

- `correct` — live listing, and it is the confirmed print.
- `wrong-print` — sibling artwork, wrong number, or wrong language.
- `dead-link` — 404, ended, or redirected to search.
- `unclear` — cannot tell from the page. Counts against accuracy.

`lens` says how the link was presented: `best_value` is a recommendation, `inspect_first` is a
row the product asked the buyer to check. Both are links a buyer clicks, so both are scored.

Rows already carrying `abstained`, `unresolved`, `error` need no review; they have no link to open.

| card | verdict | lens | confirmed | printMatch | total | title | url | notes |
|---|---|---|---|---|---|---|---|---|
| op-nami-op01-016 | unclear | best_value | OP01-016 | compatible | $2.99 | One Piece - Nami - OP01-016 - Rare - Near Mint - LD-01 - Free Shipping | https://www.ebay.com/itm/306680357872 | Active purchase controls. Photo matches ordinary OP01-016 artwork, number and English text. Title says LD-01 and item specifics say Learn Together Deck Set, while confirmed catalog release is Romance Dawn. Artwork alone cannot settle release/finish equivalence. |
| op-zoro-op06-118 | unclear | best_value | OP06-118 | compatible | $7.99 | • Roronoa Zoro • OP06-118 SEC Non Foil One Piece TCG NM | https://www.ebay.com/itm/318386233254 | Active listing names Non Foil; item specifics say Learn together, Reprint, Regular, English OP06-118. Confirmed catalog release is Wings of the Captain. Release/finish conflict needs adjudication; not enough to count as exact-print accuracy. |
| op-luffy-op05-119 | correct | best_value | OP05-119 | compatible | $24.19 | Monkey.D.Luffy OP05-119 SEC - One Piece TCG - English Card Near-Mint Secret Rare | https://www.ebay.com/itm/306666855578 | Active listing. English purple cost-10/power-12000 card photograph matches official base artwork. Item specifics name OP05-119, Awakening of a New Era and Foil. Condition remains seller-claimed. |
| op-luffy-st01-001 | unclear | best_value | ST01-001 | compatible | $29.99 | 2022 One Piece Monkey D. Luffy ERRATA  Leader ST01-001 Revised holo FOIL NM | https://www.ebay.com/itm/407186231869 | Active $29.99 listing. English starter-leader artwork matches the official image; title claims ERRATA/Revised holo. Catalog has only one ST01-001 print and does not settle revision/finish distinctions. Do not infer that the current reference identifies that premium. |
| op-zoro-op01-001 | correct | best_value | OP01-001 | compatible | $6.39 | Roronoa Zoro OP01-001 Romance Dawn - One Piece TCG English Card Near Mint | https://www.ebay.com/itm/307153442898 | Page loaded normally after its automatic checking-browser screen. Active listing; English red leader photo matches official OP01-001 base artwork and number. Title and item specifics name Romance Dawn. |
| op-ace-op02-013-p1 | wrong-print | inspect_first | OP02-013_p1 | compatible | $308.45 | Bandai One Piece Portgas.D.Ace Alt Art Foil SR Paramount War OP02-013 EN | https://www.ebay.com/itm/227465362031 | Active listing says Alt Art/Paramount War, but the photograph has ornate gold/cloud artwork and a different pose from the selected OP02-013_p1 flames artwork. The live price review prevented a buy recommendation ($299 item vs $55.59 exact reference), but did not establish correct artwork. |
| op-law-op05-069 | correct | best_value | OP05-069 | compatible | $1.99 | Trafalgar Law (069) OP05-069 Awakening of the New Era One Piece Foil NM | https://www.ebay.com/itm/137675543806 | Active listing; English purple Law photograph matches the official base art, cost 3/power 5000. Title and item specifics name Awakening of the New Era. |
| op-shanks-op09-001 | correct | best_value | OP09-001 | compatible | $1.77 | Shanks (001) OP09-001 NM One Piece | https://www.ebay.com/itm/377374661087 | Active listing; English red Shanks leader image matches the official base art. Item specifics name Emperors in the New World and OP09-001. |
| op-rosinante-op04-119 | correct | best_value | OP04-119 | compatible | $2.99 | Donquixote Rosinante OP04-119 Kingdoms of Intrigue Foil | https://www.ebay.com/itm/168664843634 | Active listing; green cost-8/power-8000 Rosinante photograph matches the official base art. Item specifics name English, Foil and Kingdoms of Intrigue. |
| op-ace-op07-119-p1 | correct | best_value | OP07-119_p1 | compatible | $20.00 | Portgas.D.Ace (119) (Parallel) OP07-119 500 Years in the Future | https://www.ebay.com/itm/178465359858 | Active listing; yellow cost-10/power-10000 Ace photograph matches the selected alternate artwork; title names Parallel and 500 Years in the Future. Item specifics contain conflicting autograph fields (No versus Signed By); no signature or grade inferred. |
| op-chopper-eb01-006 | wrong-print | best_value | EB01-006 | compatible | $30.50 | Tony Tony Chopper EB01-006 One Piece Extended  Artwork For PSA CGC BGS or TAG | https://www.ebay.com/itm/157767198624?var=459197281290 | Active selected BGS variation is extended artwork for a slab, not a raw card. The displayed example explicitly says 'Case And Card Not Included' and 'ARTWORK SITS BEHIND YOUR SLAB'. API nevertheless returned Best Buy at $30.50 pre-tax. This is a product-exclusion miss, not a taxonomy mapping to approve. |
| op-linlin-op03-114 | correct | best_value | OP03-114 | compatible | $3.45 | Charlotte Linlin OP03-114 SR Pillars of Strength One Piece TCG NM | https://www.ebay.com/itm/318571962051 | Active listing; title and specifics name English OP03-114/Pillars of Strength. Displayed SAMPLE stock image matches official base artwork. No actual-copy condition or authenticity proof inferred. |
| op-ace-op07-053-p1 | correct | best_value | OP07-053_p1 | compatible | $12.72 | Portgas.D.Ace (Tournament Pack 2024 Oct.-Dec.) OP07-053 R NM | https://www.ebay.com/itm/277966590916 | Active listing names Tournament Pack 2024 Oct.-Dec.; SAMPLE stock image matches official English blue OP07-053_p1 artwork. Page shows CAD with approximate USD and shipping to a different browser ZIP from the API experiment. No assertion that browser and API checkout totals match. |
