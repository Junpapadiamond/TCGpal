// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnimatedSearchInput } from "./AnimatedSearchInput";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => Object.assign(new EventTarget(), { matches: false }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("types examples without changing the buyer's value or accessible label", () => {
  const change = vi.fn();
  render(<AnimatedSearchInput active examples={["Pikachu"]} placeholder="Card name" aria-label="Search for a card" onChange={change} />);
  const input = screen.getByRole("textbox", { name: "Search for a card" }) as HTMLInputElement;
  expect(input.placeholder).toBe("Card name");
  act(() => { vi.advanceTimersByTime(1200); });
  expect("Pikachu".startsWith(input.placeholder)).toBe(true);
  expect(input.placeholder.length).toBeGreaterThan(0);
  expect(input.value).toBe("");
  expect(change).not.toHaveBeenCalled();
});

it("pauses for direct interaction and does not intercept Enter", () => {
  const key = vi.fn();
  const { rerender } = render(<AnimatedSearchInput active examples={["Pikachu"]} placeholder="Card name" aria-label="Search" onKeyDown={key} />);
  const input = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.keyDown(input, { key: "Enter" });
  act(() => { vi.advanceTimersByTime(2000); });
  expect(key).toHaveBeenCalledOnce();
  expect(input.placeholder).toBe("Card name");
  rerender(<AnimatedSearchInput active={false} examples={["Pikachu"]} placeholder="Card name" aria-label="Search" defaultValue="Giratina" />);
  expect(input.value).toBe("Giratina");
});

it("honors reduced motion", () => {
  vi.stubGlobal("matchMedia", () => Object.assign(new EventTarget(), { matches: true }));
  render(<AnimatedSearchInput active examples={["Pikachu"]} placeholder="Card name" aria-label="Search" />);
  act(() => { vi.advanceTimersByTime(5000); });
  expect((screen.getByRole("textbox") as HTMLInputElement).placeholder).toBe("Card name");
});
