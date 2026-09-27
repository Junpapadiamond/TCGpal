import type { Metadata } from "next";
import { MethodPageClient } from "./MethodPageClient";

export const metadata: Metadata = {
  title: "Method and data sources — TCGlens",
  description: "How TCGlens confirms card identity, compares item price and checkout cost, ranks active listings, and abstains when evidence is incomplete.",
};

export default function MethodPage() {
  return <MethodPageClient />;
}
