import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { agentCapabilitiesSchema } from "@/lib/schemas";

describe("/api/agent/capabilities", () => {
  it("returns a validated cacheable capabilities response", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    expect(agentCapabilitiesSchema.parse(body)).toEqual(body);
  });
});
