// Is the TCGplayer/TCGCSV anchor centred on the eBay asks we actually rank?
//
// The result screen shows "item N% above/below reference" and buildAction turns
// >15% into "Consider waiting". Both assume the anchor is an unbiased estimate of
// what this card costs on the marketplace we search. If eBay asks sit
// structurally above TCGplayer market, then the badge is partly measuring the
// gap between two marketplaces, and the wait threshold is calibrated off-centre.
if (process.argv.includes("--taxonomy")) {
  await import("./measure-one-piece-taxonomy-anchors.mjs");
  process.exit(process.exitCode ?? 0);
}
const BASE = process.env.TARGET || "https://lenstcg.com";

const CARDS = [
  { label: "Umbreon VMAX 215/203", game: "pokemon", name: "Umbreon VMAX", setCode: "SWSH7", cardNumber: "215/203", query: "Umbreon VMAX 215/203" },
  { label: "Giratina V 186/196", game: "pokemon", name: "Giratina V", setCode: "SWSH11", cardNumber: "186/196", query: "Giratina V 186/196" },
  { label: "Charizard 4/102", game: "pokemon", name: "Charizard", setCode: "BS", cardNumber: "4/102", query: "Charizard 4/102" },
  { label: "Pikachu 58/102", game: "pokemon", name: "Pikachu", setCode: "BS", cardNumber: "58/102", query: "Pikachu 58/102" },
  { label: "Mewtwo & Mew-GX 222/236", game: "pokemon", name: "Mewtwo & Mew-GX", setCode: "SM11", cardNumber: "222/236", query: "Mewtwo & Mew-GX 222/236" },
  { label: "Luffy OP05-119", game: "onePiece", name: "Monkey.D.Luffy", setCode: "OP-05", cardNumber: "OP05-119", query: "Monkey.D.Luffy OP05-119" },
  { label: "Zoro OP06-118", game: "onePiece", name: "Roronoa Zoro", setCode: "OP-06", cardNumber: "OP06-118", query: "Roronoa Zoro OP06-118" },
  { label: "Nami OP01-016", game: "onePiece", name: "Nami", setCode: "OP-01", cardNumber: "OP01-016", query: "Nami OP01-016" },
];

function request(card, confirmedCardId) {
  return {
    query: card.query,
    sourceListing: {
      marketplace: "eBay", url: "", title: "", description: "", price: null, shipping: null,
      claimedCondition: "Unknown", active: true,
      seller: { feedbackPercentage: null, feedbackCount: null, returnsAccepted: null, topRated: null, buyerProtection: null, subRatings: null },
      evidence: { photoCount: 0, frontBackExplicit: false, closeupsExplicit: false, surfaceExplicit: false, identityExplicit: false, substantiveConditionNotes: false, missing: [] },
    },
    buyer: { country: "US", postalCode: "10001", taxRate: null, desiredCondition: "Near Mint" },
    cardHint: { game: card.game, name: card.name, setCode: card.setCode, cardNumber: card.cardNumber, language: "English", variant: "", gradingClaim: "" },
    manualCandidates: [],
    webDiscoveryMode: "off",
    ...(confirmedCardId ? { confirmedCardId } : {}),
  };
}

async function compare(body) {
  const response = await fetch(`${BASE}/api/agent/listing-compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 160)}`);
  return response.json();
}

const pct = (n) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;
const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const allDeltas = [];
const perCard = [];

for (const card of CARDS) {
  try {
    let report = await compare(request(card));
    if (report.status === "needs_confirmation" && report.identityCandidates?.length) {
      const pick = report.identityCandidates.find((c) => c.confidence === "high") ?? report.identityCandidates[0];
      report = await compare({ ...report.request, confirmedCardId: pick.id });
    }
    const anchor = report.confirmedCard?.marketMid ?? null;
    const asOf = report.confirmedCard?.marketAsOf ?? null;
    const eligible = (report.candidates ?? []).filter((c) => c.eligible);
    if (!anchor || anchor <= 0 || eligible.length === 0) {
      perCard.push({ label: card.label, note: `anchor=${anchor} eligible=${eligible.length}` });
      console.log(`${card.label.padEnd(26)} — skipped (anchor ${anchor}, ${eligible.length} eligible)`);
      continue;
    }
    // Item price only, matching how the badge is computed (shipping/tax excluded).
    const deltas = eligible.map((c) => (c.price - anchor) / anchor);
    allDeltas.push(...deltas);
    const ageH = asOf ? (Date.now() - new Date(asOf).getTime()) / 3.6e6 : null;
    perCard.push({ label: card.label, anchor, n: deltas.length, med: median(deltas), ageH });
    console.log(
      `${card.label.padEnd(26)} anchor $${anchor.toFixed(2).padStart(9)}  n=${String(deltas.length).padStart(2)}  ` +
      `median ${pct(median(deltas)).padStart(7)}  min ${pct(Math.min(...deltas)).padStart(7)}  max ${pct(Math.max(...deltas)).padStart(7)}  ` +
      `anchor age ${ageH === null ? "?" : ageH.toFixed(1) + "h"}`,
    );
  } catch (error) {
    console.log(`${card.label.padEnd(26)} ERROR ${error.message}`);
  }
  await new Promise((r) => setTimeout(r, 2500));
}

console.log("\n──────── pooled across every eligible listing ────────");
const m = median(allDeltas);
console.log(`listings measured        ${allDeltas.length}`);
console.log(`median delta vs anchor   ${pct(m ?? 0)}   <- 0% would mean the anchor is centred on eBay asks`);
console.log(`share priced ABOVE anchor ${((allDeltas.filter((d) => d > 0).length / allDeltas.length) * 100).toFixed(0)}%   <- 50% would mean unbiased`);
console.log(`share past the +15% wait threshold ${((allDeltas.filter((d) => d > 0.15).length / allDeltas.length) * 100).toFixed(0)}%`);
const cardMedians = perCard.filter((p) => p.med != null).map((p) => p.med);
console.log(`per-card medians         ${cardMedians.map((d) => pct(d)).join(", ")}`);
