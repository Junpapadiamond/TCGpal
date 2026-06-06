import { describe, expect, it } from "vitest";
import { getTodayRemaining, getTodaySpent } from "./budget-ledger";
import type { TcgPurchase } from "./schemas";

const purchases: TcgPurchase[] = [
  {
    id: "purchase-1",
    cardId: "pokemon-umbreon-vmax-evolving-skies-alt",
    cardName: "Umbreon VMAX",
    cardVersion: "Evolving Skies Alternate Art 215/203",
    askingPrice: 130,
    boughtAt: "2026-06-06T08:00:00.000Z",
  },
  {
    id: "purchase-2",
    cardId: "pokemon-giratina-v-lost-origin-alt",
    cardName: "Giratina V",
    cardVersion: "Lost Origin Alternate Art 186/196",
    askingPrice: 90,
    boughtAt: "2026-06-06T09:00:00.000Z",
  },
];

describe("budget ledger", () => {
  it("counts spent today from manually recorded purchases", () => {
    expect(getTodaySpent(purchases)).toBe(220);
  });

  it("calculates remaining today budget without going negative", () => {
    expect(getTodayRemaining(300, purchases)).toBe(80);
    expect(getTodayRemaining(100, purchases)).toBe(0);
  });
});
