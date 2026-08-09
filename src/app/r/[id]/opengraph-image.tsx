import { ImageResponse } from "next/og";
import { buildReceiptModel, formatReceiptMoney, receiptListingCost } from "@/features/receipt/receipt-model";
import { comparisonSnapshotIdSchema, getComparisonSnapshot } from "@/lib/comparison/report-snapshot";

export const alt = "Lens TCG decision receipt";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function ReceiptOpenGraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = comparisonSnapshotIdSchema.safeParse(id);
  const snapshot = parsed.success ? await getComparisonSnapshot(parsed.data) : null;
  const model = snapshot ? buildReceiptModel(snapshot) : null;
  const card = model?.card;
  const verdict = model?.primary?.choice.label ?? (model?.outcome === "inspect_first" ? "Inspect first" : "No trustworthy buy");
  const price = model?.primary ? formatReceiptMoney(receiptListingCost(model.primary.listing)) : "No comparable buy";
  const checked = snapshot
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(snapshot.savedAt))
    : "Receipt unavailable";

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#f4f7f3", color: "#24312f", padding: 64 }}>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "2px solid #2f6f73", background: "#fcfbf6", padding: 48 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#2f6f73", fontSize: 26, fontWeight: 700, letterSpacing: 2 }}>
          <span>LENS TCG · DECISION RECEIPT</span>
          <span style={{ color: "#64736c", fontSize: 22, letterSpacing: 0 }}>Checked {checked}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#64736c", fontSize: 28 }}>{[card?.setName, card?.cardNumber && `#${card.cardNumber}`].filter(Boolean).join(" · ")}</div>
          <div style={{ marginTop: 12, fontSize: 70, fontWeight: 800, letterSpacing: -2 }}>{card?.name ?? "Saved comparison"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#2f6f73", fontSize: 24, fontWeight: 700 }}>OUR PICK</span>
            <span style={{ marginTop: 6, fontSize: 42, fontWeight: 800 }}>{verdict}</span>
          </div>
          <div style={{ fontSize: 58, fontWeight: 800 }}>{price}</div>
        </div>
      </div>
    </div>,
    size,
  );
}
