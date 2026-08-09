import { z } from "zod";

const OFFICIAL_ONE_PIECE_IMAGE_HOST = "en.onepiece-cardgame.com";
const OFFICIAL_ONE_PIECE_IMAGE_PATH = /^\/images\/cardlist\/card\/[a-z0-9]+(?:[-_][a-z0-9]+)*\.png$/i;
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

export const CARD_IMAGE_TIMEOUT_MS = 8_000;
export const CARD_IMAGE_MAX_BYTES = 5_000_000;

export const cardImageRequestSchema = z.object({
  url: z.string().trim().min(1).max(500).url(),
}).strict();

export function parseOfficialOnePieceCardImageUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.hostname.toLowerCase() !== OFFICIAL_ONE_PIECE_IMAGE_HOST
      || url.port
      || url.username
      || url.password
      || url.search
      || url.hash
      || !OFFICIAL_ONE_PIECE_IMAGE_PATH.test(url.pathname)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/** Return a same-origin URL for official One Piece art while preserving other
 * already-validated image hosts used by the catalog adapters. */
export function cardImageSource(value: string | null): string | null {
  if (!value) return null;
  const officialUrl = parseOfficialOnePieceCardImageUrl(value);
  return officialUrl
    ? `/api/card-image?url=${encodeURIComponent(officialUrl.href)}`
    : value;
}

type FetchCardImageOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
};

export async function fetchOfficialOnePieceCardImage(
  value: URL | string,
  { fetcher = fetch, timeoutMs = CARD_IMAGE_TIMEOUT_MS, maxBytes = CARD_IMAGE_MAX_BYTES }: FetchCardImageOptions = {},
) {
  const url = parseOfficialOnePieceCardImageUrl(value.toString());
  if (!url) throw new Error("Unsupported card image URL.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      headers: { Accept: "image/png" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Card image request failed with ${response.status}.`);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType && contentType !== "image/png") throw new Error("Card image response was not PNG.");

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new Error("Card image response was too large.");
    }

    const bytes = await readResponseBytes(response, maxBytes);
    if (!isPng(bytes)) throw new Error("Card image response was not PNG.");
    return bytes;
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseBytes(response: Response, maxBytes: number) {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error("Card image response was too large.");
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) throw new Error("Card image response was too large.");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isPng(bytes: Uint8Array) {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}
