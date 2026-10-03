// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchExamples } from "./SearchExamples";
import { setLanguage } from "./i18n";
import { SEARCH_EXAMPLES } from "./search-examples";

const examples = SEARCH_EXAMPLES.filter((item) => item.game === "pokemon").slice(0, 6);
const labels = () => within(screen.getByRole("group", { name: "Search examples" }))
  .getAllByRole("button", { name: /^Use search example:/ }).map((button) => button.textContent);
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("automatic search examples", () => {
  let motion: EventTarget & { matches: boolean };

  beforeEach(() => {
    vi.useFakeTimers();
    setLanguage("en");
    motion = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal("matchMedia", () => motion);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("replaces all six examples after three seconds and selects the displayed example", () => {
    const onSelect = vi.fn();
    render(<SearchExamples examples={examples} onSelect={onSelect} onRefresh={vi.fn()} />);
    const first = labels();
    advance(2999);
    expect(labels()).toEqual(first);
    advance(1);
    expect(labels()).toHaveLength(6);
    expect(labels().every((label) => !first.includes(label))).toBe(true);
    const button = screen.getAllByRole("button", { name: /^Use search example:/ })[0];
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(SEARCH_EXAMPLES.find((item) => item.id === button.dataset.exampleId));
  });

  it("holds the choices during hover and keyboard focus, then gives a fresh three seconds", () => {
    render(<SearchExamples examples={examples} onSelect={vi.fn()} onRefresh={vi.fn()} />);
    const group = screen.getByRole("group", { name: "Search examples" });
    const first = labels();
    fireEvent.mouseEnter(group);
    advance(6000);
    expect(labels()).toEqual(first);
    fireEvent.mouseLeave(group);
    const button = screen.getAllByRole("button", { name: /^Use search example:/ })[0];
    fireEvent.focus(button);
    advance(6000);
    expect(labels()).toEqual(first);
    fireEvent.blur(button, { relatedTarget: document.body });
    advance(2999);
    expect(labels()).toEqual(first);
    advance(1);
    expect(labels()).not.toEqual(first);
  });

  it("allows the buyer to pause rotation and resume it", () => {
    render(<SearchExamples examples={examples} onSelect={vi.fn()} onRefresh={vi.fn()} />);
    const first = labels();
    fireEvent.click(screen.getByRole("button", { name: "Pause examples" }));
    advance(9000);
    expect(labels()).toEqual(first);
    fireEvent.click(screen.getByRole("button", { name: "Resume examples" }));
    advance(3000);
    expect(labels()).not.toEqual(first);
  });

  it("stops for reduced motion and hidden tabs, including preference changes", () => {
    motion.matches = true;
    render(<SearchExamples examples={examples} onSelect={vi.fn()} onRefresh={vi.fn()} />);
    const first = labels();
    advance(6000);
    expect(labels()).toEqual(first);
    act(() => { motion.matches = false; motion.dispatchEvent(new Event("change")); });
    advance(3000);
    expect(labels()).not.toEqual(first);
    const second = labels();
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    fireEvent(document, new Event("visibilitychange"));
    advance(6000);
    expect(labels()).toEqual(second);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    fireEvent(document, new Event("visibilitychange"));
    advance(3000);
    expect(labels()).not.toEqual(second);
  });

  it("uses a new game's examples immediately and cleans up its timer", () => {
    const props = { onSelect: vi.fn(), onRefresh: vi.fn() };
    const clearTimer = vi.spyOn(window, "clearTimeout");
    const scheduleTimer = vi.spyOn(window, "setTimeout");
    const view = render(<SearchExamples {...props} examples={examples} />);
    advance(3000);
    view.rerender(<SearchExamples {...props} examples={SEARCH_EXAMPLES.filter((item) => item.game === "onePiece").slice(0, 6)} />);
    expect(labels()[0]).toContain("Luffy");
    advance(3000);
    expect(screen.getAllByRole("button", { name: /^Use search example:/ }).every((button) => button.dataset.exampleId?.startsWith("onePiece-"))).toBe(true);
    const lastTimer = scheduleTimer.mock.results.at(-1)?.value;
    clearTimer.mockClear();
    view.unmount();
    expect(clearTimer).toHaveBeenCalledWith(lastTimer);
  });

  it("keeps examples still once the buyer starts typing", () => {
    const props = { examples, onSelect: vi.fn(), onRefresh: vi.fn() };
    const view = render(<SearchExamples {...props} />);
    const first = labels();
    view.rerender(<SearchExamples {...props} active={false} />);
    advance(6000);
    expect(labels()).toEqual(first);
  });

  it("passes the visible group to manual refresh after automatic rotation", () => {
    const onRefresh = vi.fn();
    render(<SearchExamples examples={examples} onSelect={vi.fn()} onRefresh={onRefresh} />);
    advance(3000);
    const visibleIds = screen.getAllByRole("button", { name: /^Use search example:/ }).map((button) => button.dataset.exampleId);
    fireEvent.click(screen.getByRole("button", { name: "More examples" }));
    expect(onRefresh.mock.calls[0][0].map((item: { id: string }) => item.id)).toEqual(visibleIds);
  });
});
