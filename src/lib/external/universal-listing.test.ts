import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectMarketplaceFromUrl,
  extractDeterministic,
  fetchUniversalListing,
  isFetchableListingUrl,
  isPathAllowedByRobots,
} from "@/lib/external/universal-listing";

const productHtml = `
<html><head>
<title>Umbreon VMAX 215/203 Alt Art | Mercari</title>
<meta property="og:title" content="Umbreon VMAX 215/203 Alt Art" />
<meta property="og:description" content="Near Mint, front and back photos, corner closeups." />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Umbreon VMAX 215/203 Alt Art",
 "description":"Near Mint raw single. Front and back photos with corner closeups.",
 "image":["a.jpg","b.jpg","c.jpg"],
 "offers":{"@type":"Offer","price":"1899.00","priceCurrency":"USD","itemCondition":"https://schema.org/UsedCondition"}}
</script>
</head><body>Pokemon card listing page</body></html>`;

describe("universal paste-a-URL adapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("gates non-https, credentialed, and private-host URLs before any fetch", () => {
    expect(isFetchableListingUrl("http://mercari.com/item/1").ok).toBe(false);
    expect(isFetchableListingUrl("https://user:pass@mercari.com/item/1").ok).toBe(false);
    expect(isFetchableListingUrl("https://localhost/item/1").ok).toBe(false);
    expect(isFetchableListingUrl("https://192.168.1.5/item/1").ok).toBe(false);
    expect(isFetchableListingUrl("https://internal/item").ok).toBe(false);
    expect(isFetchableListingUrl("not a url").ok).toBe(false);
    expect(isFetchableListingUrl("https://www.mercari.com/us/item/m123/").ok).toBe(true);
  });

  it("detects the marketplace from the pasted hostname", () => {
    expect(detectMarketplaceFromUrl("https://www.mercari.com/us/item/m1/")).toBe("Mercari");
    expect(detectMarketplaceFromUrl("https://jp.mercari.com/item/m1")).toBe("Mercari");
    expect(detectMarketplaceFromUrl("https://snkrdunk.com/products/abc")).toBe("SNKRDUNK");
    expect(detectMarketplaceFromUrl("https://page.auctions.yahoo.co.jp/jp/auction/abc")).toBe("Yahoo Auctions JP");
    expect(detectMarketplaceFromUrl("https://www.whatnot.com/listing/1")).toBe("Whatnot");
    expect(detectMarketplaceFromUrl("https://www.comc.com/Cards/x")).toBe("Other");
  });

  it("extracts JSON-LD product facts deterministically", () => {
    const extracted = extractDeterministic(productHtml);
    expect(extracted.title).toBe("Umbreon VMAX 215/203 Alt Art");
    expect(extracted.price).toBe(1899);
    expect(extracted.currency).toBe("USD");
    expect(extracted.photoCount).toBe(3);
  });

  it("fetches an allowed page once and normalizes the listing without AI", async () => {
    const fetched: string[] = [];
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      const href = String(url);
      fetched.push(href);
      if (href.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /admin\n");
      return new Response(productHtml, { headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const result = await fetchUniversalListing("https://www.mercari.com/us/item/m123/", fetcher);

    expect(result.marketplace).toBe("Mercari");
    expect(result.listing.price).toBe(1899);
    expect(result.listing.title).toContain("Umbreon VMAX");
    expect(result.listing.evidence.photoCount).toBe(3);
    expect(result.extractedCard.number).toBe("215/203");
    // page + robots only — a single user-initiated fetch, never crawling.
    expect(fetched.filter((href) => !href.endsWith("/robots.txt")).length).toBe(1);
  });

  it("honors robots.txt disallow rules and does not fetch the page", async () => {
    const fetched: string[] = [];
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      const href = String(url);
      fetched.push(href);
      if (href.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /blockedpath\n");
      return new Response(productHtml);
    }) as unknown as typeof fetch;

    await expect(fetchUniversalListing("https://blocked-robots.example.com/blockedpath/item/9", fetcher))
      .rejects.toThrow(/robots\.txt/);
    expect(fetched.every((href) => href.endsWith("/robots.txt"))).toBe(true);
  });

  it("evaluates robots longest-match with allow overrides", async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url).endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow: /shop\nAllow: /shop/item\n");
      }
      throw new Error("unexpected");
    }) as unknown as typeof fetch;

    expect(await isPathAllowedByRobots(new URL("https://robots-allow.example.com/shop/item/1"), fetcher)).toBe(true);
    expect(await isPathAllowedByRobots(new URL("https://robots-allow.example.com/shop/cart"), fetcher)).toBe(false);
    expect(await isPathAllowedByRobots(new URL("https://robots-allow.example.com/other"), fetcher)).toBe(true);
  });

  it("rejects non-USD listings instead of pretending a conversion", async () => {
    const eurHtml = productHtml.replace('"priceCurrency":"USD"', '"priceCurrency":"EUR"');
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      if (String(url).endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response(eurHtml);
    }) as unknown as typeof fetch;

    await expect(fetchUniversalListing("https://eur-site.example.com/item/1", fetcher))
      .rejects.toThrow(/EUR/);
  });

  it("uses Tavily Extract as an exact-URL fallback when page structure lacks price facts", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tavily-test");
    vi.stubEnv("OPENAI_API_KEY", "");
    const requestedBodies: unknown[] = [];
    const fetcher = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith("/robots.txt")) return new Response("", { status: 404 });
      if (href === "https://api.tavily.com/extract") {
        requestedBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(JSON.stringify({
          results: [{
            url: "https://www.mercari.com/us/item/mfallback/",
            title: "Umbreon VMAX 215/203 Evolving Skies Near Mint",
            content: "Price $1,850.00. Shipping $5.00. Front and back photos. Clean surface.",
          }],
          failed_results: [],
        }));
      }
      return new Response("<html><body>Login-gated marketplace shell</body></html>");
    }) as unknown as typeof fetch;

    const result = await fetchUniversalListing("https://www.mercari.com/us/item/mfallback/", fetcher);

    expect(result.listing.title).toContain("Umbreon VMAX");
    expect(result.listing.price).toBe(1850);
    expect(result.listing.shipping).toBe(5);
    expect(result.listing.claimedCondition).toBe("Near Mint");
    expect(result.listing.evidence.photoCount).toBe(2);
    expect(result.extractedCard.number).toBe("215/203");
    expect(result.notes.some((note) => note.includes("Tavily Extract filled missing listing facts"))).toBe(true);
    expect(requestedBodies).toHaveLength(1);
    expect(requestedBodies[0]).toMatchObject({
      urls: ["https://www.mercari.com/us/item/mfallback/"],
      extract_depth: "basic",
    });
  });

  it("uses Tavily Extract when the exact page fetch is robots-allowed but HTTP-blocked", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tavily-test");
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetched: string[] = [];
    const fetcher = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      const href = String(url);
      fetched.push(href);
      if (href.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n");
      if (href === "https://api.tavily.com/extract") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { urls?: string[] };
        expect(body.urls).toEqual(["https://www.mercari.com/us/item/mblocked/"]);
        return new Response(JSON.stringify({
          results: [{
            url: "https://www.mercari.com/us/item/mblocked/",
            title: "Umbreon VMAX 215/203 Evolving Skies",
            raw_content: "Asking $1,925.00. Shipping $0.00. NM. Photos included.",
          }],
          failed_results: [],
        }));
      }
      return new Response("blocked", { status: 403 });
    }) as unknown as typeof fetch;

    const result = await fetchUniversalListing("https://www.mercari.com/us/item/mblocked/", fetcher);

    expect(result.listing.price).toBe(1925);
    expect(result.listing.shipping).toBe(0);
    expect(result.extractedCard.number).toBe("215/203");
    expect(result.notes.join(" ")).toContain("Direct fetch returned HTTP 403");
    expect(fetched).toContain("https://api.tavily.com/extract");
  });
});
