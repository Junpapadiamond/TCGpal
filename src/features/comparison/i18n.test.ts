import { describe, expect, it } from "vitest";
import { localizeVariantLabel } from "./i18n";

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
