# TCGpal Listing Risk Pipeline — Eval v0.1

Started: 2026-05-25

## Scope

This report covers the first local/AI-hybrid implementation of the Listing Risk Agent Review Pipeline:

- Evidence Agent
- Risk Agent
- Math Agent
- Critic Agent

The current automated eval uses deterministic fallback fixtures. The planned 20 real-listing eval remains the next step once the UI pipeline is stable enough for repeated manual runs.

## Current Automated Checks

| Check | Status |
|---|---|
| Evidence output validates against schema | Passed |
| Missing back photo is detected | Passed |
| No-return seller policy is detected | Passed |
| Risk output includes five dimensions | Passed |
| Math Agent uses `calculateRawVsSlab` tool | Passed |
| Critic output avoids banned phrases | Passed |

## Manual Fixture Used

`Tony Tony Chopper EB01 Alt Art Japanese One Piece Mint`

Description:

`Great condition, looks PSA10. No returns.`

Expected behavior:

- Extract language as Japanese.
- Treat PSA10 language as low-confidence seller claim.
- Flag missing back photo, corner closeups, and surface evidence.
- Treat no returns as high seller-policy risk.
- Use conservative PSA10 odds in Raw vs Slab math.
- Avoid profit promises and “must buy” wording.

## Next Eval Step

Collect 20 real listings:

- 5 obvious pass
- 5 obvious consider/buy
- 5 ambiguous
- 5 edge cases

For each listing, record:

- Human verdict: pass / ask questions / consider / buy
- Evidence field accuracy
- Risk verdict agreement
- Critic banned phrase count
- Latency per stage

Target report format:

| Agent | Avg latency | Schema pass rate |
|---|---:|---:|
| Evidence | TBD | TBD |
| Risk | TBD | TBD |
| Math | deterministic | n/a |
| Critic | TBD | TBD |
