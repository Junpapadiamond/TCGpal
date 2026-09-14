import robotsParser from "robots-parser";
import { getJsonCache, setJsonCache } from "@/lib/ops/cache";
import { mercariDomExpression } from "./mercari-dom.mjs";
import type { Browser, Page } from "puppeteer-core";

const ORIGIN = "https://www.mercari.com";
const USER_AGENT = "TCGlens/1.0 (+https://lenstcg.com)";
const MAX_MS = 30_000;

export function mercariRequestAllowed(value: string, resourceType: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    if (resourceType === "document") return url.hostname === "www.mercari.com" && !url.searchParams.has("ref")
      && (/^\/search\/?$/.test(url.pathname) || /^\/us\/item\/m\d+\/$/.test(url.pathname));
    return ["www.mercari.com", "mercari.com", "static.mercdn.net", "u-mercari-images.mercdn.net"].includes(url.hostname)
      || url.hostname.endsWith(".mercari.com") || url.hostname.endsWith(".mercdn.net");
  } catch { return false; }
}

export function mercariRobotsAllowed(text: string, url: string) {
  if (!/^\s*user-agent\s*:/im.test(text) || /<html/i.test(text)) throw new Error("Mercari robots policy unavailable.");
  return robotsParser(`${ORIGIN}/robots.txt`, text).isAllowed(url, USER_AGENT) !== false;
}

async function robots(fetcher: typeof fetch, signal: AbortSignal) {
  const cached = await getJsonCache<string>("mercari-robots", "v1", { validate: value => typeof value === "string" ? value : null });
  if (cached) return cached;
  const response = await fetcher(`${ORIGIN}/robots.txt`, { redirect: "error", cache: "no-store",
    headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]) });
  if (!response.ok) throw new Error(`Mercari robots policy unavailable (HTTP ${response.status}).`);
  const text = await response.text();
  if (Buffer.byteLength(text) > 64_000) throw new Error("Mercari robots policy exceeded its size limit.");
  mercariRobotsAllowed(text, `${ORIGIN}/search/`);
  await setJsonCache("mercari-robots", "v1", text, { ttlSeconds: 3600 });
  return text;
}

// No account, cookie reuse, stealth, proxies, CAPTCHA solving or alternate API.
// The browser loads only a search and three canonical detail pages. Failures
// propagate to the existing isolated fanout, so eBay remains usable.
export async function collectMercariPages(query: string, fetcher: typeof fetch, outerSignal?: AbortSignal): Promise<unknown[]> {
  const signal = outerSignal ? AbortSignal.any([outerSignal, AbortSignal.timeout(MAX_MS)]) : AbortSignal.timeout(MAX_MS);
  const policy = await robots(fetcher, signal);
  const searchUrl = `${ORIGIN}/search/?keyword=${encodeURIComponent(query)}`;
  if (!mercariRobotsAllowed(policy, searchUrl)) throw new Error("Mercari search is excluded by robots.txt.");
  if (process.platform !== "linux") throw new Error("Mercari browser requires the Linux deployment runtime.");
  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([import("@sparticuz/chromium"), import("puppeteer-core")]);
  let browser: Browser | undefined;
  const stop = () => { if (browser) void browser.close().catch(() => undefined); };
  signal.addEventListener("abort", stop, { once: true });
  try {
    signal.throwIfAborted();
    browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: "shell",
      // Keep same-origin and certificate protections; no anti-detection flags.
      args: chromium.args.filter(arg => !arg.includes("disable-web-security")), timeout: 8000 });
    signal.throwIfAborted();
    const page = await browser.newPage();
    const browserAgent = await browser.userAgent();
    await page.setUserAgent(`${browserAgent} ${USER_AGENT}`);
    await page.setRequestInterception(true);
    let documentBlocked = false;
    let requests = 0;
    page.on("request", request => {
      const type = request.resourceType();
      const allowed = ++requests <= 160 && mercariRequestAllowed(request.url(), type)
        && (type !== "document" || mercariRobotsAllowed(policy, request.url()));
      if (!allowed && type === "document" && request.frame() === page.mainFrame()) documentBlocked = true;
      // Images/fonts/media are not necessary for DOM metadata, and are not read.
      const skip = ["image", "font", "media"].includes(type);
      void (allowed && !skip ? request.continue() : request.abort()).catch(() => undefined);
    });
    const observe = async (url: string, detail: boolean) => {
      signal.throwIfAborted();
      if (!mercariRequestAllowed(url, "document") || !mercariRobotsAllowed(policy, url)) throw new Error("Mercari page excluded by the access boundary.");
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 8000 });
      if (documentBlocked) throw new Error("Mercari redirected outside the public listing boundary.");
      if (!response || response.status() >= 400) throw new Error(`Mercari access restricted (HTTP ${response?.status() ?? "unavailable"}).`);
      const read = () => page.evaluate(mercariDomExpression({ sourceUrl: page.url(), observedAt: new Date().toISOString(), limit: 6 })) as Promise<{
        status: string; discoveries: { url: string }[];
      }>;
      let row = await readPage(page, read);
      if (row.status === "blocked") throw new Error("Mercari access verification required; acquisition stopped.");
      if (row.status !== "observed") {
        try { await page.waitForSelector(detail ? 'h1[data-testid="ItemName"]' : 'a[data-testid="ProductThumbWrapper"]', { timeout: 4000 }); }
        catch { /* Record missing evidence, never retry a navigation. */ }
        row = await readPage(page, read);
      }
      if (row.status === "blocked") throw new Error("Mercari access verification required; acquisition stopped.");
      return row;
    };
    const search = await observe(searchUrl, false);
    if (search.status !== "observed") throw new Error("Mercari search did not expose verifiable listing links.");
    const rows = [];
    for (const discovery of search.discoveries.slice(0, 3)) rows.push(await observe(discovery.url, true));
    return rows;
  } finally {
    signal.removeEventListener("abort", stop);
    if (browser) await browser.close().catch(() => undefined);
  }
}

async function readPage<T>(page: Page, read: () => Promise<T>): Promise<T> {
  const size = await page.evaluate(() => document.documentElement.outerHTML.length);
  if (size > 2_000_000) throw new Error("Mercari page exceeded its size limit.");
  return read();
}
