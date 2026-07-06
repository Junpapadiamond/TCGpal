import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";

vi.mock("@sentry/nextjs", () => ({
  captureRequestError: vi.fn(),
  init: vi.fn(),
}));

describe("Next instrumentation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("exports Sentry request-error capture and registers the node runtime config", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("SENTRY_DSN", "https://public@example.com/1");

    const instrumentation = await import("./instrumentation");
    await instrumentation.register();

    expect(instrumentation.onRequestError).toBe(Sentry.captureRequestError);
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({
      dsn: "https://public@example.com/1",
      sendDefaultPii: false,
    }));
  });
});
