import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { clearLocalRateLimitStore } from "@/lib/ops/rate-limit";

describe("/mcp Streamable HTTP endpoint", () => {
  beforeEach(() => {
    clearLocalRateLimitStore();
    vi.unstubAllEnvs();
    vi.stubEnv("RATE_LIMIT_MCP_MAX", "2");
    vi.stubEnv("RATE_LIMIT_MCP_WINDOW_MS", "60000");
    vi.stubEnv("RATE_LIMIT_DISCOVERY_MAX", "1");
    vi.stubEnv("RATE_LIMIT_DISCOVERY_WINDOW_MS", "60000");
    vi.stubEnv("RATE_LIMIT_SALT", "mcp-route-test");
  });

  it("initializes and lists all TCGlens tools", async () => {
    const initialized = await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } }));
    expect(initialized.status).toBe(200);
    expect(initialized.headers.get("x-request-id")).toBeTruthy();

    const listed = await POST(mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));
    const body = await mcpBody(listed);
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining([
      "tcglens_get_capabilities", "tcglens_browse_cards", "tcglens_discover_cards", "tcglens_compare_card", "tcglens_build_deep_link",
    ]));
  });

  it("returns a safe MCP validation error for malformed tool input", async () => {
    const response = await POST(mcpRequest({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "tcglens_browse_cards", arguments: { query: "", game: "magic" } } }));
    const body = await mcpBody(response);
    expect(response.status).toBe(200);
    expect(body.result.isError).toBe(true);
    expect(JSON.stringify(body)).not.toContain("request body");
  });

  it("rate limits MCP requests without exposing their bodies", async () => {
    const request = () => POST(mcpRequest({ jsonrpc: "2.0", id: 4, method: "tools/list", params: { private: "do-not-log" } }));
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    const limited = await request();
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "Too many TCGlens MCP requests. Please retry shortly." });
  });

  it("keeps the stricter discovery quota at the MCP boundary", async () => {
    const request = () => POST(mcpRequest({
      jsonrpc: "2.0", id: 5, method: "tools/call",
      params: { name: "tcglens_discover_cards", arguments: { query: "Pikachu", budget: { min: 500, max: 200 } } },
    }));
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(429);
  });
});

function mcpRequest(body: unknown) {
  return new Request("https://tcgpal.vercel.app/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-forwarded-for": "203.0.113.73" },
    body: JSON.stringify(body),
  });
}

async function mcpBody(response: Response) {
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
    if (!data) throw new Error("MCP SSE response did not contain a data event.");
    return JSON.parse(data);
  }
  return JSON.parse(text);
}
