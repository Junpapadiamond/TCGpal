import Image from "next/image";
import type { Marketplace } from "@/lib/schemas";
import { useT } from "./i18n";

const assets: Partial<Record<Marketplace, { src: string; width: number; height: number; wordmark: boolean }>> = {
  eBay: { src: "/marketplace-ebay.png", width: 55, height: 23, wordmark: true },
  TCGplayer: { src: "/marketplace-tcgplayer.svg", width: 92, height: 28, wordmark: true },
  SNKRDUNK: { src: "/marketplace-snkrdunk.png", width: 116, height: 18, wordmark: true },
  Whatnot: { src: "/marketplace-whatnot.png", width: 116, height: 18, wordmark: true },
  Mercari: { src: "/marketplace-mercari.png", width: 112, height: 28, wordmark: true },
};

/** Reuse the platform's real mark; keep its accessible name exactly once. */
export function MarketplaceBrand({ marketplace }: { marketplace: Marketplace }) {
  const t = useT();
  const asset = assets[marketplace];
  return <span className="inline-flex min-h-7 items-center gap-2.5 font-semibold text-[#24312f]">
    {asset && <span className={marketplace === "Mercari" ? "relative inline-flex h-7 w-28 overflow-hidden" : "inline-flex"}>
      {marketplace === "Mercari"
        ? <Image src={asset.src} alt="" fill sizes="112px" className="scale-[1.4] object-cover mix-blend-multiply" />
        : <Image src={asset.src} alt="" width={asset.width} height={asset.height} className="max-h-6 w-auto object-contain" />}
    </span>}
    <span className={asset?.wordmark ? "sr-only" : undefined}>{t.marketplaces[marketplace] ?? marketplace}</span>
  </span>;
}
