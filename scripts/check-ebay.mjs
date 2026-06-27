// Verify eBay production credentials and Browse access.
//   Run from the project root:  node scripts/check-ebay.mjs
//
// It checks the two independent gates separately so you know exactly where you are:
//   1. OAuth application token  -> credentials valid + keyset active (exemption done)
//   2. Browse item_summary/search -> the growth-check-gated forward-search method
// Single-item lookup (paste-a-URL) works as soon as gate 1 passes, even if gate 2 is pending.
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);

const id = env.EBAY_CLIENT_ID;
const secret = env.EBAY_CLIENT_SECRET;
if (!id || !secret) {
  console.error("✗ EBAY_CLIENT_ID / EBAY_CLIENT_SECRET missing from .env.local");
  process.exit(1);
}
if (id.includes("SBX") || secret.startsWith("SBX-")) {
  console.error("✗ These look like SANDBOX keys (SBX). Production keys are required for real listings.");
  process.exit(1);
}

const API = "https://api.ebay.com";
const auth = Buffer.from(`${id}:${secret}`).toString("base64");

// Gate 1: application token
const tokenRes = await fetch(`${API}/identity/v1/oauth2/token`, {
  method: "POST",
  headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
});
if (!tokenRes.ok) {
  console.error(`✗ OAuth token failed (${tokenRes.status}) — keyset still disabled, or creds are wrong/incomplete.`);
  console.error(await tokenRes.text());
  process.exit(1);
}
const { access_token: token } = await tokenRes.json();
console.log("✓ OAuth token: OK — credentials valid, keyset active.");

// Gate 2: Browse search (growth-check gated)
const q = "charizard ex";
const searchRes = await fetch(
  `${API}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=3&filter=buyingOptions:{FIXED_PRICE}`,
  { headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" } },
);
if (searchRes.ok) {
  const data = await searchRes.json();
  const n = data.total ?? data.itemSummaries?.length ?? 0;
  console.log(`✓ Browse search: OK — ${n} live results for "${q}". Forward search is LIVE.`);
} else {
  console.log(`… Browse search: ${searchRes.status} — not granted yet (the growth-check gate).`);
  console.log("   Single-item / paste-a-URL still works now; forward search lights up once eBay grants it.");
}
