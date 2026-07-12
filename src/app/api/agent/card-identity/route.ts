import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { resolveCardIdentity } from "@/lib/ai/card-identity";
import { createRequestId, getOperationalErrorCode, logOpsEvent } from "@/lib/ops/events";
import { rateLimitHeaders, rateLimitRequest } from "@/lib/ops/rate-limit";
import { captureOperationalException } from "@/lib/ops/sentry";
import { cardIdentitySearchRequestSchema } from "@/lib/schemas";

export const maxDuration = 20;

export async function POST(request: Request) {
  const route = "card-identity" as const;
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
      { error: "Too many card searches. Please retry shortly." },
      { status: 429, headers: { ...headers, "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  logOpsEvent({ event: "api_request_started", requestId, route, status: "started" });
  let requestValidated = false;
  try {
    const input = cardIdentitySearchRequestSchema.parse(await request.json());
    requestValidated = true;
    const result = await resolveCardIdentity(input, { now: () => new Date() });
    logOpsEvent({
      event: "api_request_completed",
      requestId,
      route,
      provider: input.cardHint.game === "onePiece" ? "one-piece-catalog" : "pokemon-tcg",
      status: result.status === "unavailable" ? "partial" : "complete",
      httpStatus: 200,
      durationMs: Date.now() - startedAt,
      count: result.candidates.length,
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
        operation: "card_identity_route",
        status: "failed",
        extra: { errorCode },
      });
    }
    return NextResponse.json(
      { error: isClientError ? "Enter a valid card search." : "The card catalog could not be checked." },
      { status: isClientError ? 400 : 500, headers },
    );
  }
}
