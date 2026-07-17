import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCardIdentityRuntimeForTests,
  resolveCardIdentityRuntime,
} from "@/lib/ai/card-identity-runtime";
import type { CardIdentitySearchResponse } from "@/lib/schemas";

const input = {
  query: "Pikachu",
  cardHint: { game: "pokemon" as const },
};

const resolved: CardIdentitySearchResponse = {
  identityContractVersion: 1,
  status: "needs_confirmation",
  candidates: [{
    id: "base1-58",
    name: "Pikachu",
    setName: "Base",
    setCode: "BS",
    cardNumber: "58/102",
    language: "English",
    imageUrl: null,
    confidence: "high",
    matchReasons: ["Card name matches."],
  }],
  confirmedCard: null,
  warnings: [],
  generatedAt: "2026-07-17T00:00:00.000Z",
};

describe("card identity runtime", () => {
  beforeEach(() => {
    clearCardIdentityRuntimeForTests();
  });

  it("coalesces identical searches without letting one cancelled waiter abort another", async () => {
    let finish!: (value: CardIdentitySearchResponse) => void;
    let sharedSignal: AbortSignal | undefined;
    const resolver = vi.fn((_input, dependencies) => {
      sharedSignal = dependencies.signal;
      return new Promise<CardIdentitySearchResponse>((resolve) => {
        finish = resolve;
      });
    });
    const firstController = new AbortController();
    const secondController = new AbortController();

    const first = resolveCardIdentityRuntime(input, {
      resolver,
      signal: firstController.signal,
      deadlineMs: 5_000,
    });
    const second = resolveCardIdentityRuntime(input, {
      resolver,
      signal: secondController.signal,
      deadlineMs: 5_000,
    });
    await vi.waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));

    firstController.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(sharedSignal?.aborted).toBe(false);

    finish(resolved);
    await expect(second).resolves.toEqual(resolved);
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it("aborts shared upstream work after every waiter leaves", async () => {
    let sharedSignal: AbortSignal | undefined;
    const resolver = vi.fn((_input, dependencies) => {
      sharedSignal = dependencies.signal;
      return new Promise<CardIdentitySearchResponse>((_resolve, reject) => {
        dependencies.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        }, { once: true });
      });
    });
    const firstController = new AbortController();
    const secondController = new AbortController();

    const first = resolveCardIdentityRuntime(input, {
      resolver,
      signal: firstController.signal,
      deadlineMs: 5_000,
    });
    const second = resolveCardIdentityRuntime(input, {
      resolver,
      signal: secondController.signal,
      deadlineMs: 5_000,
    });
    await vi.waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));

    firstController.abort();
    secondController.abort();

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(sharedSignal?.aborted).toBe(true);
  });

  it("does not start upstream work for a request that is already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const resolver = vi.fn(async () => resolved);

    await expect(resolveCardIdentityRuntime(input, {
      resolver,
      signal: controller.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("returns an honest unavailable response before the route hard timeout", async () => {
    const resolver = vi.fn((_input, dependencies) => (
      new Promise<CardIdentitySearchResponse>((_resolve, reject) => {
        dependencies.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        }, { once: true });
      })
    ));

    const result = await resolveCardIdentityRuntime(input, {
      resolver,
      deadlineMs: 10,
    });

    expect(result.status).toBe("unavailable");
    expect(result.warnings.join(" ")).toMatch(/temporarily unavailable/i);
    expect(result.warnings.join(" ")).toMatch(/catalog lookup unavailable/i);
  });

  it("enforces the deadline even when an upstream resolver ignores cancellation", async () => {
    const resolver = vi.fn(() => (
      new Promise<CardIdentitySearchResponse>((resolve) => {
        setTimeout(() => resolve(resolved), 50);
      })
    ));

    const result = await resolveCardIdentityRuntime(input, {
      resolver,
      deadlineMs: 5,
    });

    expect(result.status).toBe("unavailable");
    expect(result.warnings.join(" ")).toMatch(/temporarily unavailable/i);
  });

  it("falls back to a stale successful identity result when refresh is unavailable", async () => {
    let now = new Date("2026-07-17T00:00:00.000Z");
    const unavailable: CardIdentitySearchResponse = {
      ...resolved,
      status: "unavailable",
      candidates: [],
      warnings: ["Pokémon catalog lookup unavailable."],
    };
    const resolver = vi.fn()
      .mockResolvedValueOnce(resolved)
      .mockResolvedValueOnce(unavailable);

    await expect(resolveCardIdentityRuntime(input, {
      resolver,
      now: () => now,
    })).resolves.toEqual(resolved);

    now = new Date("2026-07-17T00:16:00.000Z");
    const fallback = await resolveCardIdentityRuntime(input, {
      resolver,
      now: () => now,
    });

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(fallback.candidates.map((candidate) => candidate.id)).toEqual(["base1-58"]);
    expect(fallback.warnings.join(" ")).toMatch(/cached.*temporarily unavailable/i);
  });
});
