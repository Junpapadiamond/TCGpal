// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/" }

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_VERDICT_NOTE_UI_ENABLED } from "@/features/comparison/ui-feature-flags";
import { useAiVerdictNote } from "@/features/comparison/use-ai-verdict-note";
import { comparisonReport } from "@/lib/ai/verdict-note-fixtures";

function Probe({ enabled }: { enabled: boolean }) {
  const note = useAiVerdictNote({ enabled, report: comparisonReport(), role: "best_value", lang: "en" });
  return <p>note: {note ?? "none"}</p>;
}

describe("useAiVerdictNote", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("ships off, so production keeps the deterministic sentence", () => {
    expect(AI_VERDICT_NOTE_UI_ENABLED).toBe(false);
  });

  it("does not call the endpoint when disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe enabled={false} />);

    await waitFor(() => expect(screen.getByText("note: none")).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the note once the checked answer arrives", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ note: "At $834.24 with 10 item-specific photos, this copy documents itself best.", citedFactIds: [3], usedAi: true, rejectedReason: null }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe enabled />);

    await waitFor(() => expect(screen.getByText(/documents itself best/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the deterministic sentence when the server declines to write one", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ note: null, citedFactIds: [], usedAi: false, rejectedReason: "The note states an ungrounded number." }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    render(<Probe enabled />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText("note: none")).toBeTruthy();
  });

  it("keeps the deterministic sentence when the request fails outright", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));

    render(<Probe enabled />);

    await waitFor(() => expect(screen.getByText("note: none")).toBeTruthy());
  });
});
