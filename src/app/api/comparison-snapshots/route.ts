import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getComparisonSnapshot,
  saveComparisonSnapshot,
} from "@/lib/comparison/report-snapshot";
import {
  comparisonCacheKey,
  getCachedComparison,
  isCacheableRequest,
} from "@/lib/comparison/report-cache";
import { rateLimitHeaders, rateLimitRequest } from "@/lib/ops/rate-limit";
import { comparisonRequestSchema } from "@/lib/schemas";

const createSnapshotSchema = z.object({
  request: comparisonRequestSchema,
  confirmedCardId: z.string().trim().min(1).max(160),
  generatedAt: z.string().datetime(),
});

export async function POST(request: Request) {
  const rateLimit = await rateLimitRequest(request, "listing-compare");
  const headers = rateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many snapshot requests. Please retry shortly." },
      { status: 429, headers: { ...headers, "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  try {
    const input = createSnapshotSchema.parse(await request.json());
    if (!isCacheableRequest(input.request)) {
      return NextResponse.json(
        { error: "Only server-verified card searches can be saved." },
        { status: 400, headers },
      );
    }
    const report = await getCachedComparison(comparisonCacheKey(input.request, input.confirmedCardId));
    if (!report || report.generatedAt !== input.generatedAt) {
      return NextResponse.json(
        { error: "This comparison is no longer available to save. Refresh it and try again." },
        { status: 404, headers },
      );
    }
    const snapshot = await saveComparisonSnapshot(report);
    return NextResponse.json({
      receiptId: snapshot.id,
      savedAt: snapshot.savedAt,
      expiresAt: snapshot.expiresAt,
      durable: snapshot.durable,
    }, { status: 201, headers });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "The result snapshot could not be created.",
    }, { status: 400, headers });
  }
}

export async function GET(request: Request) {
  const rateLimit = await rateLimitRequest(request, "listing-compare");
  const headers = rateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many snapshot requests. Please retry shortly." },
      { status: 429, headers: { ...headers, "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const id = new URL(request.url).searchParams.get("id") ?? "";
  const snapshot = await getComparisonSnapshot(id);
  if (!snapshot) {
    return NextResponse.json({ error: "This saved comparison is unavailable or has expired." }, { status: 404, headers });
  }
  return NextResponse.json({ snapshot }, { headers });
}
