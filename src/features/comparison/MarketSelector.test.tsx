// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarketAvailabilityProvider, MarketSelector } from "./MarketSelector";

afterEach(cleanup);
it("puts All first and derives pending status from server configuration", () => {
  render(<MarketAvailabilityProvider pendingMarkets={["Fanatics Collect", "Cardmarket"]}>
    <MarketSelector onChange={vi.fn()} />
  </MarketAvailabilityProvider>);
  const buttons = within(screen.getByRole("group", { name: "Markets to search" })).getAllByRole("button");
  expect(buttons[0].textContent).toBe("All");
  expect(screen.getByRole("button", { name: "CardTrader" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Cardmarket Pending" })).toBeTruthy();
});
