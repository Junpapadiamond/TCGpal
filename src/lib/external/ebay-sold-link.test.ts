import { describe, expect, it } from "vitest";
import { buildEbaySoldSearchUrl } from "@/lib/external/ebay-sold-link";

describe("buildEbaySoldSearchUrl", () => {
  it("builds a US sold and completed listing search by default", () => {
    const result = buildEbaySoldSearchUrl({
      cardName: "Umbreon VMAX",
      version: "Evolving Skies Alternate Art",
      setNumber: "215/203",
      grade: "PSA 10",
    });
    const url = new URL(result.url);

    expect(url.host).toBe("www.ebay.com");
    expect(url.searchParams.get("LH_Sold")).toBe("1");
    expect(url.searchParams.get("LH_Complete")).toBe("1");
    expect(url.searchParams.get("_nkw")).toContain("PSA 10");
    expect(result.query).toContain("Umbreon VMAX Evolving Skies Alternate Art 215/203 PSA 10");
  });

  it("uses the selected marketplace host", () => {
    expect(new URL(buildEbaySoldSearchUrl({ cardName: "Charizard", marketplace: "UK" }).url).host).toBe("www.ebay.co.uk");
    expect(new URL(buildEbaySoldSearchUrl({ cardName: "Charizard", marketplace: "DE" }).url).host).toBe("www.ebay.de");
  });

  it("omits raw as a grade keyword", () => {
    const result = buildEbaySoldSearchUrl({
      cardName: "Giratina V",
      version: "Lost Origin",
      grade: "raw",
    });

    expect(result.query.toLowerCase()).not.toContain("raw");
  });

  it("URL-encodes the query and keeps small noise exclusions", () => {
    const result = buildEbaySoldSearchUrl({
      cardName: "Pikachu & Zekrom GX",
      version: "Tag Team",
      setNumber: "33/181",
    });

    expect(result.url).toContain("Pikachu+%26+Zekrom+GX");
    expect(result.query).toContain("-lot");
    expect(result.query).toContain("-proxy");
    expect(result.query).toContain("-reprint");
    expect(result.query).toContain("-digital");
    expect(result.query).toContain("-custom");
  });
});
