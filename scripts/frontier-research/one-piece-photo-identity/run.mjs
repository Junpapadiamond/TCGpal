// Offline by default. A live run needs explicit research approval and the
// already-configured Anthropic route; never discovers/switches credentials.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { inspectPhotoPairs, photoResearchInputSchema, readBounded } from "./client.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = path.join(root, "output/accuracy-eval/frontier-research/one-piece-photo-identity");
const flags = new Map(process.argv.slice(2).map(arg => {
  const split = arg.indexOf("=");
  return split < 0 ? [arg, true] : [arg.slice(0, split), arg.slice(split + 1)];
}));
const manifestPath = flags.get("--manifest");
if (typeof manifestPath !== "string") throw new Error("Use --manifest=<frozen-manifest.json>; omit --execute for an offline preflight.");
const raw = await fs.readFile(path.resolve(manifestPath), "utf8");
if (Buffer.byteLength(raw) > 64 * 1024) throw new Error("Manifest exceeds 64 KB.");
const input = photoResearchInputSchema.parse(JSON.parse(raw));
const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 24);
if (!flags.has("--execute")) {
  console.log(JSON.stringify({ mode: "frontier-research", status: "offline-preflight", productionReady: false,
    pairs: input.pairs.length, maxImageRequests: input.pairs.length * 2, maxModelCalls: 1,
    maxImageBytesEach: 2 * 1024 * 1024, imageDeadlineMs: 8000, modelDeadlineMs: 20000,
    maxOutputTokens: 1500, estimatedSpendUsd: null,
    billingNote: "Token/request bounds are not a verified dollar cap. Confirm the configured provider tariff and approved spending before --execute.",
    manifestHash: digest }, null, 2));
} else {
  const approvalId = process.env.PHOTO_IDENTITY_RESEARCH_APPROVAL;
  if (!approvalId || !/^[a-zA-Z0-9_-]{8,80}$/.test(approvalId)) throw new Error("An explicit PHOTO_IDENTITY_RESEARCH_APPROVAL is required.");
  if (process.env.AI_PROVIDER !== "anthropic") throw new Error("This experiment supports only the existing Anthropic route. No provider fallback.");
  const modelName = process.env.ANTHROPIC_MODEL;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!modelName || (!authToken && !apiKey) || !process.env.ANTHROPIC_BASE_URL) throw new Error("Existing provider configuration is incomplete.");
  const base = new URL(process.env.ANTHROPIC_BASE_URL);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error("Invalid existing provider URL.");
  const endpoint = `${base.toString().replace(/\/$/, "").replace(/\/v1(?:\/messages)?$/, "")}/v1/messages`;
  await fs.mkdir(path.join(output, "reservations"), { recursive: true });
  const reservation = path.join(output, "reservations", `${digest}.json`);
  let usage = null;
  const result = await inspectPhotoPairs(input, { model: async (request, signal) => {
    // Atomic, permanent per-manifest reservation. Failed/ambiguous calls retain
    // it, so restarting the same command never spends another model request.
    try {
      await fs.writeFile(reservation, JSON.stringify({ approvalId, model: modelName, reservedAt: new Date().toISOString(), maxCalls: 1 }), { flag: "wx" });
    } catch (error) {
      if (error.code === "EEXIST") throw new Error("This manifest already reserved its one model call. No retry.");
      throw new Error("Research reservation unavailable. No model call.");
    }
    const headers = { "content-type": "application/json", "anthropic-version": "2023-06-01" };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    else headers["x-api-key"] = apiKey;
    let response;
    try {
      response = await fetch(endpoint, { method: "POST", headers, redirect: "error", signal,
        body: JSON.stringify({ model: modelName, max_tokens: request.maxOutputTokens,
          system: request.system, messages: [{ role: "user", content: request.content }] }) });
    } catch { throw new Error("Research model transport failed; reservation retained, no retry."); }
    const bytes = await readBounded(response, 256 * 1024, signal);
    let body;
    try { body = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("Research model returned invalid JSON."); }
    if (body.stop_reason !== "end_turn" || !Array.isArray(body.content)) throw new Error("Research model response incomplete.");
    usage = { inputTokens: Number.isSafeInteger(body.usage?.input_tokens) ? body.usage.input_tokens : null,
      outputTokens: Number.isSafeInteger(body.usage?.output_tokens) ? body.usage.output_tokens : null };
    const text = body.content.filter(block => block.type === "text").map(block => block.text).join("");
    try { return JSON.parse(text); } catch { throw new Error("Research model returned non-JSON text."); }
  } });
  const resultPath = path.join(output, `${digest}.json`);
  await fs.writeFile(resultPath, JSON.stringify({ ...result, model: modelName, usage, humanAdjudicated: false }, null, 2));
  console.log(JSON.stringify({ status: "research-only", productionReady: false, resultPath,
    observations: result.observations.map(({ id, status }) => ({ id, status })), usage }, null, 2));
}
