import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { discoverCards } from "@/lib/ai/card-discovery";
import { clearLocalRateLimitStore } from "@/lib/ops/rate-limit";

vi.mock("@/lib/ai/card-discovery", () => ({
  discoverCards: vi.fn(async (request) => ({
    discoveryContractVersion: 1,
    status: "no_matches",
    request,
    evaluatedIdentities: 10,
    marketEligibleIdentities: 0,
    shortlist: [],
    warnings: [],
    limitations: [],
    generatedAt: "2026-07-12T00:00:00.000Z",
  })),
}));

describe("/api/agent/card-discovery", () => {
  beforeEach(() => {
    clearLocalRateLimitStore();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("RATE_LIMIT_DISCOVERY_MAX", "1");
    vi.stubEnv("RATE_LIMIT_DISCOVERY_WINDOW_MS", "60000");
    vi.stubEnv("RATE_LIMIT_SALT", "discovery-route-test");
  });

  it("validates and runs one bounded discovery request", async () => {
    const response = await POST(requestFor({
      query: "Pikachu",
      game: "pokemon",
      budget: { min: 200, max: 500 },
      desiredCondition: "Near Mint",
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("discovery-test-request");
    expect(discoverCards).toHaveBeenCalledWith(expect.objectContaining({
      query: "Pikachu",
      budget: { min: 200, max: 500, currency: "USD", basis: "checkout" },
      maxResults: 3,
    }), { now: expect.any(Function) });
  });

  it("rejects reversed budgets before discovery", async () => {
    const response = await POST(requestFor({ query: "Pikachu", budget: { min: 500, max: 200 } }));

    expect(response.status).toBe(400);
    expect(discoverCards).not.toHaveBeenCalled();
  });

  it("rate limits discovery independently from exact-card searches", async () => {
    const body = { query: "Pikachu", budget: { min: 200, max: 500 } };
    const first = await POST(requestFor(body));
    const second = await POST(requestFor(body));

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });
});

function requestFor(body: unknown) {
  return new Request("https://tcglens.test/api/agent/card-discovery", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.61",
      "x-request-id": "discovery-test-request",
    },
    body: JSON.stringify(body),
  });
}
