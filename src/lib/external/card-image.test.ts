import { describe, expect, it, vi } from "vitest";
import {
  CARD_IMAGE_MAX_BYTES,
  cardImageSource,
  fetchOfficialOnePieceCardImage,
  parseOfficialOnePieceCardImageUrl,
} from "./card-image";

const officialUrl = "https://en.onepiece-cardgame.com/images/cardlist/card/OP05-119_p2.png";
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

describe("official card image proxy", () => {
  it("accepts only official card PNG paths", () => {
    expect(parseOfficialOnePieceCardImageUrl(officialUrl)?.hostname).toBe("en.onepiece-cardgame.com");
    expect(parseOfficialOnePieceCardImageUrl("http://en.onepiece-cardgame.com/images/cardlist/card/OP05-119_p2.png")).toBeNull();
    expect(parseOfficialOnePieceCardImageUrl("https://en.onepiece-cardgame.com/images/logo.png")).toBeNull();
    expect(parseOfficialOnePieceCardImageUrl("https://evil.example/images/cardlist/card/OP05-119_p2.png")).toBeNull();
    expect(parseOfficialOnePieceCardImageUrl(`${officialUrl}?width=100`)).toBeNull();
  });

  it("maps official art to a same-origin URL and leaves other sources alone", () => {
    expect(cardImageSource(officialUrl)).toBe(`/api/card-image?url=${encodeURIComponent(officialUrl)}`);
    expect(cardImageSource("https://images.pokemontcg.io/base1/4_hires.png")).toBe("https://images.pokemontcg.io/base1/4_hires.png");
    expect(cardImageSource(null)).toBeNull();
  });

  it("bounds and validates the fetched PNG response", async () => {
    const fetcher = vi.fn(async () => new Response(png, {
      headers: { "content-type": "image/png" },
    }));
    await expect(fetchOfficialOnePieceCardImage(officialUrl, { fetcher })).resolves.toEqual(png);

    const oversized = vi.fn(async () => new Response(new Uint8Array(CARD_IMAGE_MAX_BYTES + 1), {
      headers: { "content-type": "image/png" },
    }));
    await expect(fetchOfficialOnePieceCardImage(officialUrl, { fetcher: oversized })).rejects.toThrow("too large");

    const html = vi.fn(async () => new Response("not an image", {
      headers: { "content-type": "text/html" },
    }));
    await expect(fetchOfficialOnePieceCardImage(officialUrl, { fetcher: html })).rejects.toThrow("not PNG");
  });
});
