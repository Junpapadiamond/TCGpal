import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const officialUrl = "https://en.onepiece-cardgame.com/images/cardlist/card/OP05-119_p2.png";
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

describe("/api/card-image", () => {
  it("returns a cacheable same-origin PNG for an allowlisted card image", async () => {
    const fetcher = vi.fn(async () => new Response(png, {
      headers: { "content-type": "image/png" },
    }));
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(new Request(`https://tcglens.test/api/card-image?url=${encodeURIComponent(officialUrl)}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("s-maxage=604800");
    expect(await response.arrayBuffer()).toEqual(png.buffer);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("rejects non-official and malformed URLs without fetching", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(new Request("https://tcglens.test/api/card-image?url=https%3A%2F%2Fevil.example%2Fcard.png"));

    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
