import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ compare: vi.fn(), redis: { eval: vi.fn(), get: vi.fn(), set: vi.fn() } }));
vi.mock("@/lib/ops/redis", () => ({ getRedisClient: () => mocks.redis }));
vi.mock("@/lib/ai/listing-compare", () => ({ runListingComparison: mocks.compare }));
import { createCloudDependencies, reserveCloudScript, releaseCloudScript } from "./cloud-runtime";
import cohort from "./real-card-cohort.json";
afterEach(() => vi.clearAllMocks());
it("uses one atomic durable reservation and owner-checked release", async () => {
  mocks.redis.eval.mockResolvedValue("reserved");
  const d = createCloudDependencies();
  expect(await d.reserve("daily:2026-10-20")).toBe("reserved");
  const [script, keys, owner] = mocks.redis.eval.mock.calls[0];
  expect(script).toBe(reserveCloudScript);
  expect(keys).toEqual(["tcglens:card-eval:v1:reserved:daily:2026-10-20", "tcglens:card-eval:v1:lock"]);
  await d.release();
  expect(mocks.redis.eval).toHaveBeenLastCalledWith(releaseCloudScript, [keys[1]], owner);
});
it("acquires only eBay with structured identity and no buyer location or query-model round trip", async () => {
  mocks.compare.mockResolvedValue({ status: "next_moves", generatedAt: new Date().toISOString(), candidates: [] });
  const d = createCloudDependencies();
  await d.sample(cohort.cards[0]);
  const [request, dependencies] = mocks.compare.mock.calls[0];
  expect(request.marketScope).toBe("single"); expect(request.query).toBeUndefined();
  expect(request.buyer.postalCode).toBe(""); expect(request.webDiscoveryMode).toBe("off");
  expect(dependencies.agents.map((a: { marketplace: string }) => a.marketplace)).toEqual(["eBay"]);
  expect(dependencies.signal).toBeInstanceOf(AbortSignal);
});
