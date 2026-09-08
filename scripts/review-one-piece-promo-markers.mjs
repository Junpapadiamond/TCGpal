// Offline hypothesis test only. Mutations are confined to this process's catalog.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } });
const { onePieceCatalog, findOnePieceCatalogVariants } = await jiti.import("../src/lib/external/one-piece-catalog.ts");
const { mapOnePieceCardToIdentity } = await jiti.import("../src/lib/external/one-piece-tcg.ts");
const { auditOnePieceAlignment } = await jiti.import("../src/lib/testing/one-piece-alignment.ts");
const { assessPrintFidelity } = await jiti.import("../src/lib/comparison/print-fidelity.ts");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const reference = read("docs/one-piece-tcgplayer-alignment-2026-09-07.json");
const families = [...new Set(onePieceCatalog.map((card) => card.card_set_id))];
const cohort = ["P-014", "P-053", "P-055"];
const broader = process.argv.includes("--broader");
const hypotheses = broader ? reference.records.flatMap((row) => {
  if (!row.priorCandidateStillInCatalog || row.priorConflicts.length) return [];
  const product = row.candidates.find((product) => product.productId === row.priorProductId);
  const label = product?.name.match(/\((Jolly Roger Foil|Pirate Foil|Textured Foil|Full Art)\)/i)?.[1];
  return label ? [{ printId: row.printId, marker: label.toLowerCase().replace("jolly roger foil", "jolly roger") }] : [];
}) : cohort.flatMap((code) => [["_p2", "jolly roger"], ["_p3", "full art"]].map(([suffix, marker]) => ({ printId: code + suffix, marker })));
const proposals = hypotheses.map(({ printId, marker }) => {
  const row = reference.records.find((row) => row.printId === printId);
  const product = row?.candidates.find((product) => product.productId === row.priorProductId);
  if (!product || !product.name.toLowerCase().includes(marker) || row.priorConflicts.length) throw new Error(`Missing corroboration for ${printId}`);
  if (row.officialImageSha256 !== row.priorImageComparison?.officialSha256) throw new Error(`Official image changed for ${printId}`);
  return { printId: row.printId, marker, productId: product.productId, groupId: product.groupId,
    productName: product.name, productUrl: product.url, groupName: product.groupName, officialImageUrl: row.officialImageUrl,
    priorImageEvidenceDate: row.priorImageEvidenceDate, humanReviewStatus: "pending" };
});
// These are observed catalog labels, not manufactured seller examples.
const probes = proposals.flatMap((proposal) => findOnePieceCatalogVariants(proposal.printId.split("_")[0]).map((card) => ({
  selectedPrintId: card.card_image_id, title: `${proposal.productName} ${card.card_set_id} ${proposal.groupName} English`,
  expected: card.card_image_id === proposal.printId ? "compatible" : "mismatch", sourceUrl: proposal.productUrl,
})));
// Actual seller title captured in the preceding user-triggered investigation.
probes.push({ selectedPrintId: "P-055_p3", title: "Monkey.D.Luffy (Jolly Roger Foil) | Foil | Premium Booster -The Best- #P-055",
  expected: "mismatch", sourceUrl: "docs/one-piece-ambiguity-review-2026-09-07.json" });
function probe() {
  return probes.map((item) => {
    const card = onePieceCatalog.find((card) => card.card_image_id === item.selectedPrintId);
    const outcome = assessPrintFidelity({ card: mapOnePieceCardToIdentity(card, { confidence: "high", matchReasons: ["offline-reference-review"] }),
      matchText: item.title, listingPrice: 100, exactMarketAnchor: null });
    return { ...item, match: outcome.match, reasons: outcome.reasons };
  });
}
const before = { audit: auditOnePieceAlignment(families).summary, probes: probe() };
for (const proposal of proposals) {
  const card = onePieceCatalog.find((card) => card.card_image_id === proposal.printId);
  card.exact_markers = [...new Set([...(card.exact_markers ?? []), proposal.marker])];
}
const audit = auditOnePieceAlignment(families);
const proposedFamilies = new Set(proposals.map((proposal) => proposal.printId.split("_")[0]));
const after = { audit: audit.summary, probes: probe(), cohort: audit.rows.filter((row) => proposedFamilies.has(row.cardNumber)) };
const failures = after.probes.filter((item) => item.match !== item.expected && !(item.expected === "compatible" && item.match === "exact"));
const result = { mode: "research-only", runtimeChanged: false, completedAt: new Date().toISOString(),
  scope: `${proposals.length} family-specific marker hypotheses; no product mapping, label, classifier, price, or eligibility mutation`,
  proposals, before, after, failures };
writeFileSync(`docs/one-piece-${broader ? "broader" : "promo"}-marker-probe-2026-09-07.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ before: before.audit, after: after.audit, probes: probes.length, failures }));
if (failures.length || after.audit.selfMismatch || after.audit.substitutions) process.exitCode = 1;
