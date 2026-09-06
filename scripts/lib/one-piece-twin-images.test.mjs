import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { twinGroups, compareImages, robotsAllowsResearch } from "./one-piece-twin-images.mjs";

describe("official twin-image research", () => {
  it("pins the actual catalog cohort without merging different releases or classes", () => {
    const groups = twinGroups(JSON.parse(readFileSync("src/lib/external/one-piece-catalog.generated.json", "utf8")));
    expect(groups).toHaveLength(264);
    expect(groups.flat()).toHaveLength(642);
    expect(new Set(groups.flat().map((card) => card.card_set_id)).size).toBe(253);
    expect(groups.every((group) => new Set(group.map((card) => card.set_name)).size === 1)).toBe(true);
  });
  it("never calls two missing/failed images identical", () => {
    expect(compareImages({ status: "error" }, { status: "error" })).toEqual({ status: "not_compared" });
  });
  it("requires matching dimensions and decoded pixels, and retains measurable differences", () => {
    const image = { status: "observed", width: 2, height: 3, sha256: "file-a", pixelSha256: "pixels", vector: Buffer.from([0, 0, 0]) };
    expect(compareImages(image, { ...image, sha256: "file-b" })).toMatchObject({ byteIdentical: false, pixelIdentical: true, rgbRmse32x45: 0 });
    expect(compareImages(image, { ...image, width: 3, height: 2 })).toMatchObject({ pixelIdentical: false });
    expect(compareImages(image, { ...image, pixelSha256: "different", vector: Buffer.from([3, 3, 3]) })).toMatchObject({ pixelIdentical: false, rgbRmse32x45: 3 });
  });
  it("fails closed on robots failures or disallow directives", () => {
    expect(robotsAllowsResearch(404, "")).toBe(true);
    expect(robotsAllowsResearch(200, "User-agent: *\nDisallow:\n")).toBe(true);
    expect(robotsAllowsResearch(200, "User-agent: *\nDisallow: /images/\n")).toBe(false);
    for (const status of [401, 403, 429, 500]) expect(robotsAllowsResearch(status, "")).toBe(false);
  });
});
