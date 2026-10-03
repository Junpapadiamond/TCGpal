// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CrossMarketCostNote } from "./CrossMarketOpportunities";
import { LanguageProvider, setLanguage } from "./i18n";
import { listingFixture } from "@/lib/ai/verdict-note-fixtures";

afterEach(() => { cleanup(); setLanguage("en"); });
const incomplete = listingFixture({ id: "store", marketplace: "Stomping Grounds", price: 90, shipping: null, buyerFee: null,
  costComplete: false, eligible: false, eligibilityIssues: [{ code: "shipping_unknown", category: "cost", disposition: "exclude", message: "Unknown shipping" }] });

describe("inline cross-market cost checks", () => {
  it.each(["en", "zh"] as const)("keeps the conditional break-even verdict beside an offer in %s", (lang) => {
    setLanguage(lang);
    const complete = listingFixture({ id: "complete", price: 100, shipping: 10, preTaxTotal: 110, eligible: true, eligibilityIssues: [] });
    const { container } = render(<LanguageProvider><CrossMarketCostNote listing={incomplete} candidates={[complete, incomplete]} /></LanguageProvider>);
    expect(screen.getByText(lang === "zh" ? /低于 \$20.00/ : /below \$20.00/)).toBeTruthy();
    expect(container.querySelector("section, article, a")).toBeNull();
    expect(screen.queryByText(/TCGlens verdict/)).toBeNull();
  });
  it("states that a higher known cost cannot beat the current cheapest complete offer", () => {
    const complete = listingFixture({ id: "complete", price: 80, preTaxTotal: 80, eligible: true, eligibilityIssues: [] });
    render(<LanguageProvider><CrossMarketCostNote listing={incomplete} candidates={[complete, incomplete]} /></LanguageProvider>);
    expect(screen.getByText(/Known costs already meet or exceed/)).toBeTruthy();
  });
  it("does not imply a saving when there is no complete-cost benchmark", () => {
    render(<LanguageProvider><CrossMarketCostNote listing={incomplete} candidates={[incomplete]} /></LanguageProvider>);
    expect(screen.getByText(/no complete-cost listing/)).toBeTruthy();
  });
  it.each([
    { costComplete: true },
    { active: false },
    { raw: false },
    { eligibilityIssues: [...incomplete.eligibilityIssues, { code: "identity_variant_mismatch" as const, category: "identity" as const, disposition: "exclude" as const, message: "Wrong print" }] },
  ])("keeps the existing comparison gates: %j", (change) => {
    const { container } = render(<LanguageProvider><CrossMarketCostNote listing={{ ...incomplete, ...change }} candidates={[incomplete]} /></LanguageProvider>);
    expect(container.textContent).toBe("");
  });
});
