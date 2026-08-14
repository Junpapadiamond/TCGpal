import type { TcgGame } from "@/lib/schemas";

// The fixed eval set for exact-print recall (docs/plan-retrieval-agent-2026-08-10.md).
//
// Recall is the share of these cards whose report ends with outcome "best_buy" —
// i.e. at least one live listing survived identity, exclusion, and cost gates.
// The set is committed so the Phase 0 baseline and any later agent run measure
// the same thing; changing an entry invalidates the comparison, so treat edits
// as a new baseline rather than a tweak.
//
// Deliberately NOT a sample of demand. It is a stress set: it over-weights the
// cards where one search per platform is most likely to return the wrong print
// (numbers with many sibling alternate arts) while keeping enough easy,
// high-supply prints to notice if a change breaks the ordinary case.
//
// This module has no runtime dependencies so that both vitest and the plain-node
// measurement script can read the same source of truth.

export type PrintRecallSplit = "tuning" | "held_out";

// "base" is the standard print of a collector number; "alternate" is any sibling
// print sharing that number (alt art, secret rare, special art, illustration
// rare). Both directions matter: retrieving the base print when alt-art supply
// dominates is the failure observed on 2026-08-10, and the mirror case — finding
// the alt when the base dominates — is the same defect seen from the other side.
export type PrintRecallPrintClass = "base" | "alternate";

// "vintage" is the WotC era, where condition language and 1st Edition/Shadowless
// print variation dominate titles. "modern" is Sword & Shield onward plus every
// One Piece set.
export type PrintRecallEra = "vintage" | "modern";

export type PrintRecallCard = {
  /** Stable id for this eval row. Never reused, so results stay joinable across runs. */
  id: string;
  /** Column label in the measurement table. */
  label: string;
  game: TcgGame;
  /** Free-text hero query, exactly as a buyer would type it into the search box. */
  query: string;
  name: string;
  setCode: string;
  cardNumber: string;
  /**
   * Pins the exact print when a collector number carries sibling prints, so the
   * eval measures retrieval rather than which identity row happened to sort
   * first. One Piece ids come from the committed catalog's image id
   * (`OP01-016`, `OP01-016_p1`); Pokemon numbers are already print-unique, so
   * those rows resolve through the normal auto-confirm path.
   */
  confirmedCardId?: string;
  printClass: PrintRecallPrintClass;
  era: PrintRecallEra;
  split: PrintRecallSplit;
  /** Why this card earns a slot. */
  note: string;
};

export const PRINT_RECALL_CARDS: readonly PrintRecallCard[] = [
  // ── One Piece · tuning ──────────────────────────────────────────────────────
  // The three cards that returned zero eligible listings against production on
  // 2026-08-10. They are the reason the plan exists, so they stay in the tuning
  // half where they can be looked at.
  {
    id: "op-nami-op01-016",
    label: "Nami OP01-016",
    game: "onePiece",
    query: "Nami OP01-016",
    name: "Nami",
    setCode: "OP-01",
    cardNumber: "OP01-016",
    confirmedCardId: "OP01-016",
    printClass: "base",
    era: "modern",
    split: "tuning",
    note: "Zero eligible on 2026-08-10: 50 found, 38 excluded as sibling prints. Seven alternate arts share this number.",
  },
  {
    id: "op-zoro-op06-118",
    label: "Roronoa Zoro OP06-118",
    game: "onePiece",
    query: "Roronoa Zoro OP06-118",
    name: "Roronoa Zoro",
    setCode: "OP-06",
    cardNumber: "OP06-118",
    confirmedCardId: "OP06-118",
    printClass: "base",
    era: "modern",
    split: "tuning",
    note: "Zero eligible on 2026-08-10. Secret rare whose number carries five alternate prints.",
  },
  {
    id: "op-luffy-op05-119",
    label: "Monkey.D.Luffy OP05-119",
    game: "onePiece",
    query: "Monkey.D.Luffy OP05-119",
    name: "Monkey.D.Luffy",
    setCode: "OP-05",
    cardNumber: "OP05-119",
    confirmedCardId: "OP05-119",
    printClass: "base",
    era: "modern",
    split: "tuning",
    note: "Zero eligible on 2026-08-10. Eight sibling prints, including three Special Art versions priced far above the base.",
  },
  {
    id: "op-luffy-st01-001",
    label: "Monkey.D.Luffy ST01-001",
    game: "onePiece",
    query: "Monkey.D.Luffy ST01-001",
    name: "Monkey.D.Luffy",
    setCode: "ST-01",
    cardNumber: "ST01-001",
    confirmedCardId: "ST01-001",
    printClass: "base",
    era: "modern",
    split: "tuning",
    note: "Floor case: a starter-deck leader with no sibling print and heavy supply. If this one abstains, the failure is not about print ambiguity.",
  },
  {
    id: "op-zoro-op01-001",
    label: "Roronoa Zoro OP01-001",
    game: "onePiece",
    query: "Roronoa Zoro OP01-001",
    name: "Roronoa Zoro",
    setCode: "OP-01",
    cardNumber: "OP01-001",
    confirmedCardId: "OP01-001",
    printClass: "base",
    era: "modern",
    split: "tuning",
    note: "Widely played leader with only two sibling prints — mild ambiguity against deep supply.",
  },
  {
    id: "op-ace-op02-013-p1",
    label: "Portgas.D.Ace OP02-013 (Alt Art P1)",
    game: "onePiece",
    query: "Portgas.D.Ace OP02-013 alternate art",
    name: "Portgas.D.Ace",
    setCode: "OP-02",
    cardNumber: "OP02-013",
    confirmedCardId: "OP02-013_p1",
    printClass: "alternate",
    era: "modern",
    split: "tuning",
    note: "The mirror of the Nami failure: asks for the alternate art on a number whose base print is the cheap, high-volume listing.",
  },
  {
    id: "op-law-op05-069",
    label: "Trafalgar Law OP05-069",
    game: "onePiece",
    query: "Trafalgar Law OP05-069",
    name: "Trafalgar Law",
    setCode: "OP-05",
    cardNumber: "OP05-069",
    confirmedCardId: "OP05-069",
    printClass: "base",
    era: "modern",
    split: "tuning",
    note: "Super rare with three alternate prints — the common shape of a One Piece chase card.",
  },
  {
    id: "op-shanks-op09-001",
    label: "Shanks OP09-001",
    game: "onePiece",
    query: "Shanks OP09-001",
    name: "Shanks",
    setCode: "OP-09",
    cardNumber: "OP09-001",
    confirmedCardId: "OP09-001",
    printClass: "base",
    era: "modern",
    split: "tuning",
    note: "Recent set: checks that recall does not depend on a set having been out long enough to accumulate listings.",
  },

  // ── One Piece · held out ────────────────────────────────────────────────────
  {
    id: "op-rosinante-op04-119",
    label: "Donquixote Rosinante OP04-119",
    game: "onePiece",
    query: "Donquixote Rosinante OP04-119",
    name: "Donquixote Rosinante",
    setCode: "OP-04",
    cardNumber: "OP04-119",
    confirmedCardId: "OP04-119",
    printClass: "base",
    era: "modern",
    split: "held_out",
    note: "Secret rare with a Special Art sibling — same shape as the Luffy failure, unseen during tuning.",
  },
  {
    id: "op-ace-op07-119-p1",
    label: "Portgas.D.Ace OP07-119 (Secret Rare Alt P1)",
    game: "onePiece",
    query: "Portgas.D.Ace OP07-119 alternate art",
    name: "Portgas.D.Ace",
    setCode: "OP-07",
    cardNumber: "OP07-119",
    confirmedCardId: "OP07-119_p1",
    printClass: "alternate",
    era: "modern",
    split: "held_out",
    note: "Held-out alternate-art request, including a tournament reprint among the siblings.",
  },
  {
    id: "op-chopper-eb01-006",
    label: "Tony Tony.Chopper EB01-006",
    game: "onePiece",
    query: "Tony Tony.Chopper EB01-006",
    name: "Tony Tony.Chopper",
    setCode: "EB-01",
    cardNumber: "EB01-006",
    confirmedCardId: "EB01-006",
    printClass: "base",
    era: "modern",
    split: "held_out",
    note: "Extra Booster set: titles often name the reprint collection rather than the set code.",
  },
  {
    id: "op-linlin-op03-114",
    label: "Charlotte Linlin OP03-114",
    game: "onePiece",
    query: "Charlotte Linlin OP03-114",
    name: "Charlotte Linlin",
    setCode: "OP-03",
    cardNumber: "OP03-114",
    confirmedCardId: "OP03-114",
    printClass: "base",
    era: "modern",
    split: "held_out",
    note: "Super rare whose siblings span a Special Art and a regional promo.",
  },
  {
    id: "op-ace-op07-053-p1",
    label: "Portgas.D.Ace OP07-053 (Tournament Pack 2024)",
    game: "onePiece",
    query: "Portgas.D.Ace OP07-053 Tournament Pack",
    name: "Portgas.D.Ace",
    setCode: "OP-07",
    cardNumber: "OP07-053",
    confirmedCardId: "OP07-053_p1",
    printClass: "alternate",
    era: "modern",
    split: "held_out",
    // The competition slot. Deliberately a tournament *participation* print rather
    // than a trophy one: OP03-123_p2 (Championship 2024 Katakuri) was probed on
    // 2026-08-14 and returned 21 listings of which ~17 were PSA 10 slabs around
    // $2,500 against a $1,750 anchor, with no raw English supply at all. Abstaining
    // there is the correct answer, so scoring it would measure supply rather than
    // retrieval. This number carries five siblings across the base set, a
    // celebration pack, and two 3rd Anniversary prints, so naming the event is
    // still the only thing that separates them.
    note: "Competition print with real raw supply: Tournament Pack 2024 Oct.-Dec., one of five prints sharing OP07-053.",
  },

  // ── Pokemon · vintage (Base Set) · tuning ───────────────────────────────────
  // Base Set titles are dominated by 1st Edition / Shadowless / graded language
  // and by heavy reprint traffic (Base Set 2, Legendary Collection, Celebrations),
  // so these measure a different retrieval failure from the One Piece rows.
  {
    id: "pkm-charizard-base-4",
    label: "Charizard 4/102",
    game: "pokemon",
    query: "Charizard 4/102",
    name: "Charizard",
    setCode: "BS",
    cardNumber: "4/102",
    printClass: "base",
    era: "vintage",
    split: "tuning",
    note: "The most counterfeited and most reprinted card in the hobby; also the hardest market-floor case.",
  },
  {
    id: "pkm-pikachu-base-58",
    label: "Pikachu 58/102",
    game: "pokemon",
    query: "Pikachu 58/102",
    name: "Pikachu",
    setCode: "BS",
    cardNumber: "58/102",
    printClass: "base",
    era: "vintage",
    split: "tuning",
    note: "Cheap vintage common: the market-floor gate has the least headroom here, so novelty listings crowd the results.",
  },
  {
    id: "pkm-machamp-base-8",
    label: "Machamp 8/102",
    game: "pokemon",
    query: "Machamp 8/102",
    name: "Machamp",
    setCode: "BS",
    cardNumber: "8/102",
    printClass: "base",
    era: "vintage",
    split: "tuning",
    note: "Only ever printed 1st Edition in the starter deck, so nearly every listing carries print-variant language.",
  },
  {
    id: "pkm-venusaur-base-15",
    label: "Venusaur 15/102",
    game: "pokemon",
    query: "Venusaur 15/102",
    name: "Venusaur",
    setCode: "BS",
    cardNumber: "15/102",
    printClass: "base",
    era: "vintage",
    split: "tuning",
    note: "Vintage holo with steady supply — the mid-difficulty vintage control.",
  },

  // ── Pokemon · vintage (Base Set) · held out ─────────────────────────────────
  {
    id: "pkm-blastoise-base-2",
    label: "Blastoise 2/102",
    game: "pokemon",
    query: "Blastoise 2/102",
    name: "Blastoise",
    setCode: "BS",
    cardNumber: "2/102",
    printClass: "base",
    era: "vintage",
    split: "held_out",
    note: "Held-out vintage holo; shares its number with Base Set 2 and Platinum reprints.",
  },
  {
    id: "pkm-alakazam-base-1",
    label: "Alakazam 1/102",
    game: "pokemon",
    query: "Alakazam 1/102",
    name: "Alakazam",
    setCode: "BS",
    cardNumber: "1/102",
    printClass: "base",
    era: "vintage",
    split: "held_out",
    note: "Held out; card number 1 collides with four other sets and with Dark Alakazam.",
  },

  // ── Pokemon · modern · tuning ───────────────────────────────────────────────
  {
    id: "pkm-umbreon-vmax-swsh7-215",
    label: "Umbreon VMAX 215/203",
    game: "pokemon",
    query: "Umbreon VMAX 215/203",
    name: "Umbreon VMAX",
    setCode: "SWSH7",
    cardNumber: "215/203",
    printClass: "alternate",
    era: "modern",
    split: "tuning",
    note: "Secret-numbered alternate art with a large price gap to the 095/203 base print in the same set.",
  },
  {
    id: "pkm-rayquaza-vmax-swsh7-218",
    label: "Rayquaza VMAX 218/203",
    game: "pokemon",
    query: "Rayquaza VMAX 218/203",
    name: "Rayquaza VMAX",
    setCode: "SWSH7",
    cardNumber: "218/203",
    printClass: "alternate",
    era: "modern",
    split: "tuning",
    note: "Second secret print from the same set, so a set-level retrieval failure separates from a card-level one.",
  },
  {
    id: "pkm-giratina-v-swsh11-186",
    label: "Giratina V 186/196",
    game: "pokemon",
    query: "Giratina V 186/196",
    name: "Giratina V",
    setCode: "SWSH11",
    cardNumber: "186/196",
    printClass: "alternate",
    era: "modern",
    split: "tuning",
    note: "Alternate art paired below with its own base print, so the pair isolates print selection from card difficulty.",
  },
  {
    id: "pkm-giratina-v-swsh11-130",
    label: "Giratina V 130/196",
    game: "pokemon",
    query: "Giratina V 130/196",
    name: "Giratina V",
    setCode: "SWSH11",
    cardNumber: "130/196",
    printClass: "base",
    era: "modern",
    split: "tuning",
    note: "Base print of the row above: cheap, plentiful, and easily buried by alt-art listings for the same name.",
  },
  {
    id: "pkm-charizard-v-swsh9-154",
    label: "Charizard V 154/172",
    game: "pokemon",
    query: "Charizard V 154/172",
    name: "Charizard V",
    setCode: "SWSH9",
    cardNumber: "154/172",
    printClass: "alternate",
    era: "modern",
    split: "tuning",
    note: "Alternate art on the single noisiest name in Pokemon search results.",
  },
  {
    id: "pkm-mewtwo-mew-gx-sm11-222",
    label: "Mewtwo & Mew-GX 222/236",
    game: "pokemon",
    query: "Mewtwo & Mew-GX 222/236",
    name: "Mewtwo & Mew-GX",
    setCode: "SM11",
    cardNumber: "222/236",
    printClass: "alternate",
    era: "modern",
    split: "tuning",
    note: "Sun & Moon era: an ampersand name plus a secret print, which stresses the query parser as well as retrieval.",
  },
  {
    id: "pkm-charizard-ex-sv3-223",
    label: "Charizard ex 223/197",
    game: "pokemon",
    query: "Charizard ex 223/197",
    name: "Charizard ex",
    setCode: "SV3",
    cardNumber: "223/197",
    printClass: "alternate",
    era: "modern",
    split: "tuning",
    note: "Special Illustration Rare competing with a same-name Double Rare, a same-set Ultra Rare, and a Hyper Rare.",
  },
  {
    id: "pkm-charizard-ex-sv3pt5-006",
    label: "Charizard ex 006/165",
    game: "pokemon",
    query: "Charizard ex 006/165",
    name: "Charizard ex",
    setCode: "151",
    cardNumber: "006/165",
    printClass: "base",
    era: "modern",
    split: "tuning",
    note: "Modern base print with a leading zero in the number and a set named only by digits.",
  },

  // ── Pokemon · modern · held out ─────────────────────────────────────────────
  {
    id: "pkm-lugia-v-swsh12-186",
    label: "Lugia V 186/195",
    game: "pokemon",
    query: "Lugia V 186/195",
    name: "Lugia V",
    setCode: "SWSH12",
    cardNumber: "186/195",
    printClass: "alternate",
    era: "modern",
    split: "held_out",
    note: "Held-out modern alternate art from a set not otherwise represented.",
  },
  {
    id: "pkm-mew-ex-sv3pt5-205",
    label: "Mew ex 205/165",
    game: "pokemon",
    query: "Mew ex 205/165",
    name: "Mew ex",
    setCode: "151",
    cardNumber: "205/165",
    printClass: "alternate",
    era: "modern",
    split: "held_out",
    note: "Held-out gold hyper rare — the print class most often faked by novelty metal cards.",
  },
  {
    id: "pkm-gardevoir-ex-sv1-245",
    label: "Gardevoir ex 245/198",
    game: "pokemon",
    query: "Gardevoir ex 245/198",
    name: "Gardevoir ex",
    setCode: "SV1",
    cardNumber: "245/198",
    printClass: "alternate",
    era: "modern",
    split: "held_out",
    note: "Held-out Special Illustration Rare from the first Scarlet & Violet set.",
  },
  {
    id: "pkm-pikachu-sv3pt5-173",
    label: "Pikachu 173/165",
    game: "pokemon",
    query: "Pikachu 173/165",
    name: "Pikachu",
    setCode: "151",
    cardNumber: "173/165",
    printClass: "alternate",
    era: "modern",
    split: "held_out",
    note: "Held out; 'Pikachu' returns more unrelated inventory than any other query in the set.",
  },
];

export const PRINT_RECALL_TUNING_CARDS: readonly PrintRecallCard[] =
  PRINT_RECALL_CARDS.filter((card) => card.split === "tuning");

// Never look at these while iterating on retrieval. They exist so a recall gain
// can be distinguished from a prompt fitted to the cards that were visible.
export const PRINT_RECALL_HELD_OUT_CARDS: readonly PrintRecallCard[] =
  PRINT_RECALL_CARDS.filter((card) => card.split === "held_out");
