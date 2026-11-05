import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { isCardTraderEnabled, parseCardTraderOffers, searchCardTrader, selectCardTraderBlueprint } from "./cardtrader";
import { clearLocalCache } from "@/lib/ops/cache";
import { enforceRateLimit } from "@/lib/ops/rate-limit";
import { normalizeListing, rankListings } from "@/lib/comparison/ranking";
import type { CardIdentityCandidate } from "@/lib/schemas";

vi.mock("@/lib/ops/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/ops/redis", () => ({ getRedisClient: () => null }));
const card: CardIdentityCandidate = { id: "swsh7-215", name: "Umbreon VMAX", cardNumber: "215/203",
  setName: "Evolving Skies", setCode: "swsh7", language: "English", confidence: "high", imageUrl: null, matchReasons: [] };
const buyer = { country: "US" as const, postalCode: "", desiredCondition: "Near Mint" as const, taxRate: null };
const expansion = { id: 2309, game_id: 5, code: "evs", name: "Evolving Skies" };
const blueprint = { id: 166453, name: "Umbreon VMAX", version: "Special Illustration Rare | 215/203",
  game_id: 5, category_id: 73, expansion_id: 2309, tcg_player_id: 246723, fixed_properties: { collector_number: "215" } };
const properties = { condition: "Near Mint", signed: false, altered: false, collector_number: "215",
  pokemon_language: "en", pokemon_reverse: false, first_edition: false };
// Synthetic seller details, shaped after the authenticated November 5 response.
const offer = (overrides: Record<string, unknown> = {}) => ({ id: 123, blueprint_id: 166453, name_en: "Umbreon VMAX",
  expansion: { id: 2309, code: "evs", name_en: "Evolving Skies" }, quantity: 2, description: null,
  properties_hash: properties, graded: false, on_vacation: false, price: { cents: 238401, currency: "USD" },
  user: { country_code: "US", username: "Test seller" }, ...overrides });
const payload = (rows = [offer()]) => ({ "166453": rows });
const selected = () => selectCardTraderBlueprint([blueprint], card, 246723)!;
const input = (fetcher: typeof fetch, overrides = {}) => ({ card, buyer, fetcher, plan: { tcgplayerProductId: 246723 }, ...overrides });

beforeEach(() => {
  clearLocalCache();
  vi.stubEnv("CARDTRADER_ENABLED", "1"); vi.stubEnv("CARDTRADER_API_TOKEN", "test-only-token");
  vi.stubEnv("CARDTRADER_MARKET_DATA_APPROVED", "1");
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true, backend: "redis", limit: 1, remaining: 0,
    resetAt: new Date(Date.now() + 1000), retryAfterSeconds: 1 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });

it("requires operator activation, credentials and approved market-data use independently", () => {
  expect(isCardTraderEnabled()).toBe(true);
  for (const key of ["CARDTRADER_ENABLED", "CARDTRADER_API_TOKEN", "CARDTRADER_MARKET_DATA_APPROVED"]) {
    const value = process.env[key]; vi.stubEnv(key, ""); expect(isCardTraderEnabled()).toBe(false); vi.stubEnv(key, value);
  }
});
it("joins one exact external product, rejecting duplicate, wrong game, number, category and name mappings", () => {
  expect(selected()).toMatchObject({ id: 166453 });
  expect(selectCardTraderBlueprint([blueprint], card, null)).toBeNull();
  expect(selectCardTraderBlueprint([blueprint, { ...blueprint, id: 2 }], card, 246723)).toBeNull();
  for (const patch of [{ game_id: 15 }, { category_id: 190 }, { name: "Espeon VMAX" },
    { tcg_player_id: 246722 }, { fixed_properties: { collector_number: "214" } }, { version: "214/203" }]) {
    expect(selectCardTraderBlueprint([{ ...blueprint, ...patch }], card, 246723)).toBeNull();
  }
});
it("keeps account-currency offers review-only with unknown charges and no invented photos or seller history", () => {
  const [row] = parseCardTraderOffers(payload(), selected(), card, new Date("2026-11-05T02:00:00Z"));
  expect(row).toMatchObject({ marketplace: "CardTrader", price: 2384.01, shipping: null, buyerFee: null,
    imageUrl: null, imageUrls: [], evidence: { photoCount: 0 }, claimedCondition: "Near Mint", listingLanguage: "English" });
  expect(row.url).toBe("https://www.cardtrader.com/en/cards/166453");
  expect(row.evidence.missing.join(" ")).toMatch(/account.currency/i);
  const normalized = normalizeListing({ listing: row, buyer, confirmedCard: card });
  expect(normalized.costComplete).toBe(false); expect(rankListings([normalized])).toEqual([]);
});
it.each([
  { quantity: 0 }, { graded: true }, { on_vacation: true }, { bundle_size: 4 }, { blueprint_id: 2 },
  { name_en: "Espeon VMAX" }, { user: { country_code: "IT", username: "Test" } },
  { expansion: { id: 999, code: "other", name_en: "Another set" } }, { price: { cents: 500, currency: "EUR" } },
  { properties_hash: { ...properties, signed: true } }, { properties_hash: { ...properties, altered: true } },
  { properties_hash: { ...properties, pokemon_language: "jp" } }, { properties_hash: { ...properties, collector_number: "214" } },
  { properties_hash: { ...properties, pokemon_reverse: true } }, { properties_hash: { ...properties, first_edition: true } },
  { description: "4x lot" }, { description: "Japanese 215/203" }, { description: "PSA 10" },
])("rejects conflicting or unusable seller offer %j", patch => {
  expect(parseCardTraderOffers(payload([offer(patch)]), selected(), card)).toEqual([]);
});
it("does not upgrade unrecognized or weaker seller condition to Near Mint", () => {
  const rows = parseCardTraderOffers(payload([offer({ properties_hash: { ...properties, condition: "Slightly Played" } })]), selected(), card);
  expect(rows[0].claimedCondition).toBe("Lightly Played");
  expect(parseCardTraderOffers(payload([offer({ properties_hash: { ...properties, condition: "Like New" } })]), selected(), card)[0].claimedCondition).toBe("Unknown");
});
it("retains official One Piece reprint metadata without treating catalog terminology as a seller replica claim", () => {
  const nami = { ...card, id: "OP01-016", name: "Nami", cardNumber: "OP01-016", setName: "Romance Dawn", setCode: "OP-01", language: "EN" };
  const bp = { ...blueprint, id: 244494, name: "Nami", game_id: 15, category_id: 192, expansion_id: 3332,
    tcg_player_id: 454534, version: 'Foil Reprint | "reveal up to 1 {Straw Hat Crew} type Character"', fixed_properties: { collector_number: "OP01-016" } };
  const product = offer({ blueprint_id: bp.id, name_en: "Nami", expansion: { id: 3332, code: "op01", name_en: "OP-01: Romance Dawn" },
    properties_hash: { condition: "Near Mint", signed: false, altered: false, collector_number: "OP01-016", onepiece_language: "en" } });
  const [row] = parseCardTraderOffers({ [bp.id]: [product] }, bp, nami);
  expect(row).toBeDefined(); expect(row.matchAspectText).toContain("Foil Reprint");
  expect(normalizeListing({ listing: row, buyer, confirmedCard: nami }).exclusionReasons.join(" ")).not.toMatch(/replica|excluded product/i);
});
it("fails visibly on invalid envelopes or fractional cents", () => {
  expect(() => parseCardTraderOffers({ error: "denied" }, selected(), card)).toThrow(/schema/i);
  expect(() => parseCardTraderOffers(payload([offer({ price: { cents: 2.5, currency: "USD" } })]), selected(), card)).toThrow(/schema/i);
});
it("searches bounded official GET endpoints then reuses the observed cache without another request", async () => {
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-only-token" });
    expect(init?.redirect).toBe("error"); expect(init?.method).toBe("GET");
    const path = new URL(String(url)).pathname;
    return Response.json(path.endsWith("/expansions") ? { array: [expansion] } : path.endsWith("/export") ? [blueprint] : payload());
  }) as unknown as typeof fetch;
  const rows = await searchCardTrader(input(fetcher)); expect(rows).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(await searchCardTrader(input(fetcher))).toEqual(rows); expect(fetcher).toHaveBeenCalledTimes(3);
});
it("does no acquisition without exact product mapping or approval", async () => {
  const fetcher = vi.fn();
  await expect(searchCardTrader(input(fetcher, { plan: {} }))).rejects.toThrow(/mapping/i);
  vi.stubEnv("CARDTRADER_MARKET_DATA_APPROVED", "0");
  await expect(searchCardTrader(input(fetcher))).rejects.toThrow(/approved|disabled/i); expect(fetcher).not.toHaveBeenCalled();
});
it.each([401, 403, 429, 500])("stops on HTTP %i without retry or credential switching", async status => {
  const fetcher = vi.fn(async () => new Response("private-error-token", { status }));
  await expect(searchCardTrader(input(fetcher))).rejects.toThrow(`HTTP ${status}`);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("fails closed when the shared request limiter is unavailable in production", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true, backend: "memory", limit: 1, remaining: 0,
    resetAt: new Date(), retryAfterSeconds: 1 });
  const fetcher = vi.fn(); await expect(searchCardTrader(input(fetcher))).rejects.toThrow(/limiter/); expect(fetcher).not.toHaveBeenCalled();
});
it("stops before network acquisition after cancellation", async () => {
  const controller = new AbortController(); controller.abort(); const fetcher = vi.fn();
  await expect(searchCardTrader(input(fetcher, { signal: controller.signal }))).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
});
it("bounds the response body even when content-length is absent", async () => {
  const fetcher = vi.fn(async () => new Response(new Uint8Array(4_000_001)));
  await expect(searchCardTrader(input(fetcher))).rejects.toThrow(/size limit/); expect(fetcher).toHaveBeenCalledOnce();
});
it("bounds a stalled response stream, including body parsing, without retries", async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start() {} })));
    const result = searchCardTrader(input(fetcher)).catch(error => error);
    await vi.advanceTimersByTimeAsync(12_001);
    expect((await result).message).toMatch(/timed out/); expect(fetcher).toHaveBeenCalledOnce();
  } finally { vi.useRealTimers(); }
});
it("fails visibly when no exact blueprint exists and never queries offers for a different print", async () => {
  const urls: string[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    urls.push(String(url)); return Response.json(String(url).endsWith("/expansions") ? [expansion] : [{ ...blueprint, tcg_player_id: 246722 }]);
  }) as unknown as typeof fetch;
  await expect(searchCardTrader(input(fetcher))).rejects.toThrow(/no sibling print/);
  expect(urls).toHaveLength(2); expect(urls.some(url => url.includes("marketplace"))).toBe(false);
});
