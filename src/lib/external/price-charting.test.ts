import { describe, expect, it, vi } from "vitest";
import { PriceChartingUnavailableError, searchPriceChartingProducts } from "@/lib/external/price-charting";

describe("PriceCharting API adapter", () => {
  it("requires a server-side token", async () => {
    await expect(searchPriceChartingProducts({ query: "Charizard", token: "" })).rejects.toBeInstanceOf(PriceChartingUnavailableError);
  });

  it("normalizes cent prices from product search", async () => {
    const fetcher = vi.fn(async (url: URL) => {
      expect(url.searchParams.get("t")).toBe("test-token");
      expect(url.searchParams.get("q")).toBe("Charizard");

      return new Response(
        JSON.stringify({
          status: "success",
          products: [
            {
              id: "123",
              "product-name": "Charizard VSTAR Crown Zenith",
              "console-name": "Pokemon Cards",
              "loose-price": 6500,
              "graded-price": "15500",
            },
          ],
        }),
      );
    }) as unknown as typeof fetch;

    const result = await searchPriceChartingProducts({ query: "Charizard", token: "test-token", fetcher });

    expect(result.products[0]).toMatchObject({
      id: "123",
      productName: "Charizard VSTAR Crown Zenith",
      consoleName: "Pokemon Cards",
      loosePrice: 65,
      gradedPrice: 155,
    });
  });
});
