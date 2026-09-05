import { describe, expect, it } from "vitest";
import {
  auditOnePieceAlignment,
  familiesWithPrefix,
  isBasePrintRow,
  isRetailFamily,
} from "@/lib/testing/one-piece-alignment";
import { onePieceCatalog } from "@/lib/external/one-piece-catalog";

// The families a One Piece buyer is most likely to bring: the promo pool, both
// Extra Booster and Premium Booster lines, and the chase numbers that carry the
// most sibling prints. Every print in every one of these is walked.
const FLAGSHIP_FAMILIES = [
  "OP01-001", "OP01-016", "OP01-120", "OP02-013", "OP03-114", "OP03-123", "OP04-119",
  "OP05-069", "OP05-119", "OP06-118", "OP06-119", "OP07-053", "OP07-119", "OP09-001",
  "OP09-027", "OP11-118", "OP13-118", "ST01-001", "ST01-012",
];

const FAMILIES = [
  ...new Set([
    ...familiesWithPrefix(["EB01", "EB02", "EB03", "EB04", "PRB01", "PRB02", "P"]),
    ...FLAGSHIP_FAMILIES,
  ]),
];

const audit = auditOnePieceAlignment(FAMILIES);

describe("One Piece exact-print alignment", () => {
  it("walks the whole target catalog", () => {
    expect(FAMILIES.length).toBeGreaterThan(300);
    expect(audit.summary.prints).toBe(746);
    expect(audit.summary.selfAccepted).toBeGreaterThanOrEqual(656);
    expect(audit.summary.selfUnknown).toBeLessThanOrEqual(90);
  });

  it("never lets a confirmed print accept a sibling's own listing", () => {
    // The invariant the product exists for. A same-name, same-number, cheaper
    // sibling must never replace the selected artwork — not once, in any family.
    const substitutions = audit.rows
      .filter((row) => row.admittedSiblings.length > 0)
      .map((row) => `${row.printId} admits ${row.admittedSiblings.join(", ")}`);
    expect(substitutions).toEqual([]);
  });

  it("never rejects a print's own listing as a different print", () => {
    const broken = audit.rows
      .filter((row) => row.self === "mismatch")
      .map((row) => `${row.printId} (${row.release}): ${row.selfReason}`);
    expect(broken).toEqual([]);
  });

  it("accepts the ordinary listing of every retail base print", () => {
    // The 2026-08-14 adjudication: eight of twelve base prints abstained on
    // titles that named the release and nothing else. This holds the fix across
    // every EB, PRB, and flagship base print rather than the eight that were
    // measured.
    const abstaining = audit.rows
      .filter((row) => isBasePrintRow(row) && isRetailFamily(row.cardNumber) && row.self !== "accepted")
      .map((row) => `${row.printId} (${row.release}): ${row.selfReason}`);
    expect(abstaining).toEqual([]);
  });

  it("accepts every print that carries a marker no sibling shares", () => {
    // A print with an exact marker of its own — manga, wanted poster, a
    // release name or treatment no sibling carries — is text-distinguishable
    // and must prove itself. A print whose every marker is shared (a plain
    // super alt beside a red one, two prints from the same event) may honestly
    // abstain; those are listed by review:one-piece-alignment, not failed here.
    const distinguishable = audit.rows.filter((row) => row.hasFamilyUniqueMarker && row.self !== "accepted");
    expect(distinguishable.map((row) => `${row.printId} [${row.artworkClass}] ${row.release}: ${row.selfReason}`)).toEqual([]);
  });
});

// The two invariants that must hold for every print the catalog knows, not only
// the families a buyer is most likely to bring. The stronger claims — every base
// print accepted, every uniquely marked print accepted — stay on the target
// families above, where each abstention has been read.
describe("One Piece exact-print alignment — whole catalog", () => {
  const prefixes = [...new Set(onePieceCatalog.map((entry) => entry.card_set_id.split("-")[0]!.toUpperCase()))];
  const whole = auditOnePieceAlignment(familiesWithPrefix(prefixes));

  it("covers every print", () => {
    expect(whole.summary.prints).toBe(onePieceCatalog.length);
  });

  it("never lets any print accept a sibling's own listing", () => {
    expect(whole.rows.filter((row) => row.admittedSiblings.length > 0).map((row) => `${row.printId} admits ${row.admittedSiblings.join(", ")}`)).toEqual([]);
  });

  it("never rejects any print's own listing as a different print", () => {
    expect(whole.rows.filter((row) => row.self === "mismatch").map((row) => `${row.printId} (${row.release}): ${row.selfReason}`)).toEqual([]);
  });
});

