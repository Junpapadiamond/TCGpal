import { afterEach, expect, it, vi } from "vitest";
const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/evaluation/cloud-runtime", () => ({ createCloudDependencies: create }));
import { POST } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("rejects missing/wrong credentials before storage or provider work", async () => {
  vi.stubEnv("CARD_EVAL_CRON_SECRET", "test-secret");
  expect((await POST(new Request("https://test", { method: "POST" }))).status).toBe(401);
  expect(create).not.toHaveBeenCalled();
});
it("rejects scope expansion and oversized input", async () => {
  vi.stubEnv("CARD_EVAL_CRON_SECRET", "test-secret");
  const req = (body: string) => new Request("https://test", { method: "POST", body,
    headers: { authorization: "Bearer test-secret" } });
  expect((await POST(req('{"mode":"daily","marketScope":"cross"}'))).status).toBe(400);
  expect((await POST(req("x".repeat(1025)))).status).toBe(413);
  expect(create).not.toHaveBeenCalled();
});
