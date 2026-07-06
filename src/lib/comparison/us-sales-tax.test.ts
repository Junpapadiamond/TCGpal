import { describe, expect, it } from "vitest";
import { estimateSalesTaxRateFromZip, stateFromZip } from "@/lib/comparison/us-sales-tax";

describe("US sales-tax estimate from ZIP", () => {
  it("places full ZIPs in the right state", () => {
    expect(stateFromZip("10001")).toBe("NY");
    expect(stateFromZip("90001")).toBe("CA");
    expect(stateFromZip("75001")).toBe("TX");
    expect(stateFromZip("97201")).toBe("OR");
    expect(stateFromZip("03301")).toBe("NH");
  });

  it("returns a positive estimated rate for sales-tax states", () => {
    expect(estimateSalesTaxRateFromZip("10001")).toBeCloseTo(0.0852, 4);
    expect(estimateSalesTaxRateFromZip("90001")).toBeCloseTo(0.0882, 4);
    expect(estimateSalesTaxRateFromZip("75001")).toBeCloseTo(0.082, 4);
  });

  it("returns 0 for NOMAD (no statewide sales tax) states", () => {
    expect(estimateSalesTaxRateFromZip("97201")).toBe(0); // Oregon
    expect(estimateSalesTaxRateFromZip("03301")).toBe(0); // New Hampshire
  });

  it("returns null (→ pre-tax total) when the ZIP can't place a state", () => {
    expect(estimateSalesTaxRateFromZip("")).toBeNull();
    expect(estimateSalesTaxRateFromZip("100")).toBeNull(); // partial ZIP
    expect(estimateSalesTaxRateFromZip("00600")).toBeNull(); // Puerto Rico prefix, not a state
  });
});
