import { describe, expect, it } from "vitest";
import { assessPrintFidelity } from "@/lib/comparison/print-fidelity";
import { findOnePieceCatalogVariant } from "@/lib/external/one-piece-catalog";
import { mapOnePieceCardToIdentity } from "@/lib/external/one-piece-tcg";

const ACCEPTED = new Set(["exact", "compatible"]);

function classify(printId: string, title: string) {
  const print = findOnePieceCatalogVariant(printId);
  if (!print) throw new Error(`Missing bundled print ${printId}`);
  return assessPrintFidelity({
    card: mapOnePieceCardToIdentity(print, { confidence: "high", matchReasons: ["test"] }),
    matchText: title,
    listingPrice: 100,
    exactMarketAnchor: null,
  });
}

describe("One Piece base print: a plain title naming the release describes the base", () => {
  // Every row below is a real eBay title from the 2026-08-14 buy-accuracy
  // adjudication (docs/one-piece-buy-accuracy-2026-08-14-baseline.md). Each is the
  // ordinary retail print of its number, and each ended `inspect_first` with
  // printMatch `unknown` — eight of the twelve cards measured. A seller listing an
  // alternate art, manga, or special art says so, because it is worth many times
  // the base; the absence of that word on a title that names the original release
  // is the evidence, and the gate was reading it as no evidence at all.
  it.each([
    ["OP01-016", "One Piece TCG English OP01-016 Nami R"],
    ["OP06-118", "Roronoa Zoro OP06-118 Secret Rare Wings of the Captain One Piece Foil Near Mint"],
    ["OP05-119", "Monkey D. Luffy OP05-119 SEC One Piece Awakening of the New Era NM"],
    ["OP01-001", "Bandai One Piece Card Game Roronoa Zoro OP01-001 Leader"],
    ["OP05-069", "Trafalgar Law (069) OP05-069 Awakening of the New Era One Piece Foil NM"],
    ["OP04-119", "Donquixote Rosinante OP04-119 Kingdoms of Intrigue NM One Piece Card TCG"],
    ["EB01-006", "One Piece Tony Tony.Chopper EB01-006 Extra Booster: Memorial Collection Foil Eng"],
    ["OP03-114", "Charlotte Linlin OP03-114 SR Pillars of Strength One Piece TCG NM Holo Foil Card"],
    ["PRB02-006", "One Piece Roronoa Zoro PRB02-006 R The Best Vol.2 English NM"],
    ["ST01-012", "Monkey.D.Luffy ST01-012 SR Straw Hat Crew Starter Deck 1 NM"],
  ])("%s accepts the ordinary listing: %s", (printId, title) => {
    const assessment = classify(printId, title);
    expect(ACCEPTED.has(assessment.match), assessment.reasons.join(",")).toBe(true);
  });

  it.each([
    ["OP06-118", "Roronoa Zoro OP06-118 Wings of the Captain Alt Art NM"],
    ["OP06-118", "Roronoa Zoro OP06-118 Manga Rare NM"],
    ["OP01-016", "Nami OP01-016 Alternate Art Romance Dawn English NM"],
    ["OP01-016", "Nami OP01-016 SP Special Art NM"],
    ["OP01-016", "Nami OP01-016 Parallel Foil"],
    ["OP05-119", "Monkey.D.Luffy OP05-119 Gold Special Art"],
    ["EB01-006", "Tony Tony.Chopper EB01-006 One Piece Card The Best Manga"],
    ["OP01-016", "Nami OP01-016 Gift Collection 2023"],
    ["OP01-016", "Nami OP01-016 The Three Captains ST-10"],
  ])("%s still rejects a sibling that names itself: %s", (printId, title) => {
    expect(classify(printId, title).match).toBe("mismatch");
  });

  it("does not let silence prove an alternate art", () => {
    // The rule is one-way. A plain title cannot be evidence for the print a seller
    // would have named, so the confirmed alt art still abstains on it.
    expect(classify("OP01-016_p1", "One Piece TCG English OP01-016 Nami R").match).toBe("unknown");
    expect(classify("OP06-118_p1", "Roronoa Zoro OP06-118 Wings of the Captain NM").match).toBe("unknown");
  });

  it("does not let silence pick a print among promos, where nothing is ordinary", () => {
    // P-001 has seven prints and every one is a promo. "Promo" on a title tells the
    // buyer nothing about which, so the base of that family stays unproven.
    expect(classify("P-001", "Monkey.D.Luffy P-001 Promo One Piece NM").match).toBe("unknown");
  });

  it("keeps rejecting a plain title on a number whose base print has a same-art reprint claim", () => {
    expect(classify("ST01-001", "Monkey.D.Luffy ST01-001 Revision Pack Leader").match).toBe("mismatch");
  });
});

describe("One Piece class words: every way a seller says 'not the base'", () => {
  it.each([
    ["OP05-119", "Monkey.D.Luffy OP05-119 SEC Alt Awakening of the New Era NM"],
    ["OP06-118", "Roronoa Zoro OP06-118 AA Wings of the Captain English"],
    ["OP06-118", "Roronoa Zoro OP06-118 Alternate Wings of the Captain"],
    ["EB01-061", "Mr.2.Bon.Kurei EB01-061 Alt Foil Memorial Collection"],
  ])("%s rejects a parallel that says only 'Alt' or 'AA': %s", (printId, title) => {
    // The catalog labels these siblings "Secret Rare Alt"; sellers write "SEC
    // Alt" and "AA". Neither says "art", and a detector that needed the word
    // read them as silence — then the silence rule gave the base print the
    // parallel's own listing. Thirteen base prints admitted their alt this way.
    expect(classify(printId, title).match).toBe("mismatch");
  });

  it("does not read 'alt' inside another word", () => {
    // "alternative" and "salt" are not class words; both titles are still the
    // plain base listing.
    expect(classify("OP06-118", "Roronoa Zoro OP06-118 Wings of the Captain alternative payment ok").match).toBe("compatible");
    expect(classify("OP06-118", "Roronoa Zoro OP06-118 Wings of the Captain NM salt-free").match).toBe("compatible");
  });
});

describe("One Piece two-print families: the class word is the whole proof", () => {
  it.each([
    ["EB01-013_p1", "Kouzuki Hiyori EB01-013 Alt Art Memorial Collection English NM"],
    ["EB02-003_p1", "Tony Tony.Chopper EB02-003 Alternate Art Anime 25th Collection One Piece"],
    ["EB03-001_p1", "Nefeltari Vivi EB03-001 AA One Piece Heroines Edition NM"],
    ["EB04-001_p1", "Jewelry Bonney EB04-001 Parallel Adventure On Kami's Island"],
  ])("%s is proven by the class word alone: %s", (printId, title) => {
    // Most of EB01–EB04 is a base and one alternate. "Alt Art" can point at
    // exactly one print there, and demanding corroboration sent all 69 of these
    // to inspect — the audit's largest bucket.
    const assessment = classify(printId, title);
    expect(ACCEPTED.has(assessment.match), assessment.reasons.join(",")).toBe(true);
  });

  it("still demands corroboration where a loose word could mean a different sibling", () => {
    // OP01-016 has five alternate-class prints; "alt art" alone names none of them.
    expect(classify("OP01-016_p1", "Nami OP01-016 Alt Art English NM").match).toBe("unknown");
    // OP05-119 base + parallel + manga + three SP: "SP" alone is not one print.
    expect(classify("OP05-119_p7", "Monkey.D.Luffy OP05-119 SP English NM").match).toBe("unknown");
  });
});

describe("One Piece nested release names: a marker belongs to every print whose release contains it", () => {
  // "Event Pack" sits inside "Cs 25-26 Event Pack", which sits inside "Cs 25-26
  // Event Pack Finalist Ver." Ownership by origin turned each into a marker a
  // sibling's own listing contained but did not own, and thirteen promo prints
  // rejected their own careful listing as a different print.
  it("accepts the Finalist Ver. print's own listing", () => {
    const assessment = classify("P-065_p2", "Tony Tony.Chopper P-065 Cs 25-26 Event Pack Finalist Ver. Promo EN");
    expect(ACCEPTED.has(assessment.match), assessment.reasons.join(",")).toBe(true);
  });

  it("abstains, rather than rejects, on the print whose name is a prefix of a sibling's", () => {
    // "Cs 25-26 Event Pack" could be the Event Pack print or a Finalist Ver.
    // whose seller dropped the qualifier. Nothing a seller writes separates
    // them, so the honest answer is inspect — never "this is a different print".
    expect(classify("P-065_p1", "Tony Tony.Chopper P-065 Cs 25-26 Event Pack Promo EN").match).toBe("unknown");
  });

  it("still rejects the ordinary Event Pack Vol.5 print when the title names the Cs 25-26 pack", () => {
    expect(classify("P-065", "Tony Tony.Chopper P-065 Cs 25-26 Event Pack Promo EN").match).toBe("mismatch");
  });

  it("accepts a promo base print whose untagged release contains a sibling's semantic alias", () => {
    // P-078's ordinary print is from "Offline Regional Participation Pack 2025
    // Vol.1" — a release the catalog never enriched — while a sibling carries
    // the derived alias "regional participation". The base's own listing
    // contains that alias because its own release name does.
    const assessment = classify("P-078", "Adio P-078 Offline Regional Participation Pack 2025 Vol.1 Promo EN");
    expect(ACCEPTED.has(assessment.match), assessment.reasons.join(",")).toBe(true);
  });
});

describe("One Piece competition prints: naming the print's own release is proof", () => {
  it.each([
    ["EB01-015_p2", "Scratchmen Apoo EB01-015 Winner Pack 2025 Vol.2 One Piece Promo NM"],
    ["EB02-019_p2", "Roronoa Zoro EB02-019 Winner Pack 2025 Vol. 3 One Piece English"],
    ["EB01-043_p1", "Spandine EB01-043 Offline Regional Participation Pack 2025 Vol.1 Promo"],
  ])("%s is proven by its full release name: %s", (printId, title) => {
    // The rule accepted only "Nth Anniversary" — the wording of the 3rd
    // Anniversary packs — so every Winner and Participation print from any
    // other event abstained on a listing that named it in full. 27 in the audit.
    const assessment = classify(printId, title);
    expect(ACCEPTED.has(assessment.match), assessment.reasons.join(",")).toBe(true);
  });

  it("still withholds a competition print on a loose class word alone", () => {
    // "Tournament pack" could be any of the numbered packs the catalog does not
    // carry; only the anniversary or the full release name pins the 3rd
    // Anniversary print.
    expect(classify("ST01-012_p5", "Monkey.D.Luffy ST01-012 Tournament Pack NM").match).not.toBe("compatible");
    expect(classify("EB01-015_p2", "Scratchmen Apoo EB01-015 Winner NM").match).not.toBe("compatible");
  });
});

