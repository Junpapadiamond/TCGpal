# Apify pilot deadline removal — October 29, 2026

## Decision

The founder explicitly requested an indefinite extension after the investigation found that both pilot approvals expired on October 22. The underlying goal is availability; the selected mechanism removes the calendar deadline, not the spending ceilings. The strongest case is avoiding needless outages while previously authorized capacity remains. Two objections remain: finite capacity can still run out, and an account or marketplace failure cannot be repaired by removing a date. Account balances and remaining production ledger capacity have not yet been established in this investigation.

Decision: set the explicit server-only `APIFY_PILOT_APPROVAL_NO_EXPIRY=1` flag for both existing Apify adapters. Retain the historical dated configuration so disabling the flag restores the original expiry. Whatnot retains the cumulative 1,846 shared-counter ceiling; Mercari retains nine application starts on the original October 19 ledger (plus the already consumed Console test). Never reset or refund either counter. Per-account conservative $5 accounting, three-result limits, $0.03/$0.05 per-run caps, tariff preflights, unknown charges and review-only eligibility remain unchanged. No supplied chat credentials are imported and no new account capacity is authorized here.

## Falsifiable test and ownership

Smallest test: simulate dates after the original deadline, allow only the final remaining reservation for each provider, then reject the next call at the same permanent ceiling. Confirm disabled or malformed flags retain expiry, incomplete approval fails closed, and the flag alone grants no extra allowance. After the full application gate, deploy and attempt one explicit cross-market comparison against the existing sources and budgets, with no automatic retry.

Success: the deployed configuration no longer stops on pilot expiry and the other limits continue to apply. A successful source response requires separate observed production evidence; a READY deployment alone does not prove inventory acquisition. Kill criteria: any changed spending ceiling, reset ledger, new credential import, unauthorized retry, or incomplete-cost recommendation. Codex owns implementation and release checks; the founder owns spending scope. Review date: October 29, 2026, at release verification. There is no scheduled review or automatic budget renewal.

## Verification

Regression tests were written first and failed on the original expiry behavior for both providers, then passed after implementation. The three focused Apify suites passed 57 tests. ESLint, TypeScript, metadata validation, the full 1,942-test suite (five skipped), and the production webpack build passed. The first full suite had one five-second UI-journey timeout while checks/build were running together; the complete rerun passed without changing tests or timeouts. npm is absent from this shell, so the package scripts' underlying local Node entrypoints were invoked directly. No dependency changes or installation were needed.

Graphify is unavailable in this Windows environment. The change adds no functions/imports or cross-file call relationships; source review covered the existing budget boundary.

## Production evidence

- Commit `015a82d` was fast-forwarded to main and deployed READY as `dpl_BZYEq4iBpHSzkEW79QfqPoWscpuJ`, with `lenstcg.com` assigned. Production `APIFY_PILOT_APPROVAL_NO_EXPIRY=1` was saved before the build and read back after deployment. The old expiry and finite limits were not changed.
- One built-in-browser Giratina V 186/196 / NM / no-ZIP search explicitly opted into cross-market acquisition. The eBay-first request returned 50 candidates in 2.85 seconds; the subsequent cross request returned HTTP 200 with 56 candidates in 90.313 seconds. Runtime source outcomes: eBay 50, Whatnot 3, Stomping Grounds 3, Mercari fallback/0 (`PLATFORM_SEARCH_FAILED`). The page visibly showed Whatnot's $725 review offer and Mercari's unavailable state. Unknown Whatnot shipping and buyer fees remained unknown, with no complete-cost recommendation.
- This confirms Whatnot acquisition after expiry removal, not recovery of both marketplaces. The Mercari error code is deliberately generic; the underlying Actor error and account balances were not exposed by this read-only investigation. The elapsed time is consistent with a source timeout but does not prove that diagnosis. No second cross request, credential rotation, Actor retry or counter reset was attempted. Any reservation from the failed request remains spent.
- Cross request ID: `e1b67d49-9a20-477a-af62-f65103633be7`, observed at `2026-10-30T03:22:32Z`–`03:24:02Z` (October 29 New York). The URL receipt `51298f28ecc74588b183fe29aa2982d7` stores the single-market report, so it is not evidence of the cross response. Screenshot: ignored `output/qa/apify-no-expiry-2026-10-29/production-cross-market.png` in the primary checkout. Browser warning/error log was empty.
