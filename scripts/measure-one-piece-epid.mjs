// One bounded production probe, no local provider secrets and no raw report archive.
import { writeFileSync } from "node:fs";
import { PRINT_RECALL_CARDS } from "../src/lib/testing/print-recall-cards.ts";
import { resolve } from "./lib/compare-probe.mjs";
const target = process.env.TARGET ?? "https://lenstcg.com";
const card = PRINT_RECALL_CARDS.find((entry) => entry.id === "op-ace-op02-013-p1");
const startedAt = new Date().toISOString();
const output = process.env.EPID_OUTPUT ?? `docs/one-piece-epid-${startedAt.slice(0, 10)}.json`;
let result;
try {
  const { report } = await resolve(target, card, { log: console.log });
  const crosswalk = report.trace?.find((entry) => entry.step === "card_crosswalk") ?? null;
  const inspect = report.candidates?.find((entry) => entry.id === report.inspectListingId);
  result = {
    mode: "research-only", startedAt, observedAt: new Date().toISOString(), target,
    requestedPrintId: card.confirmedCardId, resolvedPrintId: report.confirmedCard?.id ?? null,
    reportGeneratedAt: report.generatedAt, outcome: report.outcome, crosswalk,
    ebayEpid: crosswalk?.summary?.match(/eBay ePID (\d+)/)?.[1] ?? null,
    limitation: "Public report projection: a keyword fallback cannot distinguish no unique Catalog match from unavailable Catalog access.",
    anchor: { productId: report.confirmedCard?.tcgplayerProductId ?? null, value: report.confirmedCard?.marketMid ?? null,
      source: report.confirmedCard?.marketSource ?? null, asOf: report.confirmedCard?.marketAsOf ?? null },
    inspect: inspect ? { url: inspect.url, title: inspect.title, price: inspect.price, shipping: inspect.shipping,
      printMatch: inspect.printMatch, eligibilityIssues: inspect.eligibilityIssues } : null,
    platforms: report.platforms?.map(({ marketplace, status, candidateCount }) => ({ marketplace, status, candidateCount })),
  };
} catch (error) {
  result = { mode: "research-only", startedAt, observedAt: new Date().toISOString(), target, requestedPrintId: card.confirmedCardId, error: error.message };
  process.exitCode = 2;
}
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
