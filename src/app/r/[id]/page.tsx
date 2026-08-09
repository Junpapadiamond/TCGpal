import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ReceiptPageClient } from "@/features/receipt/ReceiptPageClient";
import { buildReceiptModel, formatReceiptMoney, receiptListingCost } from "@/features/receipt/receipt-model";
import { comparisonSnapshotIdSchema, getComparisonSnapshot } from "@/lib/comparison/report-snapshot";

type ReceiptPageProps = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

const getReceipt = cache(async (id: string) => {
  const parsed = comparisonSnapshotIdSchema.safeParse(id);
  if (!parsed.success) return null;
  return getComparisonSnapshot(parsed.data);
});

export async function generateMetadata({ params }: ReceiptPageProps): Promise<Metadata> {
  const { id } = await params;
  const snapshot = await getReceipt(id);
  if (!snapshot) {
    return {
      title: "Receipt unavailable — Lens TCG",
      description: "This saved Lens TCG comparison is unavailable or has expired.",
      robots: { index: false, follow: false },
    };
  }

  const model = buildReceiptModel(snapshot);
  const cardName = model.card?.name ?? "Card comparison";
  const verdict = model.primary?.choice.label ?? (model.outcome === "inspect_first" ? "Inspect first" : "No trustworthy buy");
  const cost = model.primary ? formatReceiptMoney(receiptListingCost(model.primary.listing)) : null;
  const checked = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(snapshot.savedAt));
  const description = [verdict, cost, `Checked ${checked}`].filter(Boolean).join(" · ");
  const title = `${cardName} — ${verdict} receipt`;

  return {
    title,
    description,
    openGraph: {
      type: "article",
      title,
      description,
      publishedTime: snapshot.savedAt,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ReceiptPage({ params }: ReceiptPageProps) {
  const { id } = await params;
  const snapshot = await getReceipt(id);
  if (!snapshot) notFound();
  return <ReceiptPageClient snapshot={snapshot} />;
}
