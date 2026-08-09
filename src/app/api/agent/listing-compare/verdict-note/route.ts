import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { generateVerdictNote, isVerdictNoteEnabled, resolveVerdictNoteTarget } from "@/lib/ai/verdict-note";
import { buildVerdictCopy } from "@/features/comparison/verdict-copy";
import { getJsonCache, setJsonCache } from "@/lib/ops/cache";
import { createRequestId, getOperationalErrorCode, logOpsEvent } from "@/lib/ops/events";
import { rateLimitHeaders, rateLimitRequest } from "@/lib/ops/rate-limit";
import { captureOperationalException } from "@/lib/ops/sentry";
import { verdictNoteRequestSchema, verdictNoteResponseSchema, type VerdictNoteResponse } from "@/lib/schemas";

export const maxDuration = 20;

// The note is enrichment on an already-rendered result, so it shares the
// assistant rate-limit bucket rather than the comparison one.
const route = "listing-compare-explain" as const;

// Lives exactly as long as the 15-minute report cache it describes: a re-render,
// a lens toggle back and forth, or a second viewer of the same cached report
// reuses one model call.
const CACHE_SCOPE = "verdict-note";
const CACHE_TTL_SECONDS = 15 * 60;

const disabled: VerdictNoteResponse = { note: null, citedFactIds: [], usedAi: false, rejectedReason: null };

export async function POST(request: Request) {
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
      { status: 429, headers: { ...headers, "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  let requestValidated = false;
  try {
    // Off by default. The flag check comes before any work so a disabled
    // deployment costs one schema parse and nothing else.
    const body = await request.json();
    const parsed = verdictNoteRequestSchema.parse(body);
    requestValidated = true;
    if (!isVerdictNoteEnabled()) {
      return NextResponse.json(disabled, { headers });
    }

    const target = resolveVerdictNoteTarget(parsed.report, parsed.role);
    if (!target) {
      return NextResponse.json(disabled, { headers });
    }

    // The deterministic verdict is rebuilt here, server-side, from the validated
    // report — the model is told what was decided, it never gets to decide.
    const verdict = buildVerdictCopy({
      listing: target.listing,
      choice: target.choice,
      alternatives: target.alternatives,
      marketPrice: target.marketPrice,
      lang: parsed.lang,
    });
    const decision = {
      kind: verdict.action.kind,
      label: verdict.action.label,
      fallbackNote: verdict.action.note,
    };

    const cacheKey = [
      parsed.report.generatedAt,
      parsed.report.confirmedCard?.id ?? "no-card",
      target.listing.id,
      parsed.role,
      parsed.lang,
      decision.kind,
    ].join("|");
    const cached = await getJsonCache<VerdictNoteResponse>(CACHE_SCOPE, cacheKey, {
      validate(value) {
        const result = verdictNoteResponseSchema.safeParse(value);
        return result.success ? result.data : null;
      },
    });
    if (cached) {
      return NextResponse.json(cached, { headers });
    }

    const generated = await generateVerdictNote({
      report: parsed.report,
      role: parsed.role,
      lang: parsed.lang,
      decision,
    });
    const response = verdictNoteResponseSchema.parse({
      note: generated.note,
      citedFactIds: generated.citedFactIds,
      usedAi: generated.usedAi,
      rejectedReason: generated.rejectedReason,
    });
    if (response.note) {
      await setJsonCache(CACHE_SCOPE, cacheKey, response, { ttlSeconds: CACHE_TTL_SECONDS });
    }

    logOpsEvent({
      event: "api_request_completed",
      requestId,
      route,
      status: response.note ? "complete" : "fallback",
      httpStatus: 200,
      durationMs: Date.now() - startedAt,
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
      httpStatus: isClientInputError ? 400 : 200,
      durationMs: Date.now() - startedAt,
      errorCode,
    });
    if (isClientInputError) {
      return NextResponse.json({ error: "The verdict note request was not valid." }, { status: 400, headers });
    }
    // Anything else is a silent fallback: the client keeps the deterministic
    // sentence it already rendered, so a broken note is never a broken result.
    captureOperationalException(error, {
      requestId,
      route,
      operation: "verdict_note_route",
      status: "failed",
      extra: { errorCode },
    });
    return NextResponse.json(disabled, { headers });
  }
}
