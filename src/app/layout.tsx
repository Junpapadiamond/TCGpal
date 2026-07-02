import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Noto_Serif_SC } from "next/font/google";
import "./globals.css";

// Display serif for headings: Fraunces with its optical-size, softness, and
// wonk axes loaded so CSS can tune the print personality per size.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
});

// Money and ledger numbers. Plex Mono tops out at 700; font-black usages
// resolve to that.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

// Chinese display serif: Han glyphs fall through Fraunces to this in the
// heading stack, so 中文 headings get the same editorial weight as English.
// Not preloaded — the CJK slices only download when zh text renders.
const notoSerifSC = Noto_Serif_SC({
  variable: "--font-serif-sc",
  weight: ["600", "700"],
  preload: false,
});

export const metadata: Metadata = {
  title: "TCGpal — Compare Pokémon card listings with evidence",
  description: "Compare landed cost, seller signals, and condition evidence before buying a Pokémon card.",
  icons: {
    icon: [
      { url: "/tcgpal-icon.svg", type: "image/svg+xml" },
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexMono.variable} ${notoSerifSC.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
