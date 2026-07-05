# eBay ePID Coverage Report

Date: 2026-07-05

Scope: narrow live smoke readout for Workstream A. This is not the full adjudication corpus from `docs/product-spec.md`; it is a credential and coverage probe for one Pokemon sample and one One Piece sample.

## Current eBay Access

- OAuth token: OK with the current `.env.local` keyset.
- Browse `item_summary/search`: OK.
- Catalog `product_summary/search`: HTTP 403 for both samples, so the Catalog ePID path is currently gated by eBay entitlement.

## Browse ePID Consensus Fallback

The implementation accepts a Browse-discovered ePID only when high-confidence listing rows with ePIDs show at least 75% consensus. Split signals stay on keyword fallback.

| Game | Sample | Browse rows checked | Rows with ePID | Top ePID consensus | Accepted |
|---|---|---:|---:|---:|---|
| Pokemon | Umbreon VMAX 215/203 | 10 | 7 | 6/7 = 0.86 | Yes |
| One Piece | Monkey.D.Luffy OP01-024 | 10 | 9 | 6/9 = 0.67 | No |

For the accepted Pokemon ePID `24048923237`, Browse ePID search returned HTTP 200 with 225 total results.

## Interpretation

- Pokemon has usable ePID coverage through Browse consensus under the current keyset.
- One Piece coverage remains thinner and more variant-split, so the keyword path remains the safer fallback for the sampled card.
- Full precision measurement still needs the human-adjudicated 30+ listing corpus from `docs/product-spec.md`; this smoke readout only proves access behavior and sample coverage.
