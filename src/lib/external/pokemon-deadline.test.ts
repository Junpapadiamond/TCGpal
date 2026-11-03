import { afterEach, expect, it, vi } from "vitest";
import { getPokemonCard, browsePokemonCards } from "./pokemon-tcg";

afterEach(() => vi.useRealTimers());

it.each(["get", "browse"])("keeps the %s deadline active until the JSON body is parsed", async kind => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => ({
    ok: true, status: 200,
    json: () => new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })),
  } as Response));
  let error: unknown;
  void (kind === "get" ? getPokemonCard({ id: "base1-58", fetcher, timeoutMs: 30 })
    : browsePokemonCards({ query: "Pikachu", fetcher, timeoutMs: 30 })).catch(value => { error = value; });
  await vi.advanceTimersByTimeAsync(40);
  expect(error).toMatchObject({ name: "TimeoutError" });
});
