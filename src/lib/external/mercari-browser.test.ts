import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectMercariPages, mercariRequestAllowed, mercariRobotsAllowed } from "./mercari-browser";

const mocks = vi.hoisted(() => ({
  getCache: vi.fn(), setCache: vi.fn(), launch: vi.fn(), executablePath: vi.fn(),
}));
vi.mock("@/lib/ops/cache", () => ({ getJsonCache: mocks.getCache, setJsonCache: mocks.setCache }));
vi.mock("@sparticuz/chromium", () => ({ default: { args: [], executablePath: mocks.executablePath } }));
vi.mock("puppeteer-core", () => ({ default: { launch: mocks.launch } }));

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCache.mockResolvedValue(null);
  mocks.setCache.mockResolvedValue(undefined);
  mocks.executablePath.mockResolvedValue("/test/chromium");
  Object.defineProperty(process, "platform", { value: "linux", configurable: true });
});
afterEach(() => { Object.defineProperty(process, "platform", platform); });

function browserFixture(status = 200, observedStatus = "observed") {
  const page = { setUserAgent: vi.fn(), setRequestInterception: vi.fn(), on: vi.fn(),
    mainFrame: vi.fn(), goto: vi.fn().mockResolvedValue({ status: () => status }),
    url: () => "https://www.mercari.com/search/?keyword=Pikachu",
    evaluate: vi.fn().mockImplementation((expression: unknown) => typeof expression === "function" ? 1000
      : { status: observedStatus, discoveries: [{ url: "https://www.mercari.com/us/item/m123/" }] }),
    waitForSelector: vi.fn() };
  const browser = { newPage: vi.fn().mockResolvedValue(page), userAgent: async () => "Headless test browser", close: vi.fn().mockResolvedValue(undefined) };
  mocks.launch.mockResolvedValue(browser);
  return { browser, page };
}

describe("bounded Mercari browser transport", () => {
  it("rejects private hosts, tracking navigation, account pages, unsafe protocols and foreign documents", () => {
    for (const url of ["http://www.mercari.com/search/", "https://127.0.0.1/", "https://www.mercari.com.evil.test/search/", "https://www.mercari.com/account/", "https://www.mercari.com/us/item/m1/?ref=search", "https://example.com/"]) {
      expect(mercariRequestAllowed(url, "document")).toBe(false);
    }
    expect(mercariRequestAllowed("https://www.mercari.com/search/?keyword=Pikachu", "document")).toBe(true);
    expect(mercariRequestAllowed("https://www.mercari.com/us/item/m1/", "document")).toBe(true);
  });
  it("honors explicit robot exclusions and rejects invalid robot responses", () => {
    expect(mercariRobotsAllowed("User-agent: *\nDisallow: /search", "https://www.mercari.com/search/?keyword=Pikachu")).toBe(false);
    expect(mercariRobotsAllowed("User-agent: *\nDisallow: /*?ref=\n", "https://www.mercari.com/us/item/m1/")).toBe(true);
    expect(() => mercariRobotsAllowed("<html>Access denied</html>", "https://www.mercari.com/search/")).toThrow(/robots/);
  });
  it("rejects an oversized declared robots body before reading or launching a browser", async () => {
    const response = new Response("User-agent: *\nAllow: /", { headers: { "Content-Length": "64001" } });
    const read = vi.spyOn(response, "text");
    await expect(collectMercariPages("Pikachu", vi.fn().mockResolvedValue(response))).rejects.toThrow(/size limit/);
    expect(read).not.toHaveBeenCalled();
    expect(mocks.launch).not.toHaveBeenCalled();
  });
  it("cancels a chunked robots response as soon as the byte limit is exceeded", async () => {
    const cancel = vi.fn();
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { if (sent++ < 3) controller.enqueue(new Uint8Array(40_000)); else controller.close(); }, cancel,
    });
    await expect(collectMercariPages("Pikachu", vi.fn().mockResolvedValue(new Response(body)))).rejects.toThrow(/size limit/);
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.launch).not.toHaveBeenCalled();
  });
  it("cancels a stalled robots body when the caller aborts", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const pending = expect(collectMercariPages("Pikachu", fetcher, controller.signal)).rejects.toThrow(/test cancellation/);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort(new Error("test cancellation"));
    await pending;
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.launch).not.toHaveBeenCalled();
  });
  it("stops at HTTP 403 without detail navigation or browser retry", async () => {
    const { browser, page } = browserFixture(403);
    await expect(collectMercariPages("Pikachu", vi.fn().mockResolvedValue(new Response("User-agent: *\nAllow: /"))))
      .rejects.toThrow(/HTTP 403/);
    expect(page.goto).toHaveBeenCalledOnce();
    expect(page.evaluate).not.toHaveBeenCalled();
    expect(mocks.launch).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
  });
  it("stops at a visible access restriction without opening discovered details", async () => {
    const { browser, page } = browserFixture(200, "blocked");
    await expect(collectMercariPages("Pikachu", vi.fn().mockResolvedValue(new Response("User-agent: *\nAllow: /"))))
      .rejects.toThrow(/verification required/);
    expect(page.goto).toHaveBeenCalledOnce();
    expect(page.waitForSelector).not.toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalledOnce();
  });
});
