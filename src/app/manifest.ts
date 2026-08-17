import type { MetadataRoute } from "next";

/**
 * Home-screen install metadata. This is the cheap half of "make it an app":
 * an icon on the home screen and a chromeless window, with no store review,
 * no second build target, and no separate origin for the API to trust.
 *
 * `display: "standalone"` drops the browser chrome once installed. It does not
 * change how the site renders in a normal tab, so nothing here affects the
 * launch funnel for buyers arriving from a link.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lens TCG — evidence-backed card listing comparison",
    short_name: "Lens TCG",
    description:
      "Confirm the exact print, compare live listings by complete cost, and see the evidence behind the pick.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Matches the page background in globals.css so the launch screen does not
    // flash white before the cream paper paints.
    background_color: "#f4f7f3",
    theme_color: "#2f6f73",
    categories: ["shopping", "utilities"],
    icons: [
      { src: "/icon-180.png", sizes: "180x180", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Declared "maskable" separately so Android can crop to its own shape
      // without letterboxing the square icon.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
