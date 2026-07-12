import { describe, expect, it } from "vitest";
import { buildAgentSearchUrl, parseAgentSearchParams } from "@/lib/agent-search-link";

describe("agent search links", () => {
  it("round-trips an exact One Piece card handoff", () => {
    const url = buildAgentSearchUrl("https://tcgpal.vercel.app", {
      query: "Monkey.D.Luffy OP05-119 Japanese manga rare",
      game: "onePiece",
      confirmedCardId: "OP05-119_manga_jp",
    });

    expect(parseAgentSearchParams(new URL(url).searchParams)).toEqual({
      query: "Monkey.D.Luffy OP05-119 Japanese manga rare",
      game: "onePiece",
      confirmedCardId: "OP05-119_manga_jp",
      autoSubmit: true,
    });
  });

  it("rejects incomplete or non-agent query strings", () => {
    expect(parseAgentSearchParams(new URLSearchParams("q=P-096"))).toBeNull();
    expect(parseAgentSearchParams(new URLSearchParams("agent=1&game=magic&q=Black+Lotus"))).toBeNull();
    expect(parseAgentSearchParams(new URLSearchParams("agent=1&game=pokemon&q=x"))).toBeNull();
  });

  it("can fill the search without automatically running it", () => {
    expect(parseAgentSearchParams(new URLSearchParams("agent=1&game=pokemon&q=Umbreon+VMAX+215%2F203&auto=0"))).toEqual({
      query: "Umbreon VMAX 215/203",
      game: "pokemon",
      confirmedCardId: undefined,
      autoSubmit: false,
    });
  });
});
