// Does every catalogued set still reach a TCGplayer market anchor?
//
// The measurement lives in src/lib/comparison/market-anchor-coverage-review.test.ts
// because it needs the real crosswalk and its `@/` imports. This wrapper owns
// only the judgment, which is the part the measurement kept getting wrong.
//
// Why it exists: the check used to be `npm run review:market-anchor` called
// directly from the workflow, and vitest can exit 0 or 1 and nothing else. So a
// pokemontcg.io bad hour — the provider was measured at 6/12 healthy on
// 2026-08-26 — arrived as exit 1, identical to a genuine coverage regression.
// The check went red seven days running and every one of those reds was the
// provider, not the product. That is precisely the "cannot tell a regression
// from a bad hour" failure lib/check.mjs warns gets a check muted within a week.
//
// Usage: node scripts/health/market-anchor.mjs
import { spawn } from "node:child_process";
import { FAIL, INCONCLUSIVE, PASS, report } from "./lib/check.mjs";

const MARKER = "::anchor::";

/**
 * Turn one review run into a verdict.
 *
 * The vitest exit code is deliberately not the signal: a run that measured
 * nothing exits 1, and so does a run that measured a real regression. Only the
 * emitted payload can tell those apart, so its absence means "we did not
 * measure", never "the product regressed".
 */
export function interpretAnchorRun({ stdout = "", exitCode = 0 } = {}) {
  const lines = stdout.split("\n").filter((line) => line.includes(MARKER));
  const last = lines.at(-1);
  if (!last) {
    return {
      status: INCONCLUSIVE,
      headline: `no measurement was reported (review exited ${exitCode})`,
      rows: ["The review produced no verdict line, so nothing was measured.", "Coverage is unknown; this is not evidence of a regression."],
      detail: { exitCode },
    };
  }

  let payload;
  try {
    payload = JSON.parse(last.slice(last.indexOf(MARKER) + MARKER.length));
  } catch (error) {
    return {
      status: INCONCLUSIVE,
      headline: "the review's verdict line could not be read",
      rows: [String(error)],
      detail: { exitCode },
    };
  }

  const pct = (value) => `${(value * 100).toFixed(1)}%`;
  const rows = [
    `cards  ${payload.cardsResolved}/${payload.cardsAudited} anchored (${pct(payload.cardCoverage)}, floor ${pct(payload.minCardCoverage)})`,
    `sets   ${payload.setsVisited}/${payload.setsTotal} visited, coverage ${pct(payload.setCoverage)} (floor ${pct(payload.minSetCoverage)})`,
    `took   ${(payload.elapsedMs / 1000).toFixed(0)}s, ${payload.unreadableSets} unreadable set(s), ${payload.feedErrors} feed error(s)`,
  ];
  for (const name of payload.setsWithoutAnchor ?? []) rows.push(`  no anchor: ${name}`);

  if (payload.verdict === "inconclusive") {
    const why = payload.feedErrors > 0
      ? `${payload.feedErrors} feed error(s)`
      : `ran out of time with ${payload.unauditedCards} card(s) unaudited`;
    return {
      status: INCONCLUSIVE,
      headline: `only ${payload.setsVisited}/${payload.setsTotal} sets measured — ${why}`,
      rows,
      detail: payload,
    };
  }
  if (payload.verdict === "regression") {
    return {
      status: FAIL,
      headline: `market anchor coverage fell below its floor (${pct(payload.setCoverage)} of sets, ${pct(payload.cardCoverage)} of cards)`,
      rows,
      detail: payload,
    };
  }
  return {
    status: PASS,
    headline: `every measured set reached a market anchor (${pct(payload.cardCoverage)} of cards)`,
    rows,
    detail: payload,
  };
}

function main() {
  // Streamed rather than buffered: this check can run for a quarter of an hour,
  // and a CI step that prints nothing for fifteen minutes is one somebody
  // eventually cancels on the assumption that it hung.
  const child = spawn("npx", ["vitest", "run", "src/lib/comparison/market-anchor-coverage-review.test.ts"], {
    env: { ...process.env, MARKET_ANCHOR_REVIEW: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let captured = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    captured += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    captured += chunk;
    process.stderr.write(chunk);
  });

  child.on("error", (error) => {
    process.exit(report({ name: "market-anchor", ...interpretAnchorRun({ stdout: String(error), exitCode: 1 }) }));
  });
  child.on("close", (code) => {
    const verdict = interpretAnchorRun({ stdout: captured, exitCode: code ?? 1 });
    process.exit(report({ name: "market-anchor", ...verdict }));
  });
}

if (process.argv[1] && process.argv[1].endsWith("market-anchor.mjs")) main();
