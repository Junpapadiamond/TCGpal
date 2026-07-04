// Validate the Tavily key and the exact-URL extraction path without printing
// secrets or extracted marketplace content.
//
// Run from the project root:
//   node scripts/check-tavily.mjs https://www.mercari.com/us/item/...
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const apiKey = process.env.TAVILY_API_KEY?.trim() || env.TAVILY_API_KEY?.trim();
if (!apiKey) {
  console.error("✗ TAVILY_API_KEY is missing.");
  process.exit(1);
}

const rawUrl = process.argv[2];
let url;
try {
  url = new URL(rawUrl);
} catch {
  console.error("✗ Pass the exact public HTTPS listing URL as the first argument.");
  process.exit(1);
}
if (url.protocol !== "https:" || url.username || url.password) {
  console.error("✗ The check accepts only a public HTTPS URL without embedded credentials.");
  process.exit(1);
}

const response = await fetch("https://api.tavily.com/extract", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    urls: [url.href],
    query: "Extract seller-stated trading-card listing facts from this exact URL: title, price, shipping, condition, card name, card number, set, photos, and evidence notes. Use only the page content.",
    chunks_per_source: 3,
    extract_depth: "advanced",
    format: "text",
    include_images: false,
    include_favicon: false,
    timeout: 20,
  }),
});

const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  const error = typeof payload?.error === "string" ? ` — ${payload.error.slice(0, 180)}` : "";
  console.error(`✗ Tavily authentication/request failed (${response.status})${error}`);
  process.exit(1);
}

const result = Array.isArray(payload?.results) ? payload.results[0] : null;
if (!result?.url) {
  const failure = Array.isArray(payload?.failed_results) ? payload.failed_results[0]?.error : null;
  console.error(`✗ Key is valid, but exact-URL extraction returned no page${failure ? ` — ${String(failure).slice(0, 180)}` : "."}`);
  process.exit(1);
}

const resultUrl = new URL(result.url);
const sameHost = resultUrl.hostname.replace(/^www\./, "").toLowerCase()
  === url.hostname.replace(/^www\./, "").toLowerCase();
const normalizePath = (pathname) => pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
const samePath = normalizePath(resultUrl.pathname) === normalizePath(url.pathname);
const content = String(result.raw_content ?? result.content ?? "").trim();

console.log("✓ Tavily key: authenticated.");
console.log(`✓ Extract result: ${sameHost && samePath ? "same exact listing path" : "DIFFERENT URL (discard in app)"}.`);
console.log(`✓ Extracted facts payload: ${content.length} characters${result.title ? ", title present" : ", title absent"}.`);
