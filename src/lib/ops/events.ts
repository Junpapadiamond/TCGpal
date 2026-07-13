import { randomUUID } from "node:crypto";
import type { Marketplace, PlatformSourceMode } from "@/lib/schemas";

export type OpsRoute = "card-identity" | "card-discovery" | "listing-compare" | "listing-compare-explain" | "mcp";
export type OpsLevel = "info" | "warn" | "error";
export type OpsProvider =
  | "anthropic"
  | "cache"
  | "ebay"
  | "exa"
  | "openai"
  | "pricecharting"
  | "pokemon-tcg"
  | "rate-limit"
  | "redis"
  | "tavily"
  | "tcgcsv"
  | "unknown";

export type OperationalEventName =
  | "api_request_started"
  | "api_request_completed"
  | "api_request_failed"
  | "cache_lookup"
  | "provider_failure"
  | "rate_limited"
  | "source_outcome";

export type OperationalEvent = {
  event: OperationalEventName;
  level?: OpsLevel;
  requestId?: string;
  route?: OpsRoute;
  provider?: OpsProvider | string;
  platformId?: string;
  marketplace?: Marketplace;
  sourceMode?: PlatformSourceMode;
  status?: "started" | "complete" | "partial" | "failed" | "fallback" | "skipped" | "hit" | "miss" | "limited";
  configured?: boolean;
  count?: number;
  durationMs?: number;
  httpStatus?: number;
  cacheBackend?: "redis" | "memory";
  rateLimitBackend?: "redis" | "memory";
  limit?: number;
  remaining?: number;
  errorCode?: string;
  timestamp?: string;
};

export type OperationalEventRecord = Required<Pick<OperationalEvent, "event" | "timestamp">>
  & Omit<OperationalEvent, "event" | "timestamp">;

export interface OperationalEventSink {
  log(event: OperationalEventRecord): void | Promise<void>;
}

const consoleSink: OperationalEventSink = {
  log(event) {
    const level = event.level ?? defaultLevel(event);
    const line = JSON.stringify(event);
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.info(line);
    }
  },
};

let sink: OperationalEventSink = consoleSink;

export function setOperationalEventSinkForTests(nextSink: OperationalEventSink) {
  sink = nextSink;
}

export function resetOperationalEventSinkForTests() {
  sink = consoleSink;
}

export function createRequestId(request: Request) {
  const incoming = request.headers.get("x-request-id")?.trim();
  if (incoming && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming)) return incoming;
  return randomUUID();
}

export function logOpsEvent(event: OperationalEvent) {
  if (!opsLoggingEnabled()) return;

  const record: OperationalEventRecord = {
    ...event,
    event: sanitizeToken(event.event, "unknown") as OperationalEventName,
    timestamp: event.timestamp ?? new Date().toISOString(),
    requestId: sanitizeOptional(event.requestId),
    provider: sanitizeOptional(event.provider),
    platformId: sanitizeOptional(event.platformId),
    errorCode: sanitizeOptional(event.errorCode),
  };

  try {
    void Promise.resolve(sink.log(record)).catch((error) => {
      console.warn(JSON.stringify({
        event: "ops_event_sink_failed",
        timestamp: new Date().toISOString(),
        errorCode: getOperationalErrorCode(error),
      }));
    });
  } catch (error) {
    console.warn(JSON.stringify({
      event: "ops_event_sink_failed",
      timestamp: new Date().toISOString(),
      errorCode: getOperationalErrorCode(error),
    }));
  }
}

export function getOperationalErrorCode(error: unknown) {
  if (error instanceof Error && error.name) return sanitizeToken(error.name, "ERROR").toUpperCase();
  return "UNKNOWN_ERROR";
}

function opsLoggingEnabled() {
  return process.env.NODE_ENV !== "test" && process.env.OPERATIONAL_LOGGING !== "0";
}

function defaultLevel(event: OperationalEvent) {
  if (event.event === "api_request_failed" || event.event === "provider_failure") return "error";
  if (event.event === "rate_limited" || event.status === "fallback") return "warn";
  return "info";
}

function sanitizeOptional(value: unknown) {
  if (typeof value !== "string") return undefined;
  const sanitized = sanitizeToken(value, "");
  return sanitized || undefined;
}

function sanitizeToken(value: string, fallback: string) {
  const trimmed = value.trim().slice(0, 128);
  const cleaned = trimmed.replace(/[^A-Za-z0-9._:-]/g, "_");
  return cleaned || fallback;
}
