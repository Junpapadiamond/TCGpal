import { describe, expect, it } from "vitest";
import { calculateRawVsSlab, netSaleValue } from "./raw-vs-slab";
import { defaultRawVsSlabInput } from "./sample-data";

describe("raw vs slab calculations", () => {
  it("calculates net sale value after marketplace fee and shipping", () => {
    expect(netSaleValue(220, 0.13, 5)).toBe(186.4);
  });

  it("calculates expected profit deterministically", () => {
    const result = calculateRawVsSlab(defaultRawVsSlabInput);

    expect(result.psa10NetValue).toBe(186.4);
    expect(result.psa9NetValue).toBe(77.65);
    expect(result.expectedProfit).toBe(-25.39);
    expect(result.worstCaseOutcome).toBe(-80.85);
  });

  it("returns null break-even probability when PSA10 has no premium", () => {
    const result = calculateRawVsSlab({
      ...defaultRawVsSlabInput,
      psa10Price: 45,
      otherPrice: 45,
    });

    expect(result.breakEvenPsa10Probability).toBeNull();
  });
});
