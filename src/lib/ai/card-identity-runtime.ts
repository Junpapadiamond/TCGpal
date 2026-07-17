import { resolveCardIdentity } from "@/lib/ai/card-identity";
import { clearLocalCache, getJsonCache, setJsonCache } from "@/lib/ops/cache";
import { createAbortError, createLinkedAbortSignal } from "@/lib/ops/abort";
import {
  cardIdentitySearchRequestSchema,
  cardIdentitySearchResponseSchema,
  type CardIdentitySearchRequestInput,
  type CardIdentitySearchResponse,
} from "@/lib/schemas";

const CACHE_SCOPE = "card-identity-v1";
const FRESH_TTL_MS = 15 * 60 * 1000;
const STALE_TTL_SECONDS = 6 * 60 * 60;
const DEFAULT_DEADLINE_MS = 10_000;

type CachedIdentity = {
  cachedAt: string;
  response: CardIdentitySearchResponse;
};

type Resolver = typeof resolveCardIdentity;

type IdentityFlight = {
  controller: AbortController;
  promise: Promise<CardIdentitySearchResponse>;
  waiters: number;
  settled: boolean;
};

const flights = new Map<string, IdentityFlight>();

export async function resolveCardIdentityRuntime(
  rawInput: CardIdentitySearchRequestInput,
  options: {
    signal?: AbortSignal;
    now?: () => Date;
    deadlineMs?: number;
    resolver?: Resolver;
  } = {},
): Promise<CardIdentitySearchResponse> {
  if (options.signal?.aborted) throw options.signal.reason ?? createAbortError();
  const input = cardIdentitySearchRequestSchema.parse(rawInput);
  const now = options.now ?? (() => new Date());
  const resolver = options.resolver ?? resolveCardIdentity;
  const key = JSON.stringify(input);
  const cached = await getJsonCache(CACHE_SCOPE, key, {
    now: now(),
    validate: parseCachedIdentity,
  });
  const cacheAge = cached ? now().getTime() - Date.parse(cached.cachedAt) : Number.POSITIVE_INFINITY;
  if (options.signal?.aborted) throw options.signal.reason ?? createAbortError();
  if (cached && cacheAge <= FRESH_TTL_MS) return cached.response;

  let flight = flights.get(key);
  if (!flight || flight.controller.signal.aborted) {
    flight = createFlight({
      key,
      input,
      resolver,
      now,
      deadlineMs: options.deadlineMs ?? DEFAULT_DEADLINE_MS,
    });
    flights.set(key, flight);
  }

  const refreshed = await waitForFlight(flight, options.signal);
  if (refreshed.status === "unavailable" && cached?.response.candidates.length) {
    return cardIdentitySearchResponseSchema.parse({
      ...cached.response,
      warnings: [
        ...cached.response.warnings,
        "Showing cached card identities because the live catalog is temporarily unavailable.",
      ],
    });
  }
  return refreshed;
}

export function clearCardIdentityRuntimeForTests() {
  for (const flight of flights.values()) {
    if (!flight.settled) flight.controller.abort(createAbortError("Test reset."));
  }
  flights.clear();
  clearLocalCache();
}

function createFlight({
  key,
  input,
  resolver,
  now,
  deadlineMs,
}: {
  key: string;
  input: ReturnType<typeof cardIdentitySearchRequestSchema.parse>;
  resolver: Resolver;
  now: () => Date;
  deadlineMs: number;
}) {
  const controller = new AbortController();
  const linked = createLinkedAbortSignal(controller.signal, deadlineMs);
  const flight: IdentityFlight = {
    controller,
    promise: undefined as unknown as Promise<CardIdentitySearchResponse>,
    waiters: 0,
    settled: false,
  };

  const provider = Promise.resolve()
    .then(() => resolver(input, { signal: linked.signal, now }))
    .catch((error) => {
      if (!isTimeoutReason(linked.signal.reason)) throw error;
      return unavailableResponse(now(), "Card catalog lookup unavailable: the provider is temporarily unavailable. Please try again.");
    });
  const deadline = waitForDeadline(linked.signal, now);

  flight.promise = Promise.race([provider, deadline])
    .then((response) => {
      if (response.status !== "unavailable") {
        void setJsonCache(CACHE_SCOPE, key, {
          cachedAt: now().toISOString(),
          response,
        } satisfies CachedIdentity, {
          ttlSeconds: STALE_TTL_SECONDS,
          now: now(),
        }).catch(() => undefined);
      }
      return response;
    })
    .finally(() => {
      linked.cleanup();
      flight.settled = true;
      if (flights.get(key) === flight) flights.delete(key);
    });
  void flight.promise.catch(() => undefined);
  return flight;
}

function waitForDeadline(signal: AbortSignal, now: () => Date) {
  return new Promise<CardIdentitySearchResponse>((resolve, reject) => {
    const abort = () => {
      if (isTimeoutReason(signal.reason)) {
        resolve(unavailableResponse(now(), "Card catalog lookup unavailable: the provider is temporarily unavailable. Please try again."));
      } else {
        reject(signal.reason ?? createAbortError());
      }
    };
    if (signal.aborted) {
      abort();
    } else {
      signal.addEventListener("abort", abort, { once: true });
    }
  });
}

function isTimeoutReason(reason: unknown) {
  return Boolean(reason && typeof reason === "object" && "name" in reason && reason.name === "TimeoutError");
}

async function waitForFlight(flight: IdentityFlight, signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? createAbortError();
  flight.waiters += 1;
  try {
    if (!signal) return await flight.promise;
    return await new Promise<CardIdentitySearchResponse>((resolve, reject) => {
      const abort = () => reject(signal.reason ?? createAbortError());
      signal.addEventListener("abort", abort, { once: true });
      flight.promise.then(resolve, reject).finally(() => {
        signal.removeEventListener("abort", abort);
      });
    });
  } finally {
    flight.waiters -= 1;
    if (flight.waiters === 0 && !flight.settled) {
      flight.controller.abort(createAbortError("No active request is waiting for this lookup."));
    }
  }
}

function parseCachedIdentity(value: unknown): CachedIdentity | null {
  if (!value || typeof value !== "object") return null;
  const cachedAt = "cachedAt" in value ? value.cachedAt : null;
  const response = "response" in value ? cardIdentitySearchResponseSchema.safeParse(value.response) : null;
  return typeof cachedAt === "string" && Number.isFinite(Date.parse(cachedAt)) && response?.success
    ? { cachedAt, response: response.data }
    : null;
}

function unavailableResponse(now: Date, warning: string): CardIdentitySearchResponse {
  return {
    identityContractVersion: 1,
    status: "unavailable",
    candidates: [],
    confirmedCard: null,
    warnings: [warning],
    generatedAt: now.toISOString(),
  };
}
