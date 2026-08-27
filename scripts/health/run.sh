#!/usr/bin/env bash
# Run one health check, honouring the three-way exit contract in lib/check.mjs:
#
#   0 PASS         — measured, within budget
#   1 FAIL         — measured, out of budget. A real regression.
#   2 INCONCLUSIVE — could not measure (provider down, network, out of time).
#
# GitHub Actions only understands zero and non-zero, so without this translation
# every upstream outage arrives as a failure. That is not a cosmetic difference:
# a check that pages on the provider's bad hours gets muted within a week, and a
# muted check is how the market-anchor bug survived for months.
set -uo pipefail

"$@"
rc=$?

if [ "$rc" -eq 2 ]; then
  echo "::notice title=Health check inconclusive::$* could not measure; not treated as a failure."
  exit 0
fi
exit $rc
