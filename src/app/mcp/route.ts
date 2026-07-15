import { createMcpHandler } from "mcp-handler";
import { NextResponse } from "next/server";
import { createRequestId, getOperationalErrorCode, logOpsEvent } from "@/lib/ops/events";
import { registerTcglensTools } from "@/lib/mcp/tools";
import { runWithMcpRequestContext } from "@/lib/mcp/request-context";
import { rateLimitHeaders, rateLimitMcpRequest } from "@/lib/ops/rate-limit";
import { captureOperationalException } from "@/lib/ops/sentry";

export const maxDuration = 60;

const mcpHandler = createMcpHandler(
  (server) => registerTcglensTools(server),
  {
    serverInfo: { name: "tcglens", version: "1.0.2" },
    instructions: "TCGlens is a source-backed raw-single card identity and listing decision engine. Check capabilities when scope is uncertain. Browse identities before comparing an ambiguous print. Market references are not inventory. Near Mint is a seller claim. Do not predict grades or guarantee profit.",
  },
  { basePath: "/", maxDuration, verboseLogs: false, disableSse: true },
);

export function GET(request: Request) {
  return handleMcpRequest(request);
}

export function POST(request: Request) {
  return handleMcpRequest(request);
}

async function handleMcpRequest(request: Request) {
  const route = "mcp" as const;
  const requestId = createRequestId(request);
  const startedAt = Date.now();
  const toolName = await readToolName(request);
  const rateLimit = await rateLimitMcpRequest(request, toolName);
  const headers = { ...rateLimitHeaders(rateLimit), "x-request-id": requestId };
  if (!rateLimit.allowed) {
    logOpsEvent({ event: "rate_limited", requestId, route, provider: "rate-limit", status: "limited", httpStatus: 429, rateLimitBackend: rateLimit.backend, limit: rateLimit.limit, remaining: rateLimit.remaining });
    return NextResponse.json(
      { error: "Too many TCGlens MCP requests. Please retry shortly." },
      { status: 429, headers: { ...headers, "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  logOpsEvent({ event: "api_request_started", requestId, route, status: "started" });
  try {
    const response = await runWithMcpRequestContext({ requestId }, () => mcpHandler(request));
    const safeResponse = withHeaders(response, headers);
    logOpsEvent({ event: "api_request_completed", requestId, route, status: "complete", httpStatus: response.status, durationMs: Date.now() - startedAt });
    return safeResponse;
  } catch (error) {
    const errorCode = getOperationalErrorCode(error);
    logOpsEvent({ event: "api_request_failed", level: "error", requestId, route, status: "failed", httpStatus: 500, durationMs: Date.now() - startedAt, errorCode });
    captureOperationalException(error, { requestId, route, operation: "mcp_route", status: "failed", extra: { errorCode } });
    return NextResponse.json({ error: "TCGlens MCP could not complete the request." }, { status: 500, headers });
  }
}

async function readToolName(request: Request) {
  if (request.method !== "POST") return null;
  try {
    const body = await request.clone().json() as { method?: unknown; params?: { name?: unknown } };
    return body.method === "tools/call" && typeof body.params?.name === "string"
      ? body.params.name.slice(0, 128)
      : null;
  } catch {
    return null;
  }
}

function withHeaders(response: Response, headers: Record<string, string>) {
  const merged = new Headers(response.headers);
  for (const [name, value] of Object.entries(headers)) merged.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
}
