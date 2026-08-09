import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { clearLocalCache } from "@/lib/ops/cache";
import { demoIdentities, demoListingSeeds } from "@/lib/comparison/fixtures";
import { normalizeListing, rankListings } from "@/lib/comparison/ranking";
import { saveComparisonSnapshot } from "@/lib/comparison/report-snapshot";
import { buildStandardComparisonRequest, STANDARD_COMPARISON_FLOW_CARDS } from "@/lib/testing/standard-comparison-flow";
import type { ComparisonReport } from "@/lib/schemas";
import ReceiptPage, { generateMetadata } from "./page";

const receiptId = "0123456789abcdef0123456789abcdef";

function report(): ComparisonReport {
  const request = buildStandardComparisonRequest(STANDARD_COMPARISON_FLOW_CARDS[0]);
  request.query = "Umbreon VMAX 215/203";
  const card = { ...demoIdentities[0], marketMid: 200, marketSource: "tcgcsv" as const, marketAsOf: "2026-08-08T00:00:00.000Z" };
  const listings = demoListingSeeds.slice(0, 2).map((seed, index) => normalizeListing({
    listing: {
      ...seed,
      id: index === 0 ? "receipt-pick" : "receipt-second",
      price: index === 0 ? 185 : 176,
      shipping: 5,
      claimedCondition: "Near Mint",
      demo: false,
    },
    buyer: request.buyer,
    marketPrice: 200,
  }));
  return {
    status: "complete",
    request,
    identityCandidates: [card],
    confirmedCard: card,
    candidates: listings,
    rankedChoices: rankListings(listings, { marketPrice: 200 }),
    references: [],
    narrative: { summary: "A defensible buy with visible tradeoffs.", cautions: ["Condition remains the seller's claim."] },
    warnings: [],
    trace: [],
    platforms: [{
      id: "ebay",
      marketplace: "eBay",
      label: "eBay Browse",
      sourceMode: "official_api",
      status: "complete",
      configured: true,
      count: 2,
      detail: "Live listings checked.",
    }],
    webDiscoveries: [],
    outcome: "best_buy",
    demoMode: false,
    generatedAt: "2026-08-09T08:30:00.000Z",
  };
}

describe("receipt page", () => {
  beforeEach(() => clearLocalCache());

  it("server-renders the exact card, two-listing decision, evidence boundaries, and re-check", async () => {
    await saveComparisonSnapshot(report(), { id: receiptId, now: new Date() });
    const page = await ReceiptPage({ params: Promise.resolve({ id: receiptId }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Decision receipt");
    expect(html).toContain("Umbreon VMAX");
    expect(html).toContain("215/203");
    expect(html).toContain("Our pick");
    expect(html).toContain("Second look");
    expect(html).toContain("Exact card");
    expect(html).toContain("Condition photos");
    expect(html).toContain("Seller record");
    expect(html).toContain("Complete price");
    expect(html).toContain("Condition is still the seller’s claim");
    expect(html).toContain("Re-check live");
    expect(html).toContain("condition=Near+Mint");
  });

  it("builds card-specific share metadata from the immutable snapshot", async () => {
    await saveComparisonSnapshot(report(), { id: receiptId, now: new Date() });
    const metadata = await generateMetadata({ params: Promise.resolve({ id: receiptId }) });

    expect(metadata.title).toContain("Umbreon VMAX");
    expect(metadata.description).toContain("Best value");
    expect(metadata.description).toContain("Checked");
    expect(metadata.openGraph).toMatchObject({ type: "article" });
  });
});
