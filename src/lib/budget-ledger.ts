import type { TcgPurchase } from "./schemas";

export function getTodaySpent(purchases: TcgPurchase[]) {
  return purchases.reduce((total, purchase) => total + purchase.askingPrice, 0);
}

export function getTodayRemaining(todayBudget: number, purchases: TcgPurchase[]) {
  return Math.max(todayBudget - getTodaySpent(purchases), 0);
}
