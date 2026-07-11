import { describe, expect, it } from "vitest";
import { localizeVariantLabel } from "./i18n";

describe("variant label localization", () => {
  it("localizes new One Piece treatment search facets in Chinese", () => {
    expect(localizeVariantLabel("zh", "Signed")).toBe("签名版");
    expect(localizeVariantLabel("zh", "Serialized")).toBe("序列编号版");
    expect(localizeVariantLabel("zh", "Stamped")).toBe("压印版");
    expect(localizeVariantLabel("zh", "Textured")).toBe("纹理版");
  });

  it("preserves English and unknown marketplace terminology", () => {
    expect(localizeVariantLabel("en", "Signed")).toBe("Signed");
    expect(localizeVariantLabel("zh", "Manga Art")).toBe("Manga Art");
  });
});
