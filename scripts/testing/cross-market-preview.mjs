// Local-only browser QA. Serves the real Next UI through a proxy, replacing
// provider calls with explicit synthetic fixtures. Never imported by the app.
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = fileURLToPath(new URL("../../", import.meta.url));
const port = Number(process.env.TCGLENS_QA_PORT ?? 4317);
const upstreamPort = Number(process.env.TCGLENS_QA_UPSTREAM_PORT ?? 3000);
const jiti = createJiti(import.meta.url, { interopDefault: false, alias: { "@": path.join(root, "src") } });
process.env.EBAY_CLIENT_ID = "local-qa-only";
process.env.CROSS_MARKET_PRICE_PILOT_ENABLED = "0";
process.env.MERCARI_APIFY_PROXY_ENABLED = "0";
process.env.MERCARI_DIRECT_ENABLED = "0";
process.env.SOLDGRAPH_ENABLED = "0";
process.env.EBAY_CLIENT_SECRET = "local-qa-only";
process.env.WHATNOT_APIFY_TOKEN = "local-qa-only";
process.env.WHATNOT_APIFY_PRICE_UNIT = "dollars";
process.env.MERCARI_APIFY_TOKEN = "local-qa-only";
process.env.NODE_ENV = "test";
// Never send an inherited credential, analytics event, or durable cache write.
for (const key of Object.keys(process.env)) {
  if (/OPENAI|ANTHROPIC|UPSTASH|KV_REST|SOLDGRAPH|SENTRY|POSTHOG|PRICECHARTING|TAVILY|EXA_|VERCEL/.test(key)) delete process.env[key];
}
const { resolveCardIdentity } = await jiti.import(path.join(root, "src/lib/ai/card-identity.ts"));
const { runListingComparison } = await jiti.import(path.join(root, "src/lib/ai/listing-compare.ts"));
const { getPokemonCardFromSnapshot } = await jiti.import(path.join(root, "src/lib/external/pokemon-catalog-snapshot.ts"));
const { findOnePieceCatalogVariant } = await jiti.import(path.join(root, "src/lib/external/one-piece-catalog.ts"));
const { ebayPlatformAgent } = await jiti.import(path.join(root, "src/lib/comparison/platforms.ts"));
const { parseWhatnotListings } = await jiti.import(path.join(root, "src/lib/external/whatnot.ts"));
const { parseMercariListings } = await jiti.import(path.join(root, "src/lib/external/mercari.ts"));
const { parseStompingGroundsListings } = await jiti.import(path.join(root, "src/lib/external/stomping-grounds.ts"));
const { parseSoldgraphListings } = await jiti.import(path.join(root, "src/lib/external/soldgraph.ts"));
const soldgraphQA = process.env.TCGLENS_QA_PROVIDER === "soldgraph";
// Exercise real parsers and ranking through explicit trusted dependency injection.
// Never invoke paid run/start or Redis paths; never mutate the default registry.
const fixtureAgents = [ebayPlatformAgent, {
  id: "whatnot", marketplace: "Whatnot", label: soldgraphQA ? "Whatnot via Soldgraph · QA fixture" : "Whatnot QA fixture", sourceMode: "third_party_provider", requiredEnv: [], isConfigured: () => true,
  search: async ({ card, fetcher }) => soldgraphQA
    ? parseSoldgraphListings(await (await fetcher("https://api.soldgraph.com/v1/whatnot/listings")).json(), "whatnot", card, `${card.name} ${card.cardNumber}`, new Date())
    : parseWhatnotListings(await (await fetcher("https://api.apify.com/fixtures/whatnot-scraper")).json(), card, new Date(), "dollars"),
}, {
  id: "mercari", marketplace: "Mercari", label: soldgraphQA ? "Mercari via Soldgraph · QA fixture" : "Mercari QA fixture", sourceMode: "third_party_provider", requiredEnv: [], isConfigured: () => true,
  search: async ({ card, fetcher }) => soldgraphQA
    ? parseSoldgraphListings(await (await fetcher("https://api.soldgraph.com/v1/mercari/listings")).json(), "mercari", card, `${card.name} ${card.cardNumber}`, new Date())
    : parseMercariListings(await (await fetcher("https://api.apify.com/fixtures/mercari-us-scraper")).json(), card, new Date()),
}, {
  id: "stomping-grounds", marketplace: "Stomping Grounds", label: "Stomping Grounds QA fixture", sourceMode: "official_api", requiredEnv: [], isConfigured: () => true,
  search: async ({ card, fetcher }) => parseStompingGroundsListings(await (await fetcher("https://singles.stompinggroundstcg.com/api/ucp/mcp")).json(), card, new Date()),
}];

function fixtureFetcher(request = {}) {
  const chosen = getPokemonCardFromSnapshot(request.confirmedCardId ?? "") ?? findOnePieceCatalogVariant(request.confirmedCardId ?? "");
  const number = request.cardHint?.cardNumber || (chosen?.set?.printedTotal ? `${chosen.number}/${chosen.set.printedTotal}` : chosen?.number || request.confirmedCardId?.split("_")[0] || "58/102");
  const title = `${chosen?.name ?? request.cardHint?.name ?? "Pikachu"} ${number} base print Near Mint English`;
  const item = { itemId: "qa-1", title, itemWebUrl: "https://www.ebay.com/itm/123456789012", condition: "Ungraded",
    conditionDescriptors: [{ name: "Card Condition", values: [{ content: "Near Mint" }] }], localizedAspects: [{ name: "Language", value: "English" }],
    seller: { feedbackPercentage: "99.8", feedbackScore: 1600 }, price: { value: "100", currency: "USD" },
    shippingOptions: [{ shippingCost: { value: "10", currency: "USD" } }] };
  return async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.soldgraph.com") {
      const provider = url.pathname.includes("whatnot") ? "whatnot" : "mercari";
      const id = provider === "whatnot" ? "TGlzdGluZzox==" : "m123456";
      return Response.json({ provider, country: "us", query: `${chosen?.name ?? request.cardHint?.name ?? "Pikachu"} ${number}`,
        page: 1, count: 1, collected_at: new Date().toISOString(), schema_version: 2, completeness: "provider_page_only",
        data: [{ id, title, link: provider === "whatnot" ? `https://www.whatnot.com/listing/${id}` : `https://www.mercari.com/us/item/${id}/`,
          condition: provider === "whatnot" ? "Near Mint" : "Like New", displayed_price: { amount: provider === "whatnot" ? 90 : 85, currency: "USD" },
          ...(provider === "whatnot" ? { quantity: 1, grading_service: null, grade: null, card_set: null, card_number: number, language: "English" } : {}) }] });
    }
    if (url.hostname === "singles.stompinggroundstcg.com") return Response.json({ jsonrpc: "2.0", id: 1, result: { structuredContent: { products: [{
      id: "gid://shopify/Product/123", title, url: "https://singles.stompinggroundstcg.com/products/qa-fixture", description: { html: "<p>SYNTHETIC QA FACTS ONLY</p>" }, tags: [],
      variants: [{ id: "gid://shopify/ProductVariant/456", title: "Near Mint", price: { amount: 9200, currency: "USD" }, availability: { available: true }, requires: { shipping: true }, options: [{ name: "Condition", label: "Near Mint" }] }],
    }] } } });
    if (url.hostname === "api.pokemontcg.io") {
      if (url.pathname.startsWith("/v2/cards/")) {
        const card = getPokemonCardFromSnapshot(decodeURIComponent(url.pathname.split("/").at(-1)));
        return card ? Response.json({ data: { ...card, tcgplayer: { prices: { holofoil: { market: 100 } } } } }) : Response.json({}, { status: 404 });
      }
      // Exercise the exact-number recovery path, including Pikachu 58/102.
      return Response.json({ data: [], count: 0, totalCount: 0 });
    }
    if (url.hostname === "api.ebay.com") {
      if (url.pathname.includes("/oauth2/token")) return Response.json({ access_token: "qa", expires_in: 3600 });
      if (url.pathname.includes("/commerce/catalog/")) return Response.json({ productSummaries: [] });
      if (url.pathname.includes("/item_summary/search")) return Response.json({ itemSummaries: url.searchParams.get("sort") === "price" ? [
        { ...item, itemId: "qa-probe", price: { value: "85", currency: "USD" }, shippingOptions: [{ shippingCost: { value: "5", currency: "USD" } }] },
        { ...item, itemId: "qa-proxy", title: `${title} gold metal replica`, price: { value: "1", currency: "USD" } },
        { ...item, itemId: "qa-unknown", title: title.replace("Near Mint", ""), conditionDescriptors: [], price: { value: "70", currency: "USD" }, shippingOptions: [] },
      ] : [item] });
      if (url.pathname.includes("/buy/browse/v1/item/")) return Response.json(item);
    }
    if (url.hostname === "api.apify.com") {
      if (url.pathname.includes("whatnot-scraper")) return Response.json([{ type: "listing", id: "qa-whatnot", title,
        subtitle: "Near Mint ∙ English", publicStatus: "PUBLISHED", transactionType: "BUY_NOW", quantity: 1,
        price: { amountSafe: 90, currency: "USD" }, scrapedAt: new Date().toISOString() }]);
      if (url.pathname.includes("mercari-us-scraper")) return Response.json([{ type: "listing", listing_id: "m123456", url: "https://www.mercari.com/us/item/m123456/", title,
        listing_status: "active", currency: "USD", price: 85, shipping_payer: "buyer", shipping_fee: 5.25,
        scrape_context: { scraped_time: Date.now() } }]);
    }
    return Response.json({ error: "Network disabled in local QA fixtures" }, { status: 404 });
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const pathname = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
    if (["/api/agent/card-identity", "/api/agent/listing-compare"].includes(pathname) && req.method === "POST") {
      const input = JSON.parse(body.toString());
      const value = pathname.endsWith("card-identity")
        ? await resolveCardIdentity(input, { fetcher: fixtureFetcher(input) })
        : await runListingComparison(input, { fetcher: fixtureFetcher(input), agents: fixtureAgents });
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(value));
      return;
    }
    if (pathname === "/api/comparison-snapshots") {
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ snapshot: null, durable: false })); return;
    }
    const response = await fetch(`http://127.0.0.1:${upstreamPort}${req.url}`, { method: req.method, body: body.length ? body : undefined,
      headers: { ...(req.headers["content-type"] ? { "content-type": req.headers["content-type"] } : {}) } });
    const headers = Object.fromEntries(response.headers);
    delete headers["content-encoding"]; delete headers["content-length"]; delete headers["transfer-encoding"];
    if (headers["content-type"]?.includes("text/html")) {
      const html = (await response.text()).replace("</head>", '<style>html::before{content:"LOCAL QA · SYNTHETIC MARKETPLACE FACTS";position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#6f5a22;color:white;font:11px monospace;text-align:center;padding:5px;pointer-events:none}</style></head>');
      res.writeHead(response.status, headers); res.end(html);
    } else { res.writeHead(response.status, headers); res.end(Buffer.from(await response.arrayBuffer())); }
  } catch (error) {
    console.error(error.message); res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "Local QA harness failed" }));
  }
});
// Next development waits for its HMR connection before hydrating. Forward only
// this local socket; dropping Upgrade makes the otherwise-real UI look inert.
server.on("upgrade", (request, socket, head) => {
  const upstream = net.connect(upstreamPort, "127.0.0.1", () => {
    const headers = { ...request.headers, host: `127.0.0.1:${upstreamPort}` };
    upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});
server.listen(port, "127.0.0.1", () => console.log(`Local fixture QA at http://127.0.0.1:${port} (Next UI required on port ${upstreamPort})`));
