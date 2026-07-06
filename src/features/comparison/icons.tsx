// TCGpal's own icon set. Every mark is hand-drawn in the visual language of the
// logo: rounded-corner card silhouettes, fanned card pairs, and foil sparks,
// all at one stroke weight. Icons render in currentColor so the surrounding
// text color (verdict tones, eyebrows, buttons) styles them, exactly like the
// stock set they replace.

import type { ReactElement } from "react";

export type IconProps = { className?: string };
export type IconComponent = (props: IconProps) => ReactElement;

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...strokeProps}>
      {children}
    </svg>
  );
}

/** A loupe over a card — search that is specifically about finding a card. */
export function IconCardSearch({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="3" width="10.5" height="14.5" rx="2" />
      <path d="M6.9 6.6h4.7" />
      <circle cx="15.6" cy="15.6" r="3.7" />
      <path d="M18.4 18.4 21 21" />
    </Svg>
  );
}

/** Two fanned cards — the logo motif; stands for "across marketplaces". */
export function IconCardFan({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="5.4" y="4.2" width="9.4" height="13.6" rx="2" transform="rotate(-13 10.1 11)" />
      <rect x="9.2" y="6.2" width="9.4" height="13.6" rx="2" transform="rotate(9 13.9 13)" />
    </Svg>
  );
}

/** A card with a check — a listing that passed the safety screen. */
export function IconCardCheck({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="6.5" y="3.25" width="11" height="17.5" rx="2.2" />
      <path d="m9.4 12.3 1.9 1.9 3.5-4.5" />
    </Svg>
  );
}

/** A scalloped seal with a check — seller trust, verified claims. */
export function IconSeal({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m12 2.6 2 1.5 2.5-.3 1 2.3 2.3 1-.3 2.5 1.5 2-1.5 2 .3 2.5-2.3 1-1 2.3-2.5-.3-2 1.5-2-1.5-2.5.3-1-2.3-2.3-1 .3-2.5-1.5-2 1.5-2-.3-2.5 2.3-1 1-2.3 2.5.3z" />
      <path d="m9.2 12.2 1.9 1.9 3.7-4.4" />
    </Svg>
  );
}

/** A four-point foil spark with two small glints — holo shine, "best" markers. */
export function IconFoil({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12.6 3.6c.55 3.35 2.4 5.2 5.75 5.75-3.35.55-5.2 2.4-5.75 5.75-.55-3.35-2.4-5.2-5.75-5.75 3.35-.55 5.2-2.4 5.75-5.75z" />
      <path d="M5.2 15.4v3.4M3.5 17.1h3.4" />
      <path d="M17.5 17.6v2.6M16.2 18.9h2.6" />
    </Svg>
  );
}

/** Viewfinder brackets framing a card — photo evidence of the actual item. */
export function IconPhotoProof({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 8.2V6a2 2 0 0 1 2-2h2.2" />
      <path d="M20 8.2V6a2 2 0 0 0-2-2h-2.2" />
      <path d="M4 15.8V18a2 2 0 0 0 2 2h2.2" />
      <path d="M20 15.8V18a2 2 0 0 1-2 2h-2.2" />
      <rect x="9" y="7.6" width="6" height="8.8" rx="1.4" />
    </Svg>
  );
}

/** A price tag. */
export function IconTag({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M11.7 3.3H5.6a2.3 2.3 0 0 0-2.3 2.3v6.1c0 .61.24 1.2.67 1.63l7.13 7.13a2.3 2.3 0 0 0 3.25 0l5.85-5.85a2.3 2.3 0 0 0 0-3.25L13.33 3.97a2.3 2.3 0 0 0-1.63-.67z" />
      <circle cx="7.7" cy="7.7" r="1.1" />
    </Svg>
  );
}

/** A receipt with a torn edge — landed cost, the evidence ledger. */
export function IconReceipt({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6.2 3.4h11.6v16.8l-1.93-1.5-1.94 1.5L12 18.7l-1.93 1.5-1.94-1.5-1.93 1.5z" />
      <path d="M9.2 8h5.6M9.2 11.4h5.6M9.2 14.8h3.4" />
    </Svg>
  );
}

export function IconCaution({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.6v5M12 16.2h.01" />
    </Svg>
  );
}

export function IconInfo({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11v5.2M12 7.7h.01" />
    </Svg>
  );
}

export function IconPin({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 21.2S5.2 16 5.2 10.8a6.8 6.8 0 1 1 13.6 0c0 5.2-6.8 10.4-6.8 10.4z" />
      <circle cx="12" cy="10.6" r="2.4" />
    </Svg>
  );
}

export function IconLink({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10.2 13.8a4 4 0 0 0 5.66 0l3.1-3.1a4 4 0 1 0-5.66-5.66l-1.7 1.7" />
      <path d="M13.8 10.2a4 4 0 0 0-5.66 0l-3.1 3.1a4 4 0 1 0 5.66 5.66l1.7-1.7" />
    </Svg>
  );
}

export function IconChevronDown({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m6 9.5 6 6 6-6" />
    </Svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function IconX({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 5.5v13M5.5 12h13" />
    </Svg>
  );
}

export function IconArrowUpRight({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M7 17 17 7M9 7h8v8" />
    </Svg>
  );
}

export function IconExternal({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M15 4.5h4.5V9" />
      <path d="M19.5 4.5 11 13" />
      <path d="M17 13.5v4.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4.5" />
    </Svg>
  );
}

/** An open arc — pair with the caller's animate-spin class. */
export function IconSpinner({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3a9 9 0 0 1 9 9" />
    </Svg>
  );
}
