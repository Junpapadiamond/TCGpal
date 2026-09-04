import { assessPrintFidelity, isGenericMarker } from "@/lib/comparison/print-fidelity";
import { findOnePieceCatalogVariants, onePieceCatalog } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";
import type { CardIdentityCandidate } from "@/lib/schemas";

/**
 * Exact-print alignment audit for One Piece.
 *
 * "Aligned" means: when a buyer confirms a print, a listing that describes that
 * print the way a seller describes it is accepted, and a listing describing any
 * sibling print of the same number is not. This walks every print in the chosen
 * families and asks both questions with the classifier the product actually
 * runs, using the same observed-evidence construction as the sibling matrix in
 * one-piece-witness.test.ts — so the two instruments cannot disagree.
 *
 * Two of the three outcomes are defects. A print that rejects its own evidence
 * as a mismatch is broken; a print that accepts a sibling's evidence is the
 * substitution the product exists to prevent. The third — a print whose own
 * evidence is `unknown` — is an honest abstention when nothing seller-visible
 * separates it from a sibling (two prints from the same event, a reprint with
 * the same art), and is reported rather than failed so the list can be read.
 */
export type AlignmentSelfOutcome = "accepted" | "unknown" | "mismatch";

export type AlignmentRow = {
  printId: string;
  cardNumber: string;
  name: string;
  variant: string | null;
  release: string;
  artworkClass: string | null;
  siblingCount: number;
  self: AlignmentSelfOutcome;
  selfReason: string;
  /** Sibling print ids whose own evidence this print wrongly accepted. */
  admittedSiblings: string[];
  /**
   * Whether some exact marker of this print is carried by no sibling's release
   * wording — judged exactly as the classifier judges ownership: generic class
   * words ("alt art", "parallel", "SP") are not markers at all, and a phrase
   * belongs to every sibling whose wording contains it, so "Alternate Art" is
   * not unique beside a "Super Alternate Art". A print with one is
   * text-distinguishable and must prove itself; a print without one may
   * honestly abstain.
   */
  hasFamilyUniqueMarker: boolean;
};

export type AlignmentAudit = {
  rows: AlignmentRow[];
  summary: {
    prints: number;
    selfAccepted: number;
    selfUnknown: number;
    selfMismatch: number;
    substitutions: number;
  };
};

const ACCEPTED = new Set(["exact", "compatible"]);

function normalizeMarker(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * The seller-visible description of a print: what a careful listing of it says.
 *
 * The base print is described the way sellers describe it — name, number,
 * release, rarity, and nothing else. The sibling matrix in one-piece-witness
 * injects the literal words "base print", which no seller writes; that is why
 * it stayed green while every plain base title in production was abstaining.
 */
export function observedEvidenceFor(card: CardIdentityCandidate): string {
  return [
    card.name,
    card.cardNumber,
    card.setName,
    card.rarity ?? "",
    (card.variant ?? "").replace(/\s*\([PR]\d+\)\s*/gi, " "),
    ...(card.collectorAliases ?? []),
    ...(card.exactMarkers ?? []),
    ...(card.treatments ?? []),
    card.language,
  ].filter(Boolean).join(" ");
}

/** Card numbers whose prefix is one of the given release codes ("EB01", "PRB02", "P"). */
export function familiesWithPrefix(prefixes: readonly string[]): string[] {
  const wanted = prefixes.map((prefix) => prefix.toUpperCase());
  const numbers = new Set<string>();
  for (const entry of onePieceCatalog) {
    const number = entry.card_set_id.trim().toUpperCase();
    const prefix = number.split("-")[0] ?? "";
    if (wanted.includes(prefix)) numbers.add(number);
  }
  return [...numbers].sort();
}

export function auditOnePieceAlignment(families: readonly string[]): AlignmentAudit {
  const rows: AlignmentRow[] = [];

  for (const family of families) {
    const siblings = findOnePieceCatalogVariants(family).map((print) =>
      mapOnePieceCardToIdentity(print, { confidence: "high", matchReasons: ["alignment-audit"] }),
    );
    const evidence = new Map(siblings.map((card) => [card.id, observedEvidenceFor(card)]));
    // Every phrase a sibling's listing would carry, so uniqueness is judged by
    // containment exactly as the classifier judges ownership.
    const wording = new Map(siblings.map((card) => [
      card.id,
      [card.setName, ...(card.collectorAliases ?? []), ...(card.exactMarkers ?? [])].map(normalizeMarker).filter(Boolean),
    ]));
    const uniqueTo = (card: CardIdentityCandidate) => (card.exactMarkers ?? [])
      .filter((marker) => !isGenericMarker(marker))
      .map(normalizeMarker)
      .filter((marker) => marker.length >= 4)
      .some((marker) => siblings.every((other) =>
        other.id === card.id || !(wording.get(other.id) ?? []).some((phrase) => phrase.includes(marker))));

    for (const selected of siblings) {
      const own = assessPrintFidelity({
        card: selected,
        matchText: evidence.get(selected.id) ?? "",
        listingPrice: 100,
        exactMarketAnchor: null,
      });
      const admittedSiblings = siblings
        .filter((other) => other.id !== selected.id)
        .filter((other) => ACCEPTED.has(assessPrintFidelity({
          card: selected,
          matchText: evidence.get(other.id) ?? "",
          listingPrice: 100,
          exactMarketAnchor: null,
        }).match))
        .map((other) => other.id);

      rows.push({
        printId: selected.id,
        cardNumber: selected.cardNumber,
        name: selected.name,
        variant: selected.variant ?? null,
        release: selected.setName,
        artworkClass: selected.artworkClass ?? null,
        siblingCount: siblings.length - 1,
        self: ACCEPTED.has(own.match) ? "accepted" : own.match === "mismatch" ? "mismatch" : "unknown",
        selfReason: own.reasons.join(","),
        admittedSiblings,
        hasFamilyUniqueMarker: uniqueTo(selected),
      });
    }
  }

  return {
    rows,
    summary: {
      prints: rows.length,
      selfAccepted: rows.filter((row) => row.self === "accepted").length,
      selfUnknown: rows.filter((row) => row.self === "unknown").length,
      selfMismatch: rows.filter((row) => row.self === "mismatch").length,
      substitutions: rows.filter((row) => row.admittedSiblings.length > 0).length,
    },
  };
}

/** The ordinary retail print of a family: its print id is the bare card number. */
export function isBasePrintRow(row: AlignmentRow): boolean {
  return row.printId.toUpperCase() === row.cardNumber.toUpperCase();
}

/** Retail numbers have one ordinary print; promo numbers do not. */
export function isRetailFamily(cardNumber: string): boolean {
  return /^(?:OP|ST|EB|PRB)\d/i.test(cardNumber);
}
