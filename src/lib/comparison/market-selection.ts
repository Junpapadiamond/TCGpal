import type { ComparisonRequest } from "@/lib/schemas";

// Presentation and input order never change cache identity. Single-market
// requests always mean eBay and cannot opt in to paid acquisition implicitly.
export function marketSelectionKey(request: Pick<ComparisonRequest, "marketScope" | "marketplaces">) {
  return request.marketScope !== "cross" ? "eBay"
    : request.marketplaces ? [...new Set(request.marketplaces)].sort().join(",") : "all";
}
