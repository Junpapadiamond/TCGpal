import { describe, expect, it } from "vitest";
import { en, localizeVariantLabel, zh } from "./i18n";

describe("price fact line", () => {
  // `priceFacts` supplies its own "Shipping" / "運費" label, so the value slotted
  // into it must be the bare amount. Passing a phrase that repeats the noun
  // printed "Shipping free shipping" on the money line of every free-shipping
  // recommendation, in both languages.
  it("does not repeat the shipping noun when shipping is free", () => {
    expect(en.result.priceFacts("$9.99", en.card.freeShipping, null)).toBe(
      "Item price $9.99 · Shipping free · Tax not estimated",
    );
    expect(zh.result.priceFacts("$9.99", zh.card.freeShipping, null)).toBe(
      "商品价 $9.99 · 运费 免费 · 税费未估算",
    );
  });

  it("still names the amount or the unknown when shipping is not free", () => {
    expect(en.result.priceFacts("$9.99", "$4.50", "$0.82")).toBe(
      "Item price $9.99 · Shipping $4.50 · Estimated tax $0.82",
    );
    expect(en.result.priceFacts("$9.99", en.card.shippingUnknown, null)).toContain(
      `Shipping ${en.card.shippingUnknown}`,
    );
  });
});

describe("variant label localization", () => {
  it("localizes new One Piece treatment search facets in Chinese", () => {
    expect(localizeVariantLabel("zh", "Signature")).toBe("印刷签名版");
    expect(localizeVariantLabel("zh", "Serial Numbered")).toBe("序列编号版");
    expect(localizeVariantLabel("zh", "Stamped")).toBe("烫印版");
    expect(localizeVariantLabel("zh", "Textured")).toBe("纹理版");
  });

  it("preserves English and unknown marketplace terminology", () => {
    expect(localizeVariantLabel("en", "Signature")).toBe("Signature");
    expect(localizeVariantLabel("zh", "Manga Art")).toBe("Manga Art");
  });
});
