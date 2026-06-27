import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  images: {
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
    ],
  },
};

export default nextConfig;
