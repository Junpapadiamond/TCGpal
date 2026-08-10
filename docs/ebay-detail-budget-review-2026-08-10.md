# eBay item-detail budget review — 2026-08-10

Reproduce with `npm run review:detail-budget`. Each listing is its own control:
both arms run the real `searchEbayAlternatives` seconds apart, inner-joined on
item id, differing only in whether the row received a detail call.

Shipped detail budget: **12** of a 50-row page.

| Card | Paired rows | Unknown on summary | Detail resolved it | → Near Mint | NM @12 | NM @50 | **Eligible @12** | **Eligible @50** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Charizard 4/102 | 46 | 29 | 21 | 2 | 6 | 9 | 4 | 8 |
| Pikachu 58/102 | 50 | 18 | 14 | 1 | 9 | 12 | 7 | 9 |
| Umbreon VMAX 215/203 | 47 | 34 | 15 | 11 | 16 | 23 | 8 | 14 |
| Giratina V 130/196 | 50 | 13 | 10 | 10 | 38 | 44 | 38 | 44 |
| Charizard ex 006/165 | 48 | 17 | 15 | 12 | 32 | 41 | 23 | 30 |
| Gardevoir ex 245/198 | 50 | 33 | 31 | 29 | 22 | 46 | 20 | 44 |
| Monkey.D.Luffy ST01-001 | 46 | 28 | 16 | 10 | 21 | 27 | 9 | 9 |
| Nami OP01-016 | 46 | 33 | 26 | 19 | 19 | 31 | 0 | 0 |
| Roronoa Zoro OP01-001 | 50 | 36 | 19 | 14 | 16 | 26 | 0 | 0 |
| Trafalgar Law OP05-069 | 50 | 36 | 24 | 21 | 23 | 35 | 0 | 0 |

## Pooled

- Paired listings measured: **483** across 10 cards
- Condition unstated on the search summary: **277** (57.3%)
- Of those, the detail call supplied a condition: **191** (69.0%)
- Of those flips, Near Mint (i.e. eligible for an NM request): **129** (67.5%)
- Near Mint rows reachable at budget 12: **202** · at budget 50: **294**
- Marginal NM supply from raising the budget: **+92** rows across 10 cards (9.2 per card)

### After every deterministic gate, not just condition

- Eligible with no detail calls at all: **90**
- Eligible at the shipped budget of 12: **109**
- Eligible with the full page enriched: **158**
- Marginal eligible listings: **+49** across 10 cards (45% more comparable supply)
- Cards where eligible supply grew: **6** of 10; shrank: **0**

