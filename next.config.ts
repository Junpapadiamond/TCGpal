import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  images: {
    // The card-image route validates the upstream URL itself; this local
    // pattern lets next/image optimize only that same-origin image endpoint.
    localPatterns: [
      {
        pathname: "/**",
        search: "",
      },
      {
        pathname: "/api/card-image",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.pokemontcg.io",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.scrydex.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "i.ebayimg.com",
        pathname: "/**",
      },
      // Whatnot and Mercari listing photos, for the item-price-only reference
      // sections. Both serve seller-uploaded images from a single CDN host.
      {
        protocol: "https",
        hostname: "images.whatnot.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "u-mercari-images.mercdn.net",
        pathname: "/**",
      },
      // One Piece card art. en.onepiece-cardgame.com serves the official
      // watermarked "SAMPLE" images used by the bundled catalog; the optcgapi
      // hosts cover images returned by the live OPTCG augmentation.
      {
        protocol: "https",
        hostname: "en.onepiece-cardgame.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.optcgapi.com",
        pathname: "/**",
      },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
      excludeReplayIframe: true,
      excludeReplayShadowDOM: true,
    },
  },
});
