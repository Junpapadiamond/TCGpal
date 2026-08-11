import { describe, expect, it, vi } from "vitest";

import { buildCompareRequest, compare, resolve } from "./compare-probe.mjs";

const CARD = {
  id: "op-nami-op01-016",
  query: "Nami OP01-016",
  game: "onePiece",
  name: "Nami",
  setCode: "OP01",
  cardNumber: "OP01-016",
  confirmedCardId: "OP01-016",
};

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => "" });
const fail = (status, body = "boom", headers = {}) => ({
  ok: false,
  status,
  json: async () => ({}),
  text: async () => body,
  headers: { get: (key) => headers[key] ?? null },
});

describe("buildCompareRequest", () => {
  // These four fields decide which rows are eligible. If they drift, a sample
  // built with this helper stops describing the rows the recall run counted.
  it("holds the buyer context every instrument shares", () => {
    const body = buildCompareRequest(CARD, "OP01-016");
    expect(body.buyer).toEqual({ country: "US", postalCode: "10001", taxRate: null, desiredCondition: "Near Mint" });
    expect(body.cardHint.language).toBe("English");
    expect(body.webDiscoveryMode).toBe("off");
    expect(body.manualCandidates).toEqual([]);
  });

  it("carries the card hint through so the search is not name-only", () => {
    const body = buildCompareRequest(CARD, "OP01-016");
    expect(body.cardHint).toMatchObject({ game: "onePiece", name: "Nami", setCode: "OP01", cardNumber: "OP01-016" });
    expect(body.confirmedCardId).toBe("OP01-016");
  });

  it("omits confirmedCardId entirely when there is none to send", () => {
    expect("confirmedCardId" in buildCompareRequest(CARD, null)).toBe(false);
  });

  // The probe measures retrieval, not the paste-a-URL path, so it must not
  // smuggle a listing in as a candidate.
  it("sends an empty source listing rather than a fabricated one", () => {
    const body = buildCompareRequest(CARD, null);
    expect(body.sourceListing.url).toBe("");
    expect(body.sourceListing.price).toBeNull();
    expect(body.sourceListing.evidence.photoCount).toBe(0);
  });
});

describe("compare", () => {
  it("returns the parsed report on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ status: "complete" }));
    await expect(compare("https://x", { a: 1 }, { fetchImpl })).resolves.toEqual({ status: "complete" });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://x/api/agent/listing-compare");
  });

  it("waits out a rate limit and keeps the card in the measurement", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(fail(429, "slow down", { "Retry-After": "3" }))
      .mockResolvedValueOnce(ok({ status: "complete" }));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(compare("https://x", {}, { fetchImpl, sleepImpl })).resolves.toEqual({ status: "complete" });
    expect(sleepImpl).toHaveBeenCalledWith(5000);
  });

  it("gives up after the attempt budget instead of retrying forever", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(429, "still limited", { "Retry-After": "1" }));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await expect(compare("https://x", {}, { fetchImpl, sleepImpl, maxAttempts: 3 })).rejects.toThrow(/429/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  // A 500 is a real failure of the thing being measured; retrying it would hide
  // the outage the run is supposed to report.
  it("does not retry a non-429 failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fail(500, "server error"));
    await expect(compare("https://x", {}, { fetchImpl })).rejects.toThrow(/500: server error/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("resolve", () => {
  it("mirrors the buyer's one confirmation tap and prefers the requested print", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(ok({
        status: "needs_confirmation",
        request: { query: "Nami OP01-016" },
        identityCandidates: [
          { id: "OP01-016_p4", confidence: "high" },
          { id: "OP01-016", confidence: "medium" },
        ],
      }))
      .mockResolvedValueOnce(ok({ status: "complete", confirmedCard: { id: "OP01-016" } }));

    const { report, confirmationRequired } = await resolve("https://x", CARD, { fetchImpl });

    expect(confirmationRequired).toBe(true);
    expect(report.confirmedCard.id).toBe("OP01-016");
    // The requested print wins over the higher-confidence sibling.
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).confirmedCardId).toBe("OP01-016");
  });

  it("does not tap anything when the first report already resolved", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({ status: "complete", confirmedCard: { id: "OP01-016" } }));
    const { confirmationRequired } = await resolve("https://x", CARD, { fetchImpl });
    expect(confirmationRequired).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
