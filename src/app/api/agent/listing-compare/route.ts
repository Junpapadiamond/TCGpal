import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { runListingComparison } from "@/lib/ai/listing-compare";
import { createRequestId, getOperationalErrorCode, logOpsEvent } from "@/lib/ops/events";
import { rateLimitHeaders, rateLimitRequest } from "@/lib/ops/rate-limit";
import { captureOperationalException } from "@/lib/ops/sentry";
import { comparisonRequestSchema } from "@/lib/schemas";

// Give the multi-provider comparison enough headroom for cold provider paths and
// optional expanded discovery, so upstream slowness can degrade into a JSON
// result instead of Vercel's plain-text timeout body.
export const maxDuration = 60;

export async function POST(request: Request) {
  const route = "listing-compare";
  const requestId = createRequestId(request);
  const startedAt = Date.now();
  const rateLimit = await rateLimitRequest(request, route);
  const headers = {
    ...rateLimitHeaders(rateLimit),
    "x-request-id": requestId,
  };

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
      { error: "Too many comparison requests. Please retry shortly." },
      {
        status: 429,
        headers: {
          ...headers,
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  logOpsEvent({
    event: "api_request_started",
    requestId,
    route,
    status: "started",
  });

  let requestValidated = false;
  try {
    const body = await request.json();
    const parsed = comparisonRequestSchema.parse(body);
    requestValidated = true;
    const report = await runListingComparison(parsed, {
      opsContext: { requestId, route },
    });
    logOpsEvent({
      event: "api_request_completed",
      requestId,
      route,
      status: report.status === "complete" ? "complete" : "partial",
      httpStatus: 200,
      durationMs: Date.now() - startedAt,
      count: report.candidates.length,
    });
    return NextResponse.json(report, { headers });
  } catch (error) {
    const isClientInputError = !requestValidated && (error instanceof ZodError || error instanceof SyntaxError);
    const errorCode = getOperationalErrorCode(error);
    logOpsEvent({
      event: "api_request_failed",
      level: isClientInputError ? "warn" : "error",
      requestId,
      route,
      status: "failed",
      httpStatus: 400,
      durationMs: Date.now() - startedAt,
      errorCode,
    });
    if (!isClientInputError) {
      captureOperationalException(error, {
        requestId,
        route,
        operation: "comparison_route",
        status: "failed",
        extra: { errorCode },
      });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "The listing comparison could not be completed.",
      },
      { status: 400, headers },
    );
  }
}
