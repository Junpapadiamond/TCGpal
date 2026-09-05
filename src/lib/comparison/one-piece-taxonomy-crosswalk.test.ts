import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findOnePieceCatalogVariant } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";
import { resolveTcgplayerProductVariants, type TcgplayerProductMatch } from "@/lib/external/tcgcsv";
import { selectExactTcgplayerProduct } from "@/lib/comparison/crosswalk";

// Real group/product names and identifiers are test evidence, never runtime curation.
const ledger = JSON.parse(readFileSync("output/one-piece-exact-print-metadata.json", "utf8")) as {
  canonicalPrintId: string; tcgplayerProductId: number; tcgplayerGroupId: number;
  tcgplayerProductName: string; tcgplayerGroupName: string; tcgplayerCollectorNumber: string;
}[];
function card(id: string) {
  return mapOnePieceCardToIdentity(findOnePieceCatalogVariant(id)!, { confidence: "high", matchReasons: ["test"] });
}
function product(id: string): TcgplayerProductMatch {
  const entry = ledger.find((row) => row.canonicalPrintId === id)!;
  return { categoryId: 68, productId: entry.tcgplayerProductId, groupId: entry.tcgplayerGroupId,
    productName: entry.tcgplayerProductName, groupName: entry.tcgplayerGroupName,
    collectorNumber: entry.tcgplayerCollectorNumber, productUrl: `https://www.tcgplayer.com/product/${entry.tcgplayerProductId}`, imageUrl: null };
}

describe("One Piece anchor group aliases", () => {
  it.each(["PRB02-006_p1", "P-001", "EB01-015_p1", "EB01-015_p2", "OP01-016_p3"])("resolves the uniquely named provider product for %s", (id) => {
    expect(selectExactTcgplayerProduct(card(id), [product(id)])?.productId).toBe(product(id).productId);
  });

  it("keeps a promo's ambiguous Alternate Art product unanchored", () => {
    expect(selectExactTcgplayerProduct(card("P-001_p3"), [product("P-001_p3")])).toBeNull();
  });

  it("does not substitute the Winner Pack for the Tournament Pack", () => {
    expect(selectExactTcgplayerProduct(card("EB01-015_p1"), [product("EB01-015_p2")])).toBeNull();
    expect(selectExactTcgplayerProduct(card("EB01-015_p2"), [product("EB01-015_p1")])).toBeNull();
  });

  it("does not anchor a base booster to a promo group with a silent product title", () => {
    expect(selectExactTcgplayerProduct(card("OP01-016"), [{ ...product("OP01-016_p3"), productName: "Nami - OP01-016" }])).toBeNull();
  });

  it("does not confuse the two Premium Booster volumes", () => {
    expect(selectExactTcgplayerProduct(card("PRB02-006_p1"), [{ ...product("PRB02-006_p1"), groupName: "Premium Booster -The Best-" }])).toBeNull();
  });

  it("abstains when two provider products support the same named release", () => {
    const exact = product("EB01-015_p2");
    // Conflicting provider-row identity is synthetic; its real release wording is unchanged.
    expect(selectExactTcgplayerProduct(card("EB01-015_p2"), [exact, { ...exact, productId: exact.productId + 1 }])).toBeNull();
  });

  it("rejects an aliased product with the wrong full name or collector number", () => {
    const exact = product("P-001");
    expect(selectExactTcgplayerProduct(card("P-001"), [{ ...exact, productName: "Monkey.D.Garp (Promotion Pack 2022)" }])).toBeNull();
    expect(selectExactTcgplayerProduct(card("P-001"), [{ ...exact, collectorNumber: "P-002" }])).toBeNull();
  });

  it("does not hide a failed candidate-group feed behind a successful empty group", async () => {
    const exact = product("OP01-016_p3");
    const fetcher: typeof fetch = async (input) => {
      if (String(input).endsWith("/groups")) return Response.json({ results: [
        { groupId: exact.groupId, name: exact.groupName },
        { groupId: 23246, name: "The Three Captains" },
      ] });
      if (String(input).endsWith(`/${exact.groupId}/products`)) return new Response("unavailable", { status: 503 });
      return Response.json({ results: [] });
    };
    await expect(resolveTcgplayerProductVariants(card("OP01-016_p3"), fetcher)).rejects.toThrow("503");
  });

  it.each(["PRB02-006_p1", "P-001", "EB01-015_p1", "OP01-016_p3"])("discovers the alias group through the bounded adapter for %s", async (id) => {
    const wanted = product(id);
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/groups")) return Response.json({ results: [{ groupId: wanted.groupId, name: wanted.groupName }] });
      if (url.endsWith(`/${wanted.groupId}/products`)) return Response.json({ results: [{
        productId: wanted.productId, name: wanted.productName, url: wanted.productUrl,
        extendedData: [{ name: "Number", value: wanted.collectorNumber }],
      }] });
      throw new Error(`Unexpected request ${url}`);
    };
    expect((await resolveTcgplayerProductVariants(card(id), fetcher)).map((row) => row.productId)).toContain(wanted.productId);
  });
});
