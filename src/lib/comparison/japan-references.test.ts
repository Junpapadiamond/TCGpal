import { describe, expect, it } from "vitest";
import { buildJapanReferenceLinks, buildJapanSearchQuery } from "@/lib/comparison/japan-references";
import type { CardIdentityCandidate } from "@/lib/schemas";

const onePieceCard: CardIdentityCandidate = {
  id: "OP01-024",
  name: "Monkey.D.Luffy",
  setName: "Romance Dawn",
  setCode: "OP-01",
  cardNumber: "OP01-024",
  language: "EN",
  imageUrl: null,
  confidence: "high",
  matchReasons: [],
};

const pokemonCard: CardIdentityCandidate = {
  id: "swsh7-215",
  name: "Umbreon VMAX",
  setName: "Evolving Skies",
  setCode: "SWSH7",
  cardNumber: "215/203",
  language: "English",
  imageUrl: null,
  confidence: "high",
  matchReasons: [],
};

describe("Japan reference links", () => {
  it("builds manual Japan price checks for One Piece cards", () => {
    const links = buildJapanReferenceLinks(onePieceCard, "2026-07-04T00:00:00.000Z");

    expect(buildJapanSearchQuery(onePieceCard)).toContain("OP01-024");
    expect(links.map((link) => link.label)).toEqual([
      "Yahoo Auctions JP price check",
      "Mercari JP price check",
      "SNKRDUNK Japan price check",
      "Card Rush OP price check",
      "Yuyutei OP price check",
    ]);
    expect(links.every((link) => link.status === "missing")).toBe(true);
    expect(links.every((link) => link.note.includes("not fetched or analyzed"))).toBe(true);
    expect(links.every((link) => !link.note.toLowerCase().includes("paste"))).toBe(true);
    expect(links.find((link) => link.label === "Card Rush OP price check")?.url).toContain("OP01-024");
  });

  // Verified against the live site on 2026-08-18: snkrdunk.com/search reads
  // `keywords`, and silently ignores a singular `keyword` — it keeps the query
  // string in the address bar and renders the generic ranking page, so the link
  // looked fine and searched nothing. Each of these params is the one its own
  // site actually reads; they are not interchangeable.
  // Measured against SNKRDUNK on 2026-08-18 with "Mega Charizard X ex 130/94
  // Phantasmal Flames", the shape the result page used to send:
  //   full string incl. set name  -> 商品が見つかりませんでした (nothing)
  //   name + unpadded "130/94"    -> nothing
  //   number alone "130/94"       -> Chanel earrings and a Duel Masters card
  //   name + padded "130/094"     -> メガリザードンXex MHR [PFL EN 130/094]【英語版】
  // The JP catalogue keys English cards on the printed, zero-padded total and
  // localises the set name, so the English set name can only ever subtract.
  it("pads the set total and drops the English set name for Japanese sites", () => {
    expect(buildJapanSearchQuery({ ...pokemonCard, name: "Mega Charizard X ex", cardNumber: "130/94", setName: "Phantasmal Flames" }))
      .toBe("130/094 Mega Charizard X ex ポケカ");
    expect(buildJapanSearchQuery({ ...pokemonCard, name: "Pikachu", cardNumber: "58/102" }))
      .toBe("58/102 Pikachu ポケカ");
    // One Piece numbers carry no total to pad and must survive untouched.
    expect(buildJapanSearchQuery({ ...onePieceCard, name: "Nami", cardNumber: "OP01-016" }))
      .toBe("OP01-016 Nami ワンピースカード");
  });

  it("uses each site's own search parameter name", () => {
    const links = buildJapanReferenceLinks(onePieceCard, "2026-07-04T00:00:00.000Z");
    const urlFor = (label: string) => new URL(links.find((link) => link.label === label)!.url!);

    expect(urlFor("SNKRDUNK Japan price check").searchParams.get("keywords")).toContain("OP01-024");
    expect(urlFor("SNKRDUNK Japan price check").searchParams.has("keyword")).toBe(false);
    expect(urlFor("Yahoo Auctions JP price check").searchParams.get("p")).toContain("OP01-024");
    expect(urlFor("Mercari JP price check").searchParams.get("keyword")).toContain("OP01-024");
    expect(urlFor("Yuyutei OP price check").searchParams.get("search_word")).toBe("OP01-024");
    expect(urlFor("Card Rush OP price check").searchParams.get("keyword")).toBe("OP01-024");
  });

  it("routes Pokemon cards to the Pokemon Yuyutei search instead of OP shops", () => {
    const links = buildJapanReferenceLinks(pokemonCard, "2026-07-04T00:00:00.000Z");

    expect(buildJapanSearchQuery(pokemonCard)).toContain("ポケカ");
    expect(links.map((link) => link.label)).toContain("Yuyutei Pokemon price check");
    expect(links.map((link) => link.label)).not.toContain("Card Rush OP price check");
  });
});
