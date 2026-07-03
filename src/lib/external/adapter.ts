import type {
  BuyerContext,
  CardIdentityCandidate,
  ListingSeed,
  SourceStatus,
} from "@/lib/schemas";

// R2: every listing source implements the same contract and produces seeds in
// the canonical Listing shape. The deterministic ranker consumes only
// normalized listings and has zero platform-specific branches; adding a
// connector means adding an adapter here — no ranking or UI changes.
export type AdapterSearchInput = {
  card: CardIdentityCandidate;
  buyer: BuyerContext;
  fetcher: typeof fetch;
};

export type AdapterSearchOutput = {
  seeds: ListingSeed[];
  // When the data is a periodic feed (e.g. TCGplayer daily prices) this is the
  // feed timestamp; live APIs leave it null (data is as-of the request).
  asOf: string | null;
  note?: string;
};

export type PlatformAdapter = {
  platform: string;
  isConfigured: () => boolean;
  search: (input: AdapterSearchInput) => Promise<AdapterSearchOutput>;
};

export type FanOutResult = {
  seeds: ListingSeed[];
  statuses: SourceStatus[];
};

const SOFT_TIMEOUT_MS = 5000;
const HARD_TIMEOUT_MS = 10000;

// R7: connectors run in parallel with a per-source hard timeout so one slow or
// failed source never blanks the comparison — partial results, always.
export async function runPlatformAdapters(
  adapters: PlatformAdapter[],
  input: AdapterSearchInput,
  options: { softTimeoutMs?: number; hardTimeoutMs?: number } = {},
): Promise<FanOutResult> {
  const softTimeoutMs = options.softTimeoutMs ?? SOFT_TIMEOUT_MS;
  const hardTimeoutMs = options.hardTimeoutMs ?? HARD_TIMEOUT_MS;

  const runs = adapters.map(async (adapter): Promise<SourceStatus & { seeds: ListingSeed[] }> => {
    if (!adapter.isConfigured()) {
      return {
        platform: adapter.platform,
        status: "not_configured",
        count: null,
        note: `${adapter.platform} credentials are not configured.`,
        durationMs: null,
        asOf: null,
        seeds: [],
      };
    }

    const startedAt = Date.now();
    try {
      const output = await withTimeout(adapter.search(input), hardTimeoutMs, adapter.platform);
      const durationMs = Date.now() - startedAt;
      const slowNote = durationMs > softTimeoutMs ? " Responded slowly." : "";
      return {
        platform: adapter.platform,
        status: output.seeds.length ? "ok" : output.note?.includes("no match") ? "no_match" : "empty",
        count: output.seeds.length,
        note: `${output.note ?? ""}${slowNote}`.trim(),
        durationMs,
        asOf: output.asOf,
        seeds: output.seeds,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : `${adapter.platform} search failed.`;
      // robots.txt disallows and platform access controls (401/403) are the
      // expected shape of "this source cannot be automated" — report them as
      // blocked (neutral), reserving "failed" for genuine errors.
      const blocked = (error instanceof Error && error.name === "UniversalListingBlockedError")
        || /robots\.txt|responded with 40[13]\b/.test(message);
      return {
        platform: adapter.platform,
        status: blocked ? "blocked" as const : "failed" as const,
        count: null,
        note: message,
        durationMs: Date.now() - startedAt,
        asOf: null,
        seeds: [],
      };
    }
  });

  const settled = await Promise.all(runs);
  return {
    seeds: settled.flatMap((result) => result.seeds),
    statuses: settled.map((result) => ({
      platform: result.platform,
      status: result.status,
      count: result.count,
      note: result.note,
      durationMs: result.durationMs,
      asOf: result.asOf,
    })),
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, platform: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${platform} search timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
