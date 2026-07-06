import type { ConditionClaim, Marketplace, RankedChoice, TcgGame } from "@/lib/schemas";

export type LensRole = RankedChoice["role"];

export type LedgerRow = {
  marketplace: Marketplace;
  price: string;
  shipping: string;
  claimedCondition: ConditionClaim;
  title: string;
  url: string;
};

export type ComparisonForm = {
  // The hero search box: one free-text query, deterministically parsed server-side
  // into game/name/collector number/language/variant/grading claim. This is the
  // primary "one box, one click" entry point; the fields below stay available as
  // progressive disclosure for a buyer who wants to fill them in separately.
  heroQuery: string;
  game: TcgGame;
  url: string;
  marketplace: Marketplace;
  cardName: string;
  setCode: string;
  cardNumber: string;
  listingTitle: string;
  description: string;
  price: string;
  shipping: string;
  postalCode: string;
  taxRatePercent: string;
  preferredRole: LensRole;
  claimedCondition: ConditionClaim;
  desiredCondition: ConditionClaim;
  feedbackPercentage: string;
  feedbackCount: string;
  returnsAccepted: boolean;
  buyerProtection: boolean;
  photoCount: string;
  frontBackExplicit: boolean;
  closeupsExplicit: boolean;
  surfaceExplicit: boolean;
  substantiveConditionNotes: boolean;
  manualCandidates: LedgerRow[];
};

export const emptyLedgerRow: LedgerRow = {
  marketplace: "TCGplayer",
  price: "",
  shipping: "",
  claimedCondition: "Unknown",
  title: "",
  url: "",
};

export const defaultComparisonFormValues: ComparisonForm = {
  heroQuery: "",
  game: "pokemon",
  url: "",
  marketplace: "eBay",
  cardName: "",
  setCode: "",
  cardNumber: "",
  listingTitle: "",
  description: "",
  price: "",
  shipping: "",
  postalCode: "",
  taxRatePercent: "",
  preferredRole: "best_value",
  claimedCondition: "Unknown",
  desiredCondition: "Near Mint",
  feedbackPercentage: "",
  feedbackCount: "",
  returnsAccepted: false,
  buyerProtection: false,
  photoCount: "0",
  frontBackExplicit: false,
  closeupsExplicit: false,
  surfaceExplicit: false,
  substantiveConditionNotes: false,
  manualCandidates: [],
};

export function resetForNewCardSearch(values: ComparisonForm): ComparisonForm {
  return {
    ...defaultComparisonFormValues,
    postalCode: values.postalCode,
    taxRatePercent: values.taxRatePercent,
    preferredRole: values.preferredRole,
    desiredCondition: values.desiredCondition,
  };
}
