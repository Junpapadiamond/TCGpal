import { timingSafeEqual } from "node:crypto";
import { cloudRequestSchema, cloudReportSchema, runCloudEvaluation } from "@/lib/evaluation/cloud-runner";
import { createCloudDependencies } from "@/lib/evaluation/cloud-runtime";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.CARD_EVAL_CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const reader = request.body?.getReader();
  let body = "";
  if (reader) {
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length;
        if (size > 1024) { await reader.cancel(); return Response.json({ error: "Body too large" }, { status: 413 }); }
        chunks.push(part.value);
      }
      body = Buffer.concat(chunks).toString("utf8");
    } finally { reader.releaseLock(); }
  }
  let input;
  try { input = cloudRequestSchema.parse(JSON.parse(body || "{}")); }
  catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  try {
    const report = await runCloudEvaluation(input.mode, new Date(), createCloudDependencies());
    return Response.json(cloudReportSchema.parse(report), { headers: { "Cache-Control": "no-store" } });
  } catch {
    // No arbitrary provider error bodies, credentials, titles or storage URLs.
    return Response.json({ error: "Cloud evaluation failed; reservation is retained" }, { status: 503 });
  }
}
