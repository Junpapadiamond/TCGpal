import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { auditOnePieceMetadata } from "./lib/one-piece-metadata-audit.mjs";

const DATASET = new URL("../output/one-piece-exact-print-metadata.json", import.meta.url);
const OUTPUT = new URL("../output/one-piece-exact-print-audit.json", import.meta.url);
const checkOnly = process.argv.includes("--check");

const source = await readFile(DATASET, "utf8");
const records = JSON.parse(source);
const audit = {
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  ...auditOnePieceMetadata(records),
};
const serialized = `${JSON.stringify(audit, null, 2)}\n`;

if (checkOnly) {
  const existing = await readFile(OUTPUT, "utf8").catch(() => "");
  if (existing !== serialized) {
    process.stderr.write("One Piece metadata audit is stale. Run npm run metadata:audit.\n");
    process.exitCode = 1;
  }
} else {
  await writeFile(OUTPUT, serialized);
  process.stderr.write(
    `Wrote ${OUTPUT.pathname}: ${audit.summary.manualReviewCandidates} manual review candidates; runtime publication ${audit.runtimePublicationAllowed ? "allowed" : "blocked"}.\n`,
  );
}
