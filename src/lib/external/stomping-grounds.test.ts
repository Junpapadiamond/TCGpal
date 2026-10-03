import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isStompingGroundsEnabled, parseStompingGroundsListings, searchStompingGrounds } from "./stomping-grounds";
import { clearLocalCache, getJsonCache, setJsonCache } from "@/lib/ops/cache";
import { enforceRateLimit } from "@/lib/ops/rate-limit";
import { getRedisClient } from "@/lib/ops/redis";
import { normalizeListing, rankListings } from "@/lib/comparison/ranking";
import type { CardIdentityCandidate } from "@/lib/schemas";

vi.mock("@/lib/ops/redis", () => ({ getRedisClient: vi.fn(() => null) }));
vi.mock("@/lib/ops/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

const now = new Date("2026-10-03T12:26:05Z");
const card: CardIdentityCandidate = {
  id: "sv3pt5-200", name: "Blastoise ex", cardNumber: "200/165", setName: "151", setCode: "SV3pt5",
  language: "English", imageUrl: null, confidence: "high", matchReasons: [],
};
const buyer = { country: "US" as const, postalCode: "", desiredCondition: "Near Mint" as const, taxRate: null };
// Hermetic synthetic envelopes using the observed October 3 provider shape.
// These are not live inventory and are never imported by the runtime adapter.
const variant = (changes: Record<string, unknown> = {}) => ({
  id: "gid://shopify/ProductVariant/46939626209566", title: "Near Mint Holofoil",
  price: { amount: 13650, currency: "USD" }, availability: { available: true },
  options: [{ name: "Title", label: "Near Mint Holofoil" }], requires: { shipping: true },
  media: [{ type: "image", url: "https://cdn.shopify.com/stock-image.jpg" }],
  sku: "SV151-200-EN-HF-1", ...changes,
});
const product = (changes: Record<string, unknown> = {}) => ({
  id: "gid://shopify/Product/8520000000001", title: "Blastoise ex (200/165) [Scarlet & Violet 151]",
  url: "https://singles.stompinggroundstcg.com/products/blastoise-ex-200-165-scarlet-violet-151",
  description: { html: "Set: Scarlet &amp; Violet 151 Type: Water Rarity: Special Illustration Rare" },
  tags: ["200", "Holofoil", "Scarlet & Violet 151"],
  collections: [{ handle: "graded-cards", title: "Graded Cards" }],
  price_range: { min: { amount: 1, currency: "USD" }, max: { amount: 200000, currency: "USD" } },
  variants: [variant()], ...changes,
});
const payload = (products: unknown[] = [product()]) => ({ jsonrpc: "2.0", id: 1, result: {
  isError: false, structuredContent: { ucp: { status: "success" }, products },
} });
const input = (fetcher: typeof fetch, overrides: Record<string, unknown> = {}) => ({ card, buyer, fetcher, ...overrides });
function sharedRedis() {
  const values = new Map<string, unknown>();
  const redis = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown, options?: { nx?: boolean }) => {
      if (options?.nx && values.has(key)) return null;
      values.set(key, value); return "OK";
    }),
    eval: vi.fn(async () => 1),
  };
  vi.mocked(getRedisClient).mockReturnValue(redis as unknown as ReturnType<typeof getRedisClient>);
  return { redis, values };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); clearLocalCache();
  vi.mocked(getRedisClient).mockReturnValue(null);
  vi.stubEnv("STOMPING_GROUNDS_ENABLED", "1");
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true, backend: "redis", limit: 60, remaining: 59,
    resetAt: new Date(now.getTime() + 3_600_000), retryAfterSeconds: 3600 });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("Stomping Grounds merchant facts", () => {
  it("uses per-variant USD cents and condition without inventing stock photos, language or complete costs", () => {
    const rows = parseStompingGroundsListings(payload(), card, now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ marketplace: "Stomping Grounds", price: 136.5, claimedCondition: "Near Mint",
      shipping: null, buyerFee: null, listingLanguage: null, imageUrl: null, imageUrls: [],
      evidence: { photoCount: 0, identityExplicit: false }, observedAt: now.toISOString() });
    expect(rows[0].url).toBe(`${product().url}?variant=46939626209566`);
    expect(rows[0].evidence.missing.join(" ")).toMatch(/maintenance/i);
    const normalized = normalizeListing({ listing: rows[0], buyer, confirmedCard: card });
    expect(normalized.costComplete).toBe(false);
    expect(rankListings([normalized])).toEqual([]);
    expect(JSON.stringify(rows)).not.toMatch(/stock-image|sku|collections|Scarlet &amp;/);
  });

  it("filters variant availability and graded labels rather than trusting the parent or graded collection", () => {
    const variants = [variant(), variant({ id: "gid://shopify/ProductVariant/2", availability: { available: false } }),
      variant({ id: "gid://shopify/ProductVariant/3", title: "Graded - PSA 10" }),
      variant({ id: "gid://shopify/ProductVariant/4", title: "Gem Mint CGC 10" }),
      variant({ id: "gid://shopify/ProductVariant/5", title: "Graded" })];
    expect(parseStompingGroundsListings(payload([product({ variants })]), card, now)).toHaveLength(1);
  });

  it("rejects wrong numbers, non-USD, nonphysical, zero and fractional-cent variants", () => {
    const wrong = product({ title: "Blastoise ex (184/165) [Scarlet & Violet 151]" });
    const variants = [variant({ price: { amount: 0, currency: "USD" } }),
      variant({ id: "gid://shopify/ProductVariant/2", price: { amount: 5, currency: "CAD" } }),
      variant({ id: "gid://shopify/ProductVariant/3", requires: { shipping: false } })];
    expect(parseStompingGroundsListings(payload([wrong, product({ variants })]), card, now)).toEqual([]);
    expect(() => parseStompingGroundsListings(payload([product({ variants: [variant({ price: { amount: 10.5, currency: "USD" } })] })]), card, now)).toThrow(/schema/i);
  });

  it("preserves exact One Piece number evidence while leaving parallel print checks to ranking", () => {
    const luffy = { ...card, id: "OP01-024", name: "Monkey.D.Luffy", setName: "Romance Dawn", setCode: "OP01", cardNumber: "OP01-024" };
    const rows = parseStompingGroundsListings(payload([product({ title: "Monkey.D.Luffy (Parallel) [Romance Dawn]",
      description: { html: "<p>Set Name: Romance Dawn Card Number: OP01-024 Release Date: 2022-12-02 Rarity: Super Rare</p>Private seller text must not persist." },
      variants: [variant({ title: "(Japanese) - Near Mint", options: [{ name: "Title", label: "(Japanese) - Near Mint" }] })],
    })]), luffy, now);
    expect(rows[0].matchAspectText).toContain("OP01-024");
    expect(rows[0].listingLanguage).toBe("Japanese");
    expect(rows[0].claimedCondition).toBe("Near Mint");
    expect(JSON.stringify(rows)).not.toContain("Private seller");
    const normalized = normalizeListing({ listing: rows[0], buyer, confirmedCard: luffy, variantIntent: "base", cardLanguage: "English" });
    expect(normalized.eligible).toBe(false);
    expect(normalized.exclusionReasons.join(" ")).toMatch(/different print/);
    expect(normalized.exclusionReasons.join(" ")).toMatch(/language.*conflicts/);
  });

  it("does not let one matching field hide a conflicting explicit collector number", () => {
    const conflicting = product({ description: { html: "Card Number: 184/165 Release Date: 2023-09-22" } });
    expect(parseStompingGroundsListings(payload([conflicting]), card, now)).toEqual([]);
  });

  it.each([
    { variants: [variant({ options: [{ name: "Collector number", label: "184/165" }] })] },
    { variants: [variant({ options: [{ name: "Collector number", label: "200/165 and 184/165" }] })] },
    { tags: ["200/165", "184/165"] },
    { tags: ["200/165 and 184/165"] },
    { description: { html: "Card Number: 200/165 Release Date: 2023-09-22 Card Number: 184/165" } },
  ])("rejects conflicting structured collector evidence despite a matching product title: %j", (changes) => {
    expect(parseStompingGroundsListings(payload([product(changes)]), card, now)).toEqual([]);
  });

  it("does not infer Near Mint from vague, negated, mixed or generic condition labels", () => {
    for (const title of ["Mint", "Like new", "Not Near Mint", "Near Mint / Lightly Played", "Default Title"]) {
      const rows = parseStompingGroundsListings(payload([product({ variants: [variant({ title, options: [] })] })]), card, now);
      expect(rows[0]?.claimedCondition).toBe("Unknown");
    }
  });

  it("rejects contradictory condition options rather than choosing the better condition", () => {
    const variants = [variant({ options: [{ name: "Condition", label: "Lightly Played" }] })];
    expect(parseStompingGroundsListings(payload([product({ variants })]), card, now)).toEqual([]);
  });

  it("requires official product URLs and boolean availability instead of treating malformed input as inventory", () => {
    for (const changes of [{ url: "https://evil.example/products/card" }, { url: "https://singles.stompinggroundstcg.com/cart/123:1" },
      { variants: [variant({ availability: { available: "true" } })] }]) {
      expect(() => parseStompingGroundsListings(payload([product(changes)]), card, now)).toThrow(/schema/i);
    }
  });

  it("bounds and deduplicates active raw variants", () => {
    const variants = Array.from({ length: 20 }, (_, index) => variant({ id: `gid://shopify/ProductVariant/${index + 1}` }));
    const rows = parseStompingGroundsListings(payload([product({ variants }), product({ variants })]), card, now);
    expect(rows).toHaveLength(12);
    expect(new Set(rows.map((row) => row.id)).size).toBe(12);
  });

  it("accepts the documented text envelope and rejects error, missing-products and oversized-products envelopes", () => {
    expect(parseStompingGroundsListings({ result: { content: [{ type: "text", text: JSON.stringify({ products: [product()] }) }] } }, card, now)).toHaveLength(1);
    for (const bad of [{ error: { message: "private provider error" } }, { result: { isError: true, structuredContent: { products: [] } } },
      { result: { structuredContent: {} } }, payload(Array.from({ length: 6 }, () => product()))]) {
      expect(() => parseStompingGroundsListings(bad, card, now)).toThrow(/schema|error/i);
    }
  });
});

describe("bounded official catalog acquisition", () => {
  it("requires explicit activation before cache, limiter or network access", async () => {
    vi.stubEnv("STOMPING_GROUNDS_ENABLED", "true");
    const fetcher = vi.fn();
    expect(isStompingGroundsEnabled()).toBe(false);
    await expect(searchStompingGrounds(input(fetcher))).rejects.toThrow(/disabled/i);
    expect(enforceRateLimit).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });

  it("makes one read-only US/USD search with own profile and ignores optional query URLs", async () => {
    const fetcher = vi.fn(async () => Response.json(payload()));
    await searchStompingGrounds(input(fetcher, { plan: { query: "https://evil.example" } }));
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://singles.stompinggroundstcg.com/api/ucp/mcp");
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
    expect(JSON.parse(init.body as string)).toMatchObject({ method: "tools/call", params: { name: "search_catalog", arguments: {
      meta: { "ucp-agent": { profile: "https://lenstcg.com/ucp-profile.json" } },
      catalog: { query: "Blastoise ex 200/165", context: { address_country: "US", currency: "USD" }, pagination: { limit: 5 } },
    } } });
    expect(enforceRateLimit).toHaveBeenCalledWith("stomping-grounds:global", { max: 60, windowMs: 3_600_000 });
  });

  it("coalesces requests and caches sanitized facts with unchanged observation time for five minutes", async () => {
    const fetcher = vi.fn(async () => Response.json(payload()));
    const [a, b] = await Promise.all([searchStompingGrounds(input(fetcher)), searchStompingGrounds(input(fetcher))]);
    expect(a).toEqual(b); expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(299_000);
    expect((await searchStompingGrounds(input(fetcher)))[0].observedAt).toBe(now.toISOString());
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_001);
    await searchStompingGrounds(input(fetcher)); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails closed when shared rate limiting is unavailable in production or denied", async () => {
    vi.stubEnv("NODE_ENV", "production");
    sharedRedis();
    const fetcher = vi.fn();
    vi.mocked(enforceRateLimit).mockResolvedValueOnce({ allowed: true, backend: "memory", limit: 60, remaining: 59, resetAt: now, retryAfterSeconds: 60 });
    await expect(searchStompingGrounds(input(fetcher))).rejects.toThrow(/shared/i);
    vi.mocked(enforceRateLimit).mockResolvedValueOnce({ allowed: false, backend: "redis", limit: 60, remaining: 0, resetAt: now, retryAfterSeconds: 60 });
    await expect(searchStompingGrounds(input(fetcher))).rejects.toThrow(/limit/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not cache provider failures as empty results and never retries an acquisition automatically", async () => {
    const fetcher = vi.fn(async () => new Response("private upstream details", { status: 403 }));
    await expect(searchStompingGrounds(input(fetcher))).rejects.toThrow(/HTTP 403/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockImplementationOnce(async () => Response.json(payload()));
    await expect(searchStompingGrounds(input(fetcher))).resolves.toHaveLength(1);
  });

  it("honors upstream throttling across card queries", async () => {
    const fetcher = vi.fn(async () => new Response("rate limited", { status: 429, headers: { "Retry-After": "120" } }));
    await expect(searchStompingGrounds(input(fetcher))).rejects.toThrow(/HTTP 429/);
    await expect(searchStompingGrounds(input(fetcher, { card: { ...card, id: "other" } }))).rejects.toThrow(/cooldown/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails closed on Redis cooldown GET failure even when the rate limiter succeeds", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { redis } = sharedRedis();
    redis.get.mockRejectedValue(new Error("private redis failure"));
    const fetcher = vi.fn(async () => Response.json(payload()));
    await expect(searchStompingGrounds(input(fetcher))).rejects.toThrow(/shared.*cooldown/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("checks Redis cooldown writeability before acquisition even when GET and the limiter succeed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { redis } = sharedRedis();
    redis.set.mockRejectedValue(new Error("private redis failure"));
    const fetcher = vi.fn(async () => Response.json(payload()));
    await expect(searchStompingGrounds(input(fetcher))).rejects.toThrow(/shared.*cooldown/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("leaves a durable pause after 429 publication fails, so another card cannot bypass it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { redis } = sharedRedis();
    redis.eval.mockRejectedValue(new Error("write failed after request"));
    const fetcher = vi.fn(async () => new Response("", { status: 429, headers: { "Retry-After": "172800" } }));
    await expect(searchStompingGrounds(input(fetcher))).rejects.toThrow(/shared.*cooldown/i);
    // A separate card bypasses process request coalescing and successful-result caches.
    await expect(searchStompingGrounds(input(fetcher, { card: { ...card, id: "other-instance-card" } }))).rejects.toThrow(/pause|in.flight/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), { nx: true });
  });

  it("never shortens a valid Retry-After longer than one day", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 429, headers: { "Retry-After": "172800" } }));
    await expect(searchStompingGrounds(input(fetcher))).rejects.toThrow(/429/);
    vi.advanceTimersByTime(86_401_000);
    await expect(searchStompingGrounds(input(fetcher))).rejects.toThrow(/cooldown/i);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("preserves the longest concurrent cooldown deadline", async () => {
    const fetcher = vi.fn(async () => {
      await setJsonCache("stomping-grounds", "cooldown", Date.now() + 172_800_000, { ttlSeconds: 172800 });
      return new Response("", { status: 429, headers: { "Retry-After": "120" } });
    });
    await expect(searchStompingGrounds(input(fetcher))).rejects.toThrow(/429/);
    expect(await getJsonCache("stomping-grounds", "cooldown")).toBe(now.getTime() + 172_800_000);
  });

  it("rejects missing, malformed and oversized bodies", async () => {
    for (const response of [new Response(null), new Response("{invalid"), new Response("x".repeat(2_000_001))]) {
      await expect(searchStompingGrounds(input(vi.fn(async () => response)))).rejects.toThrow(/body|JSON|size/i);
    }
  });

  it("applies the deadline to a response body that never finishes", async () => {
    const cancel = vi.fn();
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ cancel })));
    const outcome = searchStompingGrounds(input(fetcher)).then(() => "resolved", (error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(8_001);
    expect(await outcome).toMatch(/timed out/i); expect(fetcher).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalled();
  });

  it("honors cancellation before acquisition and while waiting for headers", async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn();
    await expect(searchStompingGrounds(input(fetcher, { signal: controller.signal }))).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    const live = new AbortController();
    const hung = vi.fn(() => new Promise<Response>(() => {}));
    const outcome = searchStompingGrounds(input(hung, { signal: live.signal })).then(() => "resolved", (error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(1); live.abort();
    expect(await outcome).toMatch(/cancel|abort/i);
  });

  it("does not trust stale, future or wrong-card cached observations", async () => {
    const fetcher = vi.fn(async () => Response.json(payload()));
    await searchStompingGrounds(input(fetcher));
    const key = JSON.stringify(["v2", card.id, card.name, card.cardNumber, card.setName, card.setCode, card.language]);
    const cached = await getJsonCache<{ observedAt: string; rows: unknown[] }>("stomping-grounds", key);
    expect(cached).not.toBeNull();
    const corrupt = [
      { ...cached, observedAt: "2026-10-02T12:00:00Z" },
      { ...cached, observedAt: "2026-10-04T12:00:00Z" },
      { ...cached, rows: [{ ...(cached!.rows[0] as Record<string, unknown>), cardId: "another-card" }] },
    ];
    for (const value of corrupt) {
      await setJsonCache("stomping-grounds", key, value, { ttlSeconds: 300 });
      await searchStompingGrounds(input(fetcher));
    }
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
