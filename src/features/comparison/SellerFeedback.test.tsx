// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SellerFeedback } from "./SellerFeedback";
import { setLanguage } from "./i18n";

const listing = { marketplace: "eBay" as const, demo: false, url: "https://www.ebay.com/itm/123456789012" };
const response = { status: "complete", source: "eBay Feedback API", observedAt: "2026-10-28T17:00:00.000Z", periods: [{ days: 30, positive: 17, neutral: 2, negative: 1 }] };
beforeEach(() => { setLanguage("en"); vi.stubGlobal("fetch", vi.fn(async () => Response.json(response))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("fetches only on explicit opening, shows counts, and reuses them across language changes", async () => {
  render(<SellerFeedback listing={listing} />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Seller feedback" }));
  expect(await screen.findByText("17 positive · 2 neutral · 1 negative")).toBeTruthy();
  expect(screen.getByText(/not scored/i)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Seller feedback" }));
  fireEvent.click(screen.getByRole("button", { name: "Seller feedback" }));
  act(() => setLanguage("zh"));
  expect(screen.getByText("17 条好评 · 2 条中评 · 1 条差评")).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("does not offer acquisition for demo or other marketplaces", () => {
  const { rerender } = render(<SellerFeedback listing={{ ...listing, demo: true }} />);
  expect(screen.queryByRole("button")).toBeNull();
  rerender(<SellerFeedback listing={{ ...listing, marketplace: "Whatnot" }} />);
  expect(screen.queryByRole("button")).toBeNull(); expect(fetch).not.toHaveBeenCalled();
});
it("shows neutral missing-data wording without ratings or automatic retries", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ ...response, status: "no_data", periods: [] }));
  render(<SellerFeedback listing={listing} />);
  fireEvent.click(screen.getByRole("button", { name: "Seller feedback" }));
  expect(await screen.findByText(/No usable seller feedback/)).toBeTruthy();
  expect(screen.queryByText(/17 positive/)).toBeNull(); expect(fetch).toHaveBeenCalledTimes(1);
});
it("clears old seller evidence when the selected listing changes", async () => {
  const { rerender } = render(<SellerFeedback listing={listing} />);
  fireEvent.click(screen.getByRole("button", { name: "Seller feedback" }));
  await screen.findByText(/17 positive/);
  rerender(<SellerFeedback listing={{ ...listing, url: "https://www.ebay.com/itm/999999999999" }} />);
  await waitFor(() => expect(screen.queryByText(/17 positive/)).toBeNull());
  expect(fetch).toHaveBeenCalledTimes(1);
});
