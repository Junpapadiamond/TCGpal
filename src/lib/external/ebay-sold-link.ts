export type EbaySoldMarketplace = "US" | "UK" | "DE";

export type EbaySoldSearchInput = {
  cardName: string;
  version?: string;
  setNumber?: string;
  grade?: string;
  marketplace?: EbaySoldMarketplace;
};

const EBAY_HOST_BY_MARKETPLACE: Record<EbaySoldMarketplace, string> = {
  US: "www.ebay.com",
  UK: "www.ebay.co.uk",
  DE: "www.ebay.de",
};

// Keep exclusions narrow so the query remains useful while filtering obvious noise.
const EBAY_SEARCH_EXCLUSIONS = ["-lot", "-proxy", "-reprint", "-digital", "-custom"] as const;

export function buildEbaySoldSearchUrl(input: EbaySoldSearchInput): { url: string; query: string } {
  const marketplace = input.marketplace ?? "US";
  const host = EBAY_HOST_BY_MARKETPLACE[marketplace];
  const grade = normalizeKeyword(input.grade);
  const terms = [
    input.cardName,
    input.version,
    input.setNumber,
    isRawGrade(grade) ? "" : grade,
    ...EBAY_SEARCH_EXCLUSIONS,
  ]
    .map(normalizeKeyword)
    .filter(Boolean);
  const query = dedupeTerms(terms).join(" ");
  const url = new URL(`https://${host}/sch/i.html`);

  url.searchParams.set("_nkw", query);
  url.searchParams.set("LH_Sold", "1");
  url.searchParams.set("LH_Complete", "1");

  return {
    url: url.toString(),
    query,
  };
}

function normalizeKeyword(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isRawGrade(value: string) {
  return value.toLowerCase() === "raw";
}

function dedupeTerms(terms: string[]) {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
