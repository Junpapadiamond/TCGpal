// Shared driver for the measurement scripts that read the public comparison
// endpoint (measure-print-recall.mjs, sample-base-print-precision.mjs).
//
// It exists so those instruments cannot disagree about what they measured. The
// buyer context below — Near Mint requested, one ZIP, English — decides which
// rows are eligible, so a sample built from a different request would describe
// different listings than the recall number it is supposed to explain.
//
// Nothing here touches product behaviour: it drives /api/agent/listing-compare
// the way a browser does and reads the report back.

export const DEFAULT_MAX_ATTEMPTS = 3;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fixed buyer context so every card is measured on the same terms: Near Mint
// requested, one delivery destination, tax estimated from the ZIP.
export function buildCompareRequest(card, confirmedCardId) {
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

export async function compare(base, body, options = {}) {
  const {
    fetchImpl = fetch,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    sleepImpl = sleep,
    log = () => {},
  } = options;

  for (let attempt = 1; ; attempt += 1) {
    const response = await fetchImpl(`${base}/api/agent/listing-compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return response.json();

    const detail = (await response.text()).slice(0, 160);
    // A 429 is the rate limiter, not a retrieval result. Waiting it out keeps the
    // card in the measurement instead of scoring it as a failure.
    if (response.status === 429 && attempt < maxAttempts) {
      const retryAfter = Number(response.headers.get("Retry-After")) || 60;
      log(`   rate limited; waiting ${retryAfter}s before retry ${attempt + 1}/${maxAttempts}`);
      await sleepImpl((retryAfter + 2) * 1000);
      continue;
    }
    throw new Error(`${response.status}: ${detail}`);
  }
}

// The buyer taps a version when the number alone is ambiguous. Mirror that one
// tap rather than scoring identity ambiguity as a retrieval failure.
export async function resolve(base, card, options = {}) {
  let report = await compare(base, buildCompareRequest(card, card.confirmedCardId), options);
  let confirmationRequired = false;

  if (report.status === "needs_confirmation" && report.identityCandidates?.length) {
    confirmationRequired = true;
    const pick = card.confirmedCardId
      ? report.identityCandidates.find((candidate) => candidate.id.toUpperCase() === card.confirmedCardId.toUpperCase())
      : null;
    const chosen = pick ?? report.identityCandidates.find((candidate) => candidate.confidence === "high") ?? report.identityCandidates[0];
    report = await compare(base, { ...report.request, confirmedCardId: chosen.id }, options);
  }
  return { report, confirmationRequired };
}
