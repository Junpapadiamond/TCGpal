import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { discoverCards } from "@/lib/ai/card-discovery";
import { createRequestId, getOperationalErrorCode, logOpsEvent } from "@/lib/ops/events";
import { rateLimitHeaders, rateLimitRequest } from "@/lib/ops/rate-limit";
import { captureOperationalException } from "@/lib/ops/sentry";
import { cardDiscoveryRequestSchema } from "@/lib/schemas";

// Identity search plus at most five live comparisons run in parallel. Keep the
// same ceiling as the established comparison route so provider slowness can be
// returned as a partial discovery result instead of an unstructured timeout.
export const maxDuration = 60;

export async function POST(request: Request) {
  const route = "card-discovery" as const;
  const requestId = createRequestId(request);
  const startedAt = Date.now();
  const rateLimit = await rateLimitRequest(request, route);
  const headers = { ...rateLimitHeaders(rateLimit), "x-request-id": requestId };

  if (!rateLimit.allowed) {
    logOpsEvent({
      event: "rate_limited",
      requestId,
      route,
      provider: "rate-limit",
      status: "limited",
      httpStatus: 429,
      rateLimitBackend: rateLimit.backend,
      limit: rateLimit.limit,
      remaining: rateLimit.remaining,
    });
    return NextResponse.json(
      { error: "Too many discovery requests. Please retry shortly." },
      { status: 429, headers: { ...headers, "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  logOpsEvent({ event: "api_request_started", requestId, route, status: "started" });
  let requestValidated = false;
  try {
    const input = cardDiscoveryRequestSchema.parse(await request.json());
    requestValidated = true;
    const result = await discoverCards(input, { now: () => new Date() });
    logOpsEvent({
      event: "api_request_completed",
      requestId,
      route,
      provider: input.game === "onePiece" ? "one-piece-catalog" : "pokemon-tcg",
      status: result.status === "complete" ? "complete" : "partial",
      httpStatus: 200,
      durationMs: Date.now() - startedAt,
      count: result.shortlist.length,
    });
    return NextResponse.json(result, { headers });
  } catch (error) {
    const isClientError = !requestValidated && (error instanceof ZodError || error instanceof SyntaxError);
    const errorCode = getOperationalErrorCode(error);
    logOpsEvent({
      event: "api_request_failed",
      level: isClientError ? "warn" : "error",
      requestId,
      route,
      status: "failed",
      httpStatus: isClientError ? 400 : 500,
      durationMs: Date.now() - startedAt,
      errorCode,
    });
    if (!isClientError) {
      captureOperationalException(error, {
        requestId,
        route,
        operation: "card_discovery_route",
        status: "failed",
        extra: { errorCode },
      });
    }
    return NextResponse.json(
      { error: isClientError ? "Enter a valid discovery request." : "Card discovery could not be completed." },
      { status: isClientError ? 400 : 500, headers },
    );
  }
}
