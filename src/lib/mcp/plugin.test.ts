import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd(), "plugins/tcglens");

describe("TCGlens Work plugin", () => {
  it("declares the production remote MCP and distributable metadata", () => {
    const plugin = JSON.parse(readFileSync(path.join(root, ".codex-plugin/plugin.json"), "utf8"));
    const mcp = JSON.parse(readFileSync(path.join(root, ".mcp.json"), "utf8"));

    expect(plugin).toMatchObject({
      name: "tcglens",
      version: "1.0.1",
      homepage: "https://tcgpal.vercel.app",
      repository: "https://github.com/Junpapadiamond/TCGpal",
      author: { name: "Jun Hsu" },
      mcpServers: "./.mcp.json",
    });
    expect(mcp).toEqual({ mcpServers: { tcglens: { type: "http", url: "https://tcgpal.vercel.app/mcp" } } });
    const marketplace = JSON.parse(readFileSync(path.resolve(process.cwd(), ".agents/plugins/marketplace.json"), "utf8"));
    expect(marketplace.plugins).toContainEqual(expect.objectContaining({ name: "tcglens", version: "1.0.1" }));
  });

  it("ships a concise skill with the required intent routing and boundaries", () => {
    const skill = readFileSync(path.join(root, "skills/tcglens/SKILL.md"), "utf8");
    expect(skill).toContain("tcglens_browse_cards");
    expect(skill).toContain("tcglens_discover_cards");
    expect(skill).toContain("tcglens_compare_card");
    expect(skill).toContain("seller’s claim");
    expect(skill).toContain("comparison contract v4");
    expect(skill).toContain("Never predict a grade");
  });
});
