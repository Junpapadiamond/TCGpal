import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { resolveCardIdentityRuntime } from "@/lib/ai/card-identity-runtime";
import { clearLocalRateLimitStore } from "@/lib/ops/rate-limit";

vi.mock("@/lib/ai/card-identity-runtime", () => ({
  resolveCardIdentityRuntime: vi.fn(async () => ({
    identityContractVersion: 1,
    status: "needs_confirmation",
    candidates: [],
    confirmedCard: null,
    warnings: [],
    generatedAt: "2026-07-12T00:00:00.000Z",
  })),
}));

describe("/api/agent/card-identity", () => {
  beforeEach(() => {
    clearLocalRateLimitStore();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("RATE_LIMIT_IDENTITY_MAX", "1");
    vi.stubEnv("RATE_LIMIT_IDENTITY_WINDOW_MS", "60000");
    vi.stubEnv("RATE_LIMIT_SALT", "identity-route-test");
  });

  it("validates and resolves one card identity request", async () => {
    const response = await POST(requestFor({ query: "Pikachu", cardHint: { game: "pokemon" } }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("identity-test-request");
    await expect(response.json()).resolves.toMatchObject({
      identityContractVersion: 1,
      status: "needs_confirmation",
    });
    expect(resolveCardIdentityRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ query: "Pikachu" }),
      expect.objectContaining({
        now: expect.any(Function),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects malformed input before identity resolution", async () => {
    const response = await POST(requestFor({ query: "" }));

    expect(response.status).toBe(400);
    expect(resolveCardIdentityRuntime).not.toHaveBeenCalled();
  });

  it("rate limits repeated catalog searches independently", async () => {
    const first = await POST(requestFor({ query: "Pikachu", cardHint: { game: "pokemon" } }));
    const second = await POST(requestFor({ query: "Pikachu", cardHint: { game: "pokemon" } }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
    expect(resolveCardIdentityRuntime).toHaveBeenCalledTimes(1);
  });
});

function requestFor(body: unknown) {
  return new Request("https://tcglens.test/api/agent/card-identity", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.60",
      "x-request-id": "identity-test-request",
    },
    body: JSON.stringify(body),
  });
}
