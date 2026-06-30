// Estimate a US buyer's sales-tax rate from their ZIP so the landed cost reflects
// roughly what eBay will add at checkout, instead of a hardcoded flat rate.
//
// This is deliberately an *estimate*: it is the approximate average combined
// (state + local) rate for the state the ZIP falls in. eBay, as the marketplace
// facilitator, charges the exact amount based on the buyer's full address at
// checkout — so the UI labels this "Est. tax". When a ZIP can't be placed in a
// state (partial ZIP, territories, military), we return null and the result honestly
// falls back to a pre-tax total rather than guessing.

// Approximate average combined state+local sales tax rates. The five NOMAD states
// (Delaware, Montana, New Hampshire, Oregon, plus Alaska's lack of a statewide tax)
// have no statewide sales tax and read as 0.
const STATE_TAX_RATES: Record<string, number> = {
  AL: 0.092, AK: 0, AZ: 0.084, AR: 0.095, CA: 0.0882, CO: 0.078, CT: 0.0635,
  DE: 0, FL: 0.07, GA: 0.074, HI: 0.045, ID: 0.061, IL: 0.0886, IN: 0.07,
  IA: 0.069, KS: 0.087, KY: 0.06, LA: 0.0955, ME: 0.055, MD: 0.06, MA: 0.0625,
  MI: 0.06, MN: 0.081, MS: 0.0707, MO: 0.0841, MT: 0, NE: 0.069, NV: 0.0823,
  NH: 0, NJ: 0.0666, NM: 0.0778, NY: 0.0852, NC: 0.0698, ND: 0.0704, OH: 0.0724,
  OK: 0.0899, OR: 0, PA: 0.0634, RI: 0.07, SC: 0.0744, SD: 0.064, TN: 0.0955,
  TX: 0.082, UT: 0.0719, VT: 0.0624, VA: 0.0573, WA: 0.0923, WV: 0.0655,
  WI: 0.0543, WY: 0.0522, DC: 0.06,
};

// Standard USPS 3-digit ZIP prefix → state allocation. Inclusive ranges; gaps
// (territories, military, unassigned) intentionally fall through to null.
const ZIP_PREFIX_RANGES: ReadonlyArray<readonly [number, number, string]> = [
  [5, 5, "NY"], [10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"],
  [50, 59, "VT"], [60, 69, "CT"], [70, 89, "NJ"], [100, 149, "NY"], [150, 196, "PA"],
  [197, 199, "DE"], [200, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"],
  [270, 289, "NC"], [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"], [350, 369, "AL"],
  [370, 385, "TN"], [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"],
  [460, 479, "IN"], [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"], [550, 567, "MN"],
  [570, 577, "SD"], [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"],
  [660, 679, "KS"], [680, 693, "NE"], [700, 714, "LA"], [716, 729, "AR"], [730, 749, "OK"],
  [750, 799, "TX"], [800, 816, "CO"], [820, 831, "WY"], [832, 838, "ID"], [840, 847, "UT"],
  [850, 865, "AZ"], [870, 884, "NM"], [885, 885, "TX"], [889, 898, "NV"], [900, 961, "CA"],
  [967, 968, "HI"], [970, 979, "OR"], [980, 994, "WA"], [995, 999, "AK"],
];

export function stateFromZip(zip: string): string | null {
  const digits = zip.replace(/\D/g, "");
  if (digits.length < 5) return null;
  const prefix = Number(digits.slice(0, 3));
  return ZIP_PREFIX_RANGES.find(([min, max]) => prefix >= min && prefix <= max)?.[2] ?? null;
}

// Returns the estimated combined rate as a fraction (e.g. 0.0852), or null when the
// ZIP can't be confidently placed — callers should then show a pre-tax total.
export function estimateSalesTaxRateFromZip(zip: string): number | null {
  const state = stateFromZip(zip);
  if (!state) return null;
  const rate = STATE_TAX_RATES[state];
  return rate === undefined ? null : rate;
}
