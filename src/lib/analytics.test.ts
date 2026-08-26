import { beforeEach, describe, expect, it } from "vitest";
import {
  classifyChannelTag,
  classifyReferrerChannel,
  clearResultShown,
  markResultShown,
  resolveChannelFrom,
  resolveInternalDeviceFlag,
  sanitizeAnalyticsProperties,
  stripUrlProperties,
  timeToOpenBucket,
} from "@/lib/analytics";

describe("analytics privacy boundary", () => {
  it("drops listing text, URLs, seller identifiers, and images", () => {
    expect(sanitizeAnalyticsProperties({
      marketplace: "eBay",
      status: "complete",
      url: "https://example.com/private",
      listingText: "private listing",
      sellerName: "seller-123",
      imageUrl: "https://example.com/card.jpg",
      referrer_class: "reddit",
    })).toEqual({
      marketplace: "eBay",
      status: "complete",
      referrer_class: "reddit",
    });
  });

  it("accepts only coarse receipt referrer classes", () => {
    expect(sanitizeAnalyticsProperties({ referrer_class: "discord" })).toEqual({ referrer_class: "discord" });
    expect(sanitizeAnalyticsProperties({ referrer_class: "https://example.com/private-path" })).toEqual({});
  });

  it("allows only approved enums for result sharing and marketplace follow-ups", () => {
    expect(sanitizeAnalyticsProperties({
      marketplace: "Mercari",
      game: "onePiece",
      share_method: "url",
      result_state: "best_buy",
      url: "https://www.mercari.com/search/?keyword=private-card-name",
      card_name: "private card name",
    })).toEqual({
      marketplace: "Mercari",
      game: "onePiece",
      share_method: "url",
      result_state: "best_buy",
    });

    expect(sanitizeAnalyticsProperties({
      marketplace: "not-a-marketplace",
      game: "private-game",
      share_method: "clipboard-with-card-name",
      result_state: "secret-state",
    })).toEqual({});
  });

  it("keeps the raw campaign tag out of the payload and allows only channel enums", () => {
    expect(sanitizeAnalyticsProperties({ channel: "rednote" })).toEqual({ channel: "rednote" });
    expect(sanitizeAnalyticsProperties({ channel: "reddit_pokemontcg_launch_post_2" })).toEqual({});
  });

  it("allows only bucketed decision latency, never a raw duration", () => {
    expect(sanitizeAnalyticsProperties({ time_to_open_bucket: "under_10s" })).toEqual({ time_to_open_bucket: "under_10s" });
    expect(sanitizeAnalyticsProperties({ time_to_open_bucket: 8123 })).toEqual({});
  });
});

describe("posthog default properties", () => {
  it("strips the URL properties posthog attaches on its own", () => {
    // The journey writes the buyer's search into the address bar, so
    // $current_url carries the card they looked up. sanitizeAnalyticsProperties
    // cannot reach this — it only filters the object we pass to capture().
    expect(stripUrlProperties({
      $current_url: "https://lenstcg.com/?query=Umbreon+VMAX+215%2F203&step=result&card=swsh7-215",
      $pathname: "/r/0123456789abcdef0123456789abcdef",
      $referrer: "https://www.reddit.com/r/PokemonTCG/comments/abc123",
      $referring_domain: "www.reddit.com",
      $host: "lenstcg.com",
      $lib: "web",
      channel: "reddit",
    })).toEqual({
      // $host is the only location signal kept: it is our own domain, carries no
      // buyer data, and separates lenstcg.com from tcgpal.vercel.app.
      $host: "lenstcg.com",
      $lib: "web",
      channel: "reddit",
    });
  });

  it("strips the initial-* variants that carry the landing URL", () => {
    expect(stripUrlProperties({
      $initial_current_url: "https://lenstcg.com/?query=Charizard+4%2F102",
      $initial_pathname: "/",
      $initial_referrer: "https://www.xiaohongshu.com/explore/abc",
      $initial_referring_domain: "www.xiaohongshu.com",
      $device_type: "Desktop",
    })).toEqual({ $device_type: "Desktop" });
  });

  it("survives posthog passing no properties at all", () => {
    expect(stripUrlProperties(null)).toEqual({});
  });
});

describe("channel attribution", () => {
  it("maps campaign tags to a coarse channel, never to the raw tag", () => {
    expect(classifyChannelTag("reddit")).toBe("reddit");
    expect(classifyChannelTag("reddit_pokemontcg_01")).toBe("reddit");
    expect(classifyChannelTag("rednote_bio")).toBe("rednote");
    expect(classifyChannelTag("xhs")).toBe("rednote");
    expect(classifyChannelTag("xiaohongshu-note-4")).toBe("rednote");
    expect(classifyChannelTag("discord_cardcollectors")).toBe("discord");
    expect(classifyChannelTag("internal")).toBe("internal");
    expect(classifyChannelTag("some-partner-newsletter")).toBe("other");
  });

  it("treats a missing or empty tag as no signal", () => {
    expect(classifyChannelTag(null)).toBeNull();
    expect(classifyChannelTag("")).toBeNull();
    expect(classifyChannelTag("   ")).toBeNull();
  });

  it("treats the internal-off tag as no signal so the visit is attributed normally", () => {
    // Must be matched before the `internal` prefix, or the act of turning the
    // flag off would itself be recorded as an internal visit.
    expect(classifyChannelTag("internal-off")).toBeNull();
    expect(classifyChannelTag("internal_off")).toBeNull();
  });

  it("classifies referrer hosts, including RedNote and same-origin navigation", () => {
    expect(classifyReferrerChannel("", "https://lenstcg.com")).toBe("direct");
    expect(classifyReferrerChannel("https://lenstcg.com/method", "https://lenstcg.com")).toBe("direct");
    expect(classifyReferrerChannel("https://www.reddit.com/r/PokemonTCG", "https://lenstcg.com")).toBe("reddit");
    expect(classifyReferrerChannel("https://redd.it/abc123", "https://lenstcg.com")).toBe("reddit");
    expect(classifyReferrerChannel("https://www.xiaohongshu.com/explore/x", "https://lenstcg.com")).toBe("rednote");
    expect(classifyReferrerChannel("https://xhslink.com/a/abc", "https://lenstcg.com")).toBe("rednote");
    expect(classifyReferrerChannel("https://discord.com/channels/1/2", "https://lenstcg.com")).toBe("discord");
    expect(classifyReferrerChannel("https://example.com/post", "https://lenstcg.com")).toBe("other");
    expect(classifyReferrerChannel("not-a-url", "https://lenstcg.com")).toBe("other");
  });

  it("prefers an explicit tag, then the stored channel, then the referrer", () => {
    const origin = "https://lenstcg.com";

    // RedNote strips the referrer inside its in-app browser, so the tag has to win.
    expect(resolveChannelFrom({ search: "?s=rednote_bio", referrer: "", stored: null, origin })).toBe("rednote");
    // A fresh campaign click overrides what an earlier visit stored this session.
    expect(resolveChannelFrom({ search: "?s=reddit_op", referrer: "", stored: "rednote", origin })).toBe("reddit");
    // Internal navigation drops the param but must not relabel the visit "direct".
    expect(resolveChannelFrom({ search: "", referrer: `${origin}/method`, stored: "reddit", origin })).toBe("reddit");
    expect(resolveChannelFrom({ search: "", referrer: "https://www.reddit.com/r/OnePieceTCG", stored: null, origin })).toBe("reddit");
    expect(resolveChannelFrom({ search: "", referrer: "", stored: null, origin })).toBe("direct");
    // A tampered or stale storage value must not smuggle a free-text label through.
    expect(resolveChannelFrom({ search: "", referrer: "", stored: "reddit_launch_post", origin })).toBe("direct");
  });
});

describe("internal device marking", () => {
  const origin = "https://lenstcg.com";

  it("marks the device from an internal tag and clears it from the off tag", () => {
    expect(resolveInternalDeviceFlag("internal", false)).toBe(true);
    expect(resolveInternalDeviceFlag("internal_macbook", false)).toBe(true);
    expect(resolveInternalDeviceFlag("internal-off", true)).toBe(false);
    expect(resolveInternalDeviceFlag("internal_off", true)).toBe(false);
  });

  it("keeps whatever the device already decided when a visit carries no internal tag", () => {
    // The point of the flag is that a browser is marked once and the founder
    // never has to remember the query param again.
    expect(resolveInternalDeviceFlag(null, true)).toBe(true);
    expect(resolveInternalDeviceFlag("reddit_op", true)).toBe(true);
    expect(resolveInternalDeviceFlag(null, false)).toBe(false);
    expect(resolveInternalDeviceFlag("reddit_op", false)).toBe(false);
  });

  it("keeps a marked device internal however the visit arrives", () => {
    // The founder opening their own Reddit post is still the founder, so a
    // marked device outranks both the tag and the referrer.
    expect(resolveChannelFrom({ search: "?s=reddit_op", referrer: "", stored: null, origin, internalDevice: true })).toBe("internal");
    expect(resolveChannelFrom({ search: "", referrer: "https://www.reddit.com/r/OnePieceTCG", stored: null, origin, internalDevice: true })).toBe("internal");
    expect(resolveChannelFrom({ search: "", referrer: "", stored: "reddit", origin, internalDevice: true })).toBe("internal");
  });

  it("leaves unmarked devices attributed exactly as before", () => {
    expect(resolveChannelFrom({ search: "?s=reddit_op", referrer: "", stored: null, origin, internalDevice: false })).toBe("reddit");
    expect(resolveChannelFrom({ search: "", referrer: "", stored: null, origin })).toBe("direct");
  });
});

describe("decision latency", () => {
  beforeEach(() => {
    clearResultShown();
  });

  it("reports no bucket until a result has actually been shown", () => {
    expect(timeToOpenBucket(1_000)).toBeUndefined();
  });

  it("buckets the gap between seeing the verdict and opening a listing", () => {
    markResultShown(100_000);
    expect(timeToOpenBucket(100_000)).toBe("under_10s");
    expect(timeToOpenBucket(109_999)).toBe("under_10s");
    expect(timeToOpenBucket(110_000)).toBe("10_to_60s");
    expect(timeToOpenBucket(159_999)).toBe("10_to_60s");
    expect(timeToOpenBucket(160_000)).toBe("over_60s");
  });

  it("ignores a clock that ran backwards rather than reporting a wrong bucket", () => {
    markResultShown(100_000);
    expect(timeToOpenBucket(99_000)).toBeUndefined();
  });
});
