import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { findOnePieceCatalogVariant } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";
import { resolveTcgplayerProductVariants, searchTcgplayerListings } from "@/lib/external/tcgcsv";
import { selectExactTcgplayerProduct } from "@/lib/comparison/crosswalk";

const enabled = process.env.ONE_PIECE_TAXONOMY_ANCHOR_REVIEW === "1";
const cases = [
  ["OP01-016", "booster"], ["EB01-006", "booster"], ["EB01-006_p1", "booster"],
  ["OP05-119", "booster"], ["OP06-118", "booster"], ["OP01-016_p4", "booster"],
  ["PRB02-006", "prb"], ["PRB02-006_p1", "prb"],
  ["EB01-006_r1", "reviewed"], ["P-001", "promo"], ["P-001_p3", "promo"],
  ["EB01-015_p1", "promo"], ["EB01-015_p2", "promo"], ["OP01-016_p3", "promo"],
  ["OP16-001", "recent"], ["OP16-001_p1", "recent"],
  ["OP17-001", "recent"], ["OP17-001_p1", "recent"],
  ["OP17-079_p1", "recent"], ["OP17-079_p2", "recent"], ["OP17-040_p1", "recent"],
] as const;

type Row = {
  printId: string; cohort: string; groupId: number | null; productId: number | null;
  productName: string | null; groupName: string | null; referenceUsd: number | null;
  asOf: string | null; observedAt: string; candidateCount: number; error: string | null;
};

describe.skipIf(!enabled)("One Piece taxonomy live market-anchor review", () => {
  it("records PRB/promo anchors and compares booster controls to the pre-change run", async () => {
    const rows: Row[] = [];
    const sources = new Map<string, { url: string; observedAt: string; status: number }>();
    const responses = new Map<string, Promise<Response>>();
    // Per-run deduplication avoids re-downloading the same public group/price feed.
    // Only bounded production adapters issue requests; this cannot invent a row.
    const fetcher: typeof fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!responses.has(url)) responses.set(url, fetch(input, init).then((response) => {
        sources.set(url, { url, observedAt: new Date().toISOString(), status: response.status });
        return response;
      }));
      return (await responses.get(url)!).clone();
    };
    for (const [printId, cohort] of cases) {
      const row: Row = { printId, cohort, groupId: null, productId: null, productName: null,
        groupName: null, referenceUsd: null, asOf: null, observedAt: new Date().toISOString(), candidateCount: 0, error: null };
      try {
        const print = findOnePieceCatalogVariant(printId);
        if (!print) throw new Error(`Missing catalog print ${printId}`);
        const card = mapOnePieceCardToIdentity(print, { confidence: "high", matchReasons: ["taxonomy-live-review"] });
        const products = await resolveTcgplayerProductVariants(card, fetcher);
        row.candidateCount = products.length;
        const selected = selectExactTcgplayerProduct(card, products);
        if (selected) {
          const result = await searchTcgplayerListings(card, selected, fetcher);
          Object.assign(row, { productId: selected.productId, groupId: selected.groupId,
            productName: selected.productName, groupName: selected.groupName,
            referenceUsd: result.anchor?.mid ?? null, asOf: result.asOf });
        }
      } catch (error) {
        row.error = error instanceof Error ? error.message : String(error);
      }
      rows.push(row);
      process.stderr.write(`${printId}: ${row.error ?? `product=${row.productId}, reference=${row.referenceUsd}`}\n`);
    }
    const baselinePath = process.env.TAXONOMY_ANCHOR_BASELINE;
    const baseline = baselinePath ? JSON.parse(readFileSync(baselinePath, "utf8")) as { rows: Row[] } : null;
    const controls = rows.filter((row) => row.cohort === "booster");
    const changedControls = baseline ? controls.filter((row) => {
      const old = baseline.rows.find((candidate) => candidate.printId === row.printId);
      return !old || row.error || old.error || row.productId !== old.productId || row.groupId !== old.groupId || row.referenceUsd !== old.referenceUsd;
    }).map((row) => row.printId) : [];
    const output = process.env.TAXONOMY_ANCHOR_OUTPUT ?? "docs/one-piece-taxonomy-anchors-current.json";
    writeFileSync(output, `${JSON.stringify({
      kind: "reference-research", acquisition: "bounded TCGCSV adapter", commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      sourceSha256: Object.fromEntries([
        "src/lib/comparison/crosswalk.ts", "src/lib/external/tcgcsv.ts",
        "src/lib/external/one-piece-taxonomy.ts", "src/lib/external/one-piece-print-metadata.ts",
        "src/lib/external/one-piece-catalog.generated.json", "src/lib/external/one-piece-catalog-revision.ts",
      ].map((path) => [path, createHash("sha256").update(readFileSync(path, "utf8").replace(/\r\n/g, "\n")).digest("hex")])),
      baselinePath: baselinePath ?? null, sources: [...sources.values()], rows, changedControls,
      note: "Item-only, condition-blind aggregate references. No seller inventory or mapping-row approval.",
    }, null, 2)}\n`);
    expect(rows.filter((row) => row.error), "Provider failures mean the run could not establish coverage").toEqual([]);
    if (baseline) {
      expect(controls.every((row) => row.referenceUsd !== null && row.referenceUsd > 0), "Booster controls must actually resolve").toBe(true);
      expect(changedControls, "No booster mapping or reference may change").toEqual([]);
      for (const cohort of ["prb", "promo"]) {
        expect(rows.some((row) => row.cohort === cohort && row.referenceUsd !== null && row.referenceUsd > 0
          && baseline.rows.find((old) => old.printId === row.printId)?.referenceUsd === null), `New ${cohort} anchor required`).toBe(true);
      }
    }
  }, 180_000);
});
