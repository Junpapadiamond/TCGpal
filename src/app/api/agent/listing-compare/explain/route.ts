import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { answerComparisonQuestion } from "@/lib/ai/comparison-qa";
import { createRequestId, getOperationalErrorCode, logOpsEvent } from "@/lib/ops/events";
import { rateLimitHeaders, rateLimitRequest } from "@/lib/ops/rate-limit";
import { captureOperationalException } from "@/lib/ops/sentry";
import { comparisonQuestionRequestSchema } from "@/lib/schemas";

export const maxDuration = 20;

export async function POST(request: Request) {
  const route = "listing-compare-explain";
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
      { error: "Too many assistant requests. Please retry shortly." },
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
    const parsed = comparisonQuestionRequestSchema.parse(body);
    requestValidated = true;
    const response = await answerComparisonQuestion(parsed.report, parsed.question, parsed.targetListingId, {
      webContext: parsed.webContext,
      activeRole: parsed.activeRole,
    });
    logOpsEvent({
      event: "api_request_completed",
      requestId,
      route,
      status: "complete",
      httpStatus: 200,
      durationMs: Date.now() - startedAt,
      count: response.webCitations.length,
    });
    return NextResponse.json(response, { headers });
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
        operation: "comparison_explain_route",
        status: "failed",
        extra: { errorCode },
      });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "The comparison question could not be answered.",
      },
      { status: 400, headers },
    );
  }
}
