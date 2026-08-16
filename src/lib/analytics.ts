"use client";

import posthog from "posthog-js";

export type TcgpalAnalyticsEvent =
  // The funnel denominator. Without a landing event the first thing we see is a
  // search, which leaves every downstream rate without a denominator: we could
  // not tell "nobody understood the pitch" from "everybody searched and nothing
  // was worth clicking". Those have opposite fixes.
  | "app_opened"
  | "card_search_started"
  | "rail_card_clicked"
  | "identity_gallery_viewed"
  | "comparison_started"
  | "source_detected"
  | "card_identity_confirmed"
  | "manual_candidate_added"
  | "comparison_completed"
  | "comparison_failed"
  | "choice_opened"
  | "lens_selected"
  | "comparison_receipt_copied"
  | "receipt_created"
  | "receipt_viewed"
  | "receipt_recheck_clicked"
  | "receipt_link_copied"
  | "result_shared"
  | "other_marketplace_clicked"
  | "game_selected"
  | "decision_feedback_submitted"
  | "second_comparison_started"
  // Fold-rate signals: fired once per report on first open of a Layer-2/3
  // surface. High fold-open rates with low choice_opened would mean buyers are
  // re-doing the research by hand — the kill criterion the folds would
  // otherwise hide. Payload stays within the allowlist (demo_mode only).
  | "alternatives_expanded"
  | "method_opened"
  | "qa_opened";

const allowedProperties = new Set([
  "marketplace",
  "status",
  "demo_mode",
  "candidate_count",
  "choice_role",
  "confidence",
  "duration_bucket",
  "changed_decision",
  "referrer_class",
  "channel",
  "time_to_open_bucket",
  "game",
  "source",
  "share_method",
  "result_state",
]);

/**
 * Coarse acquisition channels. This is the complete vocabulary: a campaign tag
 * or referrer is mapped into one of these before it can reach an event, so a
 * raw tag like `reddit_pokemontcg_launch_post_2` never leaves the browser.
 * `internal` exists so founder testing can be filtered out of launch metrics.
 */
export type TcglensChannel = "direct" | "reddit" | "rednote" | "discord" | "internal" | "other";

const allowedChannels = new Set<string>(["direct", "reddit", "rednote", "discord", "internal", "other"]);
const allowedReferrerClasses = allowedChannels;
const allowedTimeToOpenBuckets = new Set(["under_10s", "10_to_60s", "over_60s"]);
const allowedMarketplaces = new Set([
  "eBay",
  "TCGplayer",
  "Cardmarket",
  "Facebook",
  "Reddit",
  "Mercari",
  "Whatnot",
  "SNKRDUNK",
  "Yahoo Auctions JP",
  "Xianyu",
  "集换社",
  "Shopee Taiwan",
  "Local shop",
  "Other",
]);
const allowedGames = new Set(["pokemon", "onePiece"]);
const allowedShareMethods = new Set(["url", "text"]);
const allowedResultStates = new Set(["best_buy", "inspect_first", "next_moves"]);

/**
 * posthog-js attaches its own default properties to every capture, and
 * `sanitizeAnalyticsProperties` cannot reach them — that only filters the object
 * we pass to `capture()`. `$current_url` is the problem: the comparison journey
 * writes the buyer's search into the address bar (`?query=Umbreon+VMAX+215/203`),
 * so the card someone looked up would leave the browser on every event, against
 * the Analytics Privacy rule in AGENTS.md.
 *
 * `$host` is deliberately kept. It is our own domain, carries no buyer data, and
 * is the only thing that separates lenstcg.com traffic from tcgpal.vercel.app.
 */
const posthogUrlProperties = [
  "$current_url",
  "$pathname",
  "$referrer",
  "$referring_domain",
  "$initial_current_url",
  "$initial_pathname",
  "$initial_referrer",
  "$initial_referring_domain",
];

export function stripUrlProperties(properties: Record<string, unknown> | null) {
  if (!properties) return {};
  const cleaned = { ...properties };
  for (const key of posthogUrlProperties) delete cleaned[key];
  return cleaned;
}

let initialized = false;

const CHANNEL_STORAGE_KEY = "tcglens_channel";
let resolvedChannel: TcglensChannel | null = null;

/**
 * Map a `?s=` campaign tag onto a channel. Tags are per-post (`reddit_op_01`)
 * so one Reddit thread can be told from another in the spreadsheet, but only
 * the coarse prefix is ever transmitted. Returns null when there is no tag.
 */
export function classifyChannelTag(raw: string | null): TcglensChannel | null {
  const tag = raw?.trim().toLowerCase();
  if (!tag) return null;
  if (tag.startsWith("reddit")) return "reddit";
  if (tag.startsWith("rednote") || tag.startsWith("xhs") || tag.startsWith("xiaohongshu")) return "rednote";
  if (tag.startsWith("discord")) return "discord";
  if (tag.startsWith("internal")) return "internal";
  return "other";
}

export function classifyReferrerChannel(referrer: string, origin: string): TcglensChannel {
  if (!referrer) return "direct";
  try {
    const url = new URL(referrer);
    if (url.origin === origin) return "direct";
    const host = url.hostname;
    if (host.includes("reddit.com") || host === "redd.it" || host.endsWith(".redd.it")) return "reddit";
    if (host.includes("xiaohongshu.com") || host.includes("xhslink.com")) return "rednote";
    if (host.includes("discord.com") || host.includes("discordapp.com") || host.includes("discord.gg")) return "discord";
  } catch {
    return "other";
  }
  return "other";
}

/**
 * Precedence: explicit tag → what this tab already resolved → referrer.
 *
 * The stored value matters because internal navigation (result → /method →
 * back) drops the query param, and RedNote's in-app browser often sends no
 * referrer at all — without persistence those visits would silently relabel
 * themselves "direct" halfway through the funnel.
 */
export function resolveChannelFrom({ search, referrer, stored, origin }: {
  search: string;
  referrer: string;
  stored: string | null;
  origin: string;
}): TcglensChannel {
  const tagged = classifyChannelTag(new URLSearchParams(search).get("s"));
  if (tagged) return tagged;
  if (stored && allowedChannels.has(stored)) return stored as TcglensChannel;
  return classifyReferrerChannel(referrer, origin);
}

export function resolveChannel(): TcglensChannel {
  if (resolvedChannel) return resolvedChannel;
  if (typeof window === "undefined") return "direct";
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(CHANNEL_STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: fall back to this page load's signals.
  }
  const channel = resolveChannelFrom({
    search: window.location.search,
    referrer: document.referrer,
    stored,
    origin: window.location.origin,
  });
  resolvedChannel = channel;
  try {
    // Only the enum is persisted — never the raw campaign tag.
    window.sessionStorage.setItem(CHANNEL_STORAGE_KEY, channel);
  } catch {
    /* storage unavailable; the channel still holds for this page load */
  }
  return channel;
}

let resultShownAt: number | null = null;

export function markResultShown(at: number = Date.now()) {
  resultShownAt = at;
}

export function clearResultShown() {
  resultShownAt = null;
}

/**
 * How long the buyer sat with the verdict before opening a listing. Bucketed,
 * never a raw duration: an instant open means the recommendation was trusted,
 * while a long gap means they re-did the comparison by hand. That is the same
 * question dwell-time tracking would answer, without watching the session.
 */
export function timeToOpenBucket(at: number = Date.now()) {
  if (resultShownAt == null) return undefined;
  const elapsed = at - resultShownAt;
  if (elapsed < 0) return undefined;
  if (elapsed < 10_000) return "under_10s";
  if (elapsed < 60_000) return "10_to_60s";
  return "over_60s";
}

export function initializeAnalytics() {
  if (initialized || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  try {
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      person_profiles: "never",
      persistence: "localStorage",
      // Two layers on purpose: the denylist is what PostHog documents, and
      // sanitize_properties is the one we can unit-test.
      property_denylist: posthogUrlProperties,
      sanitize_properties: stripUrlProperties,
    });
    initialized = true;
  } catch {
    // Analytics must never break the app. If init fails (e.g. a strict browser
    // rejecting a host URL, or storage disabled in private mode), stay disabled.
    initialized = false;
  }
}

export function trackEvent(event: TcgpalAnalyticsEvent, properties: Record<string, unknown> = {}) {
  // A telemetry failure must never surface as a broken comparison. Any throw
  // from PostHog (e.g. Safari's URL constructor) is swallowed here.
  try {
    initializeAnalytics();
    if (!initialized) return;
    // Every event carries the acquisition channel so any step of the funnel can
    // be split by source without a person profile or a stitched identity.
    posthog.capture(event, sanitizeAnalyticsProperties({ channel: resolveChannel(), ...properties }));
  } catch {
    /* ignore analytics errors */
  }
}

export function sanitizeAnalyticsProperties(properties: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => (
      allowedProperties.has(key)
      && (key !== "referrer_class" || (typeof value === "string" && allowedReferrerClasses.has(value)))
      && (key !== "channel" || (typeof value === "string" && allowedChannels.has(value)))
      && (key !== "time_to_open_bucket" || (typeof value === "string" && allowedTimeToOpenBuckets.has(value)))
      && (key !== "marketplace" || (typeof value === "string" && allowedMarketplaces.has(value)))
      && (key !== "game" || (typeof value === "string" && allowedGames.has(value)))
      && (key !== "share_method" || (typeof value === "string" && allowedShareMethods.has(value)))
      && (key !== "result_state" || (typeof value === "string" && allowedResultStates.has(value)))
    )),
  );
}
